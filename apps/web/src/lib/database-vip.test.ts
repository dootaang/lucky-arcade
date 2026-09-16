import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

let browser: Browser, context: BrowserContext, page: Page, server: ViteDevServer;
let origin: string;
describe.sequential("VIP atomic storage", () => {
  beforeAll(async () => {
    server = await createServer({ root: fileURLToPath(new URL("../..", import.meta.url)), logLevel: "silent",
      configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: "127.0.0.1", port: 0 }, plugins: [{ name: "vip-test-page", configureServer(dev) {
        dev.middlewares.use("/__vip-test__", (_request, response) => { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>VIP</title>"); });
      } }] });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("test_server_failed");
    origin = `http://127.0.0.1:${address.port}/__vip-test__`;
    browser = await chromium.launch(); context = await browser.newContext(); page = await context.newPage();
    await page.goto(origin);
  });
  beforeEach(async () => {
    await page.reload();
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase("lucky-arcade");
      deletion.onsuccess = () => resolve(); deletion.onerror = () => reject(deletion.error);
      deletion.onblocked = () => reject(new Error("delete_blocked"));
    }));
  });
  afterAll(async () => { await context?.close(); await browser?.close(); await server?.close(); });

  it("migrates v9 once and counts only settled public paid wagers with net wins", async () => {
    await seed(5_000, 20, true);
    const result = await page.evaluate(async () => {
      const vip = await new Function("return import('/src/lib/vip.ts')")();
      const first = await vip.readVipStatus();
      let scans = 0;
      const cursor = IDBObjectStore.prototype.openCursor, all = IDBObjectStore.prototype.getAll;
      IDBObjectStore.prototype.openCursor = function (...args) { if (this.name === "game-wagers") scans++; return cursor.apply(this, args); };
      IDBObjectStore.prototype.getAll = function (...args) { if (this.name === "game-wagers") scans++; return all.apply(this, args); };
      try {
        await vip.readVipStatus(); await vip.readVipStatus();
        const purchase = await vip.purchaseVipMembership(1_000);
        return { first, scans, purchase };
      } finally { IDBObjectStore.prototype.openCursor = cursor; IDBObjectStore.prototype.getAll = all; }
    });
    expect(result.first).toMatchObject({ completedPublicWagers: 20, publicWinRate: 0.5, membership: null });
    expect(result.scans).toBe(0);
    expect(result.purchase.wallet.balance).toBe(4_000);
    expect(result.purchase.membership.firstEntryAt).toBeUndefined();
  });

  it("updates eligibility atomically on new public settlements, never on replay/refund/forfeit", async () => {
    await seed(5_000, 19);
    const result = await page.evaluate(async () => {
      const db = await new Function("return import('/src/lib/database.ts')")();
      await db.readVipStatus();
      const base = { cabinetId: "temerosa-five-card-draw", sessionId: "public", termsVersion: "public/1", stake: 10, reservedAmount: 70 };
      for (const id of ["net-loss", "refund", "forfeit"]) await db.reserveGameWager({ ...base, wagerId: id, outcomeKey: id });
      await db.settleGameWager({ wagerId: "net-loss", settlementSequence: 1, resultKey: "partial-return", creditAmount: 50 });
      await db.settleGameWager({ wagerId: "net-loss", settlementSequence: 2, resultKey: "replay", creditAmount: 999 });
      await db.systemInvalidateGameWager({ wagerId: "refund", reason: "corrupt-state" });
      await db.forfeitGameWager({ wagerId: "forfeit", settlementSequence: 1 });
      return db.readVipStatus();
    });
    expect(result).toMatchObject({ completedPublicWagers: 20, publicWinRate: 10 / 20 });
  });

  it("rejects unmet prerequisites and insufficient points without partial writes", async () => {
    await seed(999, 19);
    const first = await purchaseResult(page);
    expect(first).toEqual({ error: "vip_membership_prerequisite" });
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open("lucky-arcade");
      opening.onsuccess = () => {
        const db = opening.result, tx = db.transaction("game-wagers", "readwrite");
        tx.objectStore("game-wagers").put({ contract: "game-wager/0.1", wagerId: "last", outcomeKey: "last", cabinetId: "temerosa-slot", status: "settled", reservedAmount: 10, settlementCredit: 0 });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    }));
    // The failed purchase rolled back its bootstrap as well, so the new receipt is included.
    expect(await purchaseResult(page)).toEqual({ error: "insufficient_points" });
    expect(await snapshot()).toMatchObject({ wallet: { balance: 999 }, status: { membership: null }, journal: [] });
  });

  it("serializes membership purchases across tabs and claims first entry once", async () => {
    await seed(5_000, 20);
    const other = await context.newPage(); await other.goto(origin);
    const results = await Promise.all([purchaseResult(page), purchaseResult(other)]);
    await other.close();
    expect(results.filter((result) => "wallet" in result)).toHaveLength(1);
    expect(results.filter((result) => "error" in result)).toEqual([{ error: "vip_membership_exists" }]);
    const state = await snapshot();
    expect(state.wallet.balance).toBe(4_000); expect(state.journal).toHaveLength(1);
    expect(state.journal[0]).toMatchObject({ kind: "vip-membership-purchase", postings: [{ accountId: "player:local", delta: -1_000 }, { accountId: "house:temerosa", delta: 1_000 }] });
    const entries = await page.evaluate(async () => {
      const vip = await new Function("return import('/src/lib/vip.ts')")();
      return Promise.all([vip.markVipFirstEntry(), vip.markVipFirstEntry()]);
    });
    expect(entries.map((entry: { firstEntry: boolean }) => entry.firstEntry).sort()).toEqual([false, true]);
    expect(entries[0].membership.firstEntryAt).toBe(entries[1].membership.firstEntryAt);
  });

  it("rolls back wallet and membership when the purchase journal insert fails", async () => {
    await seed(5_000, 20);
    await watchChanges(page);
    await page.evaluate(async () => {
      const db = await new Function("return import('/src/lib/database.ts')")();
      await db.appendCasinoTransaction({ contract: "casino-transaction/1.0", transactionId: "vip:membership", idempotencyKey: "vip:membership", occurredAtCasinoSecond: 1_000, kind: "vip-membership-purchase", postings: [{ accountId: "player:local", delta: -1_000 }, { accountId: "house:temerosa", delta: 1_000 }] });
    });
    expect(await purchaseResult(page)).toHaveProperty("error");
    expect((await notificationProbe(page)).calls).toEqual([0, 0]);
    expect(await snapshot()).toMatchObject({ wallet: { balance: 5_000 }, status: { membership: null }, journal: [expect.anything()] });
  });

  it("enforces membership, terms, tiers, fixed 1x, house and pre-debit floor inside reservation", async () => {
    await seed(2_000, 20);
    const result = await page.evaluate(async () => {
      const db = await new Function("return import('/src/lib/database.ts')")();
      const base = { wagerId: "vip", outcomeKey: "vip", cabinetId: "temerosa-vip-blackjack", sessionId: "vip", termsVersion: "temerosa-vip-blackjack/0.1", stake: 200, reservedAmount: 200,
        counterpartyAccountId: "house:temerosa", counterpartyReservedAmount: 300, counterpartyBaseBalance: 150_000, casinoOccurredAtSecond: 1_000 };
      const attempt = async (overrides: Record<string, unknown>) => { try { await db.reserveGameWager({ ...base, ...overrides }); return "ok"; } catch (error) { return (error as Error).message; } };
      const missing = await attempt({}); await db.purchaseVipMembership(1_000);
      const rejected = [];
      for (const changes of [{ stake: 201, reservedAmount: 201 }, { termsVersion: "old" }, { reservedAmount: 400 }, { counterpartyAccountId: "npc:nieun" }, { stake: 500, reservedAmount: 500 }]) rejected.push(await attempt(changes));
      const accepted = await attempt({});
      const belowFloor = await attempt({ wagerId: "second", outcomeKey: "second" });
      return { missing, rejected, accepted, belowFloor, wallet: await db.readWallet(), wagers: await db.listGameWagers("vip") };
    });
    expect(result.missing).toBe("vip_membership_required");
    expect(result.rejected).toEqual(["vip_invalid_stake", "vip_invalid_terms", "vip_invalid_multiplier", "vip_house_required", "vip_floor_below_minimum"]);
    expect(result.accepted).toBe("ok"); expect(result.belowFloor).toBe("vip_floor_below_minimum");
    expect(result.wallet.balance).toBe(800); expect(result.wagers).toHaveLength(1);
  });

  it("counts A B A once, queues all tiers durably, acknowledges individually and excludes refunds/forfeits", async () => {
    await seed(100_000, 20); await purchaseResult(page);
    const result = await page.evaluate(async () => {
      const db = await new Function("return import('/src/lib/database.ts')")();
      const vip = await new Function("return import('/src/lib/vip.ts')")();
      const reserve = (id: string) => db.reserveGameWager({ wagerId: id, outcomeKey: id, cabinetId: "temerosa-vip-blackjack", sessionId: "vip", termsVersion: "temerosa-vip-blackjack/0.1", stake: 1_000, reservedAmount: 1_000,
        counterpartyAccountId: "house:temerosa", counterpartyReservedAmount: 1_500, counterpartyBaseBalance: 150_000, casinoOccurredAtSecond: 1_000 });
      const settle = (id: string) => db.settleGameWager({ wagerId: id, settlementSequence: 1, resultKey: id, creditAmount: 0 });
      await reserve("A"); await settle("A"); await reserve("B"); await settle("B"); await settle("A");
      const aba = await vip.readVipStatus();
      for (let index = 2; index < 30; index++) { await reserve(`tier-${index}`); await settle(`tier-${index}`); }
      await reserve("refund"); await db.systemInvalidateGameWager({ wagerId: "refund", reason: "corrupt-state" });
      await reserve("forfeit"); await db.forfeitGameWager({ wagerId: "forfeit", settlementSequence: 1 });
      return { aba, final: await vip.readVipStatus() };
    });
    expect(result.aba.comp).toMatchObject({ wageredTotal: 2_000, tierReached: 1, pendingTiers: [1] });
    expect(result.final.comp).toMatchObject({ wageredTotal: 30_000, tierReached: 4, pendingTiers: [1, 2, 3, 4], acknowledgedTiers: [] });
    expect(result.final.completedPublicWagers).toBe(20);
    await page.reload();
    const recovered = await page.evaluate(async () => {
      const vip = await new Function("return import('/src/lib/vip.ts')")();
      const before = await vip.readVipStatus(); await vip.acknowledgeVipComp(2); await vip.acknowledgeVipComp(2);
      return { before, after: await vip.readVipStatus() };
    });
    expect(recovered.before.comp.pendingTiers).toEqual([1, 2, 3, 4]);
    expect(recovered.after.comp).toMatchObject({ pendingTiers: [1, 3, 4], acknowledgedTiers: [2] });
  });

  it("recovers only active and snapshot receipts, without loading settled history", async () => {
    await seed(100_000, 20); await purchaseResult(page);
    const result = await page.evaluate(async () => {
      const db = await new Function("return import('/src/lib/database.ts')")();
      const vip = await new Function("return import('/src/lib/vip.ts')")();
      const reserve = (id: string) => db.reserveGameWager({ wagerId: id, outcomeKey: id, cabinetId: "temerosa-vip-blackjack", sessionId: "vip", termsVersion: "temerosa-vip-blackjack/0.1", stake: 200, reservedAmount: 200, counterpartyAccountId: "house:temerosa", counterpartyReservedAmount: 300, counterpartyBaseBalance: 150_000, casinoOccurredAtSecond: 1_000 });
      for (const id of ["old", "snapshot"]) { await reserve(id); await db.settleGameWager({ wagerId: id, settlementSequence: 1, resultKey: id, creditAmount: 0 }); }
      await reserve("active");
      const original = IDBIndex.prototype.getAll;
      const reads: unknown[][] = [];
      IDBIndex.prototype.getAll = function (...args) { reads.push([this.name, ...args]); return original.apply(this, args); };
      try { return { records: await vip.readVipRecoveryWagers("vip", "snapshot"), reads }; }
      finally { IDBIndex.prototype.getAll = original; }
    });
    expect(result.records.map((record: { wagerId: string }) => record.wagerId)).toEqual(["active", "snapshot"]);
    expect(result.reads).toEqual([["by-session-status", ["vip", "reserved"], 2]]);
  });

  it("rolls back settlement, wallet and comp together when the journal insert fails", async () => {
    await seed(10_000, 20); await purchaseResult(page);
    await watchChanges(page);
    const result = await page.evaluate(async () => {
      const db = await new Function("return import('/src/lib/database.ts')")();
      await db.reserveGameWager({ wagerId: "atomic", outcomeKey: "atomic", cabinetId: "temerosa-vip-blackjack", sessionId: "vip", termsVersion: "temerosa-vip-blackjack/0.1", stake: 1_000, reservedAmount: 1_000, counterpartyAccountId: "house:temerosa", counterpartyReservedAmount: 1_500, counterpartyBaseBalance: 150_000, casinoOccurredAtSecond: 1_000 });
      await db.appendCasinoTransaction({ contract: "casino-transaction/1.0", transactionId: "collision", idempotencyKey: "casino-wager:atomic:settle", occurredAtCasinoSecond: 1_000, kind: "legacy-migration", postings: [{ accountId: "player:local", delta: -1 }, { accountId: "house:temerosa", delta: 1 }] });
      let failed = false;
      try { await db.settleGameWager({ wagerId: "atomic", settlementSequence: 1, resultKey: "win", creditAmount: 2_000 }); } catch { failed = true; }
      return { failed, wallet: await db.readWallet(), status: await db.readVipStatus(), wagers: await db.listGameWagers("vip") };
    });
    expect(result.failed).toBe(true); expect(result.wallet.balance).toBe(8_000);
    expect(result.status.comp.wageredTotal).toBe(0); expect(result.wagers[0].status).toBe("reserved");
    expect((await notificationProbe(page)).calls).toEqual([0, 0]);
  });

  it("checks only reserved wagers in the VIP session, excluding historical receipts and non-VIP reservations", async () => {
    await seed(100_000, 20); await purchaseResult(page);
    const result = await page.evaluate(async () => {
      const db = await new Function("return import('/src/lib/database.ts')")();
      const sessionId = "temerosa-vip-blackjack:main";
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("lucky-arcade");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result, tx = database.transaction("game-wagers", "readwrite");
          const wagers = tx.objectStore("game-wagers");
          const receipt = { contract: "game-wager/0.1", cabinetId: "temerosa-vip-blackjack", sessionId,
            termsVersion: "temerosa-vip-blackjack/0.1", stake: 200, reservedAmount: 200, settlementCredit: 0, createdAt: "2026-01-01T00:00:00.000Z" };
          for (let index = 0; index < 200; index++) wagers.add({ ...receipt, wagerId: `history-${index}`, outcomeKey: `history-${index}`, status: "settled" });
          for (const status of ["refunded", "forfeited"]) wagers.add({ ...receipt, wagerId: status, outcomeKey: status, status });
          wagers.add({ ...receipt, wagerId: "active-public", outcomeKey: "active-public", status: "reserved", cabinetId: "temerosa-slot" });
          wagers.add({ ...receipt, wagerId: "other-session", outcomeKey: "other-session", status: "reserved", sessionId: "other" });
          tx.onerror = () => { database.close(); reject(tx.error); };
          tx.oncomplete = () => { database.close(); resolve(); };
        };
      });
      const visited: string[] = [];
      let lookups = 0;
      const indexCursor = IDBIndex.prototype.openCursor, indexAll = IDBIndex.prototype.getAll;
      const storeCursor = IDBObjectStore.prototype.openCursor, storeAll = IDBObjectStore.prototype.getAll;
      IDBIndex.prototype.openCursor = function (...args) {
        if (this.objectStore.name !== "game-wagers") return indexCursor.apply(this, args);
        const range = args[0];
        if (this.name !== "by-session-status" || !(range instanceof IDBKeyRange)
          || indexedDB.cmp(range.lower, [sessionId, "reserved"]) !== 0 || indexedDB.cmp(range.upper, [sessionId, "reserved"]) !== 0
          || range.lowerOpen || range.upperOpen) throw new Error("historical_wager_scan");
        lookups++;
        const request = indexCursor.apply(this, args);
        request.addEventListener("success", () => { if (request.result) visited.push(request.result.value.wagerId); });
        return request;
      };
      IDBIndex.prototype.getAll = function (...args) {
        if (this.objectStore.name === "game-wagers") throw new Error("historical_wager_scan");
        return indexAll.apply(this, args);
      };
      IDBObjectStore.prototype.openCursor = function (...args) {
        if (this.name === "game-wagers") throw new Error("historical_wager_scan");
        return storeCursor.apply(this, args);
      };
      IDBObjectStore.prototype.getAll = function (...args) {
        if (this.name === "game-wagers") throw new Error("historical_wager_scan");
        return storeAll.apply(this, args);
      };
      try {
        const reserve = (id: string) => db.reserveGameWager({ wagerId: id, outcomeKey: id, cabinetId: "temerosa-vip-blackjack", sessionId,
          termsVersion: "temerosa-vip-blackjack/0.1", stake: 200, reservedAmount: 200,
          counterpartyAccountId: "house:temerosa", counterpartyReservedAmount: 300, counterpartyBaseBalance: 150_000, casinoOccurredAtSecond: 1_000 });
        const first = await reserve("new-vip");
        let error = "";
        try { await reserve("second-vip"); } catch (caught) { error = (caught as Error).message; }
        return { status: first.wager.status, error, visited, lookups };
      } finally {
        IDBIndex.prototype.openCursor = indexCursor; IDBIndex.prototype.getAll = indexAll;
        IDBObjectStore.prototype.openCursor = storeCursor; IDBObjectStore.prototype.getAll = storeAll;
      }
    });
    expect(result).toEqual({ status: "reserved", error: "vip_wager_in_progress", lookups: 2,
      visited: ["active-public", "active-public", "new-vip"] });
  });

  it("serializes different VIP wagers for one session across tabs and releases after settle/refund", async () => {
    await seed(100_000, 20); await purchaseResult(page);
    const other = await context.newPage(); await other.goto(origin);
    const reserve = (target: Page, id: string, sessionId = "temerosa-vip-blackjack:main") => target.evaluate(async ({ id, sessionId }) => {
      const db = await new Function("return import('/src/lib/database.ts')")();
      try {
        await db.reserveGameWager({ wagerId: id, outcomeKey: id, cabinetId: "temerosa-vip-blackjack", sessionId,
          termsVersion: "temerosa-vip-blackjack/0.1", stake: 200, reservedAmount: 200,
          counterpartyAccountId: "house:temerosa", counterpartyReservedAmount: 300, counterpartyBaseBalance: 150_000, casinoOccurredAtSecond: 1_000 });
        return { id, error: null };
      } catch (error) { return { id, error: (error as Error).message }; }
    }, { id, sessionId });
    try {
      const results = await Promise.all([reserve(page, "race-a"), reserve(other, "race-b")]);
      expect(results.filter((result) => result.error === null)).toHaveLength(1);
      expect(results.filter((result) => result.error !== null).map((result) => result.error)).toEqual(["vip_wager_in_progress"]);
      const state = await snapshot();
      expect(state.wallet.balance).toBe(98_800);
      expect(state.journal).toHaveLength(2);
      const winner = results.find((result) => result.error === null)!;
      await other.evaluate(async (id) => {
        const db = await new Function("return import('/src/lib/database.ts')")();
        await db.settleGameWager({ wagerId: id, settlementSequence: 1, resultKey: "loss", creditAmount: 0 });
      }, winner.id);
      expect((await reserve(other, "after-settle")).error).toBeNull();
      await page.evaluate(async () => {
        const db = await new Function("return import('/src/lib/database.ts')")();
        await db.systemInvalidateGameWager({ wagerId: "after-settle", reason: "corrupt-state" });
      });
      expect((await reserve(page, "after-refund")).error).toBeNull();
      expect((await reserve(other, "independent", "another-session")).error).toBeNull();
    } finally { await other.close(); }
  });

  it("notifies both tabs only for committed purchases and relevant new settlements, with shared receiver cleanup", async () => {
    await seed(100_000, 20);
    const other = await context.newPage(); await other.goto(origin);
    try {
      await watchChanges(page); await watchChanges(other);
      await purchaseResult(page);
      expect((await notificationProbe(page)).calls).toEqual([1, 1]);
      await expect.poll(async () => (await notificationProbe(other)).calls).toEqual([1, 1]);
      await page.evaluate(async () => {
        const db = await new Function("return import('/src/lib/database.ts')")();
        await db.purchaseVipMembership(1_000).catch(() => undefined);
        await db.readVipStatus(); await db.readVipStatus();
        for (const id of ["refund", "forfeit", "public", "unrelated"]) {
          await db.reserveGameWager({ wagerId: id, outcomeKey: id, cabinetId: id === "unrelated" ? "old-maid" : "indian-poker",
            sessionId: "public", termsVersion: "public/1", stake: 10, reservedAmount: 10 });
        }
        await db.systemInvalidateGameWager({ wagerId: "refund", reason: "corrupt-state" });
        await db.forfeitGameWager({ wagerId: "forfeit", settlementSequence: 1 });
        await db.settleGameWager({ wagerId: "unrelated", settlementSequence: 1, resultKey: "loss", creditAmount: 0 });
        await db.settleGameWager({ wagerId: "public", settlementSequence: 1, resultKey: "loss", creditAmount: 0 });
        await db.settleGameWager({ wagerId: "public", settlementSequence: 2, resultKey: "replay", creditAmount: 100 });
        await db.reserveGameWager({ wagerId: "vip-notify", outcomeKey: "vip-notify", cabinetId: "temerosa-vip-blackjack", sessionId: "temerosa-vip-blackjack:main",
          termsVersion: "temerosa-vip-blackjack/0.1", stake: 200, reservedAmount: 200,
          counterpartyAccountId: "house:temerosa", counterpartyReservedAmount: 300, counterpartyBaseBalance: 150_000, casinoOccurredAtSecond: 1_000 });
        await db.settleGameWager({ wagerId: "vip-notify", settlementSequence: 1, resultKey: "loss", creditAmount: 0 });
        await db.settleGameWager({ wagerId: "vip-notify", settlementSequence: 2, resultKey: "replay", creditAmount: 0 });
      });
      expect(await notificationProbe(page)).toMatchObject({ calls: [3, 3], opened: 1, closed: 0 });
      await expect.poll(async () => (await notificationProbe(other)).calls).toEqual([3, 3]);
      await stopWatching(page, 0);
      expect((await notificationProbe(page)).closed).toBe(0);
      await stopWatching(page, 1); await stopWatching(page, 1);
      expect((await notificationProbe(page)).closed).toBe(1);
      // This tab has no listeners: its short-lived sender still reaches the other tab.
      await settlePublic(page, "without-listeners");
      await expect.poll(async () => (await notificationProbe(other)).calls).toEqual([4, 4]);
      expect(await notificationProbe(page)).toMatchObject({ calls: [3, 3], opened: 2, closed: 2 });
      await stopWatching(other, 0); await stopWatching(other, 1);
      await settlePublic(page, "after-cleanup");
      expect(await notificationProbe(other)).toMatchObject({ calls: [4, 4], opened: 1, closed: 1 });
    } finally { await other.close(); }
  });

  it("isolates listener and BroadcastChannel failures from successful economic commits", async () => {
    await seed(100_000, 20);
    const result = await page.evaluate(async () => {
      const NativeChannel = BroadcastChannel;
      globalThis.BroadcastChannel = class extends NativeChannel {
        override postMessage(): void { throw new Error("post failed"); }
        override close(): void { super.close(); throw new Error("close failed"); }
      };
      const vip = await new Function("return import('/src/lib/vip.ts')")();
      let calls = 0;
      const stopThrowing = vip.subscribeVipChanges(() => { throw new Error("listener failed"); });
      const stopCounting = vip.subscribeVipChanges(() => { calls++; });
      await vip.purchaseVipMembership(1_000);
      stopThrowing(); stopCounting();
      globalThis.BroadcastChannel = class extends NativeChannel {
        constructor(name: string) { super(name); super.close(); throw new Error("constructor failed"); }
      };
      const stop = vip.subscribeVipChanges(() => { calls++; });
      return { calls, membership: (await vip.readVipStatus()).membership, stop: typeof stop };
    });
    expect(result).toMatchObject({ calls: 1, membership: { price: 1_000 }, stop: "function" });
    await settlePublic(page, "broken-channel");
    expect((await snapshot()).status.completedPublicWagers).toBe(21);
  });
});

