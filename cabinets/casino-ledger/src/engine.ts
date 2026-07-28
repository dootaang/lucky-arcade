import { WAGER_MULTIPLIERS, XorShift32, type WagerMultiplier } from "@lucky-arcade/engine";
import type {
  CasinoClock,
  CasinoTableId,
  NpcActivity,
  NpcBalanceSnapshot,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcSession,
  NpcStake,
} from "./contracts.ts";

const MINUTES_PER_DAY = 1_440;
const MAX_SAFE_BALANCE = 1_000_000_000;
const PAID_STAKES = [10, 50, 200] as const;
const PAYLINES = [[0,1,2],[3,4,5],[6,7,8],[0,4,8],[6,4,2]] as const;

interface Intent { npcId: string; minute: number; ordinal: number; preferredTable: CasinoTableId }
interface MatchPlan { matchId: string; minute: number; tableId: CasinoTableId; participantIds: readonly string[] }

/**
 * Builds the whole casino day at once. PvP results therefore have one match id
 * and two (or four) counter-entries instead of two unrelated stories.
 */
export function casinoDaySessions(
  profiles: readonly NpcGamblingProfile[],
  dayIndex: number,
  openingBalances: Readonly<Record<string, number>>,
  contract: NpcLedgerContract,
): Readonly<Record<string, readonly NpcSession[]>> {
  validateDay(profiles, dayIndex, openingBalances, contract);
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const intents = createIntents(profiles, dayIndex, contract);
  const plans = createMatchPlans(intents, dayIndex, contract);
  const balances: Record<string, number> = { ...openingBalances };
  const dayOpening: Record<string, number> = { ...openingBalances };
  const output: Record<string, NpcSession[]> = Object.fromEntries(profiles.map((profile) => [profile.id, []]));

  for (const plan of plans) {
    const participants = plan.participantIds.map((id) => byId.get(id)!).filter(Boolean);
    if (participants.length === 0) continue;
    const paidAllowed = plan.tableId !== "temerosa-old-maid"
      && participants.every((profile) => policyAllowsPaid(profile, balances[profile.id]!, dayOpening[profile.id]!));
    const tableId = paidAllowed ? plan.tableId : "temerosa-old-maid";
    const rng = new XorShift32(`${contract.version}:${dayIndex}:${plan.matchId}:result`);
    const stakeTerms = tableId === "temerosa-old-maid"
      ? { stake: 0 as const, multiplier: 1 as const, exposure: 0 }
      : chooseSharedExposure(participants, balances, dayOpening, rng);
    if (tableId !== "temerosa-old-maid" && stakeTerms.exposure === 0) {
      settleFreeOldMaid(plan, participants, balances, output, rng);
      continue;
    }
    if (tableId === "temerosa-old-maid") {
      settleFreeOldMaid(plan, participants, balances, output, rng);
    } else if (tableId === "temerosa-slot") {
      settleSlot(plan, participants[0]!, balances, output, stakeTerms.stake as Exclude<NpcStake,0>, stakeTerms.multiplier as WagerMultiplier, rng);
    } else {
      settlePvp(plan, tableId, participants, balances, output, stakeTerms.stake as Exclude<NpcStake,0>, stakeTerms.multiplier as WagerMultiplier, rng);
    }
  }

  return Object.freeze(Object.fromEntries(Object.entries(output).map(([id, sessions]) => [id, Object.freeze(sessions.toSorted((a,b) => a.minuteOfDay - b.minuteOfDay || compareText(a.matchId,b.matchId)))])));
}

/** Compatibility view for callers that need one NPC. New code should use casinoDaySessions. */
export function npcDaySessions(profile: NpcGamblingProfile, dayIndex: number, openingBalance: number, contract: NpcLedgerContract): readonly NpcSession[] {
  const openings = Object.fromEntries(contract.profiles.map((entry) => [entry.id, entry.id === profile.id ? openingBalance : entry.openingBalance]));
  return casinoDaySessions(contract.profiles, dayIndex, openings, contract)[profile.id] ?? Object.freeze([]);
}

