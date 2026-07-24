import { describe, expect, it } from "vitest";
import { gflDerbyRoster, rankEngineBenchmarks, simulateRace } from "../src/index.ts";

describe("lucky derby deterministic race", () => {
  it("replays the same seed byte-for-byte", () => {
    const first = simulateRace({ seed: "daily-2026-07-24", racers: gflDerbyRoster });
    const second = simulateRace({ seed: "daily-2026-07-24", racers: gflDerbyRoster });
    expect(first).toEqual(second);
    expect(first.resultHash).toHaveLength(64);
    expect(first.frames).toHaveLength(91);
    expect(first.results.map((result) => result.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("ranks completed, responsive renderers first", () => {
    const ranked = rankEngineBenchmarks([
      { engineId: "slow", loadMs: 500, firstFrameMs: 100, longestFrameMs: 20, slowFrameRatio: 0.1, completed: true },
      { engineId: "fast", loadMs: 100, firstFrameMs: 20, longestFrameMs: 5, slowFrameRatio: 0, completed: true },
      { engineId: "broken", loadMs: 1, firstFrameMs: 1, longestFrameMs: 1, slowFrameRatio: 0, completed: false },
    ]);
    expect(ranked.map((entry) => entry.engineId)).toEqual(["fast", "slow", "broken"]);
  });

  it("changes the race with a different seed without losing racers", () => {
    const first = simulateRace({ seed: "alpha", racers: gflDerbyRoster });
    const second = simulateRace({ seed: "beta", racers: gflDerbyRoster });
    expect(first.resultHash).not.toBe(second.resultHash);
    expect(new Set(second.results.map((result) => result.racerId))).toEqual(new Set(gflDerbyRoster.map((racer) => racer.id)));
  });
});
