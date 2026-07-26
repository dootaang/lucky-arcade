import { describe, expect, it } from "vitest";
import { STANDARD_CARD_DECK, shuffledStandardDeck, standardCardById, standardCardStrength, standardRankValue } from "../src/index.ts";

describe("standard playing-card deck", () => {
  it("contains every one of the 52 cards exactly once", () => {
    expect(STANDARD_CARD_DECK).toHaveLength(52);
    expect(new Set(STANDARD_CARD_DECK.map((card) => card.id)).size).toBe(52);
  });
  it("shuffles deterministically without losing cards", () => {
    const left = shuffledStandardDeck("same"), right = shuffledStandardDeck("same");
    expect(left).toEqual(right);
    expect(new Set(left)).toEqual(new Set(STANDARD_CARD_DECK.map((card) => card.id)));
  });
  it("shares rank and total ordering helpers", () => {
    expect(standardRankValue("clubs-a")).toBe(14);
    expect(standardCardStrength("spades-a")).toBeGreaterThan(standardCardStrength("clubs-a"));
    expect(standardCardById("hearts-q")).toMatchObject({ suit: "hearts", rank: "q" });
  });
});
