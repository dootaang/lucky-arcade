import { WAGER_MULTIPLIERS, XorShift32, type WagerMultiplier } from "@lucky-arcade/engine";
import type {
  CasinoClock,
  CasinoDayPlan,
  CasinoTableId,
  NpcActivity,
  NpcBalanceSnapshot,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcMatch,
  NpcPredictionMarket,
  NpcPredictionRole,
  NpcPredictionWager,
  NpcSession,
  NpcStake,
  NpcVisit,
} from "./contracts.ts";

const MINUTES_PER_DAY = 1_440;
const SECONDS_PER_DAY = 86_400;
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
} as const);
const MATCH_SECONDS = Object.freeze({
  "temerosa-slot": [45, 90],
  "indian-poker": [120, 240],
  "temerosa-match-pairs": [180, 360],
  "temerosa-old-maid": [240, 480],
  "temerosa-high-low": [45, 120],
} as const);

interface VisitIntent { npcId: string; second: number; ordinal: number; tableId: CasinoTableId }
interface MatchDraft { matchId: string; visitId: string; tableId: CasinoTableId; participantIds: readonly string[]; startsAtSecondOfDay: number; settlesAtSecondOfDay: number }
interface PendingPrediction {
  predictionId: string;
  matchId: string;
  visitId: string;
  bettorNpcId: string;
  predictedNpcId: string;
  market: NpcPredictionMarket;
  role: NpcPredictionRole;
  placedAtSecondOfDay: number;
  settlesAtSecondOfDay: number;
  stake: Exclude<NpcStake,0>;
  multiplier: WagerMultiplier;
  reservedAmount: number;
}
const DAY_PLAN_CACHE = new Map<string,CasinoDayPlan>();

