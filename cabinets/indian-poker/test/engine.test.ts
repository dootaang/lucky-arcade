import { resultHash } from "@lucky-arcade/engine";
import { describe, expect, it } from "vitest";
import { INDIAN_POKER_DECK, cardStrength, createIndianPokerState, indianPokerRanking, reduceIndianPoker, temerosaIndianPokerCartridge, type IndianPokerState } from "../src/index.ts";

describe("indian poker engine", () => {
  it("orders all 52 cards uniquely", () => { const strengths = INDIAN_POKER_DECK.map(cardStrength); expect(new Set(strengths).size).toBe(52); expect(Math.min(...strengths)).toBe(0); expect(Math.max(...strengths)).toBe(51); });
  it("deals four unique cards and scores call/fold", () => {
    let state = reduceIndianPoker(temerosaIndianPokerCartridge, createIndianPokerState(temerosaIndianPokerCartridge, "deal"), { type: "start", seed: "deal", stake: 10, wagerId: "wager" });
    expect(new Set(Object.values(state.hands)).size).toBe(4);
    state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "choose", choice: "fold" });
    expect(state.lastRound?.scoreDelta.player).toBe(0); expect(state.status).toBe("revealing");
  });
  it("finishes five rounds deterministically", () => {
    const left = play("same"), right = play("same");
    expect(left.status).toBe("complete"); expect(left.history).toHaveLength(5); expect(indianPokerRanking(left)).toHaveLength(4); expect(resultHash(left)).toBe(resultHash(right));
  });
  it("finishes 1000 seeds", () => { for (let seed = 0; seed < 1000; seed += 1) expect(play(String(seed)).status).toBe("complete"); });
});

function play(seed: string): IndianPokerState {
  let state = reduceIndianPoker(temerosaIndianPokerCartridge, createIndianPokerState(temerosaIndianPokerCartridge, seed), { type: "start", seed, stake: 10, wagerId: `wager-${seed}` });
  while (state.status !== "complete") state = state.status === "choosing" ? reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "choose", choice: "call" }) : reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "next_round" });
  return state;
}