export function npcBalanceAt(profile: NpcGamblingProfile, clock: CasinoClock, contract: NpcLedgerContract): NpcBalanceSnapshot {
  const utcMinute = normalizedUtcMinute(clock);
  const absoluteDay = Math.floor(utcMinute / MINUTES_PER_DAY);
  const dayIndex = absoluteDay - contract.epochUtcDay;
  if (dayIndex < 0) return { balance: profile.openingBalance, today: Object.freeze([]), dayIndex: 0 };
  const opening = dayIndex === 0 ? openingBalances(contract.profiles) : completedDayBalances(contract.profiles, dayIndex - 1, contract);
  const minuteOfDay = utcMinute - absoluteDay * MINUTES_PER_DAY;
  const today = (casinoDaySessions(contract.profiles, dayIndex, opening, contract)[profile.id] ?? []).filter((session) => session.minuteOfDay <= minuteOfDay);
  return { balance: opening[profile.id]! + sumDeltas(today), today: Object.freeze(today), dayIndex };
}

export function recentNpcActivitiesAt(profiles: readonly NpcGamblingProfile[], clock: CasinoClock, contract: NpcLedgerContract, limit: number): readonly NpcActivity[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("npc_ledger_invalid_limit");
  if (limit === 0) return Object.freeze([]);
  const now = normalizedUtcMinute(clock);
  const absoluteDay = Math.floor(now / MINUTES_PER_DAY);
  const currentDayIndex = absoluteDay - contract.epochUtcDay;
  if (currentDayIndex < 0) return Object.freeze([]);
  const firstDay = Math.max(0, currentDayIndex - 1);
  let balances = firstDay === 0 ? openingBalances(profiles) : completedDayBalances(profiles, firstDay - 1, contract);
  const output: NpcActivity[] = [];
  for (let day = firstDay; day <= currentDayIndex; day += 1) {
    const sessions = casinoDaySessions(profiles, day, balances, contract);
    for (const profile of profiles) for (const session of sessions[profile.id] ?? []) {
      const utcMinute = (contract.epochUtcDay + day) * MINUTES_PER_DAY + session.minuteOfDay;
      if (utcMinute > now - MINUTES_PER_DAY && utcMinute <= now && session.delta !== 0) output.push({ npcId: profile.id, utcMinute, session });
    }
    balances = addDay(balances, sessions, profiles);
  }
  output.sort((a,b) => b.utcMinute - a.utcMinute || compareText(a.npcId,b.npcId) || compareText(a.session.matchId,b.session.matchId));
  return Object.freeze(output.slice(0, limit));
}

export function completedDayBalances(
  profiles: readonly NpcGamblingProfile[], dayIndex: number, contract: NpcLedgerContract,
  checkpoint?: Readonly<Record<string, number>>, checkpointDayIndex = -1,
): Readonly<Record<string, number>> {
  if (!Number.isSafeInteger(dayIndex) || dayIndex < -1 || !Number.isSafeInteger(checkpointDayIndex) || checkpointDayIndex < -1 || checkpointDayIndex > dayIndex) throw new Error("npc_ledger_invalid_checkpoint_day");
  let balances = checkpointDayIndex >= 0 ? validateCheckpoint(profiles, checkpoint) : openingBalances(profiles);
  for (let day = checkpointDayIndex + 1; day <= dayIndex; day += 1) balances = addDay(balances, casinoDaySessions(profiles, day, balances, contract), profiles);
  return Object.freeze(balances);
}

export function rollingNpcProfitAt(profiles: readonly NpcGamblingProfile[], clock: CasinoClock, contract: NpcLedgerContract, days = 7): Readonly<Record<string, number>> {
  if (!Number.isSafeInteger(days) || days < 1) throw new Error("npc_ledger_invalid_period");
  const utcMinute = normalizedUtcMinute(clock);
  const absoluteDay = Math.floor(utcMinute / MINUTES_PER_DAY);
  const dayIndex = absoluteDay - contract.epochUtcDay;
  if (dayIndex < 0) return Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id, 0])));
  const periodStartDay = Math.max(0, dayIndex - days + 1);
  const periodOpening = periodStartDay === 0 ? openingBalances(profiles) : completedDayBalances(profiles, periodStartDay - 1, contract);
  let current = periodOpening;
  const minuteOfDay = utcMinute - absoluteDay * MINUTES_PER_DAY;
  for (let day = periodStartDay; day <= dayIndex; day += 1) {
    const all = casinoDaySessions(profiles, day, current, contract);
    const elapsed = day === dayIndex ? Object.fromEntries(profiles.map((profile) => [profile.id, (all[profile.id] ?? []).filter((session) => session.minuteOfDay <= minuteOfDay)])) : all;
    current = addDay(current, elapsed, profiles);
  }
  return Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id, current[profile.id]! - periodOpening[profile.id]!])))
}

