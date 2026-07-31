import { CASINO_SPECTATOR_PRICING_VERSION, CASINO_SPECTATOR_TARGET_RETURN_BPS, type CasinoSpectatorMarket } from "@lucky-arcade/casino-ledger";
import { CASINO_MARKET_QUOTE_CONTRACT, type CasinoMarketQuote } from "@lucky-arcade/engine";
import { createMatchPairsSpectatorReplay, type MatchPairsFace, type MatchPairsOpponent, type MatchPairsSpectatorReplay } from "@lucky-arcade/match-pairs";
import { createOldMaidSpectatorReplay, createTemerosaCasinoOldMaidCartridge, type OldMaidCartridge, type OldMaidSpectatorReplay } from "@lucky-arcade/old-maid";
import { createTemerosaMatchPairsOpponents } from "../features/match-pairs/temerosa-match-pairs-opponents.ts";
import { TEMEROSA_MATCH_PAIRS_FACES, TEMEROSA_MATCH_PAIRS_PACK_VERSION } from "../features/match-pairs/temerosa-match-pairs-selection.ts";
import { loadTemerosaCasinoAssets } from "./temerosa-content.ts";

export const SIDE_MARKET_REPLAY_CONTRACT = "casino-side-market-replay/0.1" as const;
export const SIDE_MARKET_NATIVE_TABLE_IDS = Object.freeze(["temerosa-match-pairs", "temerosa-old-maid"] as const);

export function supportsNativeSideMarketExperience(tableId: string): tableId is typeof SIDE_MARKET_NATIVE_TABLE_IDS[number] {
  return SIDE_MARKET_NATIVE_TABLE_IDS.some((candidate) => candidate === tableId);
}

interface SideMarketReplayBase {
  readonly contract: typeof SIDE_MARKET_REPLAY_CONTRACT;
  readonly marketId: string;
  readonly seed: string;
  readonly winningOutcomeId: string;
  readonly resultHash: string;
  readonly assets: Readonly<Record<string, string>>;
}

export interface MatchPairsSideMarketReplay extends SideMarketReplayBase {
  readonly kind: "match-pairs";
  readonly game: MatchPairsSpectatorReplay;
  readonly faces: readonly MatchPairsFace[];
  readonly opponents: readonly MatchPairsOpponent[];
}

export interface OldMaidSideMarketReplay extends SideMarketReplayBase {
  readonly kind: "old-maid";
  readonly game: OldMaidSpectatorReplay;
  readonly cartridge: OldMaidCartridge;
}

export type CasinoSideMarketReplay = MatchPairsSideMarketReplay | OldMaidSideMarketReplay;

const replayPromises = new Map<string, Promise<CasinoSideMarketReplay>>();
const offerPromises = new Map<string, Promise<CasinoSpectatorMarket>>();
const probabilityPromises = new Map<string, Promise<readonly number[]>>();
const PRICING_SAMPLES = 512;
const HOUSE_RISK_LIMIT = 5_000;

/** Loads only audited local content and computes the canonical cabinet replay. */
export function resolveCasinoSideMarketReplay(market: CasinoSpectatorMarket): Promise<CasinoSideMarketReplay> {
  const existing = replayPromises.get(market.marketId);
  if (existing) return existing;
  const promise = buildReplay(market).catch((error: unknown) => { replayPromises.delete(market.marketId); throw error; });
  replayPromises.set(market.marketId, promise);
  return promise;
}

/** Reprices an exact matchup with the same cabinet CPUs used by its replay. */
export function resolveCasinoSideMarketOffer(market: CasinoSpectatorMarket): Promise<CasinoSpectatorMarket> {
  const offerKey = `${market.marketId}:${market.phase}`;
  const existing = offerPromises.get(offerKey);
  if (existing) return existing;
  let pricing = probabilityPromises.get(market.marketId);
  if (!pricing) {
    pricing = priceActualOutcomes(market).catch((error: unknown) => { probabilityPromises.delete(market.marketId); throw error; });
    probabilityPromises.set(market.marketId, pricing);
  }
  const promise = Promise.all([resolveCasinoSideMarketReplay(market), pricing]).then(([replay, probabilities]) => {
    const outcomes = market.outcomes.map((outcome, index) => {
      const probabilityBps = probabilities[index]!;
      const payoutBps = Math.floor(CASINO_SPECTATOR_TARGET_RETURN_BPS * 10_000 / probabilityBps);
      const maxExposure = Math.min(1_000, Math.max(10, Math.floor(HOUSE_RISK_LIMIT * 10_000 / Math.max(1, payoutBps - 10_000))));
      const quote: CasinoMarketQuote = Object.freeze({ contract: CASINO_MARKET_QUOTE_CONTRACT, marketId: market.marketId, outcomeId: outcome.outcomeId,
        probabilityBps, payoutBps, maxExposure, pricingVersion: CASINO_SPECTATOR_PRICING_VERSION });
      return Object.freeze({ ...outcome, quote });
    });
    return Object.freeze({ ...market, outcomes: Object.freeze(outcomes), ...(market.phase === "settled" ? { winningOutcomeId: replay.winningOutcomeId } : {}) });
  }).catch((error: unknown) => { offerPromises.delete(offerKey); throw error; });
  offerPromises.set(offerKey, promise);
  return promise;
}

