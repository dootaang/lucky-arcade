import { CASINO_MARKET_QUOTE_CONTRACT } from "@lucky-arcade/engine";
import type { GameWagerReceipt } from "@lucky-arcade/persistence";
import { describe, expect, it } from "vitest";
import { CASINO_SPECTATOR_MARKET_CONTRACT, CASINO_SPECTATOR_PRICING_VERSION } from "@lucky-arcade/casino-ledger";
import { parseSideMarketChoice } from "./side-market.ts";

describe("side market receipt", () => {
  it("restores only a frozen quote matching the one-bet market key and exposure", () => {
    const marketId = `${CASINO_SPECTATOR_MARKET_CONTRACT}:match-winner:test`;
    const choice = {
      contract: "casino-side-market-choice/0.2",
      marketContract: CASINO_SPECTATOR_MARKET_CONTRACT,
      marketId,
      outcomeId: "lyla",
      quote: { contract: CASINO_MARKET_QUOTE_CONTRACT, marketId, outcomeId: "lyla", probabilityBps: 4_000, payoutBps: 24_000, maxExposure: 1_000, pricingVersion: CASINO_SPECTATOR_PRICING_VERSION },
      closesAtUtcSecond: 100,
      settlesAtUtcSecond: 200,
      multiplier: 5,
    } as const;
    const receipt = wager(`${JSON.stringify(choice)}`, marketId, 50, 250);
    expect(parseSideMarketChoice(receipt)).toEqual(choice);
    expect(parseSideMarketChoice({ ...receipt, outcomeKey: `${marketId}:changed` })).toBeNull();
    expect(parseSideMarketChoice({ ...receipt, reservedAmount: 50 })).toBeNull();
  });
});

function wager(json: string, outcomeKey: string, stake: number, reservedAmount: number): GameWagerReceipt {
  return {
    contract: "game-wager/0.1", wagerId: "market-wager", outcomeKey,
    cabinetId: "temerosa-side-market", sessionId: "temerosa-side-market",
    termsVersion: CASINO_SPECTATOR_PRICING_VERSION, choiceKey: `side-market:${json}`,
    stake, reservedAmount, status: "reserved", createdAt: new Date(0).toISOString(), settlementCredit: 0,
  };
}
