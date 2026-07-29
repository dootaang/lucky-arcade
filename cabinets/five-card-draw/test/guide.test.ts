import { describe, expect, it } from "vitest";
import { analyzeFiveCardDrawGuide, betActionGuide, exchangeCountGuide } from "../src/index.ts";

describe("five-card draw beginner guide", () => {
  it("names the current hand and recommends only legal zero-to-three-card exchanges", () => {
    const pair = analyzeFiveCardDrawGuide(["clubs-7", "diamonds-7", "hearts-2", "spades-9", "clubs-a"]);
    expect(pair.handLabel).toBe("7 원 페어");
    expect(pair.discardCardIds).toHaveLength(3);
    expect(pair.recommendation).toContain("트리플이나 투 페어");

    const straight = analyzeFiveCardDrawGuide(["clubs-5", "diamonds-6", "hearts-7", "spades-8", "clubs-9"]);
    expect(straight.handLabel).toBe("스트레이트");
    expect(straight.discardCardIds).toEqual([]);
  });

  it("explains public exchange signals as possibilities rather than hidden facts", () => {
    expect(exchangeCountGuide(0)).toContain("수도");
    expect(exchangeCountGuide(3)).toContain("가능성");
    expect(betActionGuide("raise", 20)).toContain("손실도 커집니다");
  });
});
