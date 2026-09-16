import type { CasinoRuntime, CasinoRuntimeMethod } from "./casino-runtime.ts";

interface Task { id: number; method: CasinoRuntimeMethod; input: unknown; resolve(value: unknown): void; reject(reason: Error): void; }
let worker: Worker | undefined;
let active: Task | undefined;
let sequence = 0;
let watchdog: ReturnType<typeof setTimeout> | undefined;
const queue: Task[] = [];
const CHECKPOINT_KEY = /^npc-ledger\/[^:]+:worldline-checkpoint:/;

/** One economic worker for floor, invitations and wallet counterparties.
 * Only one request is posted at a time; no timer can build an unbounded backlog.
 * Unsupported/broken workers fail explicitly, never fall back to blocking UI.
 */
export function queryCasinoRuntime<K extends CasinoRuntimeMethod>(method: K, input: Parameters<CasinoRuntime[K]>[0]): Promise<ReturnType<CasinoRuntime[K]>> {
  if (queue.length >= 16) return Promise.reject(new Error("casino_runtime_busy"));
  return new Promise((resolve, reject) => {
    queue.push({ id: ++sequence, method, input, resolve: (value) => resolve(value as ReturnType<CasinoRuntime[K]>), reject });
    pump();
  });
}

function pump(): void {
  if (active || !queue.length) return;
  try {
    if (!worker) {
      if (typeof Worker === "undefined") throw new Error("casino_worker_unavailable");
      const instance = new Worker(new URL("./casino-runtime.worker.ts", import.meta.url), { type: "module" });
      worker = instance;
      worker.onmessage = (event: MessageEvent<{ id: number; value?: unknown; error?: string; changes?: [string, string | null][] }>) => {
        if (worker !== instance || !active || event.data.id !== active.id) return;
        clearTimeout(watchdog); watchdog = undefined;
        persist(event.data.changes ?? []);
        const task = active; active = undefined;
        if (event.data.error) task.reject(new Error(event.data.error)); else task.resolve(event.data.value);
        pump();
      };
      worker.onerror = () => { if (worker === instance) fail(new Error("casino_worker_failed")); };
      worker.onmessageerror = () => { if (worker === instance) fail(new Error("casino_worker_invalid_message")); };
      worker.postMessage({ method: "init", entries: checkpoints() });
    }
    active = queue.shift()!;
    watchdog = setTimeout(() => fail(new Error("casino_worker_timeout")), 120_000);
    worker.postMessage({ id: active.id, method: active.method, input: active.input });
  } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
}
function fail(error: Error): void {
  clearTimeout(watchdog); watchdog = undefined;
  worker?.terminate(); worker = undefined;
  active?.reject(error); active = undefined;
  for (const task of queue.splice(0)) task.reject(error);
}
function checkpoints(): [string, string][] {
  try {
    return Object.keys(localStorage).filter((key) => CHECKPOINT_KEY.test(key)).flatMap((key) => {
      const value = localStorage.getItem(key); return value === null ? [] : [[key, value] as [string, string]];
    });
  } catch { return []; }
}
function persist(changes: [string, string | null][]): void {
  try { for (const [key, value] of changes) if (CHECKPOINT_KEY.test(key)) {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } } catch { /* Derived checkpoints are optional; the worker keeps its in-memory copy. */ }
}
