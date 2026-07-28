import type { StandardCardId } from "@lucky-arcade/card-table";
import { describe, expect, it } from "vitest";
import { JACKS_OR_BETTER_PAYTABLE, evaluateJacksOrBetter } from "../src/index.ts";

describe("Jacks or Better hand evaluation", () => {
  it.each([
    ["royal-flush", 250, ["hearts-10", "hearts-j", "hearts-q", "hearts-k", "hearts-a"]],
    ["straight-flush", 50, ["spades-5", "spades-6", "spades-7", "spades-8", "spades-9"]],
    ["four-of-a-kind", 25, ["clubs-a", "diamonds-a", "hearts-a", "spades-a", "clubs-2"]],
    ["full-house", 9, ["clubs-j", "diamonds-j", "hearts-j", "spades-4", "clubs-4"]],
    ["flush", 6, ["hearts-2", "hearts-5", "hearts-8", "hearts-j", "hearts-k"]],
    ["straight", 4, ["clubs-5", "diamonds-6", "hearts-7", "spades-8", "clubs-9"]],
    ["three-of-a-kind", 3, ["clubs-q", "diamonds-q", "hearts-q", "spades-3", "clubs-8"]],
    ["two-pair", 2, ["clubs-a", "diamonds-a", "hearts-2", "spades-2", "clubs-8"]],
    ["jacks-or-better", 1, ["clubs-j", "diamonds-j", "hearts-3", "spades-7", "clubs-9"]],
    ["low-pair", 0, ["clubs-10", "diamonds-10", "hearts-3", "spades-7", "clubs-9"]],
    ["high-card", 0, ["clubs-2", "diamonds-5", "hearts-8", "spades-j", "clubs-k"]],
  ] as const)("classifies %s at %i×", (category, payoutMultiplier, hand) => {
    expect(evaluateJacksOrBetter(hand as readonly StandardCardId[])).toMatchObject({ category, payoutMultiplier });
  });

  it("recognizes the ace-low wheel as a straight", () => {
    expect(evaluateJacksOrBetter(cards("clubs-a", "diamonds-2", "hearts-3", "spades-4", "clubs-5"))).toMatchObject({ category: "straight", payoutMultiplier: 4 });
  });

  it("exports the linear 9/6 paytable", () => {
    expect(JACKS_OR_BETTER_PAYTABLE).toEqual({
      "royal-flush": 250,
      "straight-flush": 50,
      "four-of-a-kind": 25,
      "full-house": 9,
      flush: 6,
      straight: 4,
      "three-of-a-kind": 3,
      "two-pair": 2,
      "jacks-or-better": 1,
    });
  });
});

function cards(...ids: StandardCardId[]): StandardCardId[] { return ids; }
