import { WAGER_MULTIPLIERS, XorShift32, type WagerMultiplier } from "@lucky-arcade/engine";
import { NPC_INCOME_AMOUNTS } from "./economy.ts";
import {
  CASINO_SECONDS_PER_DAY,
  casinoKstDayAtUtcSecond,
  casinoSecondOfKstDayAtUtcSecond,
  casinoUtcSecondAtKstDay,
} from "./casino-time.ts";
import type {
  CasinoClock,
  CasinoDayPlan,
  CasinoTableId,
  NpcActivity,
  NpcBalanceSnapshot,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcMatch,
  NpcBalanceEvent,
  NpcPredictionWager,
  NpcSession,
  NpcStake,
  NpcVisit,
} from "./contracts.ts";

const MINUTES_PER_DAY = 1_440;
const SECONDS_PER_DAY = CASINO_SECONDS_PER_DAY;
const MAX_SAFE_BALANCE = 1_000_000_000;
const PAID_STAKES = [10, 50, 200] as const;
const HIGH_LOW_RETURN_MULTIPLIERS = [1.3, 1.9, 2.7, 4, 5.5] as const;
const PAYLINES = [[0,1,2],[3,4,5],[6,7,8],[0,4,8],[6,4,2]] as const;
const VISIT_SECONDS = Object.freeze({
  "temerosa-slot": [2_700, 5_400],
  "indian-poker": [3_600, 7_200],
  "temerosa-match-pairs": [3_600, 7_200],
  "temerosa-old-maid": [3_600, 7_200],
  "temerosa-high-low": [2_700, 5_400],
  "temerosa-five-card-draw": [3_600, 7_200],
} as const);
const MATCH_SECONDS = Object.freeze({
  "temerosa-slot": [45, 90],
  "indian-poker": [120, 240],
  "temerosa-match-pairs": [180, 360],
  "temerosa-old-maid": [240, 480],
  "temerosa-high-low": [45, 120],
  "temerosa-five-card-draw": [180, 360],
} as const);
/** 2026-07-30 18:00 KST. Earlier settlements on release day remain byte-for-byte stable. */
const FIVE_CARD_DRAW_OPENING_SECOND_OF_DAY = 18 * 60 * 60;

interface VisitIntent { npcId: string; second: number; ordinal: number; tableId: CasinoTableId }
interface MatchDraft { matchId: string; visitId: string; tableId: CasinoTableId; participantIds: readonly string[]; startsAtSecondOfDay: number; settlesAtSecondOfDay: number }
const DAY_PLAN_CACHE = new Map<string,CasinoDayPlan>();

