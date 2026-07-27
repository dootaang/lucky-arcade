import { WAGER_MULTIPLIERS, XorShift32 } from "@lucky-arcade/engine";
import type {
  CasinoClock,
  NpcActivity,
  NpcBalanceSnapshot,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcSession,
  NpcStake,
} from "./contracts.ts";

const MIN_WAGER = 10;
const MIN_WAGER_EXPOSURE = MIN_WAGER * WAGER_MULTIPLIERS[0];
const MINUTES_PER_DAY = 1_440;

export function npcDaySessions(
  profile: NpcGamblingProfile,
  dayIndex: number,
  openingBalance: number,
  contract: NpcLedgerContract,
): readonly NpcSession[] {
  validateInputs(profile, dayIndex, openingBalance, contract);
  const prefix = `${contract.version}:${profile.id}:${dayIndex}`;
  const scheduleRng = new XorShift32(`${prefix}:schedule`);
  const tableRng = new XorShift32(`${prefix}:tables`);
  const stakeRng = new XorShift32(`${prefix}:stakes`);
  const outcomeRng = new XorShift32(`${prefix}:outcomes`);
  const leverageRng = new XorShift32(`${prefix}:leverage`);
  const maximum = profile.target * 20;
  const count = randomInteger(profile.sessionsPerDay.min, profile.sessionsPerDay.max, scheduleRng);
  const schedule = sessionSchedule(profile, count, scheduleRng);
  const sessions: NpcSession[] = [];
  let current = openingBalance;

  for (let index = 0; index < count; index += 1) {
    const remaining = count - index;
    let tableId: NpcSession["tableId"] = current < MIN_WAGER_EXPOSURE ? "temerosa-old-maid" : weightedTable(profile, tableRng);
    let stake: NpcStake = tableId === "temerosa-old-maid" ? 0 : weightedStake(profile.volatility, current, stakeRng);
    let candidates = settlementCandidates(tableId, stake, leverageRng).filter((candidate) => candidate.reservedAmount <= current && current + candidate.delta >= 0 && current + candidate.delta <= maximum);
    if (candidates.length === 0) {
      stake = current >= 400 ? 200 : current >= 100 ? 50 : current >= 20 ? 10 : 0;
      tableId = stake === 0 ? "temerosa-old-maid" : "temerosa-match-pairs";
      candidates = settlementCandidates(tableId, stake, leverageRng).filter((candidate) => candidate.reservedAmount <= current && current + candidate.delta >= 0 && current + candidate.delta <= maximum);
    }
    if (candidates.length === 0) throw new Error("npc_ledger_no_legal_settlement");
    const desired = profile.reversion * (profile.target - current) / remaining
      + (outcomeRng.next() * 2 - 1) * profile.volatility * Math.max(stake, MIN_WAGER);
    const chosen = chooseSettlement(candidates, desired, Math.max(stake, MIN_WAGER), outcomeRng);
    current += chosen.delta;
    sessions.push(Object.freeze({
      minuteOfDay: schedule[index]!, tableId, stake,
      reservedAmount: chosen.reservedAmount, creditAmount: chosen.creditAmount, delta: chosen.delta,
      resultKind: chosen.resultKind, termsVersion: chosen.termsVersion,
    }));
  }

  return Object.freeze(sessions.map((session) => Object.freeze(session)));
}

export function npcBalanceAt(
  profile: NpcGamblingProfile,
  clock: CasinoClock,
  contract: NpcLedgerContract,
): NpcBalanceSnapshot {
  const utcMinute = normalizedUtcMinute(clock);
  const absoluteDay = Math.floor(utcMinute / MINUTES_PER_DAY);
  const rawDayIndex = absoluteDay - contract.epochUtcDay;
  if (rawDayIndex < 0) return { balance: profile.target, today: Object.freeze([]), dayIndex: 0 };

  const dayIndex = rawDayIndex;
  const opening = openingBalanceAt(profile, dayIndex, contract);
  const minuteOfDay = utcMinute - absoluteDay * MINUTES_PER_DAY;
  const today = npcDaySessions(profile, dayIndex, opening, contract)
    .filter((session) => session.minuteOfDay <= minuteOfDay);
  return {
    balance: opening + sumDeltas(today),
    today: Object.freeze(today),
    dayIndex,
  };
}

