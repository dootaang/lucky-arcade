import { describe, expect, it } from "vitest";
import { CASINO_GAME_INFO, bestPokerHand, blackjackValue, casinoCardResultHash, chooseOneCardCpuAction, comparePokerHands, createCasinoCardState, holdemCpuFolds, reduceCasinoCard, type CasinoCardAction, type CasinoCardGameId, type CasinoCardState } from "../src/index.ts";

const GAME_IDS = Object.keys(CASINO_GAME_INFO) as CasinoCardGameId[];

describe("casino card cores", () => {
  it("deals the same game from the same seed", () => {
    for (const gameId of GAME_IDS) {
      const start: CasinoCardAction = { type: "start", seed: "same", stake: 10, reservedAmount: 10 * CASINO_GAME_INFO[gameId].maxExposure, wagerId: "wager" };
      const left = reduceCasinoCard(createCasinoCardState(gameId), start), right = reduceCasinoCard(createCasinoCardState(gameId), start);
      expect(casinoCardResultHash(left)).toBe(casinoCardResultHash(right));
    }
  });

  it("recognizes representative poker hands", () => {
    expect(bestPokerHand(["spades-a", "spades-k", "spades-q", "spades-j", "spades-10", "clubs-2", "hearts-3"]).label).toBe("스트레이트 플러시");
    expect(bestPokerHand(["spades-a", "hearts-a", "diamonds-a", "clubs-a", "spades-2", "clubs-3", "hearts-4"]).label).toBe("포카드");
  });

  it("orders poker boundary hands by complete category and kicker rules", () => {
    const wheel = bestPokerHand(["spades-a", "hearts-2", "diamonds-3", "clubs-4", "spades-5"]);
    const sixHigh = bestPokerHand(["spades-2", "hearts-3", "diamonds-4", "clubs-5", "spades-6"]);
    expect(wheel).toMatchObject({ category: 4, kickers: [5] });
    expect(sixHigh).toMatchObject({ category: 4, kickers: [6] });
    expect(comparePokerHands(["spades-a", "hearts-a", "diamonds-k", "clubs-k", "spades-q"], ["clubs-a", "diamonds-a", "spades-k", "hearts-k", "clubs-j"])).toBeGreaterThan(0);
    expect(comparePokerHands(["spades-a", "spades-j", "spades-9", "spades-5", "spades-2"], ["hearts-a", "hearts-10", "hearts-9", "hearts-5", "hearts-2"])).toBeGreaterThan(0);
    expect(bestPokerHand(["spades-a", "hearts-a", "diamonds-a", "spades-k", "hearts-k", "diamonds-k", "clubs-2"])).toMatchObject({ category: 6, kickers: [14, 13] });
    expect(comparePokerHands(["spades-a", "hearts-k", "diamonds-q", "clubs-j", "spades-10", "clubs-2", "hearts-3"], ["clubs-a", "diamonds-k", "hearts-q", "spades-j", "clubs-10", "diamonds-2", "spades-3"])).toBe(0);
  });

  it("rejects impossible duplicate-card poker hands", () => {
    expect(() => bestPokerHand(["spades-a", "spades-a", "hearts-k", "diamonds-q", "clubs-j"])).toThrow("poker_card_duplicate");
  });

  it("values blackjack aces without busting", () => {
    expect(blackjackValue(["spades-a", "hearts-a", "clubs-9"])).toBe(21);
    expect(blackjackValue(["spades-a", "hearts-a", "clubs-9", "diamonds-k"])).toBe(21);
  });

  it("pays a player natural over a dealer three-card 21 and resolves dealer naturals immediately", () => {
    const base = started("blackjack", "blackjack-natural");
    const playerNatural = { ...base, hands: { ...base.hands, player: ["spades-a", "hearts-k"], "cpu-1": ["clubs-7", "diamonds-7"] }, deck: ["spades-7"], cursor: 0 };
    const dealerNatural = { ...base, hands: { ...base.hands, player: ["spades-k", "hearts-q"], "cpu-1": ["clubs-a", "diamonds-k"] }, deck: [], cursor: 0 };
    expect(reduceCasinoCard(playerNatural, { type: "stand" })).toMatchObject({ status: "complete", outcome: "win", creditAmount: 25 });
    expect(reduceCasinoCard(dealerNatural, { type: "stand" })).toMatchObject({ status: "complete", outcome: "loss", creditAmount: 0 });
  });

  it("treats an equal-rank high-low reveal as a loss and advances exactly once", () => {
    const state = { ...started("high-low", "high-low-tie"), currentCard: "spades-5", deck: ["hearts-5"], cursor: 0 };
    expect(reduceCasinoCard(state, { type: "guess", direction: "higher" })).toMatchObject({ status: "complete", outcome: "loss", cursor: 1, lastReveal: "hearts-5" });
  });

  it("settles a one-card table with no stock and no legal move as a push", () => {
    const base = started("one-card", "one-card-stalemate");
    const state = { ...base, deck: [], cursor: 0, discard: ["spades-a"], hands: { player: ["hearts-2"], "cpu-1": ["clubs-3"], "cpu-2": ["diamonds-4"], "cpu-3": ["hearts-5"] } };
    expect(reduceCasinoCard(state, { type: "draw_card" })).toMatchObject({ status: "complete", outcome: "push", creditAmount: 10 });
  });

  it("gives one-card CPUs only their hand and the public top card", () => {
    expect(chooseOneCardCpuAction({ hand: ["clubs-2", "hearts-a", "spades-k"], topCard: "diamonds-a" })).toEqual({ type: "play", cardId: "hearts-a" });
    expect(chooseOneCardCpuAction({ hand: ["clubs-2", "hearts-3"], topCard: "spades-a" })).toEqual({ type: "draw" });
  });

  it("gives Hold'em CPUs only their hole cards and currently visible community", () => {
    const read = { seed: "public-only", seatId: "cpu-1" as const, holeCards: ["spades-a", "hearts-k"], visibleCommunity: ["clubs-2", "diamonds-7", "hearts-9"], round: 2, playerAction: "raise" as const };
    expect(holdemCpuFolds(read)).toBe(holdemCpuFolds({ ...read }));
    expect(() => holdemCpuFolds({ ...read, holeCards: ["spades-a"] })).toThrow("holdem_cpu_read_invalid");
  });

  it("does not let Hold'em CPUs read unrevealed community cards", () => {
    const left = started("texas-holdem", "future-community");
    const replacement = ["clubs-2", "clubs-3", "clubs-4", "clubs-5", "clubs-6"];
    const right = { ...left, community: replacement };
    const leftAfter = reduceCasinoCard(left, { type: "poker", action: "raise" });
    const rightAfter = reduceCasinoCard(right, { type: "poker", action: "raise" });
    expect(left.communityVisible).toBe(0);
    expect(leftAfter.folded).toEqual(rightAfter.folded);
  });

  it("reveals Hold'em streets only after each completed decision round", () => {
    let state = started("texas-holdem", "street-order");
    expect(state.communityVisible).toBe(0);
    state = reduceCasinoCard(state, { type: "poker", action: "call" });
    expect(state).toMatchObject({ status: "playing", round: 1, communityVisible: 3 });
    state = reduceCasinoCard(state, { type: "poker", action: "call" });
    expect(state).toMatchObject({ status: "playing", round: 2, communityVisible: 4 });
    state = reduceCasinoCard(state, { type: "poker", action: "call" });
    expect(state).toMatchObject({ status: "complete", round: 3, communityVisible: 5 });
  });

  it("enforces Doubt round boundaries and rejects actions after completion", () => {
    let doubt = started("doubt", "round-boundary");
    doubt = reduceCasinoCard(doubt, { type: "answer", answer: "trust" });
    expect(doubt.status).toBe("round-result");
    expect(() => reduceCasinoCard(doubt, { type: "answer", answer: "trust" })).toThrow("doubt_answer_invalid");
    const complete = play("high-low", "terminal-action").state;
    expect(() => reduceCasinoCard(complete, { type: "guess", direction: "higher" })).toThrow("casino_card_action_invalid");
  });

  it.each(GAME_IDS)("finishes a deterministic %s autoplay", (gameId) => {
    const left = play(gameId, `finish-${gameId}`), right = play(gameId, `finish-${gameId}`);
    expect(left.state.status).toBe("complete");
    expect(left.steps).toBeLessThan(500);
    expect(casinoCardResultHash(left.state)).toBe(casinoCardResultHash(right.state));
  });

  it("finishes 10,000 seeded autoplays per game without loops", () => {
    for (const gameId of GAME_IDS) for (let seed = 0; seed < 10_000; seed += 1) {
      const run = play(gameId, `stress-${seed}`);
      expect(run.state.status, `${gameId} seed ${seed}`).toBe("complete");
      expect(run.steps, `${gameId} seed ${seed}`).toBeLessThan(500);
    }
  }, 20_000);
});