/** The v0.5 source of truth: a visit contains independently resolved real matches. */
export function casinoDayPlan(
  profiles: readonly NpcGamblingProfile[],
  dayIndex: number,
  openingBalances: Readonly<Record<string, number>>,
  contract: NpcLedgerContract,
  balanceEvents: readonly NpcBalanceEvent[] = Object.freeze([]),
): CasinoDayPlan {
  validateDay(profiles, dayIndex, openingBalances, contract);
  validateBalanceEvents(balanceEvents, profiles);
  const cacheKey=profiles===contract.profiles&&balanceEvents.length===0?`${contract.version}:${contract.seedVersion}:${dayIndex}:${profiles.map((profile)=>openingBalances[profile.id]).join(",")}`:undefined;
  const cached=cacheKey===undefined?undefined:DAY_PLAN_CACHE.get(cacheKey);
  if(cached){DAY_PLAN_CACHE.delete(cacheKey!);DAY_PLAN_CACHE.set(cacheKey!,cached);return cached;}
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const visits = createVisits(profiles, dayIndex, contract);
  const drafts = visits.flatMap((visit) => createMatchDrafts(visit, dayIndex, contract))
    .toSorted((left, right) => left.settlesAtSecondOfDay - right.settlesAtSecondOfDay || compareText(left.matchId, right.matchId));
  const balances: Record<string, number> = { ...openingBalances };
  const visitOpening = new Map<string,number>();
  const output: Record<string, NpcSession[]> = Object.fromEntries(profiles.map((profile) => [profile.id, []]));
  const incomes = incomeSessionsForDay(profiles, dayIndex, contract);
  for (const [npcId, session] of Object.entries(incomes)) output[npcId]!.push(session);
  const appliedIncome = new Set<string>();
  const matches: NpcMatch[] = [];
  const predictions: NpcPredictionWager[] = [];
  const orderedEvents = [...balanceEvents].sort((left,right)=>left.secondOfDay-right.secondOfDay||compareText(left.eventId,right.eventId));
  let eventCursor = 0;
  const applyEventsThrough = (secondOfDay:number) => {
    while(eventCursor<orderedEvents.length&&orderedEvents[eventCursor]!.secondOfDay<=secondOfDay){
      const event=orderedEvents[eventCursor++]!;
      balances[event.npcId]! += event.delta;
      if(!Number.isSafeInteger(balances[event.npcId])||balances[event.npcId]!<0)throw new Error(`npc_worldline_insolvent:${event.eventId}`);
    }
  };

  for (const draft of drafts) {
    applyEventsThrough(draft.startsAtSecondOfDay);
    for (const [npcId, session] of Object.entries(incomes)) {
      if (!appliedIncome.has(npcId) && session.secondOfDay <= draft.startsAtSecondOfDay) {
        balances[npcId]! += session.delta;
        appliedIncome.add(npcId);
      }
    }
    const participants = draft.participantIds.map((id) => byId.get(id)).filter((value): value is NpcGamblingProfile => Boolean(value));
    if (participants.length === 0) continue;
    const rng = new XorShift32(`${contract.seedVersion}:${dayIndex}:${draft.matchId}:result`);
    for(const profile of participants){const key=`${draft.visitId}:${profile.id}`;if(!visitOpening.has(key))visitOpening.set(key,balances[profile.id]!);}
    if (draft.tableId === "temerosa-old-maid") {
      if (participants.length < 2 || !participants.every((profile) => policyAllowsPaid(profile, balances[profile.id]!, visitOpening.get(`${draft.visitId}:${profile.id}`)!,rng))) continue;
      const terms = chooseOldMaidExposure(participants, balances, rng);
      if (terms.exposure === 0) continue;
      settlePaidOldMaid(draft, participants, balances, output, terms.stake, terms.multiplier, terms.exposure, rng);
      matches.push(matchFromDraft(draft, terms.stake, terms.multiplier));
      continue;
    }
    if (!participants.every((profile) => policyAllowsPaid(profile, balances[profile.id]!, visitOpening.get(`${draft.visitId}:${profile.id}`)!,rng))) continue;
    const reference=Object.fromEntries(participants.map((profile)=>[profile.id,visitOpening.get(`${draft.visitId}:${profile.id}`)!]));
    const terms = chooseSharedExposure(participants, balances, reference, rng);
    if (terms.exposure === 0) continue;
    if (draft.tableId === "temerosa-slot") {
      settleSlot(draft, participants[0]!, balances, output, terms.stake, terms.multiplier, rng);
    } else if (draft.tableId === "temerosa-high-low") {
      settleHighLow(draft, participants[0]!, balances, output, terms.stake, terms.multiplier, rng);
    } else {
      settlePvp(draft, draft.tableId, participants, balances, output, terms.stake, terms.multiplier, rng);
    }
    matches.push(matchFromDraft(draft, terms.stake, terms.multiplier));
  }

  const liveVisitIds = new Set(matches.map((match) => match.visitId));
  const finalVisits = visits.filter((visit) => liveVisitIds.has(visit.visitId)).map((visit) => {
    const last = matches.filter((match) => match.visitId === visit.visitId).at(-1);
    return Object.freeze({ ...visit, endsAtSecondOfDay: Math.min(visit.endsAtSecondOfDay, (last?.settlesAtSecondOfDay ?? visit.endsAtSecondOfDay) + 12) });
  });
  const plan=Object.freeze({
    visits: Object.freeze(finalVisits),
    matches: Object.freeze(matches),
    predictions: Object.freeze(predictions),
    sessions: freezeSessions(output),
  });
  if(cacheKey!==undefined){DAY_PLAN_CACHE.set(cacheKey,plan);while(DAY_PLAN_CACHE.size>16)DAY_PLAN_CACHE.delete(DAY_PLAN_CACHE.keys().next().value!);}
  return plan;
}

export function casinoDaySessions(
  profiles: readonly NpcGamblingProfile[], dayIndex: number, openingBalances: Readonly<Record<string, number>>, contract: NpcLedgerContract,
  balanceEvents: readonly NpcBalanceEvent[] = Object.freeze([]),
): Readonly<Record<string, readonly NpcSession[]>> {
  return casinoDayPlan(profiles, dayIndex, openingBalances, contract, balanceEvents).sessions;
}

export function npcDaySessions(profile: NpcGamblingProfile, dayIndex: number, openingBalance: number, contract: NpcLedgerContract): readonly NpcSession[] {
  const openings = Object.fromEntries(contract.profiles.map((entry) => [entry.id, entry.id === profile.id ? openingBalance : entry.openingBalance]));
  return casinoDayPlan(contract.profiles, dayIndex, openings, contract).sessions[profile.id] ?? Object.freeze([]);
}

