import { XorShift32 } from "@lucky-arcade/engine";
import { completedDayBalances, npcDaySessions } from "./engine.ts";
import type {
  CasinoPresentationClock,
  NpcAvailability,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcPresence,
  NpcPresenceInterval,
} from "./contracts.ts";

const MINUTES_PER_DAY = 1_440;
const SECONDS_PER_DAY = 86_400;
const APPROACH_SECONDS = 12;
const SETTLE_SECONDS = 6;
const LEAVE_SECONDS = 8;

const DURATION_SECONDS = Object.freeze({
  "temerosa-slot": [2_700, 4_500],
  "indian-poker": [3_300, 5_400],
  "temerosa-match-pairs": [3_600, 6_300],
  "temerosa-old-maid": [3_900, 7_200],
} as const);

export function npcPresenceIntervalsForDay(
  profile: NpcGamblingProfile,
  dayIndex: number,
  openingBalance: number,
  contract: NpcLedgerContract,
  previousAvailableAtUtcSecond = Number.NEGATIVE_INFINITY,
): readonly NpcPresenceInterval[] {
  const absoluteDay = contract.epochUtcDay + dayIndex;
  let previousAvailableAt = previousAvailableAtUtcSecond;
  let currentBalance = openingBalance;
  const intervals = npcDaySessions(profile, dayIndex, openingBalance, contract).map((session) => {
    const sessionOpeningBalance = currentBalance;
    currentBalance += session.delta;
    const settlesAtUtcSecond = absoluteDay * SECONDS_PER_DAY + session.minuteOfDay * 60;
    const [minimum, maximum] = DURATION_SECONDS[session.tableId];
    const rng = new XorShift32(`${contract.version}:${profile.id}:${dayIndex}:${session.minuteOfDay}:${session.tableId}:presence`);
    const desiredDuration = minimum + Math.floor(rng.next() * (maximum - minimum + 1));
    const latestStart = settlesAtUtcSecond - 15;
    const startedAtUtcSecond = Math.min(latestStart, Math.max(settlesAtUtcSecond - desiredDuration, previousAvailableAt));
    const availableAtUtcSecond = settlesAtUtcSecond + SETTLE_SECONDS + LEAVE_SECONDS;
    previousAvailableAt = availableAtUtcSecond;
    return Object.freeze({
      profile,
      npcId: profile.id,
      tableId: session.tableId,
      session,
      openingBalance: sessionOpeningBalance,
      startedAtUtcSecond,
      settlesAtUtcSecond,
      availableAtUtcSecond,
    });
  });
  return Object.freeze(intervals.map(({ profile: _profile, ...interval }) => Object.freeze(interval)));
}

export function casinoPresenceAt(
  profiles: readonly NpcGamblingProfile[],
  clock: CasinoPresentationClock,
  contract: NpcLedgerContract,
): readonly NpcPresence[] {
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("npc_presence_invalid_clock");
  const absoluteDay = Math.floor(now / SECONDS_PER_DAY);
  const dayIndex = absoluteDay - contract.epochUtcDay;
  if (dayIndex < 0) return Object.freeze(profiles.map((profile) => Object.freeze({ npcId: profile.id, phase: "idle" as const })));
  const output = profiles.map((profile) => {
    const firstDay = Math.max(0, dayIndex - 1);
    const lastDay = dayIndex + 1;
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
    const intervals: NpcPresenceInterval[] = [];
    for (let currentDay = firstDay; currentDay <= lastDay; currentDay += 1) {
      const dayIntervals = npcPresenceIntervalsForDay(profile, currentDay, opening, contract, previousAvailableAt);
      intervals.push(...dayIntervals);
      previousAvailableAt = dayIntervals.at(-1)?.availableAtUtcSecond ?? previousAvailableAt;
      opening += npcDaySessions(profile, currentDay, opening, contract).reduce((sum, session) => sum + session.delta, 0);
    }
    const active = intervals.find((interval) => now >= interval.startedAtUtcSecond && now < interval.availableAtUtcSecond);
    if (!active) {
      const next = intervals.find((interval) => interval.startedAtUtcSecond > now);
      return Object.freeze({ npcId: profile.id, phase: "idle" as const, ...(next ? { startedAtUtcSecond: next.startedAtUtcSecond } : {}) });
    }
    const phase = now < active.startedAtUtcSecond + APPROACH_SECONDS ? "approaching"
      : now < active.settlesAtUtcSecond ? "playing"
        : now < active.settlesAtUtcSecond + SETTLE_SECONDS ? "settling" : "leaving";
    return Object.freeze({
      npcId: profile.id, phase, tableId: active.tableId, session: active.session,
      openingBalance: active.openingBalance,
      startedAtUtcSecond: active.startedAtUtcSecond, settlesAtUtcSecond: active.settlesAtUtcSecond,
      availableAtUtcSecond: active.availableAtUtcSecond,
    });
  });
  return Object.freeze(output);
}

export function npcAvailability(presences: readonly NpcPresence[]): Readonly<Record<string, NpcAvailability>> {
  return Object.freeze(Object.fromEntries(presences.map((presence) => [presence.npcId, Object.freeze({
    npcId: presence.npcId,
    available: presence.phase === "idle",
    phase: presence.phase,
    ...(presence.tableId ? { tableId: presence.tableId } : {}),
    ...(presence.availableAtUtcSecond === undefined ? {} : { availableAtUtcSecond: presence.availableAtUtcSecond }),
  })])));
}

export function nextCasinoPresenceTransition(presences: readonly NpcPresence[], nowUtcSecond: number): number | undefined {
  const candidates = presences.flatMap((presence) => presence.phase === "idle" ? [presence.startedAtUtcSecond ?? Number.POSITIVE_INFINITY] : [
    presence.startedAtUtcSecond === undefined ? Number.POSITIVE_INFINITY : presence.startedAtUtcSecond + APPROACH_SECONDS,
    presence.settlesAtUtcSecond ?? Number.POSITIVE_INFINITY,
    presence.settlesAtUtcSecond === undefined ? Number.POSITIVE_INFINITY : presence.settlesAtUtcSecond + SETTLE_SECONDS,
    presence.availableAtUtcSecond ?? Number.POSITIVE_INFINITY,
  ]).filter((value) => value > nowUtcSecond && Number.isFinite(value));
  return candidates.length === 0 ? undefined : Math.min(...candidates);
}
