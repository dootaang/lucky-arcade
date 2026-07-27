import { describe, expect, it } from "vitest";
import type { MatchRecord } from "@lucky-arcade/persistence";
import { summarizeOpponentRecords } from "./opponent-records.ts";

function record(id: string, playerRank: number, npcRank: number, outcome: MatchRecord["outcome"] = "win"): MatchRecord {
  return {
    contract: "match-record/0.1",
    recordId: id,
    cabinetId: "test",
    cabinetVersion: "test/0.1",
    sessionId: "session",
    sequence: 1,
    seed: id,
    completedAt: "2026-07-27T00:00:00.000Z",
    turns: 1,
    standings: [
      { seatId: "player", participantId: "player", displayName: "플레이어", rank: playerRank, isPlayer: true },
      { seatId: "npc", participantId: "npc-a", displayName: "NPC A", rank: npcRank, isPlayer: false },
    ],
    outcome,
    resultHash: id,
  };
}

describe("summarizeOpponentRecords", () => {
  it("counts head-to-head wins, losses and draws and ignores spectating", () => {
    const summary = summarizeOpponentRecords([
      record("win", 1, 2),
      record("loss", 2, 1, "loss"),
      record("draw", 1, 1, "draw"),
      record("watch", 1, 2, "spectated"),
    ]);
    expect(summary["npc-a"]).toEqual({ played: 3, wins: 1, losses: 1, draws: 1 });
  });
});