export function npcBalanceAt(profile: NpcGamblingProfile, clock: CasinoClock, contract: NpcLedgerContract): NpcBalanceSnapshot {
  const nowSecond = normalizedUtcSecond(clock);
  const absoluteDay = casinoKstDayAtUtcSecond(nowSecond);
  const dayIndex = absoluteDay - contract.epochKstDay;
  if (dayIndex < 0) return { balance: profile.openingBalance, today: Object.freeze([]), dayIndex: 0 };
  const opening = dayIndex === 0 ? openingBalances(contract.profiles) : completedDayBalances(contract.profiles, dayIndex - 1, contract);
  const secondOfDay = casinoSecondOfKstDayAtUtcSecond(nowSecond);
  const today = (casinoDayPlan(contract.profiles, dayIndex, opening, contract).sessions[profile.id] ?? []).filter((session) => session.secondOfDay <= secondOfDay);
  return { balance: opening[profile.id]! + sumDeltas(today), today: Object.freeze(today), dayIndex };
}

export function recentNpcActivitiesAt(profiles: readonly NpcGamblingProfile[], clock: CasinoClock, contract: NpcLedgerContract, limit: number): readonly NpcActivity[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("npc_ledger_invalid_limit");
  if (limit === 0) return Object.freeze([]);
  const nowSecond = normalizedUtcSecond(clock);
  const absoluteDay = casinoKstDayAtUtcSecond(nowSecond);
  const currentDayIndex = absoluteDay - contract.epochKstDay;
  if (currentDayIndex < 0) return Object.freeze([]);
  const firstDay = Math.max(0, currentDayIndex - 1);
  let balances = firstDay === 0 ? openingBalances(profiles) : completedDayBalances(profiles, firstDay - 1, contract);
  const output: NpcActivity[] = [];
  for (let day = firstDay; day <= currentDayIndex; day += 1) {
    const plan = casinoDayPlan(profiles, day, balances, contract);
    for (const profile of profiles) for (const session of plan.sessions[profile.id] ?? []) {
      const utcSecond = casinoUtcSecondAtKstDay(contract.epochKstDay + day, session.secondOfDay);
      if (utcSecond > nowSecond - SECONDS_PER_DAY && utcSecond <= nowSecond && session.delta !== 0) {
        output.push({ npcId: profile.id, utcSecond, utcMinute: Math.floor(utcSecond / 60), session });
      }
    }
    balances = addDay(balances, plan.sessions, profiles);
  }
  output.sort((a,b) => b.utcSecond - a.utcSecond || compareText(a.session.matchId,b.session.matchId) || compareText(a.npcId,b.npcId));
  return Object.freeze(output.slice(0, limit));
}

/** Complete receipts for one NPC over a rolling period. `days=0` means the contract epoch. */
export function npcActivitiesForAt(
  profiles: readonly NpcGamblingProfile[], clock: CasinoClock, contract: NpcLedgerContract, npcId: string, days = 0,
): readonly NpcActivity[] {
  if (!profiles.some((profile) => profile.id === npcId)) throw new Error("npc_ledger_unknown_npc");
  if (!Number.isSafeInteger(days) || days < 0) throw new Error("npc_ledger_invalid_period");
  const nowSecond = normalizedUtcSecond(clock);
  const absoluteDay = casinoKstDayAtUtcSecond(nowSecond);
  const currentDayIndex = absoluteDay - contract.epochKstDay;
  if (currentDayIndex < 0) return Object.freeze([]);
  const lower = days === 0 ? casinoUtcSecondAtKstDay(contract.epochKstDay) : nowSecond - days * SECONDS_PER_DAY;
  const firstDay = Math.max(0, casinoKstDayAtUtcSecond(lower) - contract.epochKstDay);
  let balances = firstDay === 0 ? openingBalances(profiles) : completedDayBalances(profiles, firstDay - 1, contract);
  const output: NpcActivity[] = [];
  for (let day = firstDay; day <= currentDayIndex; day += 1) {
    const plan = casinoDayPlan(profiles, day, balances, contract);
    for (const session of plan.sessions[npcId] ?? []) {
      const utcSecond = casinoUtcSecondAtKstDay(contract.epochKstDay + day, session.secondOfDay);
      if (utcSecond > lower && utcSecond <= nowSecond) output.push({ npcId, utcSecond, utcMinute: Math.floor(utcSecond / 60), session });
    }
    balances = addDay(balances, plan.sessions, profiles);
  }
  return Object.freeze(output.toSorted((left, right) => right.utcSecond - left.utcSecond || compareText(left.session.matchId, right.session.matchId)));
}

