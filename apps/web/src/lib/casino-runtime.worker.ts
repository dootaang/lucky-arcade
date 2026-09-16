import { createCasinoRuntime, type CasinoRuntimeRequest } from "./casino-runtime.ts";
import type { StorageLike } from "./casino-ledger-cache.ts";

const entries = new Map<string, string>();
const changes = new Map<string, string | null>();
const storage: StorageLike = {
  get length() { return entries.size; }, key: (index) => [...entries.keys()][index] ?? null,
  getItem: (key) => entries.get(key) ?? null,
  setItem(key, value) { if (entries.get(key) !== value) changes.set(key, value); entries.set(key, value); },
  removeItem(key) { if (entries.delete(key)) changes.set(key, null); },
};
const runtime = createCasinoRuntime(storage);
self.onmessage = (event: MessageEvent<CasinoRuntimeRequest | { method: "init"; entries: [string, string][] }>) => {
  const request = event.data;
  if (request.method === "init") { for (const [key, value] of request.entries) entries.set(key, value); return; }
  try {
    let value: unknown;
    switch (request.method) {
      case "floor": value = runtime.floor(request.input); break;
      case "presence": value = runtime.presence(request.input); break;
      case "balances": value = runtime.balances(request.input); break;
      case "history": value = runtime.history(request.input); break;
    }
    self.postMessage({ id: request.id, value, changes: [...changes] });
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error), changes: [...changes] });
  } finally { changes.clear(); }
};