type NotificationProbe = { calls: number[]; opened: number; closed: number; stops: Array<() => void> };
type ProbeWindow = typeof globalThis & { vipProbe: NotificationProbe };
async function watchChanges(target: Page): Promise<void> {
  await target.evaluate(async () => {
    const state: NotificationProbe = { calls: [0, 0], opened: 0, closed: 0, stops: [] };
    (globalThis as ProbeWindow).vipProbe = state;
    const NativeChannel = BroadcastChannel;
    globalThis.BroadcastChannel = class extends NativeChannel {
      constructor(name: string) { super(name); state.opened++; }
      override close(): void { state.closed++; super.close(); }
    };
    const vip = await new Function("return import('/src/lib/vip.ts')")();
    state.stops = [0, 1].map((index) => vip.subscribeVipChanges(() => { state.calls[index] = state.calls[index]! + 1; }));
  });
}
async function notificationProbe(target: Page) {
  return target.evaluate(() => {
    const { calls, opened, closed } = (globalThis as ProbeWindow).vipProbe;
    return { calls, opened, closed };
  });
}
async function stopWatching(target: Page, index: number): Promise<void> {
  await target.evaluate((index) => (globalThis as ProbeWindow).vipProbe.stops[index]!(), index);
}
async function settlePublic(target: Page, id: string): Promise<void> {
  await target.evaluate(async (id) => {
    const db = await new Function("return import('/src/lib/database.ts')")();
    await db.reserveGameWager({ wagerId: id, outcomeKey: id, cabinetId: "temerosa-five-card-draw", sessionId: "public", termsVersion: "public/1", stake: 10, reservedAmount: 10 });
    await db.settleGameWager({ wagerId: id, settlementSequence: 1, resultKey: "loss", creditAmount: 0 });
  }, id);
}

