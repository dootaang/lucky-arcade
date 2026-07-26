import { describe, expect, it } from "vitest";
import { OLD_MAID_RANK_REWARDS, oldMaidRankReward } from "./wallet.ts";

describe("old maid rank rewards", () => {
  it("rewards every direct-play finish with a descending amount", () => {
    expect(OLD_MAID_RANK_REWARDS).toEqual({ 1: 10, 2: 5, 3: 3, 4: 1 });
    expect([1, 2, 3, 4].map(oldMaidRankReward)).toEqual([10, 5, 3, 1]);
  });

  it("does not invent rewards outside a four-seat ranking", () => {
    expect(oldMaidRankReward(0)).toBe(0);
    expect(oldMaidRankReward(5)).toBe(0);
  });
});