function createIntents(profiles: readonly NpcGamblingProfile[], dayIndex: number, contract: NpcLedgerContract): Intent[] {
  return profiles.flatMap((profile) => {
    const prefix = `${contract.version}:${profile.id}:${dayIndex}`;
    const scheduleRng = new XorShift32(`${prefix}:schedule`);
    const tableRng = new XorShift32(`${prefix}:tables`);
    const count = randomInteger(profile.sessionsPerDay.min, profile.sessionsPerDay.max, scheduleRng);
    return sessionSchedule(profile, count, scheduleRng).map((minute, ordinal) => ({ npcId: profile.id, minute, ordinal, preferredTable: weightedTable(profile, tableRng) }));
  }).sort((a,b) => a.minute - b.minute || compareText(a.npcId,b.npcId) || a.ordinal - b.ordinal);
}

function createMatchPlans(intents: readonly Intent[], dayIndex: number, contract: NpcLedgerContract): readonly MatchPlan[] {
  const used = new Set<string>();
  const key = (intent: Intent) => `${intent.npcId}:${intent.ordinal}`;
  const plans: MatchPlan[] = [];
  for (let baseIndex=0;baseIndex<intents.length;baseIndex+=1) {
    const intent=intents[baseIndex]!;
    if (used.has(key(intent))) continue;
    const desiredSize = intent.preferredTable === "temerosa-slot" ? 1 : intent.preferredTable === "temerosa-old-maid" ? 4 : 2;
    const group=[intent];
    for(let offset=1;offset<intents.length&&group.length<desiredSize;offset+=1){
      const candidate=intents[(baseIndex+offset)%intents.length]!;
      if(candidate.npcId!==intent.npcId&&!used.has(key(candidate))&&!group.some((entry)=>entry.npcId===candidate.npcId))group.push(candidate);
    }
    group.forEach((entry) => used.add(key(entry)));
    const participantIds = Object.freeze(group.map((entry) => entry.npcId).sort(compareText));
    const minute = Math.round(group.reduce((sum,entry) => sum + entry.minute,0) / group.length);
    plans.push(Object.freeze({ matchId: `${contract.version}:${dayIndex}:${plans.length}:${intent.preferredTable}`, minute, tableId: intent.preferredTable, participantIds }));
  }
  return Object.freeze(plans.toSorted((a,b) => a.minute-b.minute || compareText(a.matchId,b.matchId)));
}

function settleFreeOldMaid(plan: MatchPlan, profiles: readonly NpcGamblingProfile[], balances: Record<string,number>, output: Record<string,NpcSession[]>, rng: XorShift32): void {
  const ranked = profiles.map((profile) => ({ profile, score: profile.skills.oldMaid + (rng.next()-.5)*.72 })).sort((a,b) => b.score-a.score || compareText(a.profile.id,b.profile.id));
  const rewards = ranked.length >= 4 ? [10,5,3,1] : ranked.length === 3 ? [10,5,3] : ranked.length === 2 ? [10,5] : [5];
  ranked.forEach(({profile}, index) => addSession(profile.id, plan, "temerosa-old-maid", 0, 0, rewards[index]!, `rank-${index+1}`, "old-maid-rank-reward/0.1", profiles.map((entry) => entry.id), balances, output));
}

function settlePvp(plan: MatchPlan, tableId: "temerosa-match-pairs"|"indian-poker", profiles: readonly NpcGamblingProfile[], balances: Record<string,number>, output: Record<string,NpcSession[]>, stake: Exclude<NpcStake,0>, multiplier: WagerMultiplier, rng: XorShift32): void {
  if (profiles.length < 2) { settleSlot(plan, profiles[0]!, balances, output, stake, multiplier, rng); return; }
  const [left,right] = profiles;
  const skill = (profile: NpcGamblingProfile) => tableId === "temerosa-match-pairs" ? profile.skills.matchPairsMemory : profile.skills.pokerRead*.58 + profile.skills.pokerBluff*.42;
  const leftScore = skill(left!) + (rng.next()-.5)*.9;
  const rightScore = skill(right!) + (rng.next()-.5)*.9;
  const exposure = stake * multiplier;
  const ids = profiles.map((profile) => profile.id);
  if (Math.abs(leftScore-rightScore) < .035) {
    for (const profile of profiles) addSession(profile.id, plan, tableId, stake, exposure, exposure, "draw", `${tableId}-ledger/0.4`, ids, balances, output);
    return;
  }
  const winner = leftScore > rightScore ? left! : right!;
  const loser = winner.id === left!.id ? right! : left!;
  addSession(winner.id, plan, tableId, stake, exposure, exposure*2, "win", `${tableId}-ledger/0.4`, ids, balances, output);
  addSession(loser.id, plan, tableId, stake, exposure, 0, "loss", `${tableId}-ledger/0.4`, ids, balances, output);
}

