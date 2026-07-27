import type { NpcGamblingProfile } from "./contracts.ts";

export interface CasinoLeaderboardEntry {
  id: string;
  kind: "npc" | "user";
  name: string;
  balance: number;
  rank: number;
}

export function casinoLeaderboard(
  profiles: readonly NpcGamblingProfile[],
  npcBalances: Readonly<Record<string, number>>,
  userBalance: number,
): readonly CasinoLeaderboardEntry[] {
  const sorted = [
    ...profiles.map((profile) => ({ id: profile.id, kind: "npc" as const, name: profile.name, balance: npcBalances[profile.id] ?? profile.target })),
    { id: "user", kind: "user" as const, name: "나", balance: userBalance },
  ].sort((left, right) => right.balance - left.balance
    || (left.kind === right.kind ? compareText(left.id, right.id) : left.kind === "npc" ? -1 : 1));
  const ranked = sorted.map((entry, index) => Object.freeze({ ...entry, rank: index + 1 }));
  const top = ranked.slice(0, 5);
  const user = ranked.find((entry) => entry.kind === "user")!;
  return Object.freeze(top.some((entry) => entry.kind === "user") ? top : [...top, user]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
