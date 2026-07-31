import { describe, expect, it } from "vitest";
import { CASINO_MARKET_QUOTE_CONTRACT, assertCasinoMarketQuote, canonicalJson, marketReturnBps, resultHash, XorShift32 } from "../src/index.ts";

describe("deterministic engine seed", () => {
  it("rejects a market quote whose frozen price gives a legal positive expectation", () => {
    const safe = { contract: CASINO_MARKET_QUOTE_CONTRACT, marketId: "pairs:a:b", outcomeId: "a", probabilityBps: 4_000, payoutBps: 24_000, maxExposure: 1_000, pricingVersion: "pairs-pricing/0.1" } as const;
    expect(marketReturnBps(safe)).toBe(9_600);
    expect(() => assertCasinoMarketQuote(safe)).not.toThrow();
    expect(() => assertCasinoMarketQuote({ ...safe, probabilityBps: 8_500 })).toThrow("casino_market_quote_invalid");
  });
  it("keeps a golden random vector", () => {
    const rng = new XorShift32("lucky-arcade");
    expect(Array.from({ length: 5 }, () => rng.nextUint32())).toEqual([1004586977, 1082276751, 4186494646, 2291303481, 3668758099]);
  });

  it("hashes objects independent of key insertion order", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(resultHash({ b: 2, a: 1 })).toBe(resultHash({ a: 1, b: 2 }));
  });
});
