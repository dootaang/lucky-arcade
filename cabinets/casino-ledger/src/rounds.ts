import { XorShift32 } from "@lucky-arcade/engine";
import type {
  CasinoPresentationClock,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcPresence,
  NpcPresenceInterval,
  NpcRoundSettlement,
  NpcSession,
} from "./contracts.ts";
import { completedDayBalances, npcDaySessions } from "./engine.ts";
import { npcPresenceIntervalsForDay } from "./presence.ts";

const SECONDS_PER_DAY = 86_400;
const APPROACH_SECONDS = 12;
const ROUND_CONTRACT = "npc-live-rounds/0.2";

interface RoundTemplate {
  reservedAmount: number;
  creditAmount: number;
  delta: number;
  resultKind: string;
  termsVersion: string;
}

/**
 * Expands one long NPC visit into player-scale real settlements. Neutral cycles
 * add visible play without rewriting the frozen npc-ledger/0.3 visit result.
 */
export function npcVisitRounds(
  interval: NpcPresenceInterval,
  profile: NpcGamblingProfile,
): readonly NpcRoundSettlement[] {
  const maximum = profile.target * 20;
  const availableSeconds = Math.max(1, interval.settlesAtUtcSecond - interval.startedAtUtcSecond - APPROACH_SECONDS);
  const neutralCycle = neutralCycleFor(interval.session, interval.openingBalance, maximum);
  const cycleSeconds = cycleDurationSeconds(interval.session.tableId);
  const cycleCount = neutralCycle.length === 0 ? 0 : Math.floor(availableSeconds / cycleSeconds);
  const templates: RoundTemplate[] = [];
  let balance = interval.openingBalance;
  const orderRng = new XorShift32(`${ROUND_CONTRACT}:${interval.npcId}:${interval.startedAtUtcSecond}:${interval.tableId}:order`);

  for (let index = 0; index < cycleCount; index += 1) {
    const cycle = orientCycle(neutralCycle, balance, maximum, Math.floor(orderRng.next() * neutralCycle.length));
    templates.push(...cycle);
    balance += cycle.reduce((sum, round) => sum + round.delta, 0);
  }

  const terminal = terminalRounds(interval.session);
  templates.push(...terminal);
  const startUtcSecond = interval.startedAtUtcSecond + APPROACH_SECONDS;
  const endUtcSecond = interval.settlesAtUtcSecond - 1;
  const timestamps = spreadTimestamps(startUtcSecond, endUtcSecond, templates.length);
  const settlements = templates.map((round, index) => Object.freeze({
    roundId: `${ROUND_CONTRACT}:${interval.npcId}:${interval.startedAtUtcSecond}:${interval.settlesAtUtcSecond}:${index}`,
    npcId: interval.npcId,
    tableId: interval.tableId,
    utcSecond: timestamps[index]!,
    stake: interval.session.stake,
    reservedAmount: round.reservedAmount,
    creditAmount: round.creditAmount,
    delta: round.delta,
    resultKind: round.resultKind,
    termsVersion: round.termsVersion,
  }));

  assertVisitInvariant(interval, settlements, maximum);
  return Object.freeze(settlements);
}

export function recentNpcRoundSettlementsAt(
  profiles: readonly NpcGamblingProfile[],
  clock: CasinoPresentationClock,
  contract: NpcLedgerContract,
  limit: number,
  lookbackSeconds = 3_600,
): readonly NpcRoundSettlement[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("npc_rounds_invalid_limit");
  if (!Number.isSafeInteger(lookbackSeconds) || lookbackSeconds <= 0) throw new Error("npc_rounds_invalid_lookback");
  if (limit === 0) return Object.freeze([]);
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("npc_rounds_invalid_clock");
  const absoluteDay = Math.floor(now / SECONDS_PER_DAY);
  const currentDayIndex = absoluteDay - contract.epochUtcDay;
  if (currentDayIndex < 0) return Object.freeze([]);
  const firstDay = Math.max(0, currentDayIndex - 2);
  const lowerExclusive = now - lookbackSeconds;
  const output: NpcRoundSettlement[] = [];

  for (const profile of profiles) {
    let opening = firstDay === 0
      ? profile.target
      : completedDayBalances([profile], firstDay - 1, contract)[profile.id]!;
    let previousAvailableAt = Number.NEGATIVE_INFINITY;
    if (firstDay > 0) {
      const priorDay = firstDay - 1;
      const priorOpening = priorDay === 0
        ? profile.target
        : completedDayBalances([profile], priorDay - 1, contract)[profile.id]!;
      previousAvailableAt = npcPresenceIntervalsForDay(profile, priorDay, priorOpening, contract).at(-1)?.availableAtUtcSecond
        ?? previousAvailableAt;
    }
    for (let dayIndex = firstDay; dayIndex <= currentDayIndex; dayIndex += 1) {
      const intervals = npcPresenceIntervalsForDay(profile, dayIndex, opening, contract, previousAvailableAt);
      for (const interval of intervals) {
        if (interval.settlesAtUtcSecond <= lowerExclusive || interval.startedAtUtcSecond > now) continue;
        for (const round of npcVisitRounds(interval, profile)) {
          if (round.utcSecond > lowerExclusive && round.utcSecond <= now && round.delta !== 0) output.push(round);
        }
      }
      previousAvailableAt = intervals.at(-1)?.availableAtUtcSecond ?? previousAvailableAt;
      opening += npcDaySessions(profile, dayIndex, opening, contract).reduce((sum, session) => sum + session.delta, 0);
    }
  }

  output.sort((left, right) => right.utcSecond - left.utcSecond
    || compareText(left.npcId, right.npcId)
    || compareText(left.roundId, right.roundId));
  return Object.freeze(output.slice(0, limit));
}

