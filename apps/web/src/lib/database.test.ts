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
        const opening = indexedDB.open("lucky-arcade", 9);
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

  it("tops up the latest completion grant without paying the correction twice", async () => {
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const wallet = await new Function("return import('/src/lib/wallet.ts')")();
      await database.grantCompletionPoints({ sessionId: "old-rank-table", sequence: 42, cabinetId: "old-maid", spectated: false, amount: 5 });
      await database.appendMatchRecord({
        contract: "match-record/0.1", recordId: "old-rank-table#42", cabinetId: "temerosa-old-maid",
        cabinetVersion: "old-maid/0.9", packVersion: "temerosa-old-maid/0.9", sessionId: "old-rank-table",
        sequence: 42, seed: "stale-tab", completedAt: "2026-07-29T00:00:00.000Z", turns: 12,
        standings: [
          { seatId: "cpu-1", participantId: "pale", displayName: "페일", rank: 1, isPlayer: false },
          { seatId: "player", displayName: "플레이어", rank: 2, isPlayer: true },
        ],
        outcome: "win", resultHash: "stale-tab-result",
      });
      const corrected = await wallet.reconcileLatestOldMaidRankReward("old-rank-table");
      const repeated = await wallet.reconcileLatestOldMaidRankReward("old-rank-table");
      const wrongSequence = await database.topUpCompletionPoints({ sessionId: "old-rank-table", sequence: 41, expectedAmount: 60 });
      return { corrected, repeated, wrongSequence };
    });

    expect(result.corrected).toMatchObject({ correctedAmount: 25, expectedAmount: 30, rank: 2, wallet: { balance: 30 } });
    expect(result.repeated).toMatchObject({ correctedAmount: 0, expectedAmount: 30, rank: 2, wallet: { balance: 30 } });
    expect(result.wrongSequence).toMatchObject({ amount: 0, wallet: { balance: 30 } });
  });

  it("derives player period profit from realised rewards and wager receipts", async () => {
    await seedWallet(page, 200);
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const since = Math.floor(Date.now() / 1_000) - 60;
      await database.grantCompletionPoints({ sessionId: "period-grant", sequence: 1, cabinetId: "old-maid", spectated: false, amount: 30 });
      await database.reserveSpectatorPrediction({ predictionId: "period-loss", outcomeKey: "period-loss", predictedCharacterId: "alice", stake: 10, multiplier: 2 });
      await database.settleSpectatorPrediction({ predictionId: "period-loss", winningCharacterId: "bob" });
      await database.reserveGameWager({ wagerId: "period-win", outcomeKey: "period-win", cabinetId: "slot", sessionId: "period-slot", termsVersion: "test/0.1", stake: 10, reservedAmount: 40 });
      await database.settleGameWager({ wagerId: "period-win", settlementSequence: 1, resultKey: "win", creditAmount: 100 });
      await database.reserveGameWager({ wagerId: "period-pending", outcomeKey: "period-pending", cabinetId: "slot", sessionId: "period-slot", termsVersion: "test/0.1", stake: 10, reservedAmount: 10 });
      return { profit: await database.readPlayerCasinoProfitSince(since), future: await database.readPlayerCasinoProfitSince(since + 120) };
    });
    expect(result.profit).toBe(70);
    expect(result.future).toBe(0);
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

  it("backs new spectator predictions with the house escrow", async () => {
    await seedWallet(page, 100);
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const reserved = await database.reserveSpectatorPrediction({
        predictionId: "house-prediction", outcomeKey: "temerosa-old-maid|round", predictedCharacterId: "alice", stake: 10, multiplier: 2,
        counterpartyAccountId: "house:temerosa", counterpartyReservedAmount: 20, counterpartyBaseBalance: 150_000,
        casinoOccurredAtSecond: 2_000, casinoTableId: "temerosa-old-maid",
      });
      const settled = await database.settleSpectatorPrediction({ predictionId: "house-prediction", winningCharacterId: "alice" });
      const repeated = await database.settleSpectatorPrediction({ predictionId: "house-prediction", winningCharacterId: "bob" });
      return { reserved, settled, repeated, journal: await database.listCasinoTransactions() };
    });
    expect(result.reserved).toMatchObject({ wallet: { balance: 80 }, prediction: { counterpartyAccountId: "house:temerosa", counterpartyReservedAmount: 20 } });
    expect(result.settled).toMatchObject({ wallet: { balance: 120 }, prediction: { status: "won", settlementCredit: 40 } });
    expect(result.repeated).toEqual(result.settled);
    expect(result.journal).toHaveLength(2);
    expect(result.journal.flatMap((transaction: { postings: Array<{ delta: number }> }) => transaction.postings).reduce((sum: number, posting: { delta: number }) => sum + posting.delta, 0)).toBe(0);
  });

  it("reads legacy 0.1 predictions as 3x without changing their historical debit", async () => {
    await seedWallet(page, 90);
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      await database.readWallet();
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("lucky-arcade", 9);
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

  it("reserves, settles, forfeits, and system-refunds generic game wagers exactly once", async () => {
    await seedWallet(page, 200);
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const base = { cabinetId: "slot", termsVersion: "slot-wager/0.1", stake: 10 };
      const reserved = await database.reserveGameWager({ ...base, wagerId: "generic-win", outcomeKey: "slot:seed-1", sessionId: "slot-session-1", choiceKey: "line-1", reservedAmount: 40 });
      let duplicateIdError = "";
      try { await database.reserveGameWager({ ...base, wagerId: "generic-win", outcomeKey: "slot:other-seed", sessionId: "slot-session-2", reservedAmount: 10 }); }
      catch (caught) { duplicateIdError = caught instanceof Error ? caught.message : String(caught); }
      let replayError = "";
      try { await database.reserveGameWager({ ...base, wagerId: "generic-replay", outcomeKey: "slot:seed-1", sessionId: "slot-session-2", reservedAmount: 10 }); }
      catch (caught) { replayError = caught instanceof Error ? caught.message : String(caught); }
      const settled = await database.settleGameWager({ wagerId: "generic-win", settlementSequence: 9, resultKey: "triple-symbol", creditAmount: 100 });
      const settledAgain = await database.settleGameWager({ wagerId: "generic-win", settlementSequence: 10, resultKey: "changed", creditAmount: 999 });
      await database.reserveGameWager({ ...base, wagerId: "generic-loss", outcomeKey: "slot:seed-2", sessionId: "slot-session-2", reservedAmount: 20 });
      const forfeited = await database.forfeitGameWager({ wagerId: "generic-loss", settlementSequence: 3, resultKey: "abandoned" });
      const forfeitedAgain = await database.forfeitGameWager({ wagerId: "generic-loss", settlementSequence: 4 });
      await database.reserveGameWager({ ...base, wagerId: "generic-refund", outcomeKey: "slot:seed-3", sessionId: "slot-session-2", reservedAmount: 30 });
      const refunded = await database.systemInvalidateGameWager({ wagerId: "generic-refund", reason: "version-mismatch" });
      const refundedAgain = await database.systemInvalidateGameWager({ wagerId: "generic-refund", reason: "version-mismatch" });
      return { reserved, duplicateIdError, replayError, settled, settledAgain, forfeited, forfeitedAgain, refunded, refundedAgain, session: await database.listGameWagers("slot-session-2"), wallet: await database.readWallet() };
    });

    expect(result.reserved).toMatchObject({ wallet: { balance: 160 }, wager: { status: "reserved", reservedAmount: 40 } });
    expect(result.duplicateIdError).toBe("game_wager_already_exists");
    expect(result.replayError).toBe("game_outcome_already_wagered");
    expect(result.settled).toMatchObject({ wallet: { balance: 260 }, wager: { status: "settled", settlementSequence: 9, settlementCredit: 100 } });
    expect(result.settledAgain).toEqual(result.settled);
    expect(result.forfeited).toMatchObject({ wallet: { balance: 240 }, wager: { status: "forfeited", settlementCredit: 0 } });
    expect(result.forfeitedAgain).toEqual(result.forfeited);
    expect(result.refunded).toMatchObject({ wallet: { balance: 240 }, wager: { status: "refunded", settlementCredit: 30 } });
    expect(result.refundedAgain).toEqual(result.refunded);
    expect(result.session).toHaveLength(2);
    expect(result.wallet.balance).toBe(240);
  });

  it("atomically escrows both player and NPC funds in the casino journal", async () => {
    await seedWallet(page, 200);
    const result = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const reserved = await database.reserveGameWager({
        wagerId: "npc-heads-up",
        outcomeKey: "npc-heads-up:seed",
        cabinetId: "temerosa-match-pairs",
        sessionId: "npc-heads-up-session",
        termsVersion: "match-pairs/1.0",
        stake: 10,
        reservedAmount: 40,
        counterpartyAccountId: "npc:lyla",
        counterpartyReservedAmount: 60,
        counterpartyBaseBalance: 100,
        casinoOccurredAtSecond: 1_000,
      });
      const before = await database.listCasinoTransactions();
      const settled = await database.settleGameWager({ wagerId: "npc-heads-up", settlementSequence: 4, resultKey: "player-win", creditAmount: 100 });
      const settledAgain = await database.settleGameWager({ wagerId: "npc-heads-up", settlementSequence: 5, resultKey: "replay", creditAmount: 0 });
      let insufficient = "";
      try {
        await database.reserveGameWager({
          wagerId: "npc-heads-up-2", outcomeKey: "npc-heads-up:seed-2", cabinetId: "temerosa-match-pairs", sessionId: "npc-heads-up-session",
          termsVersion: "match-pairs/1.0", stake: 10, reservedAmount: 20, counterpartyAccountId: "npc:lyla", counterpartyReservedAmount: 50,
          counterpartyBaseBalance: 100, casinoOccurredAtSecond: 1_010,
        });
      } catch (caught) { insufficient = caught instanceof Error ? caught.message : String(caught); }
      return { reserved, before, settled, settledAgain, insufficient, after: await database.listCasinoTransactions() };
    });

    expect(result.reserved).toMatchObject({ wallet: { balance: 160 }, wager: { counterpartyAccountId: "npc:lyla", counterpartyReservedAmount: 60 } });
    expect(result.before).toHaveLength(1);
    expect(result.before[0].postings).toEqual([
      { accountId: "npc:lyla", delta: -60 },
      { accountId: "player:local", delta: -40 },
      { accountId: "escrow:npc-heads-up", delta: 100 },
    ]);
    expect(result.settled).toMatchObject({ wallet: { balance: 260 }, wager: { status: "settled", settlementCredit: 100 } });
    expect(result.settledAgain).toEqual(result.settled);
    expect(result.insufficient).toBe("casino_counterparty_insufficient_points");
    expect(result.after).toHaveLength(2);
    expect(result.after.flatMap((transaction: { postings: Array<{ delta: number }> }) => transaction.postings).reduce((sum: number, posting: { delta: number }) => sum + posting.delta, 0)).toBe(0);
  });

  it("serializes generic reservations across tabs", async () => {
    await seedWallet(page, 100);
    const other = await context.newPage();
    await other.goto(`${origin}${TEST_PATH}`);
    const reserve = (target: Page, wagerId: string) => target.evaluate(async (id) => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      try {
        const result = await database.reserveGameWager({ wagerId: id, outcomeKey: `race:${id}`, cabinetId: "derby", sessionId: id, termsVersion: "derby-wager/0.1", stake: 50, reservedAmount: 100 });
        return { ok: true, balance: result.wallet.balance };
      } catch (caught) {
        return { ok: false, error: caught instanceof Error ? caught.message : String(caught) };
      }
    }, wagerId);
    const results = await Promise.all([reserve(page, "generic-tab-a"), reserve(other, "generic-tab-b")]);
    await other.close();

    expect(results.filter((entry) => entry.ok)).toHaveLength(1);
    expect(results.filter((entry) => !entry.ok)).toEqual([{ ok: false, error: "insufficient_points" }]);
    expect((await page.evaluate(async () => (await (await new Function("return import('/src/lib/database.ts')")()).readWallet()).balance))).toBe(0);
  });

  it("stores a favorite-cup vote receipt idempotently", async () => {
    const records = await page.evaluate(async () => {
      const database = await new Function("return import('/src/lib/database.ts')")();
      const vote = {
        contract: "temerosa-favorite-vote/0.1", voteId: "tournament:0", seasonId: "local-preseason-0", tournamentId: "tournament",
        mode: "portrait", leftAssetId: "left", rightAssetId: "right", winnerAssetId: "left", loserAssetId: "right",
        round: 1, seed: "seed", pickedAt: "2026-07-30T00:00:00.000Z",
      };
      await database.appendTemerosaFavoriteVote(vote);
      await database.appendTemerosaFavoriteVote(vote);
      return database.listTemerosaFavoriteVotes();
    });
    expect(records).toEqual([expect.objectContaining({ voteId: "tournament:0", winnerAssetId: "left" })]);
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
      const opening = indexedDB.open("lucky-arcade", 9);
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
