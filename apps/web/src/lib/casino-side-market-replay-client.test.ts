import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CasinoSpectatorMarket } from "@lucky-arcade/casino-ledger";
import type { ReplayWorkerRequest, ReplayWorkerResponse } from "./casino-side-market-replay.worker.ts";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<ReplayWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  requests: ReplayWorkerRequest[] = [];
  terminated = false;
  constructor(readonly url: URL, readonly options: WorkerOptions) { FakeWorker.instances.push(this); }
  postMessage(request: ReplayWorkerRequest) { this.requests.push(structuredClone(request)); }
  terminate() { this.terminated = true; }
  complete() {
    const request = this.requests.at(-1)!;
    this.onmessage?.({ data: { id: request.id, ok: true, value: { marketId: request.market.marketId, winningOutcomeId: "winner", resultHash: "hash" } } } as MessageEvent<ReplayWorkerResponse>);
  }
  fail() {
    this.onmessage?.({ data: { id: this.requests.at(-1)!.id, ok: false, error: { name: "Error", message: "failed" } } } as MessageEvent<ReplayWorkerResponse>);
  }
}

const market = (id = "market"): CasinoSpectatorMarket => ({ marketId: id, phase: "settled" } as CasinoSpectatorMarket);
const client = () => import("./casino-side-market-replay-client.ts");

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("bounded side-market worker client", () => {
  it("runs serially in one module worker and reuses cached promises", async () => {
    const api = await client();
    const first = api.resolveCasinoSideMarketResult(market());
    const second = api.resolveCasinoSideMarketResult(market("second"));
    expect(api.resolveCasinoSideMarketResult(market())).toBe(first);
    const worker = FakeWorker.instances[0]!;
    expect(worker.options).toEqual({ type: "module" });
    expect(worker.url.pathname).toMatch(/casino-side-market-replay.worker.ts$/);
    expect(worker.requests).toHaveLength(1);
    worker.complete();
    expect(worker.requests).toHaveLength(2);
    worker.complete();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("terminates active work on abort and starts the queued task in a fresh worker", async () => {
    const api = await client();
    const controller = new AbortController();
    const first = api.resolveCasinoSideMarketReplay(market(), controller.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = api.resolveCasinoSideMarketReplay(market());
    controller.abort();
    await rejected;
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1]!.complete();
    await second;
    expect(api.resolveCasinoSideMarketReplay(market())).toBe(second);
  });

  it("removes cancelled queued tasks without terminating unrelated work", async () => {
    const api = await client();
    const first = api.resolveCasinoSideMarketResult(market());
    const controller = new AbortController();
    const queued = api.resolveCasinoSideMarketReplay(market("queued"), controller.signal);
    const rejected = expect(queued).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    const worker = FakeWorker.instances[0]!;
    expect(worker.terminated).toBe(false);
    worker.complete();
    await first;
    expect(worker.requests).toHaveLength(1);
  });

  it("rejects already aborted signals and unavailable workers without any fallback", async () => {
    const api = await client();
    await expect(api.resolveCasinoSideMarketReplay(market(), AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
    vi.stubGlobal("Worker", undefined);
    await expect(api.resolveCasinoSideMarketResult(market())).rejects.toThrow("side_market_worker_unavailable");
    expect(FakeWorker.instances).toHaveLength(0);
    vi.stubGlobal("Worker", FakeWorker);
    const retry = api.resolveCasinoSideMarketResult(market());
    FakeWorker.instances[0]!.complete();
    await retry;
  });

  it("evicts failed results and offers so a new worker can retry", async () => {
    const api = await client();
    const failed = api.resolveCasinoSideMarketOffer(market());
    const rejected = expect(failed).rejects.toThrow("failed");
    FakeWorker.instances[0]!.fail();
    await rejected;
    const retry = api.resolveCasinoSideMarketOffer(market());
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    FakeWorker.instances[1]!.complete();
    await expect(retry).resolves.toMatchObject({ winningOutcomeId: "winner" });
  });

  it("bounds the waiting queue to 32 without spawning extra workers", async () => {
    const api = await client();
    const promises = Array.from({ length: 34 }, (_, i) => api.resolveCasinoSideMarketResult(market(String(i))));
    const settled = Promise.allSettled(promises);
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0]!;
    for (let i = 0; i < 33; i++) worker.complete();
    const results = await settled;
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(33);
    expect(results.at(-1)).toMatchObject({ status: "rejected", reason: new Error("side_market_worker_queue_full") });
  });

  it("times out stalled workers and progresses the queue", async () => {
    const api = await client();
    const stalled = api.resolveCasinoSideMarketResult(market());
    const rejected = expect(stalled).rejects.toThrow("side_market_worker_timeout");
    const next = api.resolveCasinoSideMarketResult(market("next"));
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    FakeWorker.instances[1]!.complete();
    await next;
  });

  it("does not let an evicted promise failure erase a newer cache entry", async () => {
    const api = await client();
    const first = api.resolveCasinoSideMarketResult(market());
    const rejected = expect(first).rejects.toThrow("failed");
    const remaining = Array.from({ length: 24 }, (_, i) => api.resolveCasinoSideMarketResult(market(`other-${i}`)));
    const replacement = api.resolveCasinoSideMarketResult(market());
    expect(replacement).not.toBe(first);
    FakeWorker.instances[0]!.fail();
    await rejected;
    expect(api.resolveCasinoSideMarketResult(market())).toBe(replacement);
    const worker = FakeWorker.instances[1]!;
    for (let i = 0; i < 25; i++) worker.complete();
    await Promise.all([...remaining, replacement]);
  });

  it("resets a worker after script or message errors", async () => {
    const api = await client();
    const failed = api.resolveCasinoSideMarketResult(market());
    const rejected = expect(failed).rejects.toThrow("script failed");
    const preventDefault = vi.fn();
    FakeWorker.instances[0]!.onerror!({ message: "script failed", preventDefault } as unknown as ErrorEvent);
    await rejected;
    expect(preventDefault).toHaveBeenCalledOnce();
    const retry = api.resolveCasinoSideMarketResult(market());
    const messageRejected = expect(retry).rejects.toThrow("side_market_worker_message_failed");
    FakeWorker.instances[1]!.onmessageerror!();
    await messageRejected;
    expect(FakeWorker.instances.every((worker) => worker.terminated)).toBe(true);
  });
});
