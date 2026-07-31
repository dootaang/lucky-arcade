import { marketReturnBps } from "@lucky-arcade/engine";
import { describe, expect, it } from "vitest";
import {
  CASINO_SPECTATOR_PRICING_VERSION,
  CASINO_SPECTATOR_TARGET_RETURN_BPS,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  assertCasinoSpectatorMarket,
  casinoDayPlan,
  casinoSpectatorMarketByIdAt,
  casinoSpectatorMarketPresencesAt,
  casinoSpectatorMarketsForDay,
  casinoSpectatorMarketsAt,
  casinoUtcSecondAtKstDay,
  completedDayBalances,
} from "../src/index.ts";

const profiles = TEMEROSA_NPC_GAMBLING_PROFILES;
const contract = TEMEROSA_NPC_LEDGER_CONTRACT;
const openings = Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id, profile.openingBalance])));

describe("integrated NPC spectator markets", () => {
  it("publishes the matchup before betting and hides the deterministic result until settlement", () => {
    const target = firstMarketMatch();
    const starts = casinoUtcSecondAtKstDay(contract.epochKstDay + target.dayIndex, target.match.startsAtSecondOfDay);
    const openClock = fixedClock(starts - 120);
    const open = casinoSpectatorMarketsAt(profiles, openClock, contract, 128).find((market) => market.matchId === target.match.matchId);
    expect(open?.phase).toBe("open");
    expect(open?.winningOutcomeId).toBeUndefined();
    expect(open?.participantIds).toEqual(target.match.participantIds);
    const settled = casinoSpectatorMarketByIdAt(profiles, fixedClock(casinoUtcSecondAtKstDay(contract.epochKstDay + target.dayIndex, target.match.settlesAtSecondOfDay + 1)), contract, open!.marketId);
    expect(settled?.phase).toBe("settled");
    expect(settled?.outcomes.some((outcome) => outcome.outcomeId === settled.winningOutcomeId)).toBe(true);
  });

  it("freezes complete quotes whose individual expected return never exceeds the market cap", () => {
    const target = firstMarketMatch();
    const starts = casinoUtcSecondAtKstDay(contract.epochKstDay + target.dayIndex, target.match.startsAtSecondOfDay);
    const markets = casinoSpectatorMarketsAt(profiles, fixedClock(starts - 120), contract, 128);
    expect(markets.length).toBeGreaterThan(0);
    for (const market of markets) {
      assertCasinoSpectatorMarket(market);
      expect(market.outcomes.reduce((sum, outcome) => sum + outcome.quote.probabilityBps, 0)).toBe(10_000);
      expect(new Set(market.outcomes.map((outcome) => outcome.outcomeId)).size).toBe(market.outcomes.length);
      for (const outcome of market.outcomes) {
        expect(outcome.quote.pricingVersion).toBe(CASINO_SPECTATOR_PRICING_VERSION);
        expect(marketReturnBps(outcome.quote)).toBeLessThanOrEqual(CASINO_SPECTATOR_TARGET_RETURN_BPS);
        expect(outcome.quote.maxExposure).toBeGreaterThanOrEqual(10);
        expect(outcome.quote.maxExposure).toBeLessThanOrEqual(1_000);
      }
    }
  });

  it("audits every offered outcome over thirty deterministic casino days", () => {
    let checked = 0;
    for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
      const now = casinoUtcSecondAtKstDay(contract.epochKstDay + dayIndex, 43_200);
      const markets = casinoSpectatorMarketsForDay(profiles, dayIndex, contract, now);
      for (const market of markets) {
        for (const outcome of market.outcomes) expect(marketReturnBps(outcome.quote)).toBeLessThanOrEqual(9_600);
        checked += market.outcomes.length;
      }
    }
    expect(checked).toBeGreaterThan(100);
  }, 30_000);

  it("blocks scheduled participants only after betting closes and releases them after settlement", () => {
    const base = casinoUtcSecondAtKstDay(contract.epochKstDay + 3, 36_000);
    const now = Math.floor(base / 300) * 300 + 30;
    const openMarket = casinoSpectatorMarketsAt(profiles, fixedClock(now), contract, 8)
      .find((market) => market.matchId.startsWith("casino-spectator-exhibition/0.1:"));
    expect(openMarket?.phase).toBe("open");
    expect(casinoSpectatorMarketPresencesAt([openMarket!], openMarket!.closesAtUtcSecond - 1)).toHaveLength(0);
    const locked = casinoSpectatorMarketPresencesAt([openMarket!], openMarket!.closesAtUtcSecond);
    expect(locked.map((presence) => presence.npcId).toSorted()).toEqual([...openMarket!.participantIds].toSorted());
    expect(locked.every((presence) => presence.availableAtUtcSecond === openMarket!.settlesAtUtcSecond + 18)).toBe(true);
    expect(casinoSpectatorMarketPresencesAt([openMarket!], openMarket!.settlesAtUtcSecond + 18)).toHaveLength(0);
    const recovered = casinoSpectatorMarketByIdAt(profiles, fixedClock(openMarket!.settlesAtUtcSecond + 1), contract, openMarket!.marketId);
    expect(recovered?.winningOutcomeId).toBeDefined();
    expect(recovered?.participantIds).toEqual(openMarket!.participantIds);
  });

  it("never seats Bacikal in scheduled old-maid exhibitions", () => {
    const base = casinoUtcSecondAtKstDay(contract.epochKstDay + 4, 36_000);
    const firstCycle = Math.floor(base / 300);
    const markets = Array.from({ length: 12 }, (_, offset) => {
      const now = (firstCycle + offset) * 300 + 30;
      return casinoSpectatorMarketsAt(profiles, fixedClock(now), contract, 4)
        .find((market) => market.matchId.startsWith("casino-spectator-exhibition/0.1:") && market.tableId === "temerosa-old-maid");
    }).filter((market) => market !== undefined);
    expect(markets.length).toBeGreaterThan(0);
    expect(markets.every((market) => !market.participantIds.includes("bacikal"))).toBe(true);
  });
});

function firstMarketMatch() {
  for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
    const plan = casinoDayPlan(profiles, dayIndex, dayOpenings(dayIndex), contract);
    const match = plan.matches.find((candidate) => candidate.tableId === "temerosa-match-pairs" || candidate.tableId === "temerosa-old-maid");
    if (match) return { dayIndex, match };
  }
  throw new Error("market_match_fixture_missing");
}
function fixedClock(utcSecond: number) { return { utcSecond: () => utcSecond, utcMinute: () => Math.floor(utcSecond / 60) }; }
function dayOpenings(dayIndex: number) { return dayIndex === 0 ? openings : completedDayBalances(profiles, dayIndex - 1, contract); }
