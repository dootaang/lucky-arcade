import { resultHash } from "@lucky-arcade/engine";
import { describe, expect, it } from "vitest";
import {
  INDIAN_POKER_DECK,
  INDIAN_POKER_DEFAULT_ROUND_COUNT,
  INDIAN_POKER_STARTING_CHIPS,
  cardStrength,
  createIndianPokerState,
  indianPokerAuditTrail,
  indianPokerRanking,
  publicIndianPokerCards,
  reduceIndianPoker,
  temerosaIndianPokerCartridge,
  type IndianPokerRoundCount,
  type IndianPokerState,
} from "../src/index.ts";

describe("indian poker 0.4 engine", () => {
  it("uses the shared 52-card deck with rank-only strength", () => {
    expect(INDIAN_POKER_DECK).toHaveLength(52);
    expect(new Set(INDIAN_POKER_DECK.map((card) => card.id)).size).toBe(52);
    expect(new Set(INDIAN_POKER_DECK.map(cardStrength)).size).toBe(13);
  });

  it("defaults to seven rounds and accepts five rounds before the deal", () => {
    const ready = createIndianPokerState(temerosaIndianPokerCartridge, "format");
    expect(ready.roundCount).toBe(INDIAN_POKER_DEFAULT_ROUND_COUNT);
    const five = reduceIndianPoker(temerosaIndianPokerCartridge, ready, { type: "select-round-count", roundCount: 5 });
    expect(five.roundCount).toBe(5);
    expect(() => reduceIndianPoker(temerosaIndianPokerCartridge, start("locked", 7), { type: "select-round-count", roundCount: 5 })).toThrow("indian_poker_round_count_selection_invalid");
  });

  it.each([5, 7] as const)("deals %i rounds without replacement and conserves twenty-four chips", (roundCount) => {
    const complete = play(`persistent-deck-${roundCount}`, roundCount);
    expect(complete.history).toHaveLength(roundCount);
    expect(new Set(complete.history.flatMap((round) => [round.playerCardId, round.npcCardId])).size).toBe(roundCount * 2);
    expect(complete.playerChips + complete.npcChips).toBe(INDIAN_POKER_STARTING_CHIPS * 2);
  });

  it("seeds the first opener and alternates it every round", () => {
    const left = play("button-order", 7);
    const right = play("button-order", 7);
    expect(left.firstOpener).toBe(right.firstOpener);
    expect(left.history.map((round) => round.opener)).toEqual(left.history.map((_, index) => index % 2 === 0 ? left.firstOpener : left.firstOpener === "player" ? "npc" : "player"));
  });

  it("supports two-chip bets and a hidden fold", () => {
    let state = findPlayerOpeningSeed();
    state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "player-act", decision: { kind: "bet", amount: 2 } });
    expect(state.status).toBe("npc-action");
    state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "npc-act" });
    expect(state.status).toBe("showdown");
    expect(state.history[0]?.moves[0]).toEqual({ seatId: "player", kind: "bet", amount: 2 });

    state = findNpcBetSeed();
    state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "player-act", decision: { kind: "fold" } });
    expect(state.history.at(-1)?.playerCardRevealed).toBe(false);
    expect(publicIndianPokerCards(state)).not.toContain(state.history.at(-1)?.playerCardId);
  });

  it("exports a deterministic audit record containing the seed, actions, and cards", () => {
    const left = play("audit", 7);
    const right = play("audit", 7);
    const audit = indianPokerAuditTrail(left);
    expect(audit.rounds).toHaveLength(7);
    expect(audit.rounds.every((round) => round.moves.length > 0)).toBe(true);
    expect(new Set(audit.rounds.flatMap((round) => [round.playerCardId, round.npcCardId])).size).toBe(14);
    expect(resultHash(left)).toBe(resultHash(right));
    expect(indianPokerAuditTrail(left)).toEqual(indianPokerAuditTrail(right));
  });

  it.each([5, 7] as const)("finishes 1,000 deterministic %i-round seeds without deadlocking", (roundCount) => {
    for (let seed = 0; seed < 1_000; seed += 1) {
      const complete = play(`${roundCount}:${seed}`, roundCount);
      expect(complete.status).toBe("complete");
      expect(indianPokerRanking(complete)).toHaveLength(2);
      expect(complete.creditAmount).toBe(Math.floor(10 * complete.playerChips / INDIAN_POKER_STARTING_CHIPS));
    }
  });
});

function start(seed: string, roundCount: IndianPokerRoundCount): IndianPokerState {
  return reduceIndianPoker(
    temerosaIndianPokerCartridge,
    createIndianPokerState(temerosaIndianPokerCartridge, seed, undefined, undefined, roundCount),
    { type: "start", seed, stake: 10, wagerId: `wager-${seed}`, roundCount },
  );
}

function play(seed: string, roundCount: IndianPokerRoundCount): IndianPokerState {
  let state = start(seed, roundCount);
  let guard = 0;
  while (state.status !== "complete") {
    guard += 1;
    if (guard > 100) throw new Error(`indian_poker_deadlock:${seed}`);
    if (state.status === "player-action") {
      const facingBet = state.roundMoves.at(-1)?.seatId === "npc" && state.roundMoves.at(-1)?.kind === "bet";
      const decision = facingBet
        ? state.playerChips >= state.currentBet ? { kind: "call" as const } : { kind: "fold" as const }
        : { kind: "check" as const };
      state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "player-act", decision });
    } else if (state.status === "npc-action") state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "npc-act" });
    else state = reduceIndianPoker(temerosaIndianPokerCartridge, state, { type: "next-round" });
  }
  return state;
}

function findPlayerOpeningSeed(): IndianPokerState {
  for (let index = 0; index < 100; index += 1) {
    const state = start(`player-opener:${index}`, 7);
    if (state.roundOpener === "player") return state;
  }
  throw new Error("player_opening_seed_missing");
}

function findNpcBetSeed(): IndianPokerState {
  for (let index = 0; index < 1_000; index += 1) {
    const state = start(`npc-bet:${index}`, 7);
    if (state.status === "player-action" && state.roundMoves.at(-1)?.kind === "bet") return state;
  }
  throw new Error("npc_bet_seed_missing");
}
