import { describe, expect, it } from "vitest";
import { CASINO_GAME_INFO, bestPokerHand, casinoCardResultHash, createCasinoCardState, reduceCasinoCard, type CasinoCardAction, type CasinoCardGameId, type CasinoCardState } from "../src/index.ts";

describe("casino card cores", () => {
  it("deals the same game from the same seed", () => {
    for (const gameId of Object.keys(CASINO_GAME_INFO) as CasinoCardGameId[]) {
      const start: CasinoCardAction = { type: "start", seed: "same", stake: 10, reservedAmount: 10 * CASINO_GAME_INFO[gameId].maxExposure, wagerId: "wager" };
      const left = reduceCasinoCard(createCasinoCardState(gameId), start), right = reduceCasinoCard(createCasinoCardState(gameId), start);
      expect(casinoCardResultHash(left)).toBe(casinoCardResultHash(right));
    }
  });

  it("recognizes representative poker hands", () => {
    expect(bestPokerHand(["spades-a", "spades-k", "spades-q", "spades-j", "spades-10", "clubs-2", "hearts-3"]).label).toBe("스트레이트 플러시");
    expect(bestPokerHand(["spades-a", "hearts-a", "diamonds-a", "clubs-a", "spades-2", "clubs-3", "hearts-4"]).label).toBe("포카드");
  });

  it("finishes deterministic autoplay paths for every game", () => {
    for (const gameId of Object.keys(CASINO_GAME_INFO) as CasinoCardGameId[]) expect(play(gameId).status).toBe("complete");
  });
});

function play(gameId: CasinoCardGameId): CasinoCardState {
  let state = reduceCasinoCard(createCasinoCardState(gameId), { type: "start", seed: `finish-${gameId}`, stake: 10, reservedAmount: 10 * CASINO_GAME_INFO[gameId].maxExposure, wagerId: `wager-${gameId}` });
  for (let step = 0; step < 200 && state.status !== "complete"; step += 1) {
    if (gameId === "high-low") state = reduceCasinoCard(state, { type: "guess", direction: "higher" });
    else if (gameId === "blackjack") state = reduceCasinoCard(state, { type: "stand" });
    else if (gameId === "doubt") state = reduceCasinoCard(state, state.status === "round-result" ? { type: "next_round" } : { type: "answer", answer: "doubt" });
    else if (gameId === "one-card") { const top = state.discard.at(-1)!; const legal = state.hands.player.find((id) => id.split("-")[0] === top.split("-")[0] || id.split("-")[1] === top.split("-")[1]); state = reduceCasinoCard(state, legal ? { type: "play_card", cardId: legal } : { type: "draw_card" }); }
    else state = reduceCasinoCard(state, { type: "poker", action: "call" });
  }
  return state;
}
