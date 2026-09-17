import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { reduceCasinoCard } from "@lucky-arcade/casino-cards";
import { createVipPreviewSession, VIP_PREVIEW_KEY } from "./vip-preview-session.ts";

function fixture() {
  const values = new Map<string, string>([["actual-wallet", "untouched"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { values, storage, adapter: createVipPreviewSession(storage) };
}

describe("isolated VIP preview", () => {
  it("starts at 10,000 P and preserves first-entry state across adapter recreation", async () => {
    const { storage, adapter } = fixture();
    expect((await adapter.load()).balance).toBe(10000);
    expect(await adapter.markFirstEntry()).toBe(true);
    const reloaded = createVipPreviewSession(storage);
    expect(await reloaded.markFirstEntry()).toBe(false);
    expect((await reloaded.load()).status.membership).not.toBeNull();
  });

  it("atomically reserves and restores the same hand, settles exactly once, and resets only its own key", async () => {
    const { adapter, storage, values } = fixture();
    const initial = await adapter.load();
    const started = await adapter.start(initial.state, 200, "preview-test");
    expect(started.balance).toBe(9800);
    const restored = createVipPreviewSession(storage);
    const before = await restored.load();
    expect(before.state).toEqual(started.state);
    const complete = started.state.status === "complete" ? started.state : reduceCasinoCard(started.state, { type: "stand" });
    if (started.state.status !== "complete") await restored.persist(started.state, complete, { type: "stand" });
    const result = await restored.settle(complete);
    expect(result.balance).toBe(9800 + complete.creditAmount);
    expect(result.status.comp.wageredTotal).toBe(200);
    expect(await restored.settle(complete)).toEqual(result);
    expect((await createVipPreviewSession(storage).load()).balance).toBe(result.balance);
    restored.reset();
    expect((await restored.load()).balance).toBe(10000);
    expect((await restored.load()).state.status).toBe("ready");
    expect([...values.keys()].sort()).toEqual([VIP_PREVIEW_KEY, "actual-wallet"].sort());
    expect(values.get("actual-wallet")).toBe("untouched");
  });

  it("recovers a completed hand whose credit was not yet saved", async () => {
    const { adapter, storage } = fixture();
    const { state } = await adapter.start((await adapter.load()).state, 200, "interrupted-settle");
    const complete = state.status === "complete" ? state : reduceCasinoCard(state, { type: "stand" });
    if (state.status !== "complete") await adapter.persist(state, complete, { type: "stand" });
    const recovered = await createVipPreviewSession(storage).load();
    expect(recovered.balance).toBe(9800 + complete.creditAmount);
    expect(recovered.status.comp.wageredTotal).toBe(200);
    expect(await createVipPreviewSession(storage).load()).toEqual(recovered);
  });

  it("uses normal comp thresholds and persists acknowledgements", async () => {
    const { adapter, storage } = fixture();
    for (let i = 0; i < 10; i++) {
      const { state } = await adapter.start((await adapter.load()).state, 200, `comp-${i}`);
      const complete = state.status === "complete" ? state : reduceCasinoCard(state, { type: "stand" });
      if (state.status !== "complete") await adapter.persist(state, complete, { type: "stand" });
      await adapter.settle(complete);
      await adapter.persist(complete, reduceCasinoCard(complete, { type: "restart" }), { type: "restart" });
    }
    expect((await adapter.load()).status.comp.pendingTiers).toEqual([1]);
    await adapter.acknowledgeComp(1);
    const comp = (await createVipPreviewSession(storage).load()).status.comp;
    expect(comp.wageredTotal).toBe(2000);
    expect(comp.pendingTiers).toEqual([]);
    expect(comp.acknowledgedTiers).toEqual([1]);
  });

  it("rejects stale starts and corrupted snapshots without touching other storage", async () => {
    const { adapter, storage, values } = fixture();
    const { state } = await adapter.load();
    await adapter.start(state, 200, "one");
    await expect(adapter.start(state, 200, "two")).rejects.toThrow("conflict");
    storage.setItem(VIP_PREVIEW_KEY, "bad json");
    await expect(adapter.load()).rejects.toThrow("corrupt");
    expect(values.get("actual-wallet")).toBe("untouched");
    adapter.reset();
    expect((await adapter.load()).balance).toBe(10000);
  });

  it("has no persistence, house or worker dependency", () => {
    const source = readFileSync(new URL("./vip-preview-session.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from ["'][^"']*(database|wallet|game-wager|casino-economy|casino-ledger|runtime|live-session)/);
    expect(source).not.toMatch(/indexedDB|localStorage|new Worker|fetch\(/);
  });
});
