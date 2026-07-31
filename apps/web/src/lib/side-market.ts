import {
  CASINO_SPECTATOR_MARKET_CONTRACT,
  CASINO_SPECTATOR_PRICING_VERSION,
  TEMEROSA_HOUSE_ACCOUNT_ID,
  casinoMarketCredit,
  casinoSpectatorMarketByIdAt,
  temerosaCasinoLedgerAtUtcSecond,
  type CasinoSpectatorMarket,
} from "@lucky-arcade/casino-ledger";
import { assertCasinoMarketQuote, type CasinoMarketQuote, type WagerMultiplier } from "@lucky-arcade/engine";
import type { GameWagerReceipt, PredictionStake } from "@lucky-arcade/persistence";
import { casinoCounterpartyContext, casinoCurrentSecond } from "./casino-economy.ts";
import { readWallet } from "./database.ts";
import { invalidateWager, listWagers, reserveWager, settleWager } from "./game-wager.ts";

export const SIDE_MARKET_SESSION_ID = "temerosa-side-market";
export const SIDE_MARKET_CABINET_ID = "temerosa-side-market";
const CHOICE_CONTRACT = "casino-side-market-choice/0.2" as const;
const CHOICE_PREFIX = "side-market:";

export interface SideMarketChoice {
  contract: typeof CHOICE_CONTRACT;
  marketContract: typeof CASINO_SPECTATOR_MARKET_CONTRACT;
  marketId: string;
  outcomeId: string;
  quote: CasinoMarketQuote;
  closesAtUtcSecond: number;
  settlesAtUtcSecond: number;
  multiplier: WagerMultiplier;
}

export async function reserveSideMarketWager(input: {
  market: CasinoSpectatorMarket;
  outcomeId: string;
  stake: PredictionStake;
  multiplier: WagerMultiplier;
}): Promise<{ walletBalance: number; wager: GameWagerReceipt }> {
  const now = await casinoCurrentSecond();
  const ledger=temerosaCasinoLedgerAtUtcSecond(now);
  const rawMarket = casinoSpectatorMarketByIdAt(ledger.profiles, fixedClock(now), ledger.contract, input.market.marketId);
  if (!rawMarket || rawMarket.phase !== "open" || now < rawMarket.opensAtUtcSecond || now >= rawMarket.closesAtUtcSecond) throw new Error("side_market_closed");
  const { resolveCasinoSideMarketOffer } = await import("./casino-side-market-replay.ts");
  const market = await resolveCasinoSideMarketOffer(rawMarket);
  const outcome = market.outcomes.find((candidate) => candidate.outcomeId === input.outcomeId);
  if (!outcome) throw new Error("side_market_outcome_missing");
  assertCasinoMarketQuote(outcome.quote);
  const exposure = input.stake * input.multiplier;
  const credit = casinoMarketCredit(exposure, outcome.quote);
  const houseReservation = credit - exposure;
  if (houseReservation <= 0) throw new Error("side_market_invalid_house_risk");
  const house = await casinoCounterpartyContext(TEMEROSA_HOUSE_ACCOUNT_ID);
  const choice: SideMarketChoice = Object.freeze({
    contract: CHOICE_CONTRACT,
    marketContract: CASINO_SPECTATOR_MARKET_CONTRACT,
    marketId: market.marketId,
    outcomeId: outcome.outcomeId,
    quote: outcome.quote,
    closesAtUtcSecond: market.closesAtUtcSecond,
    settlesAtUtcSecond: market.settlesAtUtcSecond,
    multiplier: input.multiplier,
  });
  const result = await reserveWager({
    outcomeKey: market.marketId,
    cabinetId: SIDE_MARKET_CABINET_ID,
    sessionId: SIDE_MARKET_SESSION_ID,
    termsVersion: CASINO_SPECTATOR_PRICING_VERSION,
    choiceKey: `${CHOICE_PREFIX}${JSON.stringify(choice)}`,
    stake: input.stake,
    reservedAmount: exposure,
    counterpartyAccountId: house.counterpartyAccountId,
    counterpartyReservedAmount: houseReservation,
    counterpartyBaseBalance: house.counterpartyBaseBalance,
    casinoOccurredAtSecond: house.casinoOccurredAtSecond,
  });
  return { walletBalance: result.wallet.balance, wager: result.wager };
}

