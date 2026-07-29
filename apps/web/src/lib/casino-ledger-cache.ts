import {
  completedDayBalances,
  casinoDaySessions,
  type CasinoClock,
  type NpcLedgerContract,
} from "@lucky-arcade/casino-ledger";

const MINUTES_PER_DAY = 1_440;
const PREFIX = "npc-ledger/0.8:checkpoint:";

export interface NpcLedgerCheckpoint {
  contract: "npc-ledger/0.8";
  dayIndex: number;
  balances: Readonly<Record<string, number>>;
}

export interface CachedNpcBalances {
  dayIndex: number;
  balances: Readonly<Record<string, number>>;
  checkpointDayIndex: number;
}

export interface NpcRollingProfitPeriod {
  startUtcDay: number;
  coveredDays: number;
  profits: Readonly<Record<string, number>>;
}

export function npcRollingProfitPeriodAtWithCheckpoint(
  clock: CasinoClock,
  contract: NpcLedgerContract,
  currentBalances: Readonly<Record<string, number>>,
  days = 7,
  storage: StorageLike | undefined = browserStorage(),
): NpcRollingProfitPeriod {
  if (!Number.isSafeInteger(days) || days < 1) throw new Error("npc_ledger_invalid_period");
  const absoluteDay = Math.floor(clock.utcMinute() / MINUTES_PER_DAY);
  const earliestHistoryDay = contract.profitHistory[0]?.utcDay ?? contract.epochUtcDay;
  if (absoluteDay < earliestHistoryDay) {
    return { startUtcDay: absoluteDay, coveredDays: 0, profits: zeroProfits(contract) };
  }
  const startUtcDay = Math.max(earliestHistoryDay, absoluteDay - days + 1);
  const profits: Record<string, number> = Object.fromEntries(contract.profiles.map((profile) => [profile.id, 0]));
  for (const day of contract.profitHistory) {
    if (day.utcDay < startUtcDay || day.utcDay >= contract.epochUtcDay) continue;
    for (const profile of contract.profiles) profits[profile.id]! += day.profits[profile.id] ?? 0;
  }

  const currentStartUtcDay = Math.max(startUtcDay, contract.epochUtcDay);
  if (currentStartUtcDay <= absoluteDay) {
    const beforePeriodDay = currentStartUtcDay - contract.epochUtcDay - 1;
    const checkpoint = storage && beforePeriodDay >= 0 ? readLatestCheckpoint(storage, beforePeriodDay, contract) : undefined;
    const periodOpening = beforePeriodDay >= 0
      ? completedDayBalances(contract.profiles, beforePeriodDay, contract, checkpoint?.balances, checkpoint?.dayIndex ?? -1)
      : openings(contract);
    if (storage && beforePeriodDay >= 0 && checkpoint?.dayIndex !== beforePeriodDay) {
      writeCheckpoint(storage, { contract: contract.version, dayIndex: beforePeriodDay, balances: periodOpening }, contract);
    }
    for (const profile of contract.profiles) profits[profile.id]! += currentBalances[profile.id]! - periodOpening[profile.id]!;
  }
  return Object.freeze({ startUtcDay, coveredDays: absoluteDay - startUtcDay + 1, profits: Object.freeze(profits) });
}

export function npcRollingProfitsAtWithCheckpoint(
  clock: CasinoClock,
  contract: NpcLedgerContract,
  currentBalances: Readonly<Record<string, number>>,
  days = 7,
  storage: StorageLike | undefined = browserStorage(),
): Readonly<Record<string, number>> {
  return npcRollingProfitPeriodAtWithCheckpoint(clock, contract, currentBalances, days, storage).profits;
}

interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function npcBalancesAtWithCheckpoint(
  clock: CasinoClock,
  contract: NpcLedgerContract,
  storage: StorageLike | undefined = browserStorage(),
): CachedNpcBalances {
  const utcMinute = clock.utcMinute();
  if (!Number.isSafeInteger(utcMinute)) throw new Error("npc_ledger_invalid_clock");
  const absoluteDay = Math.floor(utcMinute / MINUTES_PER_DAY);
  const rawDayIndex = absoluteDay - contract.epochUtcDay;
  if (rawDayIndex < 0) {
    return { dayIndex: 0, balances: openings(contract), checkpointDayIndex: -1 };
  }

  const dayIndex = rawDayIndex;
  const completedDayIndex = dayIndex - 1;
  const checkpoint = storage ? readLatestCheckpoint(storage, completedDayIndex, contract) : undefined;
  const completed = completedDayIndex >= 0
    ? completedDayBalances(contract.profiles, completedDayIndex, contract, checkpoint?.balances, checkpoint?.dayIndex ?? -1)
    : openings(contract);
  if (storage && completedDayIndex >= 0 && checkpoint?.dayIndex !== completedDayIndex) {
    writeCheckpoint(storage, { contract: contract.version, dayIndex: completedDayIndex, balances: completed }, contract);
  }

  const exactSecond = (clock as CasinoClock & { utcSecond?: () => number }).utcSecond?.();
  const secondOfDay = exactSecond === undefined
    ? (utcMinute - absoluteDay * MINUTES_PER_DAY) * 60 + 59
    : exactSecond % 86_400;
  const daySessions = casinoDaySessions(contract.profiles, dayIndex, completed, contract);
  const balances: Record<string, number> = {};
  for (const profile of contract.profiles) {
    const elapsed = (daySessions[profile.id] ?? [])
      .filter((session) => session.secondOfDay <= secondOfDay)
      .reduce((sum, session) => sum + session.delta, 0);
    balances[profile.id] = completed[profile.id]! + elapsed;
  }
  return { dayIndex, balances: Object.freeze(balances), checkpointDayIndex: completedDayIndex };
}

export function readLatestCheckpoint(
  storage: StorageLike,
  maximumDayIndex: number,
  contract: NpcLedgerContract,
): NpcLedgerCheckpoint | undefined {
  let latest: NpcLedgerCheckpoint | undefined;
  for (const key of ledgerKeys(storage)) {
    const keyDay = Number(key.slice(PREFIX.length));
    const parsed = safeParse(storage, key);
    if (!isCheckpoint(parsed, keyDay, maximumDayIndex, contract)) {
      safeRemove(storage, key);
      continue;
    }
    if (!latest || parsed.dayIndex > latest.dayIndex) latest = parsed;
  }
  return latest;
}

export function writeCheckpoint(storage: StorageLike, checkpoint: NpcLedgerCheckpoint, contract: NpcLedgerContract): void {
  if (!isCheckpoint(checkpoint, checkpoint.dayIndex, checkpoint.dayIndex, contract)) return;
  try {
    storage.setItem(`${PREFIX}${checkpoint.dayIndex}`, JSON.stringify(checkpoint));
    const keys = ledgerKeys(storage)
      .map((key) => ({ key, day: Number(key.slice(PREFIX.length)) }))
      .filter((entry) => Number.isSafeInteger(entry.day))
      .sort((left, right) => right.day - left.day);
    for (const stale of keys.slice(9)) storage.removeItem(stale.key);
  } catch {
    // A checkpoint is optional. Quota and privacy failures must not block the floor.
  }
}

function isCheckpoint(value: unknown, keyDay: number, maximumDayIndex: number, contract: NpcLedgerContract): value is NpcLedgerCheckpoint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NpcLedgerCheckpoint>;
  if (candidate.contract !== contract.version || !Number.isSafeInteger(candidate.dayIndex) || candidate.dayIndex !== keyDay || candidate.dayIndex! < 0 || candidate.dayIndex! > maximumDayIndex) return false;
  if (!candidate.balances || typeof candidate.balances !== "object") return false;
  const ids = Object.keys(candidate.balances).sort();
  const expected = contract.profiles.map((profile) => profile.id).sort();
  if (ids.length !== expected.length || ids.some((id, index) => id !== expected[index])) return false;
  return contract.profiles.every((profile) => {
    const balance = candidate.balances![profile.id];
    return Number.isSafeInteger(balance) && balance! >= 0 && balance! <= 1_000_000_000;
  });
}

function openings(contract: NpcLedgerContract): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(contract.profiles.map((profile) => [profile.id, profile.openingBalance])));
}

function zeroProfits(contract: NpcLedgerContract): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(contract.profiles.map((profile) => [profile.id, 0])));
}

function ledgerKeys(storage: StorageLike): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("npc-ledger/") && key.includes(":checkpoint:")) keys.push(key);
    }
  } catch { /* optional cache unavailable */ }
  return keys;
}

function safeParse(storage: StorageLike, key: string): unknown {
  try {
    const value = storage.getItem(key);
    return value === null ? undefined : JSON.parse(value);
  } catch { return undefined; }
}

function safeRemove(storage: StorageLike, key: string): void {
  try { storage.removeItem(key); } catch { /* optional cache unavailable */ }
}

function browserStorage(): StorageLike | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}
