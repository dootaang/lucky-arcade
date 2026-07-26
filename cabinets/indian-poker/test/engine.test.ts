import { resultHash } from "@lucky-arcade/engine";
import { describe, expect, it } from "vitest";
import { INDIAN_POKER_DECK, cardStrength, createIndianPokerState, indianPokerRanking, reduceIndianPoker, temerosaIndianPokerCartridge, type IndianPokerState } from "../src/index.ts";

describe("indian poker heads-up engine", () => {
  it("uses the shared 52-card deck with rank-only strength", () => {
    expect(INDIAN_POKER_DECK).toHaveLength(52);
    expect(new Set(INDIAN_POKER_DECK.map((card) => card.id)).size).toBe(52);
    expect(new Set(INDIAN_POKER_DECK.map(cardStrength)).size).toBe(13);
  });

  it("deals without replacement and conserves twenty chips", () => {
    const complete = play("persistent-deck");
    expect(complete.history).toHaveLength(5);
    expect(new Set(complete.history.flatMap((round) => [round.playerCardId, round.npcCardId])).size).toBe(10);
    expect(complete.playerChips + complete.npcChips).toBe(20);
  });

  it("supports check/showdown and raise/NPC response", () => {
    let state = start("actions");
    if (state.npcOpening === "raise") state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "player-act", action: "call" });
    else {
      state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "player-act", action: "raise" });
      expect(state.status).toBe("npc-response");
      state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "npc-respond" });
    }
    expect(state.status).toBe("showdown");
    expect(state.history).toHaveLength(1);
    expect(state.playerChips + state.npcChips).toBe(20);
  });

  it("finishes deterministically and returns the remaining chip share", () => {
    const left = play("same"), right = play("same");
    expect(left.status).toBe("complete");
    expect(indianPokerRanking(left)).toHaveLength(2);
    expect(left.creditAmount).toBe(Math.floor(10 * left.playerChips / 10));
    expect(resultHash(left)).toBe(resultHash(right));
  });

  it("finishes 1,000 seeds without deadlocking", () => {
    for (let seed = 0; seed < 1_000; seed += 1) expect(play(String(seed)).status).toBe("complete");
  });
});

function start(seed: string): IndianPokerState {
  return reduceIndianPoker(temerosaIndianPokerCartridge, createIndianPokerState(temerosaIndianPokerCartridge, seed), { type: "start", seed, stake: 10, wagerId: `wager-${seed}` });
}
function play(seed: string): IndianPokerState {
  let state = start(seed);
  while (state.status !== "complete") {
    if (state.status === "player-action") state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "player-act", action: state.npcOpening === "raise" ? "call" : "check" });
    else if (state.status === "npc-response") state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "npc-respond" });
    else state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "next-round" });
  }
  return state;
}
