import { afterEach, describe, expect, it, vi } from "vitest";

class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  sent: { id?: number; method: string }[] = [];
  terminate = vi.fn();
  constructor() { WorkerStub.instances.push(this); }
  postMessage(value: { id?: number; method: string }) { this.sent.push(value); }
  answer(value: unknown) { this.onmessage?.({ data: { id: this.sent.at(-1)?.id, value, changes: [] } } as MessageEvent); }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); WorkerStub.instances = []; });
describe("economic worker client", () => {
  it("shares one worker and never posts concurrent calculations", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const { queryCasinoRuntime } = await import("./casino-runtime-client.ts");
    const first = queryCasinoRuntime("presence", 1);
    const second = queryCasinoRuntime("balances", { second: 1, journal: [] });
    const worker = WorkerStub.instances[0]!;
    expect(WorkerStub.instances).toHaveLength(1);
    expect(worker.sent.map((entry) => entry.method)).toEqual(["init", "presence"]);
    worker.answer([]);
    expect(worker.sent.at(-1)?.method).toBe("balances");
    worker.answer({ npcBalances: {}, houseBalance: 100 });
    expect(await first).toEqual([]);
    expect(await second).toEqual({ npcBalances: {}, houseBalance: 100 });
  });
  it("fails closed without Worker rather than running the simulation on the UI thread", async () => {
    vi.stubGlobal("Worker", undefined);
    const { queryCasinoRuntime } = await import("./casino-runtime-client.ts");
    await expect(queryCasinoRuntime("presence", 1)).rejects.toThrow("casino_worker_unavailable");
  });
  it("rejects active and queued calls on crash and permits an explicit later retry", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const { queryCasinoRuntime } = await import("./casino-runtime-client.ts");
    const first = queryCasinoRuntime("presence", 1).catch((error: Error) => error.message);
    const second = queryCasinoRuntime("presence", 2).catch((error: Error) => error.message);
    WorkerStub.instances[0]!.onerror?.();
    expect(await first).toBe("casino_worker_failed"); expect(await second).toBe("casino_worker_failed");
    const retry = queryCasinoRuntime("presence", 3); WorkerStub.instances[1]!.answer([]);
    expect(await retry).toEqual([]);
  });
  it("bounds pending requests and rejects a stalled worker without a retry loop", async () => {
    vi.useFakeTimers(); vi.stubGlobal("Worker", WorkerStub);
    const { queryCasinoRuntime } = await import("./casino-runtime-client.ts");
    const calls = Array.from({ length: 17 }, (_, second) => queryCasinoRuntime("presence", second).catch((error: Error) => error.message));
    await expect(queryCasinoRuntime("presence", 18)).rejects.toThrow("casino_runtime_busy");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await Promise.all(calls)).toEqual(Array(17).fill("casino_worker_timeout"));
    expect(WorkerStub.instances).toHaveLength(1);
    expect(WorkerStub.instances[0]!.terminate).toHaveBeenCalledOnce();
  });
});