export function recentNpcActivitiesAt(
  profiles: readonly NpcGamblingProfile[],
  clock: CasinoClock,
  contract: NpcLedgerContract,
  limit: number,
): readonly NpcActivity[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("npc_ledger_invalid_limit");
  if (limit === 0) return Object.freeze([]);
  const now = normalizedUtcMinute(clock);
  const absoluteDay = Math.floor(now / MINUTES_PER_DAY);
  const currentDayIndex = absoluteDay - contract.epochUtcDay;
  if (currentDayIndex < 0) return Object.freeze([]);
  const lowerExclusive = now - MINUTES_PER_DAY;
  const activities: NpcActivity[] = [];

  for (const profile of profiles) {
    const firstDay = Math.max(0, currentDayIndex - 1);
    let opening = openingBalanceAt(profile, firstDay, contract);
    for (let dayIndex = firstDay; dayIndex <= currentDayIndex; dayIndex += 1) {
      const sessions = npcDaySessions(profile, dayIndex, opening, contract);
      for (const session of sessions) {
        const utcMinute = (contract.epochUtcDay + dayIndex) * MINUTES_PER_DAY + session.minuteOfDay;
        if (utcMinute > lowerExclusive && utcMinute <= now && session.delta !== 0) {
          activities.push({ npcId: profile.id, utcMinute, session });
        }
      }
      opening += sumDeltas(sessions);
    }
  }

  activities.sort((left, right) => right.utcMinute - left.utcMinute
    || compareText(left.npcId, right.npcId)
    || compareText(left.session.tableId, right.session.tableId));
  return Object.freeze(activities.slice(0, limit).map((activity) => Object.freeze(activity)));
}

export function completedDayBalances(
  profiles: readonly NpcGamblingProfile[],
  dayIndex: number,
  contract: NpcLedgerContract,
  checkpoint?: Readonly<Record<string, number>>,
  checkpointDayIndex = -1,
): Readonly<Record<string, number>> {
  if (!Number.isSafeInteger(dayIndex) || dayIndex < -1) throw new Error("npc_ledger_invalid_day");
  if (!Number.isSafeInteger(checkpointDayIndex) || checkpointDayIndex < -1 || checkpointDayIndex > dayIndex) {
    throw new Error("npc_ledger_invalid_checkpoint_day");
  }
  const output: Record<string, number> = {};
  for (const profile of profiles) {
    let balance: number;
    if (checkpointDayIndex >= 0) {
      const stored = checkpoint?.[profile.id];
      if (stored === undefined) throw new Error(`npc_ledger_invalid_checkpoint_balance:${profile.id}`);
      balance = stored;
    } else {
      balance = profile.target;
    }
    if (!Number.isSafeInteger(balance) || balance < 0 || balance > profile.target * 20) {
      throw new Error(`npc_ledger_invalid_checkpoint_balance:${profile.id}`);
    }
    for (let currentDay = checkpointDayIndex + 1; currentDay <= dayIndex; currentDay += 1) {
      balance += sumDeltas(npcDaySessions(profile, currentDay, balance, contract));
    }
    output[profile.id] = balance;
  }
  return Object.freeze(output);
}

function openingBalanceAt(profile: NpcGamblingProfile, dayIndex: number, contract: NpcLedgerContract): number {
  let balance = profile.target;
  for (let currentDay = 0; currentDay < dayIndex; currentDay += 1) {
    balance += sumDeltas(npcDaySessions(profile, currentDay, balance, contract));
  }
  return balance;
}

