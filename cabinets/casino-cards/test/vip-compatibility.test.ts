import { expect, it } from "vitest";
import { createCasinoCardState, reduceCasinoCard, casinoCardResultHash } from "../src/engine.ts";
import { CASINO_CARD_STAKES, type CasinoCardGameId } from "../src/contracts.ts";

it("preserves pre-VIP legacy hashes and public stake list", () => {
  expect(CASINO_CARD_STAKES).toEqual([10, 50, 200]);
  const fixtures = [
    ["blackjack", 10, "6139d9e80895c3ffb3c535b7e023a95c49477c24d0b3c13f6d02466714259338"],
    ["blackjack", 200, "b07f7c449773cd836a982a9a56b73487ee649c2710e57dae4bd7c5be641140f0"],
    ["high-low", 10, "9178af0e99140252276b34e85602d7a6c20514d6a7b878550736cc1cad6588dc"],
    ["high-low", 200, "3c94cc9cc3fac930689af668164edbb0d3c83c6d6e05346a0da77466714cd95f"],
  ] as const;
  for (const [game, stake, hash] of fixtures) {
    let state = reduceCasinoCard(createCasinoCardState(game as CasinoCardGameId, "vip-regression"), { type: "start", seed: "vip-regression", stake, reservedAmount: stake, wagerId: "vip-regression" });
    if (game === "blackjack" && state.status !== "complete") state = reduceCasinoCard(state, { type: "stand" });
    expect(casinoCardResultHash(state)).toBe(hash);
  }
});
it("does not let VIP stake influence shuffle", () => {
  const decks = ([10, 200, 500, 1000] as const).map((stake) => reduceCasinoCard(createCasinoCardState("blackjack", "vip"), { type: "start", seed: "same", stake, reservedAmount: stake, wagerId: "same" }).deck);
  for (const deck of decks) expect(deck).toEqual(decks[0]);
});