/** Adds only already-settled sub-rounds to the minute-resolution base ledger. */
export function npcLiveBalancesAt(
  baseBalances: Readonly<Record<string, number>>,
  profiles: readonly NpcGamblingProfile[],
  presences: readonly NpcPresence[],
  clock: CasinoPresentationClock,
): Readonly<Record<string, number>> {
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("npc_rounds_invalid_clock");
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const output = { ...baseBalances };
  for (const presence of presences) {
    if (presence.phase === "idle" || presence.session === undefined || presence.tableId === undefined
      || presence.openingBalance === undefined || presence.startedAtUtcSecond === undefined
      || presence.settlesAtUtcSecond === undefined || now >= presence.settlesAtUtcSecond) continue;
    const profile = profileById.get(presence.npcId);
    if (!profile) throw new Error(`npc_rounds_unknown_profile:${presence.npcId}`);
    const interval: NpcPresenceInterval = {
      npcId: presence.npcId,
      tableId: presence.tableId,
      session: presence.session,
      openingBalance: presence.openingBalance,
      startedAtUtcSecond: presence.startedAtUtcSecond,
      settlesAtUtcSecond: presence.settlesAtUtcSecond,
      availableAtUtcSecond: presence.availableAtUtcSecond ?? presence.settlesAtUtcSecond,
    };
    const settledDelta = npcVisitRounds(interval, profile)
      .filter((round) => round.utcSecond <= now)
      .reduce((sum, round) => sum + round.delta, 0);
    output[presence.npcId] = (output[presence.npcId] ?? presence.openingBalance) + settledDelta;
  }
  return Object.freeze(output);
}

function neutralCycleFor(session: NpcSession, openingBalance: number, maximum: number): readonly RoundTemplate[] {
  const stake = session.stake;
  if (stake === 0) return Object.freeze([]);
  const multiplier = session.reservedAmount / stake;
  if (session.tableId === "temerosa-match-pairs") return Object.freeze([
    round(session.reservedAmount, 0, "loss", "match-pairs-paytable/0.2"),
    round(session.reservedAmount, stake * 2 * multiplier, "win-2x", "match-pairs-paytable/0.2"),
  ]);
  if (session.tableId === "indian-poker") return Object.freeze([
    round(session.reservedAmount, 0, "chips-0", "temerosa-indian-poker-paytable/0.3"),
    round(session.reservedAmount, stake * 2 * multiplier, "chips-20", "temerosa-indian-poker-paytable/0.3"),
  ]);
  const cycle = [
    round(session.reservedAmount, stake * 6 * multiplier, "lines-1", "temerosa-slot-paytable/0.3"),
    ...Array.from({ length: 5 }, () => round(session.reservedAmount, 0, "lines-0", "temerosa-slot-paytable/0.3")),
  ];
  return Object.freeze(orientCycle(cycle, openingBalance, maximum));
}

function terminalRounds(session: NpcSession): readonly RoundTemplate[] {
  if (session.tableId !== "temerosa-old-maid") {
    return Object.freeze([round(session.reservedAmount, session.creditAmount, session.resultKind, session.termsVersion)]);
  }
  const rewards = session.delta === 10 ? [5, 3, 1, 1]
    : session.delta === 5 ? [3, 1, 1]
      : session.delta === 3 ? [1, 1, 1] : [1];
  const ranks = rewards.map((reward) => reward === 5 ? "rank-2" : reward === 3 ? "rank-3" : "rank-last");
  if (session.delta === 10) ranks[0] = "rank-2";
  return Object.freeze(rewards.map((reward, index) => round(0, reward, ranks[index]!, "old-maid-rank-reward/0.1")));
}

function orientCycle(cycle: readonly RoundTemplate[], openingBalance: number, maximum: number, preferredOffset = 0): readonly RoundTemplate[] {
  for (let attempt = 0; attempt < cycle.length; attempt += 1) {
    const offset = (preferredOffset + attempt) % cycle.length;
    const candidate = [...cycle.slice(offset), ...cycle.slice(0, offset)];
    let balance = openingBalance;
    if (candidate.every((item) => {
      balance += item.delta;
      return balance >= 0 && balance <= maximum;
    })) return Object.freeze(candidate);
  }
  throw new Error("npc_rounds_no_legal_neutral_cycle");
}

function cycleDurationSeconds(tableId: NpcSession["tableId"]): number {
  if (tableId === "temerosa-slot") return 120;
  if (tableId === "indian-poker") return 120;
  if (tableId === "temerosa-match-pairs") return 120;
  return Number.POSITIVE_INFINITY;
}

function spreadTimestamps(start: number, end: number, count: number): readonly number[] {
  if (count <= 0) return Object.freeze([]);
  if (count === 1) return Object.freeze([end]);
  if (end - start + 1 < count) throw new Error("npc_rounds_insufficient_time");
  return Object.freeze(Array.from({ length: count }, (_, index) => start + Math.floor(index * (end - start) / (count - 1))));
}

function round(reservedAmount: number, creditAmount: number, resultKind: string, termsVersion: string): RoundTemplate {
  return Object.freeze({ reservedAmount, creditAmount, delta: creditAmount - reservedAmount, resultKind, termsVersion });
}

function assertVisitInvariant(interval: NpcPresenceInterval, settlements: readonly NpcRoundSettlement[], maximum: number): void {
  const total = settlements.reduce((sum, settlement) => sum + settlement.delta, 0);
  if (total !== interval.session.delta) throw new Error("npc_rounds_visit_delta_mismatch");
  let balance = interval.openingBalance;
  for (const settlement of settlements) {
    balance += settlement.delta;
    if (balance < 0 || balance > maximum) throw new Error("npc_rounds_balance_out_of_bounds");
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