function sessionSchedule(profile: NpcGamblingProfile, count: number, rng: XorShift32): readonly number[] {
  const selected = new Set<number>();
  const windowWeights = profile.activeHours.map((activeRange) => activeRange.weight);
  let attempts = 0;
  while (selected.size < count && attempts < count * 100) {
    attempts += 1;
    const activeRange = profile.activeHours[drawWeightedIndex(windowWeights, rng)]!;
    const minute = activeRange.startMinute + Math.floor(rng.next() * (activeRange.endMinute - activeRange.startMinute));
    selected.add(minute);
  }
  if (selected.size < count) {
    for (const activeRange of profile.activeHours) {
      for (let minute = activeRange.startMinute; minute < activeRange.endMinute && selected.size < count; minute += 1) selected.add(minute);
    }
  }
  if (selected.size !== count) throw new Error("npc_ledger_insufficient_schedule");
  return [...selected].sort((left, right) => left - right);
}

function weightedTable(profile: NpcGamblingProfile, rng: XorShift32): NpcSession["tableId"] {
  const index = drawWeightedIndex(profile.tables.map((table) => table.weight), rng);
  return profile.tables[index]!.tableId;
}

function weightedStake(volatility: number, balance: number, rng: XorShift32): Exclude<NpcStake, 0> {
  const stakes = [10, 50, 200] as const;
  const baseWeights = volatility >= 0.27 ? [1, 3, 6] : volatility >= 0.16 ? [3, 5, 2] : [6, 3, 1];
  const weights = stakes.map((stake, index) => stake * WAGER_MULTIPLIERS[0] <= balance ? baseWeights[index]! : 0);
  return stakes[drawWeightedIndex(weights, rng)]!;
}

interface SettlementCandidate {
  reservedAmount: number;
  creditAmount: number;
  delta: number;
  resultKind: string;
  termsVersion: string;
  baseWeight: number;
}

function settlementCandidates(tableId: NpcSession["tableId"], stake: NpcStake, leverageRng: XorShift32): readonly SettlementCandidate[] {
  if (tableId === "temerosa-old-maid") {
    return [
      candidate(0, 10, "rank-1", "old-maid-rank-reward/0.1", 1),
      candidate(0, 5, "rank-2", "old-maid-rank-reward/0.1", 2),
      candidate(0, 3, "rank-3", "old-maid-rank-reward/0.1", 3),
      candidate(0, 1, "rank-last", "old-maid-rank-reward/0.1", 4),
    ];
  }
  if (stake === 0) throw new Error("npc_ledger_paid_table_requires_stake");
  const preferred = WAGER_MULTIPLIERS[Math.floor(leverageRng.next() * WAGER_MULTIPLIERS.length)]!;
  const leverage = (reservedAmount: number, creditAmount: number, resultKind: string, termsVersion: string, baseWeight: number): readonly SettlementCandidate[] => WAGER_MULTIPLIERS.map((multiplier) => candidate(
    reservedAmount * multiplier,
    creditAmount * multiplier,
    resultKind,
    termsVersion,
    baseWeight * (multiplier === preferred ? 2 : 1),
  ));
  if (tableId === "temerosa-match-pairs") {
    return [
      ...leverage(stake, 0, "loss", "match-pairs-paytable/0.2", 5),
      ...leverage(stake, stake, "draw", "match-pairs-paytable/0.2", 1),
      ...leverage(stake, Math.round(stake * 1.5), "win-1.5x", "match-pairs-paytable/0.2", 3),
      ...leverage(stake, stake * 2, "win-2x", "match-pairs-paytable/0.2", 2),
      ...leverage(stake, Math.round(stake * 2.5), "win-2.5x", "match-pairs-paytable/0.2", 1),
    ];
  }
  if (tableId === "indian-poker") {
    return Array.from({ length: 21 }, (_, chips) => leverage(
      stake,
      Math.floor(stake * chips / 10),
      `chips-${chips}`,
      "temerosa-indian-poker-paytable/0.3",
      11 - Math.abs(10 - chips),
    )).flat();
  }
  return [0, 1, 2, 3, 4, 5].flatMap((lines) => leverage(
    stake,
    stake * lines * 6,
    `lines-${lines}`,
    "temerosa-slot-paytable/0.3",
    [10_000, 160, 30, 6, 2, 1][lines]!,
  ));
}

