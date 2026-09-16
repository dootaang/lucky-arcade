import type { CasinoSpectatorMarket } from "@lucky-arcade/casino-ledger";
import {
  supportsNativeSideMarketExperience,
  type CasinoSideMarketReplay,
  type CasinoSideMarketResult,
  type FiveCardDrawSideMarketReplay,
  type IndianPokerSideMarketReplay,
  type MatchPairsSideMarketReplay,
  type OldMaidSideMarketReplay,
} from "./casino-side-market-replay.ts";
import type { ReplayWorkerRequest, ReplayWorkerResponse } from "./casino-side-market-replay.worker.ts";

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
const QUEUE_LIMIT = 32;
const TASK_TIMEOUT_MS = 120_000;
interface ReplayTask {
  request: ReplayWorkerRequest;
  resolve: (value: CasinoSideMarketReplay | CasinoSideMarketResult) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
}
const pendingTasks: ReplayTask[] = [];
let activeTask: ReplayTask | undefined;
let replayWorker: Worker | undefined;
let taskTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
let nextTaskId = 0;

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
  void promise.catch(() => { if (replayPromises.get(market.marketId) === promise) replayPromises.delete(market.marketId); });
  return promise;
}

/** Computes only the result transcript: no animation frames or UI assets. */
export function resolveCasinoSideMarketResult(market: CasinoSpectatorMarket): Promise<CasinoSideMarketResult> {
  const existing = touch(resultPromises, market.marketId);
  if (existing) return existing;
  const promise = runReplayTask(market, "result") as Promise<CasinoSideMarketResult>;
  boundedSet(resultPromises, market.marketId, promise, RESULT_CACHE_LIMIT);
  void promise.catch(() => { if (resultPromises.get(market.marketId) === promise) resultPromises.delete(market.marketId); });
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
  }));
  boundedSet(offerPromises, offerKey, promise, OFFER_CACHE_LIMIT);
  void promise.catch(() => { if (offerPromises.get(offerKey) === promise) offerPromises.delete(offerKey); });
  return promise;
}

function runReplayTask(market: CasinoSpectatorMarket, mode: "replay" | "result", signal?: AbortSignal): Promise<CasinoSideMarketReplay | CasinoSideMarketResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Replay cancelled", "AbortError")); return; }
    // No synchronous fallback: unsupported browsers must remain responsive.
    if (typeof Worker === "undefined") { reject(new Error("side_market_worker_unavailable")); return; }
    if (pendingTasks.length >= QUEUE_LIMIT) { reject(new Error("side_market_worker_queue_full")); return; }
    const task: ReplayTask = {
      request: { id: ++nextTaskId, market, mode }, resolve, reject,
      cleanup: () => signal?.removeEventListener("abort", abort),
    };
    const abort = () => {
      if (activeTask === task) {
        // A synchronous reducer cannot receive a cancel message while busy.
        // Termination actually stops its CPU work and in-flight asset fetches.
        finishActive(undefined, new DOMException("Replay cancelled", "AbortError"), true);
      } else {
        const index = pendingTasks.indexOf(task);
        if (index >= 0) pendingTasks.splice(index, 1);
        task.cleanup();
        reject(new DOMException("Replay cancelled", "AbortError"));
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    pendingTasks.push(task);
    startNextTask();
  });
}

function startNextTask(): void {
  if (activeTask || pendingTasks.length === 0) return;
  activeTask = pendingTasks.shift()!;
  try {
    if (!replayWorker) {
      const worker = new Worker(new URL("./casino-side-market-replay.worker.ts", import.meta.url), { type: "module" });
      replayWorker = worker;
      worker.onmessage = (event: MessageEvent<ReplayWorkerResponse>) => {
        if (worker !== replayWorker || event.data.id !== activeTask?.request.id) return;
        if (event.data.ok) finishActive(event.data.value);
        else finishActive(undefined, Object.assign(new Error(event.data.error.message), { name: event.data.error.name }), true);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (worker === replayWorker) finishActive(undefined, new Error(event.message || "side_market_worker_failed"), true);
      };
      worker.onmessageerror = () => {
        if (worker === replayWorker) finishActive(undefined, new Error("side_market_worker_message_failed"), true);
      };
    }
    taskTimer = globalThis.setTimeout(() => finishActive(undefined, new Error("side_market_worker_timeout"), true), TASK_TIMEOUT_MS);
    replayWorker.postMessage(activeTask.request);
  } catch (error: unknown) {
    finishActive(undefined, error, true);
  }
}

function finishActive(value?: CasinoSideMarketReplay | CasinoSideMarketResult, error?: unknown, resetWorker = false): void {
  const task = activeTask;
  if (!task) return;
  activeTask = undefined;
  globalThis.clearTimeout(taskTimer);
  taskTimer = undefined;
  if (resetWorker && replayWorker) {
    replayWorker.onmessage = null;
    replayWorker.onerror = null;
    replayWorker.onmessageerror = null;
    replayWorker.terminate();
    replayWorker = undefined;
  }
  task.cleanup();
  if (value !== undefined) task.resolve(value);
  else task.reject(error ?? new Error("side_market_worker_failed"));
  startNextTask();
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
