import type { NpcActivity, NpcGamblingProfile, NpcRoundSettlement } from "@lucky-arcade/casino-ledger";

export interface CasinoLedgerActivitySummary {
  readonly profits: Readonly<Record<string, number>>;
  readonly wageredToday: Readonly<Record<string, number>>;
}

/**
 * Aggregate the activity stream once. The previous render path filtered the
 * complete stream once per NPC for profits and then once more for wagered
 * points, which became expensive after the series roster grew past 100 guests.
 */
export function summarizeCasinoLedgerActivities(input: {
  profiles: readonly NpcGamblingProfile[];
  activities: readonly NpcActivity[];
  journalSettlements: readonly NpcRoundSettlement[];
  carriedProfits: readonly Readonly<Record<string, number>>[];
  periodStartSecond: number;
  todayStartSecond: number;
}): CasinoLedgerActivitySummary {
  const profileIds = new Set(input.profiles.map((profile) => profile.id));
  const profits: Record<string, number> = Object.fromEntries(input.profiles.map((profile) => [profile.id, 0]));
  const wageredToday: Record<string, number> = Object.fromEntries(input.profiles.map((profile) => [profile.id, 0]));

  for (const carried of input.carriedProfits) {
    for (const [npcId, delta] of Object.entries(carried)) {
      if (profileIds.has(npcId)) profits[npcId] = (profits[npcId] ?? 0) + delta;
    }
  }

  for (const activity of input.activities) {
    if (activity.session.tableId === "npc-income" || !profileIds.has(activity.npcId)) continue;
    if (activity.utcSecond >= input.periodStartSecond) profits[activity.npcId] = (profits[activity.npcId] ?? 0) + activity.session.delta;
    if (activity.utcSecond >= input.todayStartSecond) wageredToday[activity.npcId] = (wageredToday[activity.npcId] ?? 0) + activity.session.reservedAmount;
  }

  for (const settlement of input.journalSettlements) {
    if (settlement.tableId === "npc-income" || settlement.utcSecond < input.periodStartSecond || !profileIds.has(settlement.npcId)) continue;
    profits[settlement.npcId] = (profits[settlement.npcId] ?? 0) + settlement.delta;
  }

  return Object.freeze({ profits: Object.freeze(profits), wageredToday: Object.freeze(wageredToday) });
}
