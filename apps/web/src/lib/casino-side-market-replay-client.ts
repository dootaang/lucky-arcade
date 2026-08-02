import type { CasinoSpectatorMarket } from "@lucky-arcade/casino-ledger";
import {
  buildCasinoSideMarketReplay,
  supportsNativeSideMarketExperience,
  type CasinoSideMarketReplay,
  type CasinoSideMarketResult,
  type FiveCardDrawSideMarketReplay,
  type IndianPokerSideMarketReplay,
  type MatchPairsSideMarketReplay,
  type OldMaidSideMarketReplay,
} from "./casino-side-market-replay.ts";

export {
  supportsNativeSideMarketExperience,
  type CasinoSideMarketReplay,
  type CasinoSideMarketResult,
  type FiveCardDrawSideMarketReplay,
  type IndianPokerSideMarketReplay,
  type MatchPairsSideMarketReplay,
  type OldMaidSideMarketReplay,
};

const REPLAY_CACHE_LIMIT = 8;
const RESULT_CACHE_LIMIT = 24;
const OFFER_CACHE_LIMIT = 16;
const replayPromises = new Map<string, Promise<CasinoSideMarketReplay>>();
const resultPromises = new Map<string, Promise<CasinoSideMarketResult>>();
const offerPromises = new Map<string, Promise<CasinoSpectatorMarket>>();

/** Loads only audited local content and computes the canonical cabinet replay. */
export function resolveCasinoSideMarketReplay(market: CasinoSpectatorMarket, signal?: AbortSignal): Promise<CasinoSideMarketReplay> {
  // A caller-owned cancellation must never poison the shared cache. React's
  // development effect probe aborts its first request and immediately starts a
  // second one; reusing that aborted promise leaves the modal loading forever.
  if (signal) return runReplayTask(market, "replay", signal) as Promise<CasinoSideMarketReplay>;
  const existing = touch(replayPromises, market.marketId);
  if (existing) return existing;
  const promise = runReplayTask(market, "replay", signal) as Promise<CasinoSideMarketReplay>;
  boundedSet(replayPromises, market.marketId, promise, REPLAY_CACHE_LIMIT);
  void promise.catch(() => replayPromises.delete(market.marketId));
  return promise;
}

/** Computes only the result transcript: no animation frames or UI assets. */
export function resolveCasinoSideMarketResult(market: CasinoSpectatorMarket): Promise<CasinoSideMarketResult> {
  const existing = touch(resultPromises, market.marketId);
  if (existing) return existing;
  const promise = runReplayTask(market, "result") as Promise<CasinoSideMarketResult>;
  boundedSet(resultPromises, market.marketId, promise, RESULT_CACHE_LIMIT);
  void promise.catch(() => resultPromises.delete(market.marketId));
  return promise;
}

/** Open, upcoming and locked markets already contain their canonical quote. */
export function resolveCasinoSideMarketOffer(market: CasinoSpectatorMarket): Promise<CasinoSpectatorMarket> {
  if (market.phase !== "settled") return Promise.resolve(market);
  const offerKey = `${market.marketId}:${market.phase}`;
  const existing = touch(offerPromises, offerKey);
  if (existing) return existing;
  const promise = resolveCasinoSideMarketResult(market).then((result) => Object.freeze({
    ...market,
    winningOutcomeId: result.winningOutcomeId,
  })).catch((error: unknown) => { offerPromises.delete(offerKey); throw error; });
  boundedSet(offerPromises, offerKey, promise, OFFER_CACHE_LIMIT);
  return promise;
}

function runReplayTask(market: CasinoSpectatorMarket, mode: "replay" | "result", signal?: AbortSignal): Promise<CasinoSideMarketReplay | CasinoSideMarketResult> {
  return new Promise((resolve, reject) => {
    // Let React paint the loading modal before loading audited assets and
    // reducing the one transcript the user explicitly requested. The former
    // freeze came from eagerly building several full replays while scrolling;
    // offers now use frame-free results and full frames are built only here.
    const handle = globalThis.setTimeout(() => {
      if (signal?.aborted) { abort(); return; }
      void buildCasinoSideMarketReplay(market, mode === "replay")
        .then((replay) => {
          cleanup();
          resolve(mode === "replay" ? replay : replayResult(replay));
        })
        .catch((error: unknown) => { cleanup(); reject(error); });
    }, 0);
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => {
      globalThis.clearTimeout(handle);
      cleanup();
      reject(new DOMException("Replay cancelled", "AbortError"));
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function replayResult(replay: CasinoSideMarketReplay): CasinoSideMarketResult {
  return Object.freeze({ marketId: replay.marketId, winningOutcomeId: replay.winningOutcomeId, resultHash: replay.resultHash });
}

function touch<K, V>(cache: Map<K, V>, key: K): V | undefined {
  const value = cache.get(key);
  if (value !== undefined) { cache.delete(key); cache.set(key, value); }
  return value;
}

function boundedSet<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value as K);
}