async function seed(balance: number, count: number, extras = false): Promise<void> {
  // Deliberately create v9: exercise real upgrade plus legacy receipt bootstrap.
  await page.evaluate(({ balance, count, extras }) => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open("lucky-arcade", 9);
    opening.onupgradeneeded = () => {
      opening.result.createObjectStore("wallet", { keyPath: "id" });
      opening.result.createObjectStore("game-wagers", { keyPath: "wagerId" });
    };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result, tx = db.transaction(["wallet", "game-wagers"], "readwrite");
      tx.objectStore("wallet").put({ id: "wallet", contract: "wallet/0.1", balance, updatedAt: "2026-01-01T00:00:00.000Z" });
      const games = ["temerosa-match-pairs", "temerosa-slot", "indian-poker", "temerosa-high-low", "temerosa-five-card-draw"];
      for (let index = 0; index < count + (extras ? 4 : 0); index++) {
        const extra = index - count;
        tx.objectStore("game-wagers").put({ contract: "game-wager/0.1", wagerId: `legacy-${index}`, outcomeKey: `legacy-${index}`, cabinetId: extra === 2 ? "old-maid" : games[index % 5], sessionId: "public", termsVersion: "public/1", stake: 10,
          reservedAmount: extra === 3 ? 0 : 70, status: extra === 0 ? "refunded" : extra === 1 ? "forfeited" : "settled", settlementCredit: index % 2 === 0 ? 80 : 50, createdAt: "2026-01-01T00:00:00.000Z" });
      }
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }), { balance, count, extras });
}
async function purchaseResult(target: Page) {
  return target.evaluate(async () => {
    const vip = await new Function("return import('/src/lib/vip.ts')")();
    try { return await vip.purchaseVipMembership(1_000); } catch (error) { return { error: (error as Error).message }; }
  });
}
async function snapshot() {
  return page.evaluate(async () => {
    const db = await new Function("return import('/src/lib/database.ts')")();
    return { wallet: await db.readWallet(), status: await db.readVipStatus(), journal: await db.listCasinoTransactions() };
  });
}
