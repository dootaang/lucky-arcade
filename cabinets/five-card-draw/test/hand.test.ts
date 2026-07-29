import { describe, expect, it } from "vitest";
import { STANDARD_CARD_DECK, type StandardCardId } from "@lucky-arcade/card-table";
import { comparePokerHands, evaluatePokerHand } from "../src/index.ts";

const hand = (...cards: StandardCardId[]): StandardCardId[] => cards;

describe("poker hand evaluation", () => {
  it.each([
    [hand("hearts-10", "hearts-j", "hearts-q", "hearts-k", "hearts-a"), "straight-flush"],
    [hand("clubs-9", "diamonds-9", "hearts-9", "spades-9", "clubs-a"), "four-of-a-kind"],
    [hand("clubs-8", "diamonds-8", "hearts-8", "spades-k", "clubs-k"), "full-house"],
    [hand("spades-2", "spades-5", "spades-8", "spades-j", "spades-a"), "flush"],
    [hand("clubs-a", "diamonds-2", "hearts-3", "spades-4", "clubs-5"), "straight"],
    [hand("clubs-7", "diamonds-7", "hearts-7", "spades-2", "clubs-a"), "three-of-a-kind"],
    [hand("clubs-6", "diamonds-6", "hearts-q", "spades-q", "clubs-a"), "two-pair"],
    [hand("clubs-j", "diamonds-j", "hearts-4", "spades-8", "clubs-a"), "one-pair"],
    [hand("clubs-2", "diamonds-5", "hearts-8", "spades-j", "clubs-a"), "high-card"],
  ] as const)("recognizes %s as %s", (cards, category) => {
    expect(evaluatePokerHand(cards).category).toBe(category);
  });

  it("treats an ace-low straight as five-high", () => {
    expect(evaluatePokerHand(hand("clubs-a", "diamonds-2", "hearts-3", "spades-4", "clubs-5")).kickers).toEqual([5]);
  });

  it("breaks equal categories by poker kickers", () => {
    const aces = evaluatePokerHand(hand("clubs-a", "diamonds-a", "hearts-k", "spades-8", "clubs-2"));
    const kings = evaluatePokerHand(hand("hearts-k", "diamonds-k", "clubs-q", "spades-j", "hearts-9"));
    expect(comparePokerHands(aces, kings)).toBe(1);
  });

  it("classifies all 2,598,960 five-card combinations with the canonical distribution", () => {
    const counts = new Map<string, number>();
    const deck = STANDARD_CARD_DECK.map((card) => card.id);
    for (let a = 0; a < 48; a += 1) for (let b = a + 1; b < 49; b += 1) for (let c = b + 1; c < 50; c += 1) for (let d = c + 1; d < 51; d += 1) for (let e = d + 1; e < 52; e += 1) {
      const category = evaluatePokerHand([deck[a]!, deck[b]!, deck[c]!, deck[d]!, deck[e]!]).category;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      "four-of-a-kind": 624,
      "full-house": 3_744,
      "three-of-a-kind": 54_912,
      "two-pair": 123_552,
      "one-pair": 1_098_240,
      "straight-flush": 40,
      "straight": 10_200,
      "flush": 5_108,
      "high-card": 1_302_540,
    });
  }, 30_000);
});
