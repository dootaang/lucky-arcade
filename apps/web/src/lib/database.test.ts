import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

const TEST_PATH = "/__economy-test__";
let browser: Browser;
let context: BrowserContext;
let page: Page;
let server: ViteDevServer;
let origin: string;

describe.sequential("point wallet and spectator predictions", () => {
  beforeAll(async () => {
    server = await createServer({
      root: fileURLToPath(new URL("../..", import.meta.url)),
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
      plugins: [{
        name: "economy-test-page",
        configureServer(devServer) {
          devServer.middlewares.use(TEST_PATH, (_request, response) => {
            response.setHeader("Content-Type", "text/html");
            response.end("<!doctype html><title>economy test</title>");
          });
        },
      }],
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("vite_test_server_failed");
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto(`${origin}${TEST_PATH}`);
  });

  beforeEach(async () => {
    await deleteEconomyDatabase(page);
  });

  afterAll(async () => {
    await page?.close();
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  it("preserves a legacy 100 balance and medal grant one-to-one", async () => {
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open("lucky-arcade", 5);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        db.createObjectStore("wallet", { keyPath: "id" }).put({ contract: "wallet/0.1", id: "wallet", balance: 100, updatedAt: "2026-01-01T00:00:00.000Z" });
        db.createObjectStore("grants", { keyPath: "sessionId" }).put({ contract: "medal-grant/0.1", sessionId: "legacy-session", highestSequence: 7, updatedAt: "2026-01-01T00:00:00.000Z" });
      };
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => { opening.result.close(); resolve(); };
    }));

    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const wallet = await database.readWallet();
      const duplicate = await database.grantCompletionPoints({ sessionId: "legacy-session", sequence: 7, cabinetId: "old-maid", spectated: false });
      const contract = await new Promise<string>((resolve, reject) => {
        const opening = indexedDB.open("lucky-arcade", 6);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const request = db.transaction("grants", "readonly").objectStore("grants").get("legacy-session");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => { resolve(request.result.contract); db.close(); };
        };
      });
      return { wallet, duplicate, contract };
    });

    expect(result.wallet.balance).toBe(100);
    expect(result.duplicate).toMatchObject({ amount: 0, wallet: { balance: 100 } });
    expect(result.contract).toBe("medal-grant/0.1");
  });

  it("creates new wallets at 0 P and grants direct completion +5 only once", async () => {
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const initial = await database.readWallet();
      const first = await database.grantCompletionPoints({ sessionId: "play-1", sequence: 9, cabinetId: "old-maid", spectated: false });
      const repeated = await database.grantCompletionPoints({ sessionId: "play-1", sequence: 9, cabinetId: "old-maid", spectated: false });
      const spectated = await database.grantCompletionPoints({ sessionId: "spectate-1", sequence: 9, cabinetId: "old-maid", spectated: true });
      return { initial, first, repeated, spectated };
    });

    expect(result.initial.balance).toBe(0);
    expect(result.first).toMatchObject({ amount: 5, wallet: { balance: 5 } });
    expect(result.repeated).toMatchObject({ amount: 0, wallet: { balance: 5 } });
    expect(result.spectated).toMatchObject({ amount: 0, wallet: { balance: 5 } });
  });

  it("grants a caller-selected rank reward idempotently", async () => {
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const first = await database.grantCompletionPoints({ sessionId: "ranked-play", sequence: 4, cabinetId: "old-maid", spectated: false, amount: 10 });
      const repeated = await database.grantCompletionPoints({ sessionId: "ranked-play", sequence: 4, cabinetId: "old-maid", spectated: false, amount: 1 });
      const next = await database.grantCompletionPoints({ sessionId: "ranked-play", sequence: 8, cabinetId: "old-maid", spectated: false, amount: 3 });
      let invalid = "";
      try { await database.grantCompletionPoints({ sessionId: "invalid", sequence: 1, cabinetId: "old-maid", spectated: false, amount: -1 }); }
      catch (caught) { invalid = caught instanceof Error ? caught.message : String(caught); }
      return { first, repeated, next, invalid };
    });

    expect(result.first).toMatchObject({ amount: 10, wallet: { balance: 10 } });
    expect(result.repeated).toMatchObject({ amount: 0, wallet: { balance: 10 } });
    expect(result.next).toMatchObject({ amount: 3, wallet: { balance: 13 } });
    expect(result.invalid).toBe("invalid_completion_reward");
  });

  it("reserves valid stakes, supports multiple reservations, and never overdrafts", async () => {
    await seedWallet(page, 100);
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const first = await database.reserveSpectatorPrediction({ predictionId: "p-1", outcomeKey: "outcome-1", predictedCharacterId: "alice", stake: 10, multiplier: 2 });
      const second = await database.reserveSpectatorPrediction({ predictionId: "p-2", outcomeKey: "outcome-2", market: "first-place", predictedCharacterId: "player", stake: 10, multiplier: 5 });
      let error = "";
      try { await database.reserveSpectatorPrediction({ predictionId: "p-3", outcomeKey: "outcome-3", predictedCharacterId: "carol", stake: 50, multiplier: 2 }); }
      catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
      return { first, second, error, wallet: await database.readWallet() };
    });

    expect(result.first).toMatchObject({ wallet: { balance: 80 }, prediction: { market: "joker-holder", status: "reserved", stake: 10, multiplier: 2, reservedAmount: 20 } });
    expect(result.second).toMatchObject({ wallet: { balance: 30 }, prediction: { market: "first-place", predictedCharacterId: "player", status: "reserved", stake: 10, multiplier: 5, reservedAmount: 50 } });
    expect(result.error).toBe("insufficient_points");
    expect(result.wallet.balance).toBe(30);
  });

  it("settles wins and losses idempotently and blocks paid replay by outcomeKey", async () => {
    await seedWallet(page, 100);
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      await database.reserveSpectatorPrediction({ predictionId: "win", outcomeKey: "same-seed", predictedCharacterId: "alice", stake: 10, multiplier: 3 });
      const won = await database.settleSpectatorPrediction({ predictionId: "win", winningCharacterId: "alice" });
      const wonAgain = await database.settleSpectatorPrediction({ predictionId: "win", winningCharacterId: "someone-else" });
      let replayError = "";
      try { await database.reserveSpectatorPrediction({ predictionId: "replay", outcomeKey: "same-seed", predictedCharacterId: "bob", stake: 10, multiplier: 2 }); }
      catch (caught) { replayError = caught instanceof Error ? caught.message : String(caught); }
      await database.reserveSpectatorPrediction({ predictionId: "loss", outcomeKey: "other-seed", predictedCharacterId: "bob", stake: 10, multiplier: 5 });
      const lost = await database.settleSpectatorPrediction({ predictionId: "loss", winningCharacterId: "alice" });
      const lostAgain = await database.settleSpectatorPrediction({ predictionId: "loss", winningCharacterId: "bob" });
      return { won, wonAgain, replayError, lost, lostAgain, wallet: await database.readWallet() };
    });

    expect(result.won).toMatchObject({ wallet: { balance: 130 }, prediction: { status: "won", settlementCredit: 60, multiplier: 3 } });
    expect(result.wonAgain).toEqual(result.won);
    expect(result.replayError).toBe("outcome_already_wagered");
    expect(result.lost).toMatchObject({ wallet: { balance: 80 }, prediction: { status: "lost", settlementCredit: 0 } });
    expect(result.lostAgain).toEqual(result.lost);
    expect(result.wallet.balance).toBe(80);
  });

  it("persists reservations across page re-entry and system-refunds unresolved outcomes once", async () => {
    await seedWallet(page, 50);
    await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      await database.reserveSpectatorPrediction({ predictionId: "pending", outcomeKey: "pending-outcome", predictedCharacterId: "alice", stake: 10, multiplier: 5 });
    });
    const reloaded = await context.newPage();
    await reloaded.goto(`${origin}${TEST_PATH}`);
    const result = await reloaded.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const before = await database.listSpectatorPredictions();
      const refunded = await database.systemInvalidateSpectatorPrediction({ predictionId: "pending", reason: "outcome-unavailable" });
      const refundedAgain = await database.systemInvalidateSpectatorPrediction({ predictionId: "pending", reason: "outcome-unavailable" });
      return { before, refunded, refundedAgain, wallet: await database.readWallet() };
    });
    await reloaded.close();

    expect(result.before).toHaveLength(1);
    expect(result.before[0]).toMatchObject({ predictionId: "pending", status: "reserved" });
    expect(result.refunded).toMatchObject({ wallet: { balance: 50 }, prediction: { status: "refunded", settlementCredit: 50 } });
    expect(result.refundedAgain).toEqual(result.refunded);
    expect(result.wallet.balance).toBe(50);
  });

  it("reads legacy 0.1 predictions as 3x without changing their historical debit", async () => {
    await seedWallet(page, 90);
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      await database.readWallet();
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("lucky-arcade", 6);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const transaction = db.transaction("wagers", "readwrite");
          transaction.objectStore("wagers").add({ contract: "spectator-prediction/0.1", predictionId: "legacy", outcomeKey: "legacy-outcome", predictedCharacterId: "alice", stake: 10, status: "reserved", createdAt: new Date(0).toISOString(), settlementCredit: 0 });
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
      const listed = await database.listSpectatorPredictions();
      const settled = await database.settleSpectatorPrediction({ predictionId: "legacy", winningCharacterId: "alice" });
      return { listed, settled };
    });
    expect(result.listed[0]).toMatchObject({ contract: "spectator-prediction/0.3", market: "joker-holder", multiplier: 3, reservedAmount: 10 });
    expect(result.settled).toMatchObject({ wallet: { balance: 130 }, prediction: { multiplier: 3, settlementCredit: 40 } });
  });

  it("serializes simultaneous tabs so reservations cannot exceed the wallet", async () => {
    await seedWallet(page, 400);
    const other = await context.newPage();
    await other.goto(`${origin}${TEST_PATH}`);
    const reserve = (target: Page, predictionId: string, outcomeKey: string) => target.evaluate(async ({ predictionId, outcomeKey }) => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      try {
        const result = await database.reserveSpectatorPrediction({ predictionId, outcomeKey, predictedCharacterId: "alice", stake: 200, multiplier: 2 });
        return { ok: true, balance: result.wallet.balance };
      } catch (caught) {
        return { ok: false, error: caught instanceof Error ? caught.message : String(caught) };
      }
    }, { predictionId, outcomeKey });
    const results = await Promise.all([reserve(page, "tab-a", "tab-outcome-a"), reserve(other, "tab-b", "tab-outcome-b")]);
    const balance = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      return (await database.readWallet()).balance;
    });
    await other.close();

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "insufficient_points" }]);
    expect(balance).toBe(0);
  });
});

async function deleteEconomyDatabase(target: Page): Promise<void> {
  await target.evaluate(() => new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase("lucky-arcade");
    deletion.onerror = () => reject(deletion.error);
    deletion.onblocked = () => reject(new Error("indexeddb_delete_blocked"));
    deletion.onsuccess = () => resolve();
  }));
}

async function seedWallet(target: Page, balance: number): Promise<void> {
  await target.evaluate(async (nextBalance) => {
    const database = await new Function("return import('/src/lib/database.ts')")();
    await database.readWallet();
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open("lucky-arcade", 6);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const transaction = db.transaction("wallet", "readwrite");
        transaction.objectStore("wallet").put({ contract: "wallet/0.1", id: "wallet", balance: nextBalance, updatedAt: "2026-01-01T00:00:00.000Z" });
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => { db.close(); resolve(); };
      };
    });
  }, balance);
}
