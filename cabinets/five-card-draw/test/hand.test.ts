import { describe, expect, it } from "vitest";
import type { StandardCardId } from "@lucky-arcade/card-table";
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
});