export function completedDayBalances(
  profiles: readonly NpcGamblingProfile[], dayIndex: number, contract: NpcLedgerContract,
  checkpoint?: Readonly<Record<string, number>>, checkpointDayIndex = -1,
): Readonly<Record<string, number>> {
  if (!Number.isSafeInteger(dayIndex) || dayIndex < -1 || !Number.isSafeInteger(checkpointDayIndex) || checkpointDayIndex < -1 || checkpointDayIndex > dayIndex) throw new Error("npc_ledger_invalid_checkpoint_day");
  let balances = checkpointDayIndex >= 0 ? validateCheckpoint(profiles, checkpoint) : openingBalances(profiles);
  for (let day = checkpointDayIndex + 1; day <= dayIndex; day += 1) balances = addDay(balances, casinoDayPlan(profiles, day, balances, contract).sessions, profiles);
  return Object.freeze(balances);
}

export function rollingNpcProfitAt(profiles: readonly NpcGamblingProfile[], clock: CasinoClock, contract: NpcLedgerContract, days = 7): Readonly<Record<string, number>> {
  if (!Number.isSafeInteger(days) || days < 1) throw new Error("npc_ledger_invalid_period");
  const nowSecond = normalizedUtcSecond(clock);
  const absoluteDay = casinoKstDayAtUtcSecond(nowSecond);
  const dayIndex = absoluteDay - contract.epochKstDay;
  const earliestHistoryDay = contract.profitHistory[0]?.kstDay ?? contract.epochKstDay;
  if (absoluteDay < earliestHistoryDay) return Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id, 0])));
  const periodStartKstDay = Math.max(earliestHistoryDay, absoluteDay - days + 1);
  const profits: Record<string, number> = Object.fromEntries(profiles.map((profile) => [profile.id, 0]));
  for (const history of contract.profitHistory) {
    if (history.kstDay < periodStartKstDay || history.kstDay > absoluteDay) continue;
    for (const profile of profiles) profits[profile.id]! += history.profits[profile.id] ?? 0;
  }
  if (dayIndex < 0) return Object.freeze(profits);
  const periodStartDay = Math.max(0, periodStartKstDay - contract.epochKstDay);
  const periodOpening = periodStartDay === 0 ? openingBalances(profiles) : completedDayBalances(profiles, periodStartDay - 1, contract);
  let current = periodOpening;
  const secondOfDay = casinoSecondOfKstDayAtUtcSecond(nowSecond);
  for (let day = periodStartDay; day <= dayIndex; day += 1) {
    const all = casinoDayPlan(profiles, day, current, contract).sessions;
    const elapsed = day === dayIndex
      ? Object.fromEntries(profiles.map((profile) => [profile.id, (all[profile.id] ?? []).filter((session) => session.secondOfDay <= secondOfDay)]))
      : all;
    current = addDay(current, elapsed, profiles);
  }
  for (const profile of profiles) profits[profile.id]! += current[profile.id]! - periodOpening[profile.id]!;
  return Object.freeze(profits);
}

function createVisits(profiles: readonly NpcGamblingProfile[], dayIndex: number, contract: NpcLedgerContract): readonly NpcVisit[] {
  const intents = createIntents(profiles, dayIndex, contract);
  const pending = new Map<CasinoTableId, VisitIntent[]>();
  const groups: VisitIntent[][] = [];
  for (const intent of intents) {
    const desired = participantCount(intent.tableId);
    const group = pending.get(intent.tableId) ?? [];
    if (group.some((entry) => entry.npcId === intent.npcId)) flushPending(intent.tableId, group, groups, pending);
    const current = pending.get(intent.tableId) ?? [];
    current.push(intent);
    pending.set(intent.tableId, current);
    if (current.length >= desired) flushPending(intent.tableId, current, groups, pending);
  }
  for (const [tableId, group] of pending) flushPending(tableId, group, groups, pending);
  const availableAt: Record<string, number> = Object.fromEntries(profiles.map((profile) => [profile.id, 0]));
  const visits: NpcVisit[] = [];
  for (const group of groups.toSorted((a,b) => averageSecond(a)-averageSecond(b))) {
    const originalTable = group[0]!.tableId;
    const tableId = group.length < participantCount(originalTable) && originalTable !== "temerosa-old-maid" ? "temerosa-slot" : originalTable;
    const participants = tableId === "temerosa-slot" ? [group[0]!.npcId] : group.map((entry) => entry.npcId);
    if (tableId === "temerosa-old-maid" && participants.length < 2) participants.splice(0, participants.length, group[0]!.npcId);
    const rng = new XorShift32(`${contract.seedVersion}:${dayIndex}:${visits.length}:${participants.join("+")}:visit`);
    const start = Math.max(Math.round(averageSecond(group)), ...participants.map((id) => availableAt[id]! + 30));
    if (start > SECONDS_PER_DAY - 180) continue;
    const range = VISIT_SECONDS[tableId];
    const desiredEnd = start + randomInteger(range[0], range[1], rng);
    const end = Math.min(SECONDS_PER_DAY - 1, desiredEnd);
    if (end - start < 150) continue;
    const visitId = `${contract.seedVersion}:${dayIndex}:visit:${visits.length}:${tableId}`;
    const visit = Object.freeze({ visitId, tableId, participantIds: Object.freeze(participants.toSorted(compareText)), startedAtSecondOfDay: start, endsAtSecondOfDay: end });
    visits.push(visit);
    for (const id of participants) availableAt[id] = end + 30;
  }
  return Object.freeze(visits);
}