/** The v0.5 source of truth: a visit contains independently resolved real matches. */
export function casinoDayPlan(
  profiles: readonly NpcGamblingProfile[],
  dayIndex: number,
  openingBalances: Readonly<Record<string, number>>,
  contract: NpcLedgerContract,
): CasinoDayPlan {
  validateDay(profiles, dayIndex, openingBalances, contract);
  const cacheKey=profiles===contract.profiles?`${contract.version}:${dayIndex}:${profiles.map((profile)=>openingBalances[profile.id]).join(",")}`:undefined;
  const cached=cacheKey===undefined?undefined:DAY_PLAN_CACHE.get(cacheKey);
  if(cached){DAY_PLAN_CACHE.delete(cacheKey!);DAY_PLAN_CACHE.set(cacheKey!,cached);return cached;}
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const visits = createVisits(profiles, dayIndex, contract);
  const drafts = visits.flatMap((visit) => createMatchDrafts(visit, dayIndex, contract))
    .toSorted((left, right) => left.settlesAtSecondOfDay - right.settlesAtSecondOfDay || compareText(left.matchId, right.matchId));
  const balances: Record<string, number> = { ...openingBalances };
  const visitOpening = new Map<string,number>();
  const output: Record<string, NpcSession[]> = Object.fromEntries(profiles.map((profile) => [profile.id, []]));
  const matches: NpcMatch[] = [];
  const predictions: NpcPredictionWager[] = [];
  const spectatorBusyUntil = new Map<string,number>();

  for (const draft of drafts) {
    const participants = draft.participantIds.map((id) => byId.get(id)).filter((value): value is NpcGamblingProfile => Boolean(value));
    if (participants.length === 0) continue;
    const rng = new XorShift32(`${contract.version}:${dayIndex}:${draft.matchId}:result`);
    for(const profile of participants){const key=`${draft.visitId}:${profile.id}`;if(!visitOpening.has(key))visitOpening.set(key,balances[profile.id]!);}
    if (draft.tableId === "temerosa-old-maid") {
      const pendingPredictions = createOldMaidPredictions(
        draft, participants, profiles, visits, balances, openingBalances,
        spectatorBusyUntil, dayIndex, contract,
      );
      predictions.push(...settleFreeOldMaid(draft, participants, pendingPredictions, balances, output, rng));
      matches.push(matchFromDraft(draft, 0, 1));
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
): Readonly<Record<string, readonly NpcSession[]>> {
  return casinoDayPlan(profiles, dayIndex, openingBalances, contract).sessions;
}

export function npcDaySessions(profile: NpcGamblingProfile, dayIndex: number, openingBalance: number, contract: NpcLedgerContract): readonly NpcSession[] {
  const openings = Object.fromEntries(contract.profiles.map((entry) => [entry.id, entry.id === profile.id ? openingBalance : entry.openingBalance]));
  return casinoDayPlan(contract.profiles, dayIndex, openings, contract).sessions[profile.id] ?? Object.freeze([]);
}

export function npcBalanceAt(profile: NpcGamblingProfile, clock: CasinoClock, contract: NpcLedgerContract): NpcBalanceSnapshot {
  const nowSecond = normalizedUtcSecond(clock);
  const absoluteDay = Math.floor(nowSecond / SECONDS_PER_DAY);
  const dayIndex = absoluteDay - contract.epochUtcDay;
  if (dayIndex < 0) return { balance: profile.openingBalance, today: Object.freeze([]), dayIndex: 0 };
  const opening = dayIndex === 0 ? openingBalances(contract.profiles) : completedDayBalances(contract.profiles, dayIndex - 1, contract);
  const secondOfDay = nowSecond - absoluteDay * SECONDS_PER_DAY;
  const today = (casinoDayPlan(contract.profiles, dayIndex, opening, contract).sessions[profile.id] ?? []).filter((session) => session.secondOfDay <= secondOfDay);
  return { balance: opening[profile.id]! + sumDeltas(today), today: Object.freeze(today), dayIndex };
}

export function recentNpcActivitiesAt(profiles: readonly NpcGamblingProfile[], clock: CasinoClock, contract: NpcLedgerContract, limit: number): readonly NpcActivity[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("npc_ledger_invalid_limit");
  if (limit === 0) return Object.freeze([]);
  const nowSecond = normalizedUtcSecond(clock);
  const absoluteDay = Math.floor(nowSecond / SECONDS_PER_DAY);
  const currentDayIndex = absoluteDay - contract.epochUtcDay;
  if (currentDayIndex < 0) return Object.freeze([]);
  const firstDay = Math.max(0, currentDayIndex - 1);
  let balances = firstDay === 0 ? openingBalances(profiles) : completedDayBalances(profiles, firstDay - 1, contract);
  const output: NpcActivity[] = [];
  for (let day = firstDay; day <= currentDayIndex; day += 1) {
    const plan = casinoDayPlan(profiles, day, balances, contract);
    for (const profile of profiles) for (const session of plan.sessions[profile.id] ?? []) {
      const utcSecond = (contract.epochUtcDay + day) * SECONDS_PER_DAY + session.secondOfDay;
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
  const absoluteDay = Math.floor(nowSecond / SECONDS_PER_DAY);
  const currentDayIndex = absoluteDay - contract.epochUtcDay;
  if (currentDayIndex < 0) return Object.freeze([]);
  const lower = days === 0 ? contract.epochUtcDay * SECONDS_PER_DAY : nowSecond - days * SECONDS_PER_DAY;
  const firstDay = Math.max(0, Math.floor(lower / SECONDS_PER_DAY) - contract.epochUtcDay);
  let balances = firstDay === 0 ? openingBalances(profiles) : completedDayBalances(profiles, firstDay - 1, contract);
  const output: NpcActivity[] = [];
  for (let day = firstDay; day <= currentDayIndex; day += 1) {
    const plan = casinoDayPlan(profiles, day, balances, contract);
    for (const session of plan.sessions[npcId] ?? []) {
      const utcSecond = (contract.epochUtcDay + day) * SECONDS_PER_DAY + session.secondOfDay;
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
  const absoluteDay = Math.floor(nowSecond / SECONDS_PER_DAY);
  const dayIndex = absoluteDay - contract.epochUtcDay;
  if (dayIndex < 0) return Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id, 0])));
  const periodStartDay = Math.max(0, dayIndex - days + 1);
  const periodOpening = periodStartDay === 0 ? openingBalances(profiles) : completedDayBalances(profiles, periodStartDay - 1, contract);
  let current = periodOpening;
  const secondOfDay = nowSecond - absoluteDay * SECONDS_PER_DAY;
  for (let day = periodStartDay; day <= dayIndex; day += 1) {
    const all = casinoDayPlan(profiles, day, current, contract).sessions;
    const elapsed = day === dayIndex
      ? Object.fromEntries(profiles.map((profile) => [profile.id, (all[profile.id] ?? []).filter((session) => session.secondOfDay <= secondOfDay)]))
      : all;
    current = addDay(current, elapsed, profiles);
  }
  return Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id, current[profile.id]! - periodOpening[profile.id]!])));
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
    const rng = new XorShift32(`${contract.version}:${dayIndex}:${visits.length}:${participants.join("+")}:visit`);
    const start = Math.max(Math.round(averageSecond(group)), ...participants.map((id) => availableAt[id]! + 30));
    if (start > SECONDS_PER_DAY - 180) continue;
    const range = VISIT_SECONDS[tableId];
    const desiredEnd = start + randomInteger(range[0], range[1], rng);
    const end = Math.min(SECONDS_PER_DAY - 1, desiredEnd);
    if (end - start < 150) continue;
    const visitId = `${contract.version}:${dayIndex}:visit:${visits.length}:${tableId}`;
    const visit = Object.freeze({ visitId, tableId, participantIds: Object.freeze(participants.toSorted(compareText)), startedAtSecondOfDay: start, endsAtSecondOfDay: end });
    visits.push(visit);
    for (const id of participants) availableAt[id] = end + 30;
  }
  return Object.freeze(visits);
}

