import { describe, expect, it } from "vitest";
import { createIndianPokerState, npcRead, reduceIndianPoker, temerosaIndianPokerCartridge } from "../src/index.ts";

describe("indian poker legal NPC read", () => {
  it("contains the visible player card but never the NPC's own current card", () => {
    const state = reduceIndianPoker(temerosaIndianPokerCartridge, createIndianPokerState(temerosaIndianPokerCartridge, "read"), { type: "start", seed: "read", stake: 10, wagerId: "wager", roundCount: 7 });
    const read = npcRead(state);
    expect(read.visiblePlayerCardId).toBe(state.playerCardId);
    expect(read).not.toHaveProperty("npcCardId");
    expect(read).not.toHaveProperty("ownCard");
    expect(read.previouslyRevealedCardIds).toEqual([]);
  });
});