/** Settles every due receipt. Re-entering the floor safely repeats this operation. */
export async function reconcileSideMarketWagers(nowUtcSecond?: number): Promise<{ walletBalance: number; wagers: readonly GameWagerReceipt[] }> {
  const now = nowUtcSecond ?? await casinoCurrentSecond();
  const clock = fixedClock(now);
  const existing = await listWagers(SIDE_MARKET_SESSION_ID);
  for (const wager of existing) {
    if (wager.status !== "reserved") continue;
    const choice = parseSideMarketChoice(wager);
    if (!choice) {
      await invalidateWager({ wagerId: wager.wagerId, reason: "corrupt-state" });
      continue;
    }
    if (now < choice.settlesAtUtcSecond) continue;
    const ledger=temerosaCasinoLedgerAtUtcSecond(choice.closesAtUtcSecond-1);
    const market = casinoSpectatorMarketByIdAt(ledger.profiles, clock, ledger.contract, choice.marketId);
    if (!market || market.phase !== "settled") {
      await invalidateWager({ wagerId: wager.wagerId, reason: "outcome-unavailable" });
      continue;
    }
    const { resolveCasinoSideMarketOffer, resolveCasinoSideMarketReplay } = await import("./casino-side-market-replay.ts");
    const [offer, replay] = await Promise.all([resolveCasinoSideMarketOffer(market), resolveCasinoSideMarketReplay(market)]);
    const currentOutcome = offer.outcomes.find((outcome) => outcome.outcomeId === choice.outcomeId);
    if (!currentOutcome || !sameQuote(currentOutcome.quote, choice.quote) || wager.termsVersion !== CASINO_SPECTATOR_PRICING_VERSION) {
      await invalidateWager({ wagerId: wager.wagerId, reason: "version-mismatch" });
      continue;
    }
    const won = replay.winningOutcomeId === choice.outcomeId;
    await settleWager({
      wagerId: wager.wagerId,
      settlementSequence: market.settlesAtUtcSecond,
      resultKey: `${market.marketId}:${replay.resultHash}:${replay.winningOutcomeId}`,
      creditAmount: won ? casinoMarketCredit(wager.reservedAmount, choice.quote) : 0,
    });
  }
  return { walletBalance: (await readWallet()).balance, wagers: await listWagers(SIDE_MARKET_SESSION_ID) };
}

export function parseSideMarketChoice(wager: Pick<GameWagerReceipt, "choiceKey" | "outcomeKey" | "termsVersion" | "stake" | "reservedAmount">): SideMarketChoice | null {
  if (!wager.choiceKey?.startsWith(CHOICE_PREFIX) || wager.termsVersion !== CASINO_SPECTATOR_PRICING_VERSION) return null;
  try {
    const choice = JSON.parse(wager.choiceKey.slice(CHOICE_PREFIX.length)) as Partial<SideMarketChoice>;
    const quote = choice.quote as Partial<CasinoMarketQuote> | undefined;
    if (choice.contract !== CHOICE_CONTRACT || choice.marketContract !== CASINO_SPECTATOR_MARKET_CONTRACT
      || !choice.marketId || choice.marketId !== wager.outcomeKey || !choice.outcomeId
      || !Number.isSafeInteger(choice.closesAtUtcSecond) || !Number.isSafeInteger(choice.settlesAtUtcSecond)
      || choice.closesAtUtcSecond! >= choice.settlesAtUtcSecond!
      || ![2, 3, 4, 5].includes(choice.multiplier as number)
      || !quote) return null;
    assertCasinoMarketQuote(quote as CasinoMarketQuote);
    if (quote.marketId !== choice.marketId || quote.outcomeId !== choice.outcomeId || quote.pricingVersion !== CASINO_SPECTATOR_PRICING_VERSION
      || wager.reservedAmount !== wager.stake * choice.multiplier!) return null;
    return choice as SideMarketChoice;
  } catch {
    return null;
  }
}

function fixedClock(utcSecond: number): { utcSecond(): number; utcMinute(): number } {
  if (!Number.isSafeInteger(utcSecond)) throw new Error("side_market_invalid_clock");
  return { utcSecond: () => utcSecond, utcMinute: () => Math.floor(utcSecond / 60) };
}
function sameQuote(left: CasinoMarketQuote, right: CasinoMarketQuote): boolean {
  return left.contract === right.contract && left.marketId === right.marketId && left.outcomeId === right.outcomeId
    && left.probabilityBps === right.probabilityBps && left.payoutBps === right.payoutBps
    && left.maxExposure === right.maxExposure && left.pricingVersion === right.pricingVersion;
}