function createIntents(profiles: readonly NpcGamblingProfile[], dayIndex: number, contract: NpcLedgerContract): VisitIntent[] {
  return profiles.flatMap((profile) => {
    const prefix = `${contract.seedVersion}:${profile.id}:${dayIndex}`;
    const scheduleRng = new XorShift32(`${prefix}:schedule`);
    const tableRng = new XorShift32(`${prefix}:tables`);
    const count = randomInteger(profile.sessionsPerDay.min, profile.sessionsPerDay.max, scheduleRng);
    return sessionSchedule(profile, count, scheduleRng).map((minute, ordinal) => {
      const second=minute*60+randomInteger(0,59,scheduleRng);
      return { npcId: profile.id, second, ordinal, tableId: weightedTable(profile, tableRng, dayIndex, second) };
    });
  }).sort((a,b) => a.second-b.second || compareText(a.npcId,b.npcId) || a.ordinal-b.ordinal);
}

function createMatchDrafts(visit: NpcVisit, dayIndex: number, contract: NpcLedgerContract): readonly MatchDraft[] {
  const rng = new XorShift32(`${contract.seedVersion}:${dayIndex}:${visit.visitId}:matches`);
  const range = MATCH_SECONDS[visit.tableId];
  const output: MatchDraft[] = [];
  let starts = visit.startedAtSecondOfDay + randomInteger(12,24,rng);
  while (starts + range[0] <= visit.endsAtSecondOfDay - 8) {
    const settles = Math.min(visit.endsAtSecondOfDay - 8, starts + randomInteger(range[0],range[1],rng));
    if (settles <= starts) break;
    const matchId = `${visit.visitId}:match:${output.length}`;
    output.push(Object.freeze({ matchId, visitId: visit.visitId, tableId: visit.tableId, participantIds: visit.participantIds, startsAtSecondOfDay: starts, settlesAtSecondOfDay: settles }));
    starts = settles + randomInteger(8,24,rng);
  }
  return Object.freeze(output);
}

function settlePaidOldMaid(
  plan: MatchDraft,
  profiles: readonly NpcGamblingProfile[],
  balances: Record<string,number>,
  output: Record<string,NpcSession[]>,
  stake: Exclude<NpcStake,0>,
  multiplier: WagerMultiplier,
  exposure: number,
  rng: XorShift32,
): void {
  const ranked = profiles.map((profile) => ({ profile, score: profile.skills.oldMaid + (rng.next()-.5)*.72 })).sort((a,b) => b.score-a.score || compareText(a.profile.id,b.profile.id));
  const unit = stake * multiplier;
  const credits = ranked.length >= 4 ? [unit*3,unit*2,unit,0] : ranked.length === 3 ? [unit*2,unit,0] : [unit*2,0];
  ranked.forEach(({profile}, index) => {
    addSession(
      profile.id, plan, stake, exposure, credits[index]!, `rank-${index+1}`,
      "old-maid-zero-sum/1.0", balances, output,
    );
  });
}

function settlePvp(plan: MatchDraft, tableId: "temerosa-match-pairs"|"indian-poker"|"temerosa-five-card-draw", profiles: readonly NpcGamblingProfile[], balances: Record<string,number>, output: Record<string,NpcSession[]>, stake: Exclude<NpcStake,0>, multiplier: WagerMultiplier, rng: XorShift32): void {
  if (profiles.length < 2) return;
  const [left,right] = profiles;
  const skill = (profile: NpcGamblingProfile) => tableId === "temerosa-match-pairs" ? profile.skills.matchPairsMemory : profile.skills.pokerRead*.58 + profile.skills.pokerBluff*.42;
  const leftScore = skill(left!) + (rng.next()-.5)*.9;
  const rightScore = skill(right!) + (rng.next()-.5)*.9;
  const exposure = stake*multiplier;
  const termsVersion=tableId==="temerosa-five-card-draw"?"temerosa-five-card-draw-ledger/1.0":`${tableId}-ledger/0.5`;
  if (Math.abs(leftScore-rightScore) < .035) {
    for (const profile of profiles) addSession(profile.id, plan, stake, exposure, exposure, "draw", termsVersion, balances, output);
    return;
  }
  const winner = leftScore > rightScore ? left! : right!;
  const loser = winner.id === left!.id ? right! : left!;
  addSession(winner.id, plan, stake, exposure, exposure*2, "win", termsVersion, balances, output);
  addSession(loser.id, plan, stake, exposure, 0, "loss", termsVersion, balances, output);
}

