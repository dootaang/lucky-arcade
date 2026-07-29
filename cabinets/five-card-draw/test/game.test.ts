import { describe, expect, it } from "vitest";
import type { StandardCardId } from "@lucky-arcade/card-table";
import {
  FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS,
  createFiveCardDrawState,
  decideNpcDraw,
  fiveCardDrawPublicView,
  legalPlayerBetActions,
  reduceFiveCardDraw,
  type FiveCardDrawContext,
  type FiveCardDrawPersona,
  type FiveCardDrawState,
} from "../src/index.ts";

const PERSONA: FiveCardDrawPersona = {
  drawSkill: 0.7,
  handReading: 0.6,
  aggression: 0.5,
  bluffFrequency: 0.2,
  discipline: 0.7,
  counterRead: 0.4,
  tiltResistance: 0.8,
};

function context(opponentCount = 1): FiveCardDrawContext {
  return {
    sessionId: `session-${opponentCount}`,
    opponents: Array.from({ length: opponentCount }, (_, index) => ({ id: `character-${index + 1}`, name: `상대 ${index + 1}`, persona: PERSONA })),
  };
}

function started(seed = "test-seed", opponentCount = 1): FiveCardDrawState {
  return reduceFiveCardDraw(createFiveCardDrawState(context(opponentCount)), { type: "start", seed, stake: 10 });
}

function autoplay(initial: FiveCardDrawState): FiveCardDrawState {
  let state = initial;
  for (let guard = 0; guard < 100 && state.phase !== "complete"; guard += 1) {
    if (state.currentActorId !== "player") {
      state = reduceFiveCardDraw(state, { type: "advance" });
    } else if (state.phase === "drawing") {
      state = reduceFiveCardDraw(state, { type: "exchange", cardIds: [] });
    } else {
      const actions = legalPlayerBetActions(state);
      const action = actions.includes("check") ? "check" : actions.includes("call") ? "call" : actions[0];
      if (!action) throw new Error("missing_player_action");
      state = reduceFiveCardDraw(state, { type: "bet", action });
    }
  }
  if (state.phase !== "complete") throw new Error("autoplay_guard_exhausted");
  return state;
}

describe("five-card draw game", () => {
  it.each([1, 2, 3])("deals unique hands for player plus %i opponents", (opponentCount) => {
    const state = started("deal", opponentCount);
    const activeHands = state.seatOrder.flatMap((seatId) => state.hands[seatId]);
    expect(state.seatOrder).toHaveLength(opponentCount + 1);
    expect(activeHands).toHaveLength((opponentCount + 1) * 5);
    expect(new Set(activeHands)).toHaveLength(activeHands.length);
    expect(state.deckCursor).toBe(activeHands.length);
  });

  it("replays the same seed and inputs identically", () => {
    const first = autoplay(started("repeatable", 3));
    const second = autoplay(started("repeatable", 3));
    expect(second).toEqual(first);
    expect(first.result?.resultId).toBe(second.result?.resultId);
  });

  it("allows zero through three cards in the single exchange", () => {
    let state = started("exchange");
    while (state.currentActorId !== "player") state = reduceFiveCardDraw(state, { type: "advance" });
    if (state.phase !== "opening-bet") throw new Error("unexpected_phase");
    state = reduceFiveCardDraw(state, { type: "bet", action: legalPlayerBetActions(state).includes("check") ? "check" : "call" });
    while (state.phase !== "drawing" || state.currentActorId !== "player") state = reduceFiveCardDraw(state, { type: "advance" });
    const cards = state.hands.player.slice(0, 3);
    const exchanged = reduceFiveCardDraw(state, { type: "exchange", cardIds: cards });
    expect(exchanged.discarded.player).toEqual(cards);
    expect(exchanged.hands.player).toHaveLength(5);
    expect(() => reduceFiveCardDraw(state, { type: "exchange", cardIds: state.hands.player.slice(0, 4) })).toThrow("five_card_draw_exchange_invalid");
  });

  it("keeps every NPC hand private until a showdown", () => {
    const state = started("private", 3);
    expect(Object.values(fiveCardDrawPublicView(state).npcHands)).toEqual([null, null, null]);
    const complete = autoplay(state);
    for (const seatId of complete.activeSeatIds.filter((seat) => seat !== "player")) {
      expect(fiveCardDrawPublicView(complete).npcHands[seatId]).toEqual(complete.hands[seatId]);
    }
    for (const seatId of complete.foldedSeatIds.filter((seat) => seat !== "player")) {
      expect(fiveCardDrawPublicView(complete).npcHands[seatId]).toBeNull();
    }
  });

  it("caps exposure, conserves the pot, and returns unused reservation", () => {
    const complete = autoplay(started("settlement", 3));
    const result = complete.result!;
    expect(Object.values(result.contributions).every((value) => value <= FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS * 10)).toBe(true);
    expect(Object.values(result.contributions).reduce((sum, value) => sum + value, 0)).toBe(result.pot);
    expect(Object.values(result.payouts).reduce((sum, value) => sum + value, 0)).toBe(result.pot);
    expect(result.playerCredit).toBe(FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS * 10 - result.contributions.player + result.payouts.player);
  });

  it("rotates the dealer only after a completed hand", () => {
    const playing = started("rotate", 2);
    expect(() => reduceFiveCardDraw(playing, { type: "reset" })).toThrow("five_card_draw_reset_not_allowed");
    const complete = autoplay(playing);
    const reset = reduceFiveCardDraw(complete, { type: "reset" });
    expect(reset.dealerIndex).toBe(1);
    expect(reset.sequence).toBe(complete.sequence + 1);
  });

  it("finishes 10,000 seeded tables without duplicate cards or loops", () => {
    for (let index = 0; index < 10_000; index += 1) {
      const complete = autoplay(started(`audit-${index}`, 1 + (index % 3)));
      const dealt = complete.seatOrder.flatMap((seat) => [...complete.hands[seat], ...complete.discarded[seat]]);
      expect(new Set(dealt)).toHaveLength(dealt.length);
    }
  }, 30_000);
});

describe("deterministic NPC draw strategy", () => {
  function observation(hand: readonly StandardCardId[], persona = PERSONA) {
    return { hand, visibleExchangeCounts: { player: 2 }, activeSeatCount: 3, persona, seed: "npc-decision" } as const;
  }

  it("uses only its own hand and declared public information", () => {
    const hand = ["clubs-7", "diamonds-7", "hearts-2", "spades-9", "clubs-a"] as StandardCardId[];
    expect(decideNpcDraw(observation(hand))).toEqual(decideNpcDraw(observation([...hand])));
  });

  it("stands on made hands and never discards more than three", () => {
    const straight = ["clubs-5", "diamonds-6", "hearts-7", "spades-8", "clubs-9"] as StandardCardId[];
    expect(decideNpcDraw(observation(straight)).discardCardIds).toEqual([]);
    const pair = ["clubs-7", "diamonds-7", "hearts-2", "spades-9", "clubs-a"] as StandardCardId[];
    expect(decideNpcDraw(observation(pair)).discardCardIds.length).toBeLessThanOrEqual(3);
  });
});
