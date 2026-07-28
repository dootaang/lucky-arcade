import { describe, expect, it } from "vitest";
import type { StandardCardId } from "@lucky-arcade/card-table";
import {
  createFiveCardDrawState,
  decideNpcDraw,
  fiveCardDrawPublicView,
  reduceFiveCardDraw,
} from "../src/index.ts";

function started(seed = "test-seed") {
  return reduceFiveCardDraw(
    createFiveCardDrawState({ sessionId: "session-1", opponentId: "npc-1" }),
    { type: "start", seed },
  );
}

describe("five-card draw game", () => {
  it("deals two unique five-card hands from a 52-card deck", () => {
    const state = started();
    expect(state.deck).toHaveLength(52);
    expect(state.playerHand).toHaveLength(5);
    expect(state.npcHand).toHaveLength(5);
    expect(new Set([...state.playerHand, ...state.npcHand])).toHaveLength(10);
    expect(state.deckCursor).toBe(10);
  });

  it("replays the same seed and input identically", () => {
    const firstStart = started("repeatable");
    const secondStart = started("repeatable");
    const selection = [firstStart.playerHand[0], firstStart.playerHand[3]] as StandardCardId[];
    const first = reduceFiveCardDraw(firstStart, { type: "exchange", cardIds: selection });
    const second = reduceFiveCardDraw(secondStart, { type: "exchange", cardIds: selection });
    expect(second).toEqual(first);
    expect(first.result?.resultId).toBe(second.result?.resultId);
  });

  it("allows zero through five cards in the single exchange", () => {
    const standing = reduceFiveCardDraw(started("stand"), { type: "exchange", cardIds: [] });
    const allStart = started("all");
    const all = reduceFiveCardDraw(allStart, { type: "exchange", cardIds: allStart.playerHand });
    expect(standing.phase).toBe("complete");
    expect(standing.playerDiscarded).toHaveLength(0);
    expect(all.playerDiscarded).toHaveLength(5);
    expect(all.playerHand).toHaveLength(5);
    expect(() => reduceFiveCardDraw(all, { type: "exchange", cardIds: [] })).toThrow("five_card_draw_exchange_not_allowed");
  });

  it("rejects duplicate or foreign selections", () => {
    const state = started();
    const card = state.playerHand[0] as StandardCardId;
    expect(() => reduceFiveCardDraw(state, { type: "exchange", cardIds: [card, card] })).toThrow("five_card_draw_exchange_invalid");
    const foreign = state.deck.find((id) => !state.playerHand.includes(id)) as StandardCardId;
    expect(() => reduceFiveCardDraw(state, { type: "exchange", cardIds: [foreign] })).toThrow("five_card_draw_exchange_card_missing");
  });

  it("keeps the NPC hand private until showdown", () => {
    const state = started();
    expect(fiveCardDrawPublicView(state).npcHand).toBeNull();
    const complete = reduceFiveCardDraw(state, { type: "exchange", cardIds: [] });
    expect(fiveCardDrawPublicView(complete).npcHand).toEqual(complete.npcHand);
    expect(complete.result?.outcome).toMatch(/^(player-win|npc-win|tie)$/);
  });
});

describe("deterministic NPC draw strategy", () => {
  it("uses only the declared own-hand and public observation", () => {
    const observation = {
      hand: ["clubs-7", "diamonds-7", "hearts-2", "spades-9", "clubs-a"] as StandardCardId[],
      playerExchangeCount: 2,
    };
    expect(decideNpcDraw(observation)).toEqual(decideNpcDraw({ ...observation, hand: [...observation.hand] }));
    expect(decideNpcDraw(observation)).toEqual({
      discardCardIds: ["clubs-a", "hearts-2", "spades-9"],
      reason: "keep-pair",
    });
  });

  it("stands on a made straight and draws one to a four-card flush", () => {
    expect(decideNpcDraw({
      hand: ["clubs-5", "diamonds-6", "hearts-7", "spades-8", "clubs-9"],
      playerExchangeCount: 0,
    }).discardCardIds).toEqual([]);
    expect(decideNpcDraw({
      hand: ["hearts-2", "hearts-6", "hearts-9", "hearts-k", "clubs-a"],
      playerExchangeCount: 3,
    })).toEqual({ discardCardIds: ["clubs-a"], reason: "draw-to-flush" });
  });
});