function settleSlot(plan: MatchDraft, profile: NpcGamblingProfile, balances: Record<string,number>, output: Record<string,NpcSession[]>, stake: Exclude<NpcStake,0>, multiplier: WagerMultiplier, rng: XorShift32): void {
  const grid = Array.from({length:9}, () => rng.nextUint32()%6);
  const lines = PAYLINES.filter((line) => line.every((cell) => grid[cell] === grid[line[0]!])).length;
  const exposure = stake*multiplier;
  const credit = stake*lines*6*multiplier;
  addSession(profile.id, plan, stake, exposure, credit, `lines-${lines}`, "temerosa-slot-paytable/0.3", balances, output);
}

function settleHighLow(plan: MatchDraft, profile: NpcGamblingProfile, balances: Record<string,number>, output: Record<string,NpcSession[]>, stake: Exclude<NpcStake,0>, multiplier: WagerMultiplier, rng: XorShift32): void {
  const exposure = stake * multiplier;
  let currentRank = randomInteger(2, 14, rng);
  for (let streak = 1; streak <= HIGH_LOW_RETURN_MULTIPLIERS.length; streak += 1) {
    const higherChance = (14 - currentRank) / 13;
    const lowerChance = (currentRank - 2) / 13;
    const optimalHigher = higherChance >= lowerChance;
    const followsRead = rng.next() < .55 + profile.skills.highLowJudgment * .42;
    const guessesHigher = followsRead ? optimalHigher : !optimalHigher;
    const nextRank = randomInteger(2, 14, rng);
    const correct = guessesHigher ? nextRank > currentRank : nextRank < currentRank;
    if (!correct) {
      addSession(profile.id, plan, stake, exposure, 0, `loss-${streak}`, "temerosa-high-low-paytable/0.3", balances, output);
      return;
    }
    currentRank = nextRank;
    const baseCredit = Math.round(stake * HIGH_LOW_RETURN_MULTIPLIERS[streak - 1]!);
    if (streak === HIGH_LOW_RETURN_MULTIPLIERS.length || !highLowContinues(profile, currentRank, streak, rng)) {
      addSession(profile.id, plan, stake, exposure, baseCredit * multiplier, `cashout-${streak}`, "temerosa-high-low-paytable/0.3", balances, output);
      return;
    }
  }
}

function highLowContinues(profile: NpcGamblingProfile, currentRank: number, streak: number, rng: XorShift32): boolean {
  const bestChance = Math.max(14-currentRank,currentRank-2)/13;
  const appetite = profile.riskAppetite*.34 + profile.winPressing*.28 + profile.skills.highLowJudgment*.16;
  const caution = profile.discipline*(.12+streak*.095) + Math.max(0,.48-bestChance)*.8;
  return rng.next() < Math.max(.08,Math.min(.9,.34+appetite-caution));
}

function addSession(
  npcId: string,
  plan: MatchDraft,
  stake: NpcStake,
  reservedAmount: number,
  creditAmount: number,
  resultKind: string,
  termsVersion: string,
  balances: Record<string,number>,
  output: Record<string,NpcSession[]>,
  extras: Pick<NpcSession,"rankReward"|"prediction"> = {},
): void {
  const affordableReserved = Math.min(reservedAmount, balances[npcId]!);
  const adjustedCredit = reservedAmount === affordableReserved ? creditAmount : affordableReserved;
  const delta = adjustedCredit-affordableReserved;
  balances[npcId] = Math.max(0, balances[npcId]!+delta);
  output[npcId]!.push(Object.freeze({
    matchId: plan.matchId, visitId: plan.visitId, participantIds: plan.participantIds,
    secondOfDay: plan.settlesAtSecondOfDay, minuteOfDay: Math.floor(plan.settlesAtSecondOfDay/60),
    tableId: plan.tableId, stake, reservedAmount: affordableReserved, creditAmount: adjustedCredit,
    delta, resultKind, termsVersion,
    ...extras,
  }));
}