function createIntents(profiles: readonly NpcGamblingProfile[], dayIndex: number, contract: NpcLedgerContract): VisitIntent[] {
  return profiles.flatMap((profile) => {
    const prefix = `${contract.version}:${profile.id}:${dayIndex}`;
    const scheduleRng = new XorShift32(`${prefix}:schedule`);
    const tableRng = new XorShift32(`${prefix}:tables`);
    const count = randomInteger(profile.sessionsPerDay.min, profile.sessionsPerDay.max, scheduleRng);
    return sessionSchedule(profile, count, scheduleRng).map((minute, ordinal) => ({ npcId: profile.id, second: minute*60+randomInteger(0,59,scheduleRng), ordinal, tableId: weightedTable(profile, tableRng) }));
  }).sort((a,b) => a.second-b.second || compareText(a.npcId,b.npcId) || a.ordinal-b.ordinal);
}

function createMatchDrafts(visit: NpcVisit, dayIndex: number, contract: NpcLedgerContract): readonly MatchDraft[] {
  const rng = new XorShift32(`${contract.version}:${dayIndex}:${visit.visitId}:matches`);
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

function createOldMaidPredictions(
  plan: MatchDraft,
  participants: readonly NpcGamblingProfile[],
  allProfiles: readonly NpcGamblingProfile[],
  visits: readonly NpcVisit[],
  balances: Readonly<Record<string,number>>,
  dayOpening: Readonly<Record<string,number>>,
  spectatorBusyUntil: Map<string,number>,
  dayIndex: number,
  contract: NpcLedgerContract,
): readonly PendingPrediction[] {
  if (participants.length < 2) return Object.freeze([]);
  const output: PendingPrediction[] = [];
  for (const profile of participants) {
    const rng = new XorShift32(`${contract.version}:${dayIndex}:${plan.matchId}:self-prediction:${profile.id}`);
    const terms = chooseOptionalPredictionExposure(profile, balances[profile.id]!, dayOpening[profile.id]!, rng);
    if (!terms) continue;
    output.push(pendingPrediction(plan, profile.id, profile.id, "first-place", "self", terms.stake, terms.multiplier));
  }

  const audienceRng = new XorShift32(`${contract.version}:${dayIndex}:${plan.matchId}:spectator-market`);
  const protectedStart = plan.startsAtSecondOfDay - 12;
  const protectedEnd = plan.settlesAtSecondOfDay + 14;
  const participantIds = new Set(participants.map((profile) => profile.id));
  const eligible = allProfiles.filter((profile) => !participantIds.has(profile.id)
    && (spectatorBusyUntil.get(profile.id) ?? Number.NEGATIVE_INFINITY) <= protectedStart
    && !visits.some((visit) => visit.participantIds.includes(profile.id)
      && intervalsOverlap(protectedStart, protectedEnd, visit.startedAtSecondOfDay - 12, visit.endsAtSecondOfDay + 14)))
    .map((profile) => ({ profile, score: audienceRng.next() + profile.riskAppetite*.3 + profile.skills.oldMaid*.2 }))
    .sort((left,right) => right.score-left.score || compareText(left.profile.id,right.profile.id));
  const desiredSpectators = audienceRng.next() < .65 ? 0 : 1;
  for (const {profile} of eligible) {
    if (output.filter((prediction) => prediction.role === "spectator").length >= desiredSpectators) break;
    const rng = new XorShift32(`${contract.version}:${dayIndex}:${plan.matchId}:spectator-prediction:${profile.id}`);
    const terms = chooseOptionalPredictionExposure(profile, balances[profile.id]!, dayOpening[profile.id]!, rng);
    if (!terms) continue;
    const market: NpcPredictionMarket = rng.next() < .5 ? "first-place" : "joker-holder";
    const predictedNpcId = choosePredictionTarget(participants, profile, market, rng);
    output.push(pendingPrediction(plan, profile.id, predictedNpcId, market, "spectator", terms.stake, terms.multiplier));
    spectatorBusyUntil.set(profile.id, protectedEnd);
  }
  return Object.freeze(output);
}

function settleFreeOldMaid(
  plan: MatchDraft,
  profiles: readonly NpcGamblingProfile[],
  pendingPredictions: readonly PendingPrediction[],
  balances: Record<string,number>,
  output: Record<string,NpcSession[]>,
  rng: XorShift32,
): readonly NpcPredictionWager[] {
  const ranked = profiles.map((profile) => ({ profile, score: profile.skills.oldMaid + (rng.next()-.5)*.72 })).sort((a,b) => b.score-a.score || compareText(a.profile.id,b.profile.id));
  const rewards = ranked.length >= 4 ? [60,30,15,5] : ranked.length === 3 ? [60,30,15] : ranked.length === 2 ? [60,30] : [15];
  const winnerId = ranked[0]!.profile.id;
  const jokerHolderId = ranked.at(-1)!.profile.id;
  const finalized: NpcPredictionWager[] = [];
  ranked.forEach(({profile}, index) => {
    const pending = pendingPredictions.find((prediction) => prediction.role === "self" && prediction.bettorNpcId === profile.id);
    const prediction = pending ? finalizePrediction(pending, pending.predictedNpcId === winnerId, balances[profile.id]!) : undefined;
    if (prediction) finalized.push(prediction);
    const reward = rewards[index]!;
    addSession(
      profile.id, plan, prediction?.stake ?? 0, prediction?.reservedAmount ?? 0,
      reward + (prediction?.creditAmount ?? 0),
      `rank-${index+1}${prediction ? prediction.won ? ":prediction-win" : ":prediction-loss" : ""}`,
      "old-maid-rank-and-prediction/0.3", balances, output,
      { rankReward: Object.freeze({rank:index+1,amount:reward}), ...(prediction?{prediction}:{}) },
    );
  });
  for (const pending of pendingPredictions.filter((prediction) => prediction.role === "spectator")) {
    const won = pending.market === "first-place" ? pending.predictedNpcId === winnerId : pending.predictedNpcId === jokerHolderId;
    const prediction = finalizePrediction(pending, won, balances[pending.bettorNpcId]!);
    finalized.push(prediction);
    addSession(
      pending.bettorNpcId, plan, prediction.stake, prediction.reservedAmount, prediction.creditAmount,
      prediction.won ? "prediction-win" : "prediction-loss",
      "old-maid-spectator-prediction/0.1", balances, output, {prediction},
    );
  }
  return Object.freeze(finalized);
}

function settlePvp(plan: MatchDraft, tableId: "temerosa-match-pairs"|"indian-poker", profiles: readonly NpcGamblingProfile[], balances: Record<string,number>, output: Record<string,NpcSession[]>, stake: Exclude<NpcStake,0>, multiplier: WagerMultiplier, rng: XorShift32): void {
  if (profiles.length < 2) return;
  const [left,right] = profiles;
  const skill = (profile: NpcGamblingProfile) => tableId === "temerosa-match-pairs" ? profile.skills.matchPairsMemory : profile.skills.pokerRead*.58 + profile.skills.pokerBluff*.42;
  const leftScore = skill(left!) + (rng.next()-.5)*.9;
  const rightScore = skill(right!) + (rng.next()-.5)*.9;
  const exposure = stake*multiplier;
  if (Math.abs(leftScore-rightScore) < .035) {
    for (const profile of profiles) addSession(profile.id, plan, stake, exposure, exposure, "draw", `${tableId}-ledger/0.5`, balances, output);
    return;
  }
  const winner = leftScore > rightScore ? left! : right!;
  const loser = winner.id === left!.id ? right! : left!;
  addSession(winner.id, plan, stake, exposure, exposure*2, "win", `${tableId}-ledger/0.5`, balances, output);
  addSession(loser.id, plan, stake, exposure, 0, "loss", `${tableId}-ledger/0.5`, balances, output);
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

function chooseOptionalPredictionExposure(
  profile: NpcGamblingProfile,
  balance: number,
  opening: number,
  rng: XorShift32,
): {stake:Exclude<NpcStake,0>;multiplier:WagerMultiplier}|undefined {
  if (!policyAllowsPaid(profile,balance,opening,rng)) return undefined;
  const pnl = balance-opening;
  const pressure = pnl<0 ? profile.lossChasing : pnl>0 ? profile.winPressing : .5;
  const participation = Math.min(.30,.04+profile.riskAppetite*.18+pressure*.06);
  if (rng.next() >= participation) return undefined;
  const maximum=Math.floor(Math.min(balance,balance*profile.maxExposureRatio));
  const stakes=PAID_STAKES.filter((stake)=>stake*2<=maximum);
  if(stakes.length===0)return undefined;
  const stakeWeights=stakes.map((stake)=>stake===10?20:stake===50?1+profile.riskAppetite*2:.05+profile.riskAppetite*.5);
  const stake=stakes[drawWeightedIndex(stakeWeights,rng)]!;
  const multipliers=WAGER_MULTIPLIERS.filter((value)=>stake*value<=maximum);
  const multiplierWeights=multipliers.map((value)=>value===2?12:value===3?2+profile.riskAppetite:value===4?.5+profile.riskAppetite*.5:.1+profile.riskAppetite*.25);
  const multiplier=multipliers[drawWeightedIndex(multiplierWeights,rng)]!;
  return {stake,multiplier};
}

function pendingPrediction(
  plan:MatchDraft,
  bettorNpcId:string,
  predictedNpcId:string,
  market:NpcPredictionMarket,
  role:NpcPredictionRole,
  stake:Exclude<NpcStake,0>,
  multiplier:WagerMultiplier,
):PendingPrediction {
  return Object.freeze({
    predictionId:`npc-prediction/0.1:${plan.matchId}:${bettorNpcId}`,
    matchId:plan.matchId,visitId:plan.visitId,bettorNpcId,predictedNpcId,market,role,
    placedAtSecondOfDay:plan.startsAtSecondOfDay,
    settlesAtSecondOfDay:plan.settlesAtSecondOfDay,
    stake,multiplier,reservedAmount:stake*multiplier,
  });
}

function finalizePrediction(pending:PendingPrediction,won:boolean,balance:number):NpcPredictionWager {
  const reservedAmount=Math.min(pending.reservedAmount,balance);
  const creditAmount=won?reservedAmount*2:0;
  return Object.freeze({...pending,reservedAmount,creditAmount,delta:creditAmount-reservedAmount,won});
}

function choosePredictionTarget(
  participants:readonly NpcGamblingProfile[],
  bettor:NpcGamblingProfile,
  market:NpcPredictionMarket,
  rng:XorShift32,
):string {
  const precision=.3+bettor.skills.oldMaid*.8;
  const scored=participants.map((profile)=>({
    id:profile.id,
    score:(market==="first-place"?profile.skills.oldMaid:1-profile.skills.oldMaid)*precision+rng.next()*(1-precision*.55),
  })).sort((left,right)=>right.score-left.score||compareText(left.id,right.id));
  return scored[0]!.id;
}

function intervalsOverlap(leftStart:number,leftEnd:number,rightStart:number,rightEnd:number):boolean {
  return leftStart<rightEnd&&rightStart<leftEnd;
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
function weightedTable(profile:NpcGamblingProfile,rng:XorShift32):CasinoTableId { return profile.tables[drawWeightedIndex(profile.tables.map((entry)=>entry.weight),rng)]!.tableId; }
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
  if(contract.version!=="npc-ledger/0.8"||!Number.isSafeInteger(contract.epochUtcDay)||!Number.isSafeInteger(dayIndex)||dayIndex<0)throw new Error("npc_ledger_invalid_contract");
  if(profiles.length===0||new Set(profiles.map((p)=>p.id)).size!==profiles.length||profiles.some((profile)=>!contract.profiles.some((entry)=>entry.id===profile.id)))throw new Error("npc_ledger_invalid_profiles");
  for(const profile of profiles){
    if(!profile.id||!profile.name||!Number.isSafeInteger(profile.openingBalance)||profile.openingBalance<=0)throw new Error("npc_ledger_invalid_profile");
    for(const value of [profile.riskAppetite,profile.discipline,profile.lossChasing,profile.winPressing,profile.stopLossRatio,profile.takeProfitRatio,profile.maxExposureRatio,...Object.values(profile.skills)]) if(!(value>=0&&value<=1))throw new Error("npc_ledger_invalid_profile");
    const opening=openings[profile.id]; if(!Number.isSafeInteger(opening)||opening!<0||opening!>MAX_SAFE_BALANCE)throw new Error(`npc_ledger_invalid_state:${profile.id}`);
  }
}
