import { describe, expect, it } from "vitest";
import { OLD_MAID_RANK_REWARDS, oldMaidRankReward } from "./wallet.ts";

describe("old maid rank rewards", () => {
  it("rewards every direct-play finish with a descending amount", () => {
    expect(OLD_MAID_RANK_REWARDS).toEqual({ 1: 60, 2: 30, 3: 15, 4: 5 });
    expect([1, 2, 3, 4].map(oldMaidRankReward)).toEqual([60, 30, 15, 5]);
  });

  it("does not invent rewards outside a four-seat ranking", () => {
    expect(oldMaidRankReward(0)).toBe(0);
    expect(oldMaidRankReward(5)).toBe(0);
  });
});