function chooseSharedExposure(profiles: readonly NpcGamblingProfile[], balances: Readonly<Record<string,number>>, dayOpening: Readonly<Record<string,number>>, rng: XorShift32): {stake: Exclude<NpcStake,0>; multiplier: WagerMultiplier; exposure:number} {
  const initiator = profiles[0]!;
  const maximum = Math.min(...profiles.map((profile) => Math.floor(Math.min(balances[profile.id]!, Math.max(0, balances[profile.id]! * profile.maxExposureRatio)))));
  const stakes = PAID_STAKES.filter((stake) => stake*2 <= maximum);
  if (stakes.length === 0) return { stake:10, multiplier:2, exposure:0 };
  const pnl = balances[initiator.id]!-dayOpening[initiator.id]!;
  const tilt = pnl < 0 ? initiator.lossChasing : pnl > 0 ? initiator.winPressing : .5;
  const stakeWeights = stakes.map((_,index) => 1 + index*initiator.riskAppetite*4 + (pnl < 0 ? index*tilt*2 : 0));
  const stake = stakes[drawWeightedIndex(stakeWeights,rng)]!;
  const legalMultipliers = WAGER_MULTIPLIERS.filter((value) => stake*value <= maximum);
  const weights = legalMultipliers.map((value) => 1 + (value-2)*(initiator.riskAppetite*.9+tilt*.35));
  const multiplier = legalMultipliers[drawWeightedIndex(weights,rng)]!;
  return { stake, multiplier, exposure:stake*multiplier };
}

function chooseOldMaidExposure(profiles: readonly NpcGamblingProfile[], balances: Readonly<Record<string,number>>, rng: XorShift32): {stake:Exclude<NpcStake,0>;multiplier:WagerMultiplier;exposure:number} {
  const lossUnits = profiles.length >= 4 ? 1.5 : 1;
  const maximum = Math.min(...profiles.map((profile) => Math.floor(Math.min(balances[profile.id]!, balances[profile.id]!*profile.maxExposureRatio))));
  const choices = PAID_STAKES.flatMap((stake) => WAGER_MULTIPLIERS.map((multiplier) => ({stake,multiplier,exposure:Math.round(stake*multiplier*lossUnits)})))
    .filter((choice) => choice.exposure <= maximum);
  if (choices.length === 0) return {stake:10,multiplier:2,exposure:0};
  const weights = choices.map((choice) => 1 + choice.stake/50 + (choice.multiplier-2)*profiles[0]!.riskAppetite);
  return choices[drawWeightedIndex(weights,rng)]!;
}

function policyAllowsPaid(profile: NpcGamblingProfile, balance: number, opening: number, rng:XorShift32): boolean {
  if (balance < 20) return false;
  const pnl = balance-opening;
  const outside=pnl<=-Math.round(opening*profile.stopLossRatio)||pnl>=Math.round(opening*profile.takeProfitRatio);
  return !outside||rng.next()>=profile.discipline*.18;
}

function matchFromDraft(draft: MatchDraft, stake: NpcStake, multiplier: 1|2|3|4|5): NpcMatch {
  return Object.freeze({ ...draft, stake, multiplier });
}

