import { describe, expect, it } from "vitest";
import { INDIAN_POKER_DECK, createIndianPokerState, decisionRead, reduceIndianPoker, temerosaIndianPokerCartridge } from "../src/index.ts";

describe("indian poker reads", () => {
  it("gives a decision only visible strengths, never a self-card field", () => {
    const state = reduceIndianPoker(temerosaIndianPokerCartridge, createIndianPokerState(temerosaIndianPokerCartridge, "read"), { type: "start" });
    const read = decisionRead(state, "cpu-1", new Map(INDIAN_POKER_DECK.map((card) => [card.id, card])));
    expect(read.visibleStrengths).toHaveLength(3); expect(read).not.toHaveProperty("myVisibleToOthers"); expect(read).not.toHaveProperty("ownCard");
  });
});
