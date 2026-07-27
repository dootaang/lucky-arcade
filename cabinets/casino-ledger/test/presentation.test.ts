import { describe, expect, it } from "vitest";
import { casinoLeaderboard, TEMEROSA_NPC_GAMBLING_PROFILES } from "../src/index.ts";

describe("casino leaderboard", () => {
  it("shows the user once and places a tied user behind every NPC", () => {
    const balances = Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.target]));
    const board = casinoLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES, balances, 4_000);
    expect(board.filter((entry) => entry.kind === "user")).toHaveLength(1);
    expect(board.find((entry) => entry.kind === "npc" && entry.id === "katrinka")!.rank).toBeLessThan(board.find((entry) => entry.kind === "user")!.rank);
  });

  it("appends the user fixed row only when outside the top five", () => {
    const balances = Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.target]));
    const board = casinoLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES, balances, 0);
    expect(board).toHaveLength(6);
    expect(board.at(-1)).toMatchObject({ kind: "user", rank: 36 });
  });
});