function candidate(reservedAmount: number, creditAmount: number, resultKind: string, termsVersion: string, baseWeight: number): SettlementCandidate {
  return Object.freeze({ reservedAmount, creditAmount, delta: creditAmount - reservedAmount, resultKind, termsVersion, baseWeight });
}

function chooseSettlement(candidates: readonly SettlementCandidate[], desired: number, scale: number, rng: XorShift32): SettlementCandidate {
  const weights = candidates.map((value) => {
    const closeness = 1 / (1 + Math.abs(value.delta - desired) / scale);
    return value.baseWeight * (0.25 + closeness * 3.75);
  });
  return candidates[drawWeightedIndex(weights, rng)]!;
}

function drawWeightedIndex(weights: readonly number[], rng: XorShift32): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) throw new Error("npc_ledger_empty_weight");
  let cursor = rng.next() * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index]!;
    if (cursor < 0) return index;
  }
  return weights.length - 1;
}

function randomInteger(minimum: number, maximum: number, rng: XorShift32): number {
  return minimum + Math.floor(rng.next() * (maximum - minimum + 1));
}

function sumDeltas(sessions: readonly NpcSession[]): number {
  return sessions.reduce((sum, session) => sum + session.delta, 0);
}

function normalizedUtcMinute(clock: CasinoClock): number {
  const value = clock.utcMinute();
  if (!Number.isSafeInteger(value)) throw new Error("npc_ledger_invalid_clock");
  return value;
}

function validateInputs(profile: NpcGamblingProfile, dayIndex: number, openingBalance: number, contract: NpcLedgerContract): void {
  if (contract.version !== "npc-ledger/0.3" || !Number.isSafeInteger(contract.epochUtcDay)) throw new Error("npc_ledger_invalid_contract");
  if (!profile.id || !profile.name || !Number.isSafeInteger(profile.target) || profile.target <= 0) throw new Error("npc_ledger_invalid_profile");
  if (!(profile.volatility >= 0.06 && profile.volatility <= 0.30) || !(profile.reversion >= 0.04 && profile.reversion <= 0.18)) throw new Error("npc_ledger_invalid_profile");
  if (!Number.isSafeInteger(dayIndex) || dayIndex < 0 || !Number.isSafeInteger(openingBalance) || openingBalance < 0 || openingBalance > profile.target * 20) throw new Error("npc_ledger_invalid_state");
  const { min, max } = profile.sessionsPerDay;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min <= 0 || max < min) throw new Error("npc_ledger_invalid_sessions");
  if (profile.tables.length === 0 || profile.tables.some((table) => !(table.weight > 0))) throw new Error("npc_ledger_invalid_tables");
  if (profile.activeHours.length === 0 || profile.activeHours.some((activeRange) => !Number.isInteger(activeRange.startMinute) || !Number.isInteger(activeRange.endMinute) || activeRange.startMinute < 0 || activeRange.endMinute > MINUTES_PER_DAY || activeRange.startMinute >= activeRange.endMinute || !(activeRange.weight > 0))) throw new Error("npc_ledger_invalid_hours");
  const availableMinutes = new Set<number>();
  for (const activeRange of profile.activeHours) for (let minute = activeRange.startMinute; minute < activeRange.endMinute; minute += 1) availableMinutes.add(minute);
  if (availableMinutes.size < max) throw new Error("npc_ledger_insufficient_schedule");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
