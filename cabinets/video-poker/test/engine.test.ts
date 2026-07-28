import { describe, expect, it } from "vitest";
import { createVideoPokerState, isVideoPokerState, reduceVideoPoker, videoPokerCredit, videoPokerExposure, videoPokerResultHash, type VideoPokerState } from "../src/index.ts";

const wager = { stake: 50 as const, multiplier: 3 as const, wagerId: "wager-1" };

describe("video poker engine", () => {
  it("uses one deterministic 52-card deck and deals five unique cards", () => {
    const state = deal("deck-seed");
    expect(state.deck).toHaveLength(52);
    expect(new Set(state.deck).size).toBe(52);
    expect(state.hand).toHaveLength(5);
    expect(new Set(state.hand).size).toBe(5);
    expect(state.cursor).toBe(5);
    expect(isVideoPokerState(state)).toBe(true);
  });

  it("produces identical state and result hashes for identical seed and actions", () => {
    const left = play("same-seed", [0, 2, 4]);
    const right = play("same-seed", [0, 2, 4]);
    expect(left).toEqual(right);
    expect(videoPokerResultHash(left)).toBe(videoPokerResultHash(right));
  });

  it("preserves held cards, replaces every unheld card, and allows only one exchange", () => {
    let state = deal("hold-seed");
    const initial = [...state.hand];
    state = reduceVideoPoker(state, { type: "toggle-hold", cardIndex: 1 });
    state = reduceVideoPoker(state, { type: "toggle-hold", cardIndex: 3 });
    const complete = reduceVideoPoker(state, { type: "draw" });
    expect(complete.hand[1]).toBe(initial[1]);
    expect(complete.hand[3]).toBe(initial[3]);
    expect(complete.hand[0]).not.toBe(initial[0]);
    expect(complete.hand[2]).not.toBe(initial[2]);
    expect(complete.hand[4]).not.toBe(initial[4]);
    expect(complete.cursor).toBe(8);
    expect(complete.exchangeCount).toBe(1);
    expect(() => reduceVideoPoker(complete, { type: "draw" })).toThrow("video_poker_draw_invalid");
  });

  it("takes stake and wager multiplier as inputs without mutating an external wallet", () => {
    const complete = play("payout-seed", []);
    expect(videoPokerExposure(wager)).toBe(150);
    expect(complete.outcome?.wageredPoints).toBe(150);
    expect(videoPokerCredit(complete)).toBe(150 * (complete.outcome?.hand.payoutMultiplier ?? 0));
    expect(complete.wager).toEqual(wager);
  });

  it("rejects invalid transitions and resets only after completion", () => {
    const ready = createVideoPokerState();
    expect(() => reduceVideoPoker(ready, { type: "draw" })).toThrow("video_poker_draw_invalid");
    const holding = deal("transition-seed");
    expect(() => reduceVideoPoker(holding, { type: "deal", seed: "again", wager })).toThrow("video_poker_deal_invalid");
    expect(() => reduceVideoPoker(holding, { type: "toggle-hold", cardIndex: 5 })).toThrow("video_poker_hold_invalid");
    const complete = reduceVideoPoker(holding, { type: "draw" });
    const restarted = reduceVideoPoker(complete, { type: "restart" });
    expect(restarted).toMatchObject({ status: "ready", hand: [], wager: null, outcome: null });
  });

  it("uses the shared casino leverage contract", () => {
    const ready = createVideoPokerState();
    expect(() => reduceVideoPoker(ready, { type: "deal", seed: "one-x", wager: { stake: 10, multiplier: 1 as never, wagerId: "invalid" } })).toThrow("video_poker_wager_invalid");
  });
});

function deal(seed: string): VideoPokerState {
  return reduceVideoPoker(createVideoPokerState(), { type: "deal", seed, wager });
}

function play(seed: string, holds: readonly number[]): VideoPokerState {
  let state = deal(seed);
  for (const cardIndex of holds) state = reduceVideoPoker(state, { type: "toggle-hold", cardIndex });
  return reduceVideoPoker(state, { type: "draw" });
}
