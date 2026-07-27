import {
  completedDayBalances,
  npcDaySessions,
  type CasinoClock,
  type NpcLedgerContract,
} from "@lucky-arcade/casino-ledger";

const MINUTES_PER_DAY = 1_440;
const PREFIX = "npc-ledger/0.1:checkpoint:";

export interface NpcLedgerCheckpoint {
  contract: "npc-ledger/0.1";
  dayIndex: number;
  balances: Readonly<Record<string, number>>;
}

export interface CachedNpcBalances {
  dayIndex: number;
  balances: Readonly<Record<string, number>>;
  checkpointDayIndex: number;
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
    return { dayIndex: 0, balances: targets(contract), checkpointDayIndex: -1 };
  }

  const dayIndex = rawDayIndex;
  const completedDayIndex = dayIndex - 1;
  const checkpoint = storage ? readLatestCheckpoint(storage, completedDayIndex, contract) : undefined;
  const completed = completedDayIndex >= 0
    ? completedDayBalances(contract.profiles, completedDayIndex, contract, checkpoint?.balances, checkpoint?.dayIndex ?? -1)
    : targets(contract);
  if (storage && completedDayIndex >= 0 && checkpoint?.dayIndex !== completedDayIndex) {
    writeCheckpoint(storage, { contract: contract.version, dayIndex: completedDayIndex, balances: completed }, contract);
  }

  const minuteOfDay = utcMinute - absoluteDay * MINUTES_PER_DAY;
  const balances: Record<string, number> = {};
  for (const profile of contract.profiles) {
    const opening = completed[profile.id]!;
    const elapsed = npcDaySessions(profile, dayIndex, opening, contract)
      .filter((session) => session.minuteOfDay <= minuteOfDay)
      .reduce((sum, session) => sum + session.delta, 0);
    balances[profile.id] = opening + elapsed;
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
    for (const stale of keys.slice(2)) storage.removeItem(stale.key);
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
    return Number.isSafeInteger(balance) && balance! >= 0 && balance! <= profile.target * 20;
  });
}

function targets(contract: NpcLedgerContract): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(contract.profiles.map((profile) => [profile.id, profile.target])));
}

function ledgerKeys(storage: StorageLike): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
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
