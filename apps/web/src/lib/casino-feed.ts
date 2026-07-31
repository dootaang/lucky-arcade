import {
  npcSessionSettlements,
  type NpcActivity,
  type NpcPresence,
  type NpcRoundSettlement,
} from "@lucky-arcade/casino-ledger";

/**
 * Keeps the latest real receipts visible through quiet periods. Activities are
 * the descending world-line stream; only enough are expanded to fill the UI.
 */
export function latestCasinoSettlementsAt(
  activities: readonly NpcActivity[],
  journalSettlements: readonly NpcRoundSettlement[],
  currentUtcSecond: number,
  limit = 128,
): readonly NpcRoundSettlement[] {
  if (!Number.isSafeInteger(currentUtcSecond) || !Number.isSafeInteger(limit) || limit < 0) throw new Error("casino_feed_invalid_input");
  if (limit === 0) return Object.freeze([]);
  // The house counterparty remains in the accounting ledger, but this is a
  // player-facing activity feed. Showing it here makes the house look like a
  // second gambler and duplicates every house-table result.
  const canonical = activities.slice(0, limit)
    .flatMap((entry) => npcSessionSettlements(entry.npcId, entry.utcSecond, entry.session));
  return Object.freeze([...canonical, ...journalSettlements]
    .filter((entry) => entry.utcSecond <= currentUtcSecond && entry.npcId !== "house:temerosa")
    .toSorted((left, right) => right.utcSecond - left.utcSecond || compareText(left.roundId, right.roundId))
    .slice(0, limit));
}

export function nextCasinoArrivalAt(presences: readonly NpcPresence[], currentUtcSecond: number): number | undefined {
  if (!Number.isSafeInteger(currentUtcSecond)) throw new Error("casino_feed_invalid_clock");
  const candidates = presences.flatMap((presence) => presence.phase === "idle"
    && presence.startedAtUtcSecond !== undefined
    && presence.startedAtUtcSecond > currentUtcSecond
    ? [presence.startedAtUtcSecond]
    : []);
  return candidates.length === 0 ? undefined : Math.min(...candidates);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