function started(gameId: CasinoCardGameId, seed: string): CasinoCardState {
  return reduceCasinoCard(createCasinoCardState(gameId), { type: "start", seed, stake: 10, reservedAmount: 10 * CASINO_GAME_INFO[gameId].maxExposure, wagerId: `wager-${gameId}` });
}

function play(gameId: CasinoCardGameId, seed: string): { state: CasinoCardState; steps: number } {
  let state = started(gameId, seed), steps = 0;
  for (; steps < 500 && state.status !== "complete"; steps += 1) {
    if (gameId === "high-low") state = reduceCasinoCard(state, { type: "guess", direction: "higher" });
    else if (gameId === "blackjack") state = reduceCasinoCard(state, { type: "stand" });
    else if (gameId === "doubt") state = reduceCasinoCard(state, state.status === "round-result" ? { type: "next_round" } : { type: "answer", answer: "doubt" });
    else if (gameId === "one-card") { const top = state.discard.at(-1)!; const legal = state.hands.player.find((id) => id.split("-")[0] === top.split("-")[0] || id.split("-")[1] === top.split("-")[1]); state = reduceCasinoCard(state, legal ? { type: "play_card", cardId: legal } : { type: "draw_card" }); }
    else state = reduceCasinoCard(state, { type: "poker", action: "call" });
  }
  return { state, steps };
}
