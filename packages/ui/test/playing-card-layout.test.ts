import { describe, expect, it } from "vitest";
import {
  PLAYING_CARD_HEIGHT,
  PLAYING_CARD_PIP_RANKS,
  PLAYING_CARD_SUITS,
  PLAYING_CARD_WIDTH,
  isRedSuit,
  pipPlacements,
  playingCardLabel,
  rankLabel,
} from "../src/playing-card-layout.ts";

describe("playing card pip layout", () => {
  it("draws exactly as many pips as the rank claims", () => {
    for (const rank of PLAYING_CARD_PIP_RANKS) {
      const expected = rank === "a" ? 1 : Number(rank);
      expect(pipPlacements(rank), `rank ${rank}`).toHaveLength(expected);
    }
  });

  it("keeps every pip inside the card", () => {
    for (const rank of PLAYING_CARD_PIP_RANKS) {
      for (const pip of pipPlacements(rank)) {
        const half = (pip.scale * 100) / 2;
        expect(pip.x - half, `rank ${rank}`).toBeGreaterThan(0);
        expect(pip.x + half, `rank ${rank}`).toBeLessThan(PLAYING_CARD_WIDTH);
        expect(pip.y - half, `rank ${rank}`).toBeGreaterThan(0);
        expect(pip.y + half, `rank ${rank}`).toBeLessThan(PLAYING_CARD_HEIGHT);
      }
    }
  });

  it("inverts only the pips below the middle", () => {
    for (const rank of PLAYING_CARD_PIP_RANKS) {
      for (const pip of pipPlacements(rank)) {
        expect(pip.rotated, `rank ${rank} at ${pip.y}`).toBe(pip.y > PLAYING_CARD_HEIGHT / 2);
      }
    }
  });

  it("never rotates a pip that sits on the middle line", () => {
    const middle = pipPlacements("3").filter((pip) => pip.y === PLAYING_CARD_HEIGHT / 2);
    expect(middle).toHaveLength(1);
    expect(middle[0]?.rotated).toBe(false);
  });

  it("mirrors the outer columns so the face reads symmetrically", () => {
    for (const rank of ["4", "5", "6", "7", "8", "9", "10"] as const) {
      const placements = pipPlacements(rank);
      const left = placements.filter((pip) => pip.x < PLAYING_CARD_WIDTH / 2);
      const right = placements.filter((pip) => pip.x > PLAYING_CARD_WIDTH / 2);
      expect(left.length, `rank ${rank}`).toBe(right.length);
      expect(left.map((pip) => pip.y), `rank ${rank}`).toEqual(right.map((pip) => pip.y));
    }
  });

  it("gives the ace a single large centred pip", () => {
    const [ace, ...rest] = pipPlacements("a");
    expect(rest).toHaveLength(0);
    expect(ace?.x).toBe(PLAYING_CARD_WIDTH / 2);
    expect(ace?.y).toBe(PLAYING_CARD_HEIGHT / 2);
    expect(ace?.scale).toBeGreaterThan(pipPlacements("2")[0]?.scale ?? 0);
  });

  it("is deterministic", () => {
    for (const rank of PLAYING_CARD_PIP_RANKS) {
      expect(pipPlacements(rank)).toEqual(pipPlacements(rank));
    }
  });

  it("colours only hearts and diamonds red", () => {
    expect(PLAYING_CARD_SUITS.filter(isRedSuit)).toEqual(["hearts", "diamonds"]);
  });

  it("names every card in the deck", () => {
    const labels = PLAYING_CARD_SUITS.flatMap((suit) => PLAYING_CARD_PIP_RANKS.map((rank) => playingCardLabel(suit, rank)));
    expect(labels).toHaveLength(40);
    expect(new Set(labels).size).toBe(40);
    expect(playingCardLabel("hearts", "7")).toBe("하트 7");
    expect(playingCardLabel("spades", "a")).toBe("스페이드 A");
    expect(rankLabel("10")).toBe("10");
  });
});