async function buildReplay(market: CasinoSpectatorMarket): Promise<CasinoSideMarketReplay> {
  if (!market.matchId.startsWith("casino-spectator-exhibition/0.2:")) throw new Error("side_market_replay_unsupported_match");
  if (!supportsNativeSideMarketExperience(market.tableId)) throw new Error("side_market_native_experience_missing");
  const bundle = await loadTemerosaCasinoAssets();
  const seed = `${SIDE_MARKET_REPLAY_CONTRACT}:${market.matchId}`;
  if (market.tableId === "temerosa-match-pairs") {
    if (market.participantIds.length !== 2) throw new Error("side_market_replay_participant_count");
    const participantIds = market.participantIds as unknown as readonly [string, string];
    const opponents = createTemerosaMatchPairsOpponents(bundle.contentAssets);
    const game = createMatchPairsSpectatorReplay({
      faces: TEMEROSA_MATCH_PAIRS_FACES,
      opponents,
      packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
      seed,
      sessionId: `side-market:${market.marketId}`,
      participantIds,
      difficulty: "normal",
      focus: "standard",
    });
    assertMarketOutcome(market, game.winningCharacterId);
    return Object.freeze({ contract: SIDE_MARKET_REPLAY_CONTRACT, kind: "match-pairs", marketId: market.marketId, seed,
      winningOutcomeId: game.winningCharacterId, resultHash: game.resultHash, assets: bundle.assets,
      game, faces: TEMEROSA_MATCH_PAIRS_FACES, opponents });
  }
  if (market.tableId !== "temerosa-old-maid") throw new Error("side_market_native_experience_missing");
  if (market.participantIds.length !== 4) throw new Error("side_market_replay_participant_count");
  const participantIds = market.participantIds as unknown as readonly [string, string, string, string];
  const cartridge = createTemerosaCasinoOldMaidCartridge(bundle.contentAssets);
  const game = createOldMaidSpectatorReplay({ cartridge, seed, sessionId: `side-market:${market.marketId}`, participantIds });
  assertMarketOutcome(market, game.oddCardHolderCharacterId);
  return Object.freeze({ contract: SIDE_MARKET_REPLAY_CONTRACT, kind: "old-maid", marketId: market.marketId, seed,
    winningOutcomeId: game.oddCardHolderCharacterId, resultHash: game.resultHash, assets: bundle.assets, game, cartridge });
}

function assertMarketOutcome(market: CasinoSpectatorMarket, winningOutcomeId: string): void {
  if (!market.outcomes.some((outcome) => outcome.outcomeId === winningOutcomeId)) throw new Error("side_market_replay_outcome_missing");
}

async function priceActualOutcomes(market: CasinoSpectatorMarket): Promise<readonly number[]> {
  const bundle = await loadTemerosaCasinoAssets();
  const outcomeIds = market.outcomes.map((outcome) => outcome.outcomeId);
  const counts = Object.fromEntries(outcomeIds.map((id) => [id, 1])) as Record<string, number>;
  if (market.tableId === "temerosa-match-pairs") {
    if (market.participantIds.length !== 2) throw new Error("side_market_replay_participant_count");
    const participantIds = market.participantIds as unknown as readonly [string, string];
    const opponents = createTemerosaMatchPairsOpponents(bundle.contentAssets);
    for (let sample = 0; sample < PRICING_SAMPLES; sample += 1) {
      const game = createMatchPairsSpectatorReplay({ faces: TEMEROSA_MATCH_PAIRS_FACES, opponents, packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
        seed: `${CASINO_SPECTATOR_PRICING_VERSION}:${market.tableId}:${participantIds.join("+")}:${sample}`, sessionId: `side-market-price:${sample}`,
        participantIds, difficulty: "normal", focus: "standard", captureFrames: false });
      counts[game.winningCharacterId]! += 1;
    }
  } else {
    if (market.participantIds.length !== 4) throw new Error("side_market_replay_participant_count");
    const participantIds = market.participantIds as unknown as readonly [string, string, string, string];
    const cartridge = createTemerosaCasinoOldMaidCartridge(bundle.contentAssets);
    for (let sample = 0; sample < PRICING_SAMPLES; sample += 1) {
      const game = createOldMaidSpectatorReplay({ cartridge, seed: `${CASINO_SPECTATOR_PRICING_VERSION}:${market.tableId}:${participantIds.join("+")}:${sample}`,
        sessionId: `side-market-price:${sample}`, participantIds, captureFrames: false });
      counts[game.oddCardHolderCharacterId]! += 1;
    }
  }
  return probabilityBps(outcomeIds.map((id) => counts[id]!));
}

function probabilityBps(counts: readonly number[]): readonly number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const exact = counts.map((count) => count * 10_000 / total), output = exact.map(Math.floor);
  let remainder = 10_000 - output.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) output[order[cursor % order.length]!.index]! += 1;
  return Object.freeze(output);
}
