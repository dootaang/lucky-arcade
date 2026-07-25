import type { MatchRecord } from "@lucky-arcade/persistence";
import { describe, expect, it } from "vitest";
import { summariseMatches } from "./match-history.ts";

describe("match history summary", () => {
  it("excludes spectating and aggregates opponents and streaks", () => {
    const records = [record("1", "win", 1, 4), record("2", "loss", 4, 1), record("3", "spectated", 1, 4), record("4", "win", 2, 3)];
    const summary = summariseMatches(records);
    expect(summary).toMatchObject({ played: 3, wins: 2, firstPlaces: 1, jokerHolds: 1, currentStreak: 1, longestStreak: 1 });
    expect(summary.opponents[0]).toMatchObject({ participantId: "npc", played: 3, beaten: 2 });
  });
});

function record(id: string, outcome: MatchRecord["outcome"], playerRank: number, opponentRank: number): MatchRecord {
  return { contract: "match-record/0.1", recordId: id, cabinetId: "test", cabinetVersion: "1", sessionId: "s", sequence: Number(id), seed: id, completedAt: `2026-01-0${id}T00:00:00.000Z`, turns: 1, standings: [{ seatId: "player", displayName: "플레이어", rank: playerRank, isPlayer: true }, { seatId: "cpu", participantId: "npc", displayName: "상대", rank: opponentRank, isPlayer: false }], outcome, resultHash: id };
}
