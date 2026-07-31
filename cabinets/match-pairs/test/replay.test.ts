import { describe, expect, it } from "vitest";
import { createMatchPairsSpectatorReplay, type MatchPairsFace, type MatchPairsOpponent } from "../src/index.ts";

const faces: readonly MatchPairsFace[] = Array.from({ length: 10 }, (_, index) => ({ id: `face-${index}`, assetId: `asset-${index}`, characterId: `character-${index}` }));
const opponents: readonly MatchPairsOpponent[] = [opponent("left", 3), opponent("right", 2)];

describe("match-pairs spectator replay", () => {
  it("uses one reducer transcript for both viewing and the final result", () => {
    const left = replay("market-seed");
    const right = replay("market-seed");
    expect(left.finalState.status).toBe("complete");
    expect(left.frames.map((frame) => frame.action)).toEqual(right.frames.map((frame) => frame.action));
    expect(left.resultHash).toBe(right.resultHash);
    expect(["left", "right", "draw"]).toContain(left.winningCharacterId);
  });

  it("completes a deterministic seed sample", () => {
    for (let seed = 0; seed < 250; seed += 1) expect(replay(`sample-${seed}`).finalState.status).toBe("complete");
  });
});

function replay(seed: string) {
  return createMatchPairsSpectatorReplay({ faces, opponents, packVersion: "fixture/0.1", seed, sessionId: `market:${seed}`, participantIds: ["left", "right"] });
}
function opponent(id: string, tier: 1 | 2 | 3): MatchPairsOpponent {
  return { id, name: id, portraits: { neutral: `${id}-n`, pleased: `${id}-p`, tense: `${id}-t` }, despairPortrait: `${id}-d`, memoryCapacity: tier + 4,
    observationRate: .75, recallAccuracy: .72, memoryRetention: .88, consistency: .76, searchStyle: "mixed", streakComposure: .82, difficultyTier: tier,
    winCreditMultiplier: tier === 3 ? 2.5 : tier === 2 ? 2 : 1.5 };
}
