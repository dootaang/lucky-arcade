import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { casinoSpectatorMarketByIdAt, casinoSpectatorMarketsAt, casinoUtcSecondAtKstDay, TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES, TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT } from "@lucky-arcade/casino-ledger";
import { marketReturnBps } from "@lucky-arcade/engine";
import { resolveCasinoSideMarketOffer, resolveCasinoSideMarketReplay, supportsNativeSideMarketExperience } from "./casino-side-market-replay.ts";

const originalFetch = globalThis.fetch;

beforeAll(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const match = /\/content\/temerosa-margin\/([^/]+)\/manifest\.json/.exec(url);
    const series=/\/content\/temerosa-series-npcs\/([^/]+)\/manifest\.json/.exec(url);
    if (!match&&!series) return new Response("not found", { status: 404 });
    const body = readFileSync(match?`public/content/temerosa-margin/${match[1]}/manifest.json`:`public/content/temerosa-series-npcs/${series![1]}/manifest.json`, "utf8");
    return new Response(body, { status: 200, headers: { "content-type": "application/json", date: "Thu, 30 Jul 2026 12:00:00 GMT" } });
  });
});
afterAll(() => { vi.stubGlobal("fetch", originalFetch); });

describe("canonical casino side-market replay", () => {
  it("derives both game results from completed cabinet reducer transcripts", async () => {
    const base = casinoUtcSecondAtKstDay(TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT.epochKstDay + 2, 36_000);
    const now = Math.floor(base / 360) * 360 + 30;
    const clock = { utcSecond: () => now, utcMinute: () => Math.floor(now / 60) };
    const markets = casinoSpectatorMarketsAt(TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES, clock, TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT, 8);
    expect(markets.every((market) => supportsNativeSideMarketExperience(market.tableId))).toBe(true);
    const pairMarket = markets.find((market) => market.tableId === "temerosa-match-pairs");
    const maidMarket = markets.find((market) => market.tableId === "temerosa-old-maid");
    const indianMarket=markets.find((market)=>market.tableId==="indian-poker");
    const drawMarket=markets.find((market)=>market.tableId==="temerosa-five-card-draw");
    expect(pairMarket).toBeDefined(); expect(maidMarket).toBeDefined();expect(indianMarket).toBeDefined();expect(drawMarket).toBeDefined();
    const pairReplay = await resolveCasinoSideMarketReplay(pairMarket!);
    const maidReplay = await resolveCasinoSideMarketReplay(maidMarket!);
    const indianReplay=await resolveCasinoSideMarketReplay(indianMarket!);
    const drawReplay=await resolveCasinoSideMarketReplay(drawMarket!);
    const pairOffer = await resolveCasinoSideMarketOffer(pairMarket!);
    const maidOffer = await resolveCasinoSideMarketOffer(maidMarket!);
    expect(pairReplay.kind).toBe("match-pairs");expect(maidReplay.kind).toBe("old-maid");
    if(pairReplay.kind!=="match-pairs"||maidReplay.kind!=="old-maid")throw new Error("unexpected_replay_kind");
    expect(pairReplay.game.finalState.status).toBe("complete");
    expect(maidReplay.game.finalState.status).toBe("complete");
    expect(indianReplay.kind).toBe("indian-poker");expect(drawReplay.kind).toBe("five-card-draw");
    if(indianReplay.kind!=="indian-poker"||drawReplay.kind!=="five-card-draw")throw new Error("unexpected_poker_replay_kind");
    expect(indianReplay.game.finalState.status).toBe("complete");expect(drawReplay.game.finalState.phase).toBe("complete");
    expect(pairMarket!.outcomes.some((outcome) => outcome.outcomeId === pairReplay.winningOutcomeId)).toBe(true);
    expect(maidMarket!.outcomes.some((outcome) => outcome.outcomeId === maidReplay.winningOutcomeId)).toBe(true);
    expect(pairReplay.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(maidReplay.resultHash).toMatch(/^[a-f0-9]{64}$/);
    for (const outcome of [...pairOffer.outcomes, ...maidOffer.outcomes]) expect(marketReturnBps(outcome.quote)).toBeLessThanOrEqual(9_600);
    expect(pairOffer.outcomes.reduce((sum, outcome) => sum + outcome.quote.probabilityBps, 0)).toBe(10_000);
    expect(maidOffer.outcomes.reduce((sum, outcome) => sum + outcome.quote.probabilityBps, 0)).toBe(10_000);
    const settledClock = { utcSecond: () => pairMarket!.settlesAtUtcSecond + 1, utcMinute: () => Math.floor((pairMarket!.settlesAtUtcSecond + 1) / 60) };
    const settledRaw = casinoSpectatorMarketByIdAt(TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES, settledClock, TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT, pairMarket!.marketId)!;
    const settledOffer = await resolveCasinoSideMarketOffer(settledRaw);
    expect(settledOffer.phase).toBe("settled");
    expect(settledOffer.winningOutcomeId).toBe(pairReplay.winningOutcomeId);
    expect(settledOffer.outcomes.map((outcome) => outcome.quote)).toEqual(pairOffer.outcomes.map((outcome) => outcome.quote));
    expect((await resolveCasinoSideMarketReplay(pairMarket!)).resultHash).toBe(pairReplay.resultHash);
  }, 60_000);
});
