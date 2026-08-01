import { describe, expect, it } from "vitest";
import {
  MATCH_PAIRS_SPREAD_PRICING_VERSION,
  matchPairsChallengeReward,
  matchPairsPerformance,
  matchPairsSpreadChoiceKey,
  matchPairsSpreadCovered,
  parseMatchPairsSpreadChoice,
  type MatchPairsSpreadChoice,
  type MatchPairsState,
} from "../src/index.ts";

type CompletedState = Pick<MatchPairsState, "claims" | "attempts" | "difficulty" | "outcome">;

describe("match pairs economy", () => {
  it("derives challenge rewards only from the public completed result", () => {
    const efficientWin = completed(4, 2, 6, "player");
    const slowDraw = completed(3, 3, 14, "draw");
    const loss = completed(2, 4, 13, "npc");

    expect(matchPairsPerformance(efficientWin)).toMatchObject({ scoreDifference: 2, excessAttempts: 0, performanceScore: 20, outcome: "win" });
    expect(matchPairsChallengeReward(efficientWin)).toBe(8);
    expect(matchPairsChallengeReward(slowDraw)).toBe(2);
    expect(matchPairsChallengeReward(loss)).toBe(1);
  });

  it("settles a spread symmetrically around a frozen target", () => {
    const quote = choice(9);
    expect(matchPairsSpreadCovered(completed(4, 2, 6, "player"), quote)).toBe(true);
    expect(matchPairsSpreadCovered(completed(3, 3, 7, "draw"), quote)).toBe(false);
  });

  it("round-trips only the current immutable pricing contract", () => {
    const value = choice(7);
    expect(parseMatchPairsSpreadChoice(matchPairsSpreadChoiceKey(value))).toEqual(value);
    expect(parseMatchPairsSpreadChoice("spread:{\"pricingVersion\":\"old\"}")).toBeNull();
    expect(parseMatchPairsSpreadChoice("not-a-spread")).toBeNull();
  });
});

function completed(playerPairs: number, npcPairs: number, attempts: number, outcome: MatchPairsState["outcome"]): CompletedState {
  return {
    claims: {
      player: Array.from({ length: playerPairs }, (_, index) => `player-${index}`),
      npc: Array.from({ length: npcPairs }, (_, index) => `npc-${index}`),
    },
    attempts,
    difficulty: "easy",
    outcome,
  };
}

function choice(targetScore: number): MatchPairsSpreadChoice {
  return {
    seed: "seed",
    quoteId: "npc:easy:standard",
    pricingVersion: MATCH_PAIRS_SPREAD_PRICING_VERSION,
    opponentId: "npc",
    difficulty: "easy",
    focus: "standard",
    targetScore,
  };
}
