import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export * from "./persona.ts";
export * from "./random.ts";

export const ENGINE_VERSION = "arcade-engine/0.1" as const;

export const WAGER_MULTIPLIERS = [2, 3, 4, 5] as const;
export type WagerMultiplier = (typeof WAGER_MULTIPLIERS)[number];

export const CASINO_MARKET_QUOTE_CONTRACT = "casino-market-quote/0.1" as const;

/** A frozen outcome quote. Integer basis points keep replay independent of floating point and later repricing. */
export interface CasinoMarketQuote {
  contract: typeof CASINO_MARKET_QUOTE_CONTRACT;
  marketId: string;
  outcomeId: string;
  probabilityBps: number;
  payoutBps: number;
  maxExposure: number;
  pricingVersion: string;
}

export function marketReturnBps(quote: CasinoMarketQuote): number {
  assertCasinoMarketQuote(quote);
  return Math.floor(quote.probabilityBps * quote.payoutBps / 10_000);
}

export function assertCasinoMarketQuote(quote: CasinoMarketQuote, maximumReturnBps = 9_800): void {
  const weightedPayout = quote.probabilityBps * quote.payoutBps;
  if (quote.contract !== CASINO_MARKET_QUOTE_CONTRACT || !quote.marketId || !quote.outcomeId || !quote.pricingVersion
    || !Number.isSafeInteger(quote.probabilityBps) || quote.probabilityBps <= 0 || quote.probabilityBps >= 10_000
    || !Number.isSafeInteger(quote.payoutBps) || quote.payoutBps <= 0
    || !Number.isSafeInteger(quote.maxExposure) || quote.maxExposure <= 0
    || !Number.isSafeInteger(maximumReturnBps) || maximumReturnBps <= 0
    || !Number.isSafeInteger(weightedPayout) || Math.floor(weightedPayout / 10_000) > maximumReturnBps) throw new Error("casino_market_quote_invalid");
}

/** Maximum amount removed from the wallet before a leveraged game starts. */
export function wagerExposure(stake: number, multiplier: WagerMultiplier, baseExposure = 1): number {
  if (!Number.isSafeInteger(stake) || stake < 0 || !Number.isSafeInteger(baseExposure) || baseExposure < 1) throw new Error("wager_exposure_invalid");
  const exposure = stake * multiplier * baseExposure;
  if (!Number.isSafeInteger(exposure)) throw new Error("wager_exposure_invalid");
  return exposure;
}

/**
 * Scales the underlying game's net result in both directions. `baseCredit`
 * includes the unleveraged reservation; the returned credit includes the
 * leveraged reservation. A 5x choice therefore multiplies wins and losses,
 * rather than multiplying only the upside.
 */
export function leveragedWagerCredit(baseReserved: number, baseCredit: number, multiplier: WagerMultiplier): number {
  if (!Number.isSafeInteger(baseReserved) || baseReserved < 0 || !Number.isSafeInteger(baseCredit) || baseCredit < 0) throw new Error("wager_credit_invalid");
  const credit = baseCredit * multiplier;
  if (!Number.isSafeInteger(credit) || credit < 0) throw new Error("wager_credit_invalid");
  return credit;
}

export function wagerMultiplierFromExposure(stake: number, reservedAmount: number, baseExposure = 1): WagerMultiplier {
  const unit = stake * baseExposure;
  const multiplier = unit > 0 ? reservedAmount / unit : 0;
  if (!WAGER_MULTIPLIERS.includes(multiplier as WagerMultiplier)) throw new Error("wager_multiplier_invalid");
  return multiplier as WagerMultiplier;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function resultHash(value: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(value))));
}

export interface ActionReceipt<Action = unknown> {
  contract: "action-receipt/0.1";
  sequence: number;
  action: Action;
  rngPosition: number;
  previousHash: string;
  resultHash: string;
}

export function makeReceipt<Action>(sequence: number, action: Action, rngPosition: number, previousHash: string, state: unknown): ActionReceipt<Action> {
  return { contract: "action-receipt/0.1", sequence, action, rngPosition, previousHash, resultHash: resultHash(state) };
}