function settleSlot(plan: MatchPlan, profile: NpcGamblingProfile, balances: Record<string,number>, output: Record<string,NpcSession[]>, stake: Exclude<NpcStake,0>, multiplier: WagerMultiplier, rng: XorShift32): void {
  const grid = Array.from({length:9}, () => rng.nextUint32()%6);
  const lines = PAYLINES.filter((line) => line.every((cell) => grid[cell] === grid[line[0]!])).length;
  const exposure = stake*multiplier;
  const credit = stake*lines*6*multiplier;
  addSession(profile.id, plan, "temerosa-slot", stake, exposure, credit, `lines-${lines}`, "temerosa-slot-paytable/0.3", [profile.id], balances, output);
}

function addSession(npcId: string, plan: MatchPlan, tableId: CasinoTableId, stake: NpcStake, reservedAmount: number, creditAmount: number, resultKind: string, termsVersion: string, participantIds: readonly string[], balances: Record<string,number>, output: Record<string,NpcSession[]>): void {
  const affordableReserved = Math.min(reservedAmount, balances[npcId]!);
  const adjustedCredit = reservedAmount === affordableReserved ? creditAmount : affordableReserved;
  const delta = adjustedCredit-affordableReserved;
  balances[npcId] = Math.max(0, balances[npcId]!+delta);
  output[npcId]!.push(Object.freeze({ matchId: plan.matchId, participantIds: Object.freeze([...participantIds]), minuteOfDay: plan.minute, tableId, stake, reservedAmount: affordableReserved, creditAmount: adjustedCredit, delta, resultKind, termsVersion }));
}

function chooseSharedExposure(profiles: readonly NpcGamblingProfile[], balances: Readonly<Record<string,number>>, dayOpening: Readonly<Record<string,number>>, rng: XorShift32): {stake: Exclude<NpcStake,0>; multiplier: WagerMultiplier; exposure:number} {
  const initiator = profiles[0]!;
  const maximum = Math.min(...profiles.map((profile) => Math.floor(Math.min(balances[profile.id]!, Math.max(0, balances[profile.id]! * profile.maxExposureRatio)))));
  const stakes = PAID_STAKES.filter((stake) => stake*2 <= maximum);
  if (stakes.length === 0) return { stake:10, multiplier:2, exposure:0 };
  const pnl = balances[initiator.id]!-dayOpening[initiator.id]!;
  const tilt = pnl < 0 ? initiator.lossChasing : pnl > 0 ? initiator.winPressing : .5;
  const stakeWeights = stakes.map((stake,index) => 1 + index*initiator.riskAppetite*4 + (pnl < 0 ? index*tilt*2 : 0));
  const stake = stakes[drawWeightedIndex(stakeWeights,rng)]!;
  const legalMultipliers = WAGER_MULTIPLIERS.filter((value) => stake*value <= maximum);
  const weights = legalMultipliers.map((value) => 1 + (value-2)*(initiator.riskAppetite*.9+tilt*.35));
  const multiplier = legalMultipliers[drawWeightedIndex(weights,rng)]!;
  return { stake, multiplier, exposure:stake*multiplier };
}

function policyAllowsPaid(profile: NpcGamblingProfile, balance: number, opening: number): boolean {
  if (balance < 20) return false;
  const pnl = balance-opening;
  if (pnl <= -Math.round(opening*profile.stopLossRatio)) return false;
  if (pnl >= Math.round(opening*profile.takeProfitRatio)) return false;
  return true;
}