function flushPending(tableId: CasinoTableId, group: VisitIntent[], groups: VisitIntent[][], pending: Map<CasinoTableId,VisitIntent[]>): void {
  if (group.length > 0) groups.push([...group]);
  pending.set(tableId, []);
}
function participantCount(tableId: CasinoTableId): number { return tableId === "temerosa-slot" || tableId === "temerosa-high-low" ? 1 : tableId === "temerosa-old-maid" ? 4 : 2; }
function averageSecond(group: readonly VisitIntent[]): number { return group.reduce((sum,entry)=>sum+entry.second,0)/group.length; }
function freezeSessions(output: Record<string,NpcSession[]>): Readonly<Record<string,readonly NpcSession[]>> { return Object.freeze(Object.fromEntries(Object.entries(output).map(([id,sessions])=>[id,Object.freeze(sessions.toSorted((a,b)=>a.secondOfDay-b.secondOfDay||compareText(a.matchId,b.matchId)))]))); }
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
function sessionSchedule(profile:NpcGamblingProfile,count:number,rng:XorShift32): readonly number[] {
  const values=new Set<number>(); let attempts=0;
  while(values.size<count&&attempts<count*100){ attempts++; const range=profile.activeHours[drawWeightedIndex(profile.activeHours.map((entry)=>entry.weight),rng)]!; values.add(range.startMinute+Math.floor(rng.next()*(range.endMinute-range.startMinute))); }
  for(const range of profile.activeHours) for(let minute=range.startMinute;minute<range.endMinute&&values.size<count;minute++) values.add(minute);
  if(values.size!==count) throw new Error("npc_ledger_insufficient_schedule");
  return [...values].sort((a,b)=>a-b);
}
function weightedTable(profile:NpcGamblingProfile,rng:XorShift32,dayIndex:number,secondOfDay:number):CasinoTableId {
  /* Release-day visits before opening preserve every already-observed v1.0
     settlement. Later visits can enter the newly public table immediately. */
  const beforeOpening=dayIndex===0&&secondOfDay<FIVE_CARD_DRAW_OPENING_SECOND_OF_DAY;
  const tables=beforeOpening?profile.tables.filter((entry)=>entry.tableId!=="temerosa-five-card-draw"):profile.tables;
  return tables[drawWeightedIndex(tables.map((entry)=>entry.weight),rng)]!.tableId;
}
function incomeSessionsForDay(profiles:readonly NpcGamblingProfile[],dayIndex:number,contract:NpcLedgerContract):Readonly<Record<string,NpcSession>> {
  const absoluteDay=contract.epochKstDay+dayIndex;
  return Object.freeze(Object.fromEntries(profiles.flatMap((profile)=>{
    if(absoluteDay%profile.payCycleDays!==profile.paydayOffset)return [];
    const amount=NPC_INCOME_AMOUNTS[profile.incomeBand];
    const secondOfDay=6*3_600+profile.paydayOffset*60;
    return [[profile.id,Object.freeze({matchId:`npc-income/1.0:${absoluteDay}:${profile.id}`,visitId:`npc-income/1.0:${absoluteDay}`,participantIds:Object.freeze([profile.id]),secondOfDay,minuteOfDay:Math.floor(secondOfDay/60),tableId:"npc-income" as const,stake:0,reservedAmount:0,creditAmount:amount,delta:amount,resultKind:"salary",termsVersion:"npc-income/1.0"})]];
  })));
}
function drawWeightedIndex(weights:readonly number[],rng:XorShift32):number { const total=weights.reduce((sum,value)=>sum+value,0); if(!(total>0)) throw new Error("npc_ledger_empty_weight"); let cursor=rng.next()*total; for(let i=0;i<weights.length;i++){cursor-=weights[i]!;if(cursor<0)return i;}return weights.length-1; }
function randomInteger(min:number,max:number,rng:XorShift32):number { return min+Math.floor(rng.next()*(max-min+1)); }
function sumDeltas(sessions:readonly NpcSession[]):number { return sessions.reduce((sum,session)=>sum+session.delta,0); }
function normalizedUtcSecond(clock:CasinoClock):number {
  const seconds = (clock as CasinoClock & { utcSecond?: () => number }).utcSecond?.();
  const value = seconds ?? clock.utcMinute()*60+59;
  if(!Number.isSafeInteger(value))throw new Error("npc_ledger_invalid_clock");
  return value;
}
function compareText(a:string,b:string):number{return a<b?-1:a>b?1:0;}
function validateDay(profiles:readonly NpcGamblingProfile[],dayIndex:number,openings:Readonly<Record<string,number>>,contract:NpcLedgerContract):void {
  if(!["npc-ledger/1.0","npc-ledger/1.1"].includes(contract.version)||contract.seedVersion!=="npc-ledger/0.9"||!Number.isSafeInteger(contract.epochKstDay)||!Number.isSafeInteger(dayIndex)||dayIndex<0)throw new Error("npc_ledger_invalid_contract");
  if(profiles.length===0||new Set(profiles.map((p)=>p.id)).size!==profiles.length||profiles.some((profile)=>!contract.profiles.some((entry)=>entry.id===profile.id)))throw new Error("npc_ledger_invalid_profiles");
  for(const profile of profiles){
    if(!profile.id||!profile.name||!Number.isSafeInteger(profile.openingBalance)||profile.openingBalance<=0)throw new Error("npc_ledger_invalid_profile");
    for(const value of [profile.riskAppetite,profile.discipline,profile.lossChasing,profile.winPressing,profile.stopLossRatio,profile.takeProfitRatio,profile.maxExposureRatio,...Object.values(profile.skills)]) if(!(value>=0&&value<=1))throw new Error("npc_ledger_invalid_profile");
    if(!["low","middle","high","premium"].includes(profile.incomeBand)||![7,14].includes(profile.payCycleDays)||!Number.isSafeInteger(profile.paydayOffset)||profile.paydayOffset<0||profile.paydayOffset>=profile.payCycleDays)throw new Error("npc_ledger_invalid_income_profile");
    const opening=openings[profile.id]; if(!Number.isSafeInteger(opening)||opening!<0||opening!>MAX_SAFE_BALANCE)throw new Error(`npc_ledger_invalid_state:${profile.id}`);
  }
}
function validateBalanceEvents(events:readonly NpcBalanceEvent[],profiles:readonly NpcGamblingProfile[]):void{
  const ids=new Set(profiles.map((profile)=>profile.id));
  const eventIds=new Set<string>();
  for(const event of events){
    if(!event.eventId||eventIds.has(event.eventId)||!ids.has(event.npcId)||!Number.isSafeInteger(event.secondOfDay)||event.secondOfDay<0||event.secondOfDay>=SECONDS_PER_DAY||!Number.isSafeInteger(event.delta)||event.delta===0)throw new Error("npc_worldline_invalid_event");
    eventIds.add(event.eventId);
  }
}
