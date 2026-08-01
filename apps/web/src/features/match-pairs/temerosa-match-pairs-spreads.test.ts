import { describe, expect, it } from "vitest";
import { MATCH_PAIRS_SPREAD_PRICING_VERSION, MATCH_PAIRS_SPREAD_TERMS_VERSION } from "@lucky-arcade/match-pairs";
import { TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES } from "./temerosa-match-pairs-spreads.generated.ts";

describe("Temerosa match-pairs spread book", () => {
  it("contains one audited quote for every NPC, difficulty, and focus combination", () => {
    const keys = new Set(TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES.map((quote) => quote.quoteId));
    const opponents = new Set(TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES.map((quote) => quote.opponentId));
    expect(TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES).toHaveLength(180);
    expect(opponents.size).toBe(30);
    expect(keys.size).toBe(180);
    for (const opponentId of opponents) {
      expect(TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES.filter((quote) => quote.opponentId === opponentId)).toHaveLength(6);
    }
  });

  it("opens only quotes inside the frozen public-memory audit gate", () => {
    const available = TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES.filter((quote) => quote.available);
    const unavailable = TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES.filter((quote) => !quote.available);
    expect(available).toHaveLength(142);
    expect(unavailable).toHaveLength(38);
    for (const quote of TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES) {
      expect(quote.contract).toBe(MATCH_PAIRS_SPREAD_TERMS_VERSION);
      expect(quote.pricingVersion).toBe(MATCH_PAIRS_SPREAD_PRICING_VERSION);
      expect(quote.sampleSize).toBe(600);
      expect(Number.isSafeInteger(quote.targetScore)).toBe(true);
      if (quote.available) {
        expect(quote.estimatedCoverRateBps).toBeGreaterThanOrEqual(3_000);
        expect(quote.estimatedCoverRateBps).toBeLessThanOrEqual(4_900);
      }
    }
  });
});
