import type { NpcGamblingProfile } from "./contracts.ts";

export interface CasinoLeaderboardEntry {
  id: string;
  kind: "npc" | "user";
  name: string;
  balance: number;
  periodProfit?: number;
  rank: number;
}

export function casinoLeaderboard(
  profiles: readonly NpcGamblingProfile[],
  npcBalances: Readonly<Record<string, number>>,
  userBalance: number,
  npcPeriodProfits?: Readonly<Record<string, number>>,
): readonly CasinoLeaderboardEntry[] {
  const sorted = [
    ...profiles.map((profile) => ({ id: profile.id, kind: "npc" as const, name: profile.name, balance: npcBalances[profile.id] ?? profile.openingBalance, ...(npcPeriodProfits ? { periodProfit: npcPeriodProfits[profile.id] ?? 0 } : {}) })),
    { id: "user", kind: "user" as const, name: "나", balance: userBalance },
  ].sort((left, right) => (npcPeriodProfits && left.kind === "npc" && right.kind === "npc" ? (right.periodProfit ?? 0) - (left.periodProfit ?? 0) : right.balance - left.balance)
    || (left.kind === right.kind ? compareText(left.id, right.id) : left.kind === "npc" ? -1 : 1));
  const ranked = sorted.map((entry, index) => Object.freeze({ ...entry, rank: index + 1 }));
  const top = ranked.slice(0, 5);
  const user = ranked.find((entry) => entry.kind === "user")!;
  return Object.freeze(top.some((entry) => entry.kind === "user") ? top : [...top, user]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