function addDay(openings: Readonly<Record<string,number>>, sessions: Readonly<Record<string,readonly NpcSession[]>>, profiles: readonly NpcGamblingProfile[]): Record<string,number> {
  return Object.fromEntries(profiles.map((profile) => {
    const balance = openings[profile.id]! + sumDeltas(sessions[profile.id] ?? []);
    if (!Number.isSafeInteger(balance) || balance < 0 || balance > MAX_SAFE_BALANCE) throw new Error(`npc_ledger_balance_out_of_range:${profile.id}`);
    return [profile.id,balance];
  }));
}

function openingBalances(profiles: readonly NpcGamblingProfile[]): Record<string,number> { return Object.fromEntries(profiles.map((profile) => [profile.id,profile.openingBalance])); }
function validateCheckpoint(profiles: readonly NpcGamblingProfile[], checkpoint?: Readonly<Record<string,number>>): Record<string,number> {
  if (!checkpoint) throw new Error("npc_ledger_invalid_checkpoint_balance");
  const output: Record<string,number> = {};
  for (const profile of profiles) {
    const value=checkpoint[profile.id];
    if (!Number.isSafeInteger(value)||value!<0||value!>MAX_SAFE_BALANCE) throw new Error(`npc_ledger_invalid_checkpoint_balance:${profile.id}`);
    output[profile.id]=value!;
  }
  return output;
}

function sessionSchedule(profile: NpcGamblingProfile,count:number,rng:XorShift32): readonly number[] {
  const values=new Set<number>(); let attempts=0;
  while(values.size<count&&attempts<count*100){ attempts++; const range=profile.activeHours[drawWeightedIndex(profile.activeHours.map((entry)=>entry.weight),rng)]!; values.add(range.startMinute+Math.floor(rng.next()*(range.endMinute-range.startMinute))); }
  for(const range of profile.activeHours) for(let minute=range.startMinute;minute<range.endMinute&&values.size<count;minute++) values.add(minute);
  if(values.size!==count) throw new Error("npc_ledger_insufficient_schedule");
  return [...values].sort((a,b)=>a-b);
}
function weightedTable(profile:NpcGamblingProfile,rng:XorShift32):CasinoTableId { return profile.tables[drawWeightedIndex(profile.tables.map((entry)=>entry.weight),rng)]!.tableId; }
function drawWeightedIndex(weights:readonly number[],rng:XorShift32):number { const total=weights.reduce((sum,value)=>sum+value,0); if(!(total>0)) throw new Error("npc_ledger_empty_weight"); let cursor=rng.next()*total; for(let i=0;i<weights.length;i++){cursor-=weights[i]!;if(cursor<0)return i;}return weights.length-1; }
function randomInteger(min:number,max:number,rng:XorShift32):number { return min+Math.floor(rng.next()*(max-min+1)); }
function sumDeltas(sessions:readonly NpcSession[]):number { return sessions.reduce((sum,session)=>sum+session.delta,0); }
function normalizedUtcMinute(clock:CasinoClock):number { const value=clock.utcMinute(); if(!Number.isSafeInteger(value))throw new Error("npc_ledger_invalid_clock"); return value; }
function compareText(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function validateDay(profiles:readonly NpcGamblingProfile[],dayIndex:number,openings:Readonly<Record<string,number>>,contract:NpcLedgerContract):void {
  if(contract.version!=="npc-ledger/0.4"||!Number.isSafeInteger(contract.epochUtcDay)||!Number.isSafeInteger(dayIndex)||dayIndex<0)throw new Error("npc_ledger_invalid_contract");
  if(profiles.length===0||new Set(profiles.map((p)=>p.id)).size!==profiles.length||profiles.some((profile)=>!contract.profiles.some((entry)=>entry.id===profile.id)))throw new Error("npc_ledger_invalid_profiles");
  for(const profile of profiles){
    if(!profile.id||!profile.name||!Number.isSafeInteger(profile.openingBalance)||profile.openingBalance<=0)throw new Error("npc_ledger_invalid_profile");
    for(const value of [profile.riskAppetite,profile.discipline,profile.lossChasing,profile.winPressing,profile.stopLossRatio,profile.takeProfitRatio,profile.maxExposureRatio,...Object.values(profile.skills)]) if(!(value>=0&&value<=1))throw new Error("npc_ledger_invalid_profile");
    const opening=openings[profile.id]; if(!Number.isSafeInteger(opening)||opening!<0||opening!>MAX_SAFE_BALANCE)throw new Error(`npc_ledger_invalid_state:${profile.id}`);
  }
}
