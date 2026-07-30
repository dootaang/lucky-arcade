import type { AnalyzedCard, AnyAnalyzedCard } from "@lucky-arcade/contracts";
import {
  LOCAL_PLAYER_ACCOUNT_ID,
  assertCasinoTransaction,
  createCollectionPurchaseTransaction,
  createFreePlayRewardTransaction,
  reserveCasinoEscrow,
  settleCasinoEscrow,
  type CasinoTransaction,
} from "@lucky-arcade/casino-ledger";
import type {
  CollectionSnapshot,
  CompletionPointGrant,
  CompletionPointGrantInput,
  ForfeitGameWagerInput,
  GameWagerReceipt,
  GameWagerTransactionResult,
  InvalidateGameWagerInput,
  InvalidateSpectatorPredictionInput,
  MatchRecord,
  MedalGrantInput,
  PointGrant,
  PointWalletSnapshot,
  PredictionMultiplier,
  PredictionTransactionResult,
  RecentPlay,
  ReserveGameWagerInput,
  ReserveSpectatorPredictionInput,
  SettleGameWagerInput,
  SettleSpectatorPredictionInput,
  SnapshotRecord,
  SpectatorPrediction,
  StoredActionReceipt,
  WalletSnapshot,
} from "@lucky-arcade/persistence";
import { selectCollectionFace } from "./collection-rules.ts";

const DATABASE = "lucky-arcade";
const VERSION = 8;
const STORES = { cards: "cards", sources: "sources", sessions: "sessions", actions: "actions", recent: "recent", matches: "matches", wallet: "wallet", grants: "grants", collection: "collection", wagers: "wagers", gameWagers: "game-wagers", casinoTransactions: "casino-transactions" } as const;
const INITIAL_POINT_BALANCE = 0;
const COLLECTION_COST = 12;
const DEFAULT_COMPLETION_REWARD = 5;
const VALID_STAKES = new Set([10, 50, 200]);
const VALID_MULTIPLIERS = new Set<PredictionMultiplier>([2, 3, 4, 5]);
const VALID_MARKETS = new Set(["joker-holder", "first-place"]);
const INVALIDATION_REASONS = new Set(["outcome-unavailable", "pack-version-mismatch", "corrupt-state"]);
const GAME_WAGER_INVALIDATION_REASONS = new Set(["outcome-unavailable", "version-mismatch", "corrupt-state"]);

export interface StoredCard { fingerprint: string; importedAt: string; analyzed: AnyAnalyzedCard; }

export async function saveCard(analyzed: AnalyzedCard, source: File): Promise<StoredCard> {
  const record = { fingerprint: analyzed.report.card.fingerprint, importedAt: new Date().toISOString(), analyzed } satisfies StoredCard;
  const db = await openDatabase(), transaction = db.transaction([STORES.cards, STORES.sources], "readwrite");
  transaction.objectStore(STORES.cards).put(record);
  transaction.objectStore(STORES.sources).put(source, record.fingerprint);
  await complete(transaction); db.close(); return record;
}
export async function listCards(): Promise<StoredCard[]> {
  const db = await openDatabase(), transaction = db.transaction(STORES.cards, "readonly");
  const output = await request<StoredCard[]>(transaction.objectStore(STORES.cards).getAll());
  await complete(transaction); db.close();
  return output
    .filter((item) => item?.analyzed?.contract === "analyzed-card/0.1" || item?.analyzed?.contract === "analyzed-card/0.2" || item?.analyzed?.contract === "analyzed-card/0.3")
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}
export async function loadCardSource(fingerprint: string): Promise<File | null> {
  const db = await openDatabase(), transaction = db.transaction(STORES.sources, "readonly");
  const output = await request<File | undefined>(transaction.objectStore(STORES.sources).get(fingerprint));
  await complete(transaction); db.close(); return output ?? null;
}
export async function replaceAnalyzedCard(previous: StoredCard, analyzed: AnalyzedCard): Promise<StoredCard> {
  const record = { ...previous, analyzed } satisfies StoredCard;
  const db = await openDatabase(), transaction = db.transaction(STORES.cards, "readwrite");
  transaction.objectStore(STORES.cards).put(record);
  await complete(transaction); db.close(); return record;
}
export async function saveSnapshot<State>(snapshot: SnapshotRecord<State>, recent?: RecentPlay): Promise<void> {
  const stores = recent ? [STORES.sessions, STORES.recent, STORES.actions] : [STORES.sessions, STORES.actions];
  const db = await openDatabase(), transaction = db.transaction(stores, "readwrite");
  transaction.objectStore(STORES.sessions).put(snapshot);
  if (recent) transaction.objectStore(STORES.recent).put(recent);
  deleteActionsThrough(transaction.objectStore(STORES.actions), snapshot.sessionId, snapshot.sequence);
  await complete(transaction); db.close();
}
export async function loadSnapshot<State>(sessionId: string): Promise<SnapshotRecord<State> | null> {
  const db = await openDatabase(), transaction = db.transaction(STORES.sessions, "readonly");
  const result = await request<SnapshotRecord<State> | undefined>(transaction.objectStore(STORES.sessions).get(sessionId));
  await complete(transaction); db.close(); return result ?? null;
}
export async function appendAction<Action>(sessionId: string, receipt: StoredActionReceipt<Action>): Promise<void> {
  const db = await openDatabase(), transaction = db.transaction(STORES.actions, "readwrite");
  transaction.objectStore(STORES.actions).put({ ...receipt, sessionId, key: `${sessionId}:${String(receipt.sequence).padStart(10, "0")}` });
  await complete(transaction); db.close();
}
export async function listActionsAfter<Action>(sessionId: string, sequence: number): Promise<StoredActionReceipt<Action>[]> {
  const db = await openDatabase(), transaction = db.transaction(STORES.actions, "readonly");
  const range = IDBKeyRange.bound([sessionId, sequence], [sessionId, Number.MAX_SAFE_INTEGER], true, false);
  const all = await request<Array<StoredActionReceipt<Action> & { sessionId: string }>>(transaction.objectStore(STORES.actions).index("by-session-sequence").getAll(range));
  await complete(transaction); db.close();
  return all.sort((a, b) => a.sequence - b.sequence);
}
export async function truncateActionsAfter(sessionId: string, sequence: number): Promise<void> {
  const db = await openDatabase(), transaction = db.transaction(STORES.actions, "readwrite");
  deleteActionsAfter(transaction.objectStore(STORES.actions), sessionId, sequence);
  await complete(transaction); db.close();
}
export async function listRecentPlays(): Promise<RecentPlay[]> {
  const db = await openDatabase(), transaction = db.transaction(STORES.recent, "readonly");
  const output = await request<RecentPlay[]>(transaction.objectStore(STORES.recent).getAll());
  await complete(transaction); db.close();
  return output.filter((item) => item?.contract === "recent-play/0.1").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function appendMatchRecord(record: MatchRecord): Promise<void> {
  const db = await openDatabase(), transaction = db.transaction(STORES.matches, "readwrite");
  transaction.objectStore(STORES.matches).put(record);
  await complete(transaction); db.close();
}

export async function listMatchRecordsForSession(sessionId: string, limit: number): Promise<MatchRecord[]> {
  const db = await openDatabase(), transaction = db.transaction(STORES.matches, "readonly");
  const index = transaction.objectStore(STORES.matches).index("by-session-completed-at");
  const range = IDBKeyRange.bound([sessionId, ""], [sessionId, "\uffff"]);
  const output = await collectCursor<MatchRecord>(index.openCursor(range, "prev"), Math.max(0, limit));
  await complete(transaction); db.close(); return output;
}

export async function pruneMatchRecords(maxRecords: number): Promise<void> {
  const db = await openDatabase(), transaction = db.transaction(STORES.matches, "readwrite");
  const store = transaction.objectStore(STORES.matches);
  const count = await request(store.count());
  let remaining = Math.max(0, count - Math.max(0, maxRecords));
  if (remaining > 0) {
    const cursorRequest = store.index("by-completed-at").openKeyCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || remaining <= 0) return;
      store.delete(cursor.primaryKey);
      remaining -= 1;
      cursor.continue();
    };
  }
  await complete(transaction); db.close();
}

export async function readWallet(): Promise<WalletSnapshot> {
  const db = await openDatabase(), transaction = db.transaction(STORES.wallet, "readwrite");
  const store = transaction.objectStore(STORES.wallet);
  let wallet = await request<PointWalletSnapshot | undefined>(store.get("wallet"));
  if (!wallet) {
    wallet = newWallet();
    store.put(wallet);
  }
  await complete(transaction); db.close(); return wallet;
}

export async function grantCompletionPoints(input: CompletionPointGrantInput): Promise<{ wallet: PointWalletSnapshot; amount: number }> {
  const reward = input.amount ?? DEFAULT_COMPLETION_REWARD;
  if (!Number.isSafeInteger(reward) || reward < 0) throw new Error("invalid_completion_reward");
  const db = await openDatabase(), transaction = db.transaction([STORES.wallet, STORES.grants, STORES.casinoTransactions], "readwrite");
  const wallets = transaction.objectStore(STORES.wallet), grants = transaction.objectStore(STORES.grants);
  const storedWallet = await request<PointWalletSnapshot | undefined>(wallets.get("wallet"));
  const current = storedWallet ?? newWallet();
  const previousGrant = await request<PointGrant | undefined>(grants.get(input.sessionId));
  if (input.spectated || (previousGrant?.highestSequence ?? -1) >= input.sequence) {
    if (!storedWallet) wallets.put(current);
    await complete(transaction); db.close(); return { wallet: current, amount: 0 };
  }
  const now = new Date().toISOString();
  const wallet: PointWalletSnapshot = { ...current, balance: current.balance + reward, updatedAt: now };
  wallets.put(wallet);
  grants.put({ contract: "point-grant/0.1", sessionId: input.sessionId, highestSequence: input.sequence, amount: reward, updatedAt: now } satisfies CompletionPointGrant);
  if (reward > 0) transaction.objectStore(STORES.casinoTransactions).add(createFreePlayRewardTransaction({
    transactionId: `free-play:${input.sessionId}:${input.sequence}`,
    occurredAtCasinoSecond: input.casinoOccurredAtSecond ?? Math.floor(Date.now() / 1_000),
    amount: reward,
    matchId: `${input.cabinetId}:${input.sessionId}:${input.sequence}`,
  }));
  await complete(transaction); db.close(); return { wallet, amount: reward };
}

export async function topUpCompletionPoints(input: { sessionId: string; sequence: number; expectedAmount: number; casinoOccurredAtSecond?: number }): Promise<{ wallet: PointWalletSnapshot; amount: number }> {
  if (!input.sessionId || !Number.isSafeInteger(input.sequence) || input.sequence < 0 || !Number.isSafeInteger(input.expectedAmount) || input.expectedAmount < 0) throw new Error("invalid_completion_top_up");
  const db = await openDatabase(), transaction = db.transaction([STORES.wallet, STORES.grants, STORES.casinoTransactions], "readwrite");
  const wallets = transaction.objectStore(STORES.wallet), grants = transaction.objectStore(STORES.grants);
  const storedWallet = await request<PointWalletSnapshot | undefined>(wallets.get("wallet"));
  const wallet = storedWallet ?? newWallet();
  const grant = await request<PointGrant | undefined>(grants.get(input.sessionId));
  if (!grant || grant.contract !== "point-grant/0.1" || grant.highestSequence !== input.sequence || grant.amount >= input.expectedAmount) {
    if (!storedWallet) wallets.put(wallet);
    await complete(transaction); db.close(); return { wallet, amount: 0 };
  }
  const amount = input.expectedAmount - grant.amount;
  const now = new Date().toISOString();
  const nextWallet: PointWalletSnapshot = { ...wallet, balance: wallet.balance + amount, updatedAt: now };
  wallets.put(nextWallet);
  grants.put({ ...grant, amount: input.expectedAmount, updatedAt: now } satisfies CompletionPointGrant);
  transaction.objectStore(STORES.casinoTransactions).add(createFreePlayRewardTransaction({
    transactionId: `free-play-top-up:${input.sessionId}:${input.sequence}:${input.expectedAmount}`,
    occurredAtCasinoSecond: input.casinoOccurredAtSecond ?? Math.floor(Date.now() / 1_000),
    amount,
    matchId: `old-maid:${input.sessionId}:${input.sequence}`,
  }));
  await complete(transaction); db.close(); return { wallet: nextWallet, amount };
}

/** @deprecated Kept until non-old-maid callers adopt the point-named API. */
export function grantMedals(input: MedalGrantInput): Promise<{ wallet: PointWalletSnapshot; amount: number }> {
  return grantCompletionPoints(input);
}

export async function reserveSpectatorPrediction(input: ReserveSpectatorPredictionInput): Promise<PredictionTransactionResult> {
  assertPredictionInput(input);
  const db = await openDatabase();
  const transaction = db.transaction([STORES.wallet, STORES.wagers, STORES.casinoTransactions], "readwrite");
  const completion = complete(transaction);
  try {
    const wallets = transaction.objectStore(STORES.wallet);
    const wagers = transaction.objectStore(STORES.wagers);
    const existingId = await request<IDBValidKey | undefined>(wagers.index("by-outcome-key").getKey(input.outcomeKey));
    if (existingId !== undefined) throw new Error("outcome_already_wagered");
    const wallet = await request<PointWalletSnapshot | undefined>(wallets.get("wallet")) ?? newWallet();
    const reservedAmount = input.stake * input.multiplier;
    if (wallet.balance < reservedAmount) throw new Error("insufficient_points");
    if (input.counterpartyAccountId) {
      const journal = transaction.objectStore(STORES.casinoTransactions);
      const existing = await request<CasinoTransaction[]>(journal.getAll());
      if (input.counterpartyBaseBalance! + casinoAccountDelta(existing, input.counterpartyAccountId) < input.counterpartyReservedAmount!) throw new Error("casino_counterparty_insufficient_points");
      journal.add(reserveCasinoEscrow({
        wagerId: `prediction:${input.predictionId}`,
        idempotencyKey: `casino-prediction:${input.predictionId}:reserve`,
        occurredAtCasinoSecond: input.casinoOccurredAtSecond!,
        reservations: { [LOCAL_PLAYER_ACCOUNT_ID]: reservedAmount, [input.counterpartyAccountId]: input.counterpartyReservedAmount! },
        matchId: `prediction:${input.predictionId}`,
        tableId: input.casinoTableId!,
        termsVersion: "spectator-prediction/0.3",
        stake: input.stake,
      }).transaction);
    }
    const now = new Date().toISOString();
    const nextWallet: PointWalletSnapshot = { ...wallet, balance: wallet.balance - reservedAmount, updatedAt: now };
    const prediction: SpectatorPrediction = {
      contract: "spectator-prediction/0.3",
      predictionId: input.predictionId,
      outcomeKey: input.outcomeKey,
      market: input.market ?? "joker-holder",
      predictedCharacterId: input.predictedCharacterId,
      stake: input.stake,
      multiplier: input.multiplier,
      reservedAmount,
      status: "reserved",
      createdAt: now,
      settlementCredit: 0,
      ...(input.counterpartyAccountId ? {
        counterpartyAccountId: input.counterpartyAccountId,
        counterpartyReservedAmount: input.counterpartyReservedAmount,
        casinoOccurredAtSecond: input.casinoOccurredAtSecond,
        casinoTableId: input.casinoTableId,
      } : {}),
    };
    wallets.put(nextWallet);
    wagers.add(prediction);
    await completion;
    db.close();
    return { wallet: nextWallet, prediction };
  } catch (error) {
    await abort(transaction, completion);
    db.close();
    if (isConstraintError(error)) throw new Error("outcome_already_wagered");
    throw error;
  }
}

export async function settleSpectatorPrediction(input: SettleSpectatorPredictionInput): Promise<PredictionTransactionResult> {
  if (!input.predictionId || !input.winningCharacterId) throw new Error("invalid_prediction_settlement");
  const db = await openDatabase();
  const transaction = db.transaction([STORES.wallet, STORES.wagers, STORES.casinoTransactions], "readwrite");
  const completion = complete(transaction);
  try {
    const wallets = transaction.objectStore(STORES.wallet);
    const wagers = transaction.objectStore(STORES.wagers);
    const stored = await request<StoredSpectatorPrediction | undefined>(wagers.get(input.predictionId));
    if (!stored) throw new Error("prediction_not_found");
    const prediction = normalizePrediction(stored);
    const wallet = await request<PointWalletSnapshot | undefined>(wallets.get("wallet")) ?? newWallet();
    if (prediction.status === "won" || prediction.status === "lost") {
      await completion;
      db.close();
      return { wallet, prediction };
    }
    if (prediction.status !== "reserved") throw new Error("prediction_not_settleable");
    const won = prediction.predictedCharacterId === input.winningCharacterId;
    const settlementCredit = won ? prediction.reservedAmount + prediction.stake * prediction.multiplier : 0;
    const now = new Date().toISOString();
    const nextWallet: PointWalletSnapshot = settlementCredit === 0 ? wallet : { ...wallet, balance: wallet.balance + settlementCredit, updatedAt: now };
    const settled: SpectatorPrediction = { ...prediction, status: won ? "won" : "lost", settledAt: now, winningCharacterId: input.winningCharacterId, settlementCredit };
    if (prediction.counterpartyAccountId) {
      const reservation = predictionReservation(prediction);
      transaction.objectStore(STORES.casinoTransactions).add(settleCasinoEscrow({
        reservation,
        idempotencyKey: `casino-prediction:${prediction.predictionId}:settle`,
        occurredAtCasinoSecond: predictionSettlementSecond(prediction),
        credits: { [LOCAL_PLAYER_ACCOUNT_ID]: settlementCredit, [prediction.counterpartyAccountId]: reservation.total - settlementCredit },
        resultKey: won ? "won" : "lost",
      }));
    }
    if (settlementCredit > 0) wallets.put(nextWallet);
    wagers.put(settled);
    await completion;
    db.close();
    return { wallet: nextWallet, prediction: settled };
  } catch (error) {
    await abort(transaction, completion);
    db.close();
    throw error;
  }
}

export async function systemInvalidateSpectatorPrediction(input: InvalidateSpectatorPredictionInput): Promise<PredictionTransactionResult> {
  if (!input.predictionId || !INVALIDATION_REASONS.has(input.reason)) throw new Error("invalid_prediction_invalidation");
  const db = await openDatabase();
  const transaction = db.transaction([STORES.wallet, STORES.wagers, STORES.casinoTransactions], "readwrite");
  const completion = complete(transaction);
  try {
    const wallets = transaction.objectStore(STORES.wallet);
    const wagers = transaction.objectStore(STORES.wagers);
    const stored = await request<StoredSpectatorPrediction | undefined>(wagers.get(input.predictionId));
    if (!stored) throw new Error("prediction_not_found");
    const prediction = normalizePrediction(stored);
    const wallet = await request<PointWalletSnapshot | undefined>(wallets.get("wallet")) ?? newWallet();
    if (prediction.status === "refunded") {
      await completion;
      db.close();
      return { wallet, prediction };
    }
    if (prediction.status !== "reserved") throw new Error("prediction_not_refundable");
    const now = new Date().toISOString();
    const nextWallet: PointWalletSnapshot = { ...wallet, balance: wallet.balance + prediction.reservedAmount, updatedAt: now };
    const refunded: SpectatorPrediction = { ...prediction, status: "refunded", settledAt: now, invalidationReason: input.reason, settlementCredit: prediction.reservedAmount };
    if (prediction.counterpartyAccountId) {
      const reservation = predictionReservation(prediction);
      transaction.objectStore(STORES.casinoTransactions).add(settleCasinoEscrow({
        reservation,
        idempotencyKey: `casino-prediction:${prediction.predictionId}:refund`,
        occurredAtCasinoSecond: predictionSettlementSecond(prediction),
        credits: { [LOCAL_PLAYER_ACCOUNT_ID]: prediction.reservedAmount, [prediction.counterpartyAccountId]: prediction.counterpartyReservedAmount! },
        resultKey: input.reason,
        kind: "system-refund",
      }));
    }
    wallets.put(nextWallet);
    wagers.put(refunded);
    await completion;
    db.close();
    return { wallet: nextWallet, prediction: refunded };
  } catch (error) {
    await abort(transaction, completion);
    db.close();
    throw error;
  }
}

export async function listSpectatorPredictions(): Promise<SpectatorPrediction[]> {
  const db = await openDatabase(), transaction = db.transaction(STORES.wagers, "readonly");
  const predictions = await request<StoredSpectatorPrediction[]>(transaction.objectStore(STORES.wagers).getAll());
  await complete(transaction); db.close();
  return predictions.filter((prediction) => prediction?.contract === "spectator-prediction/0.1" || prediction?.contract === "spectator-prediction/0.2" || prediction?.contract === "spectator-prediction/0.3").map(normalizePrediction).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function reserveGameWager(input: ReserveGameWagerInput): Promise<GameWagerTransactionResult> {
  assertGameWagerReservation(input);
  const db = await openDatabase();
  const transaction = db.transaction([STORES.wallet, STORES.gameWagers, STORES.casinoTransactions], "readwrite");
  const completion = complete(transaction);
  try {
    const wallets = transaction.objectStore(STORES.wallet);
    const wagers = transaction.objectStore(STORES.gameWagers);
    if (await request<GameWagerReceipt | undefined>(wagers.get(input.wagerId))) throw new Error("game_wager_already_exists");
    const existingId = await request<IDBValidKey | undefined>(wagers.index("by-outcome-key").getKey(input.outcomeKey));
    if (existingId !== undefined) throw new Error("game_outcome_already_wagered");
    const wallet = await request<PointWalletSnapshot | undefined>(wallets.get("wallet")) ?? newWallet();
    if (wallet.balance < input.reservedAmount) throw new Error("insufficient_points");
    const now = new Date().toISOString();
    const nextWallet: PointWalletSnapshot = { ...wallet, balance: wallet.balance - input.reservedAmount, updatedAt: now };
    const wager: GameWagerReceipt = {
      contract: "game-wager/0.1",
      wagerId: input.wagerId,
      outcomeKey: input.outcomeKey,
      cabinetId: input.cabinetId,
      sessionId: input.sessionId,
      termsVersion: input.termsVersion,
      ...(input.choiceKey === undefined ? {} : { choiceKey: input.choiceKey }),
      stake: input.stake,
      reservedAmount: input.reservedAmount,
      status: "reserved",
      createdAt: now,
      settlementCredit: 0,
      ...(input.counterpartyAccountId ? {
        counterpartyAccountId: input.counterpartyAccountId,
        counterpartyReservedAmount: input.counterpartyReservedAmount,
        casinoOccurredAtSecond: input.casinoOccurredAtSecond,
      } : {}),
    };
    if (input.counterpartyAccountId) {
      const journal = transaction.objectStore(STORES.casinoTransactions);
      const existing = await request<CasinoTransaction[]>(journal.getAll());
      const localDelta = casinoAccountDelta(existing, input.counterpartyAccountId);
      if (input.counterpartyBaseBalance! + localDelta < input.counterpartyReservedAmount!) throw new Error("casino_counterparty_insufficient_points");
      const reservation = reserveCasinoEscrow({
        wagerId: input.wagerId,
        idempotencyKey: `casino-wager:${input.wagerId}:reserve`,
        occurredAtCasinoSecond: input.casinoOccurredAtSecond!,
        reservations: { [LOCAL_PLAYER_ACCOUNT_ID]: input.reservedAmount, [input.counterpartyAccountId]: input.counterpartyReservedAmount! },
        tableId: input.cabinetId,
        termsVersion: input.termsVersion,
        matchId: input.wagerId,
        stake: input.stake,
      });
      journal.add(reservation.transaction);
    }
    wallets.put(nextWallet);
    wagers.add(wager);
    await completion;
    db.close();
    return { wallet: nextWallet, wager };
  } catch (error) {
    await abort(transaction, completion);
    db.close();
    if (isConstraintError(error)) throw new Error("game_outcome_already_wagered");
    throw error;
  }
}

export async function settleGameWager(input: SettleGameWagerInput): Promise<GameWagerTransactionResult> {
  if (!input.wagerId || !input.resultKey || !isNonNegativeInteger(input.settlementSequence) || !isNonNegativeInteger(input.creditAmount)) throw new Error("invalid_game_wager_settlement");
  return finishGameWager(input.wagerId, (wager, wallet, now, transaction) => {
    if (wager.status === "settled" || wager.status === "forfeited") return { wallet, wager };
    if (wager.status !== "reserved") throw new Error("game_wager_not_settleable");
    const nextWallet = input.creditAmount === 0 ? wallet : { ...wallet, balance: wallet.balance + input.creditAmount, updatedAt: now };
    if (wager.counterpartyAccountId) {
      const total=wager.reservedAmount+wager.counterpartyReservedAmount!;
      if(input.creditAmount>total)throw new Error("casino_settlement_exceeds_escrow");
      const reservation=reservationFromReceipt(wager);
      transaction.objectStore(STORES.casinoTransactions).add(settleCasinoEscrow({reservation,idempotencyKey:`casino-wager:${wager.wagerId}:settle`,occurredAtCasinoSecond:casinoSettlementSecond(wager),credits:{[LOCAL_PLAYER_ACCOUNT_ID]:input.creditAmount,[wager.counterpartyAccountId]:total-input.creditAmount},resultKey:input.resultKey}));
    }
    return { wallet: nextWallet, wager: { ...wager, status: "settled", settledAt: now, settlementSequence: input.settlementSequence, resultKey: input.resultKey, settlementCredit: input.creditAmount } };
  });
}

export async function forfeitGameWager(input: ForfeitGameWagerInput): Promise<GameWagerTransactionResult> {
  if (!input.wagerId || !isNonNegativeInteger(input.settlementSequence) || input.resultKey !== undefined && !input.resultKey) throw new Error("invalid_game_wager_forfeit");
  return finishGameWager(input.wagerId, (wager, wallet, now, transaction) => {
    if (wager.status === "settled" || wager.status === "forfeited") return { wallet, wager };
    if (wager.status !== "reserved") throw new Error("game_wager_not_forfeitable");
    if(wager.counterpartyAccountId){
      const reservation=reservationFromReceipt(wager),total=wager.reservedAmount+wager.counterpartyReservedAmount!;
      transaction.objectStore(STORES.casinoTransactions).add(settleCasinoEscrow({reservation,idempotencyKey:`casino-wager:${wager.wagerId}:forfeit`,occurredAtCasinoSecond:casinoSettlementSecond(wager),credits:{[wager.counterpartyAccountId]:total},resultKey:input.resultKey??"forfeit",kind:"forfeit"}));
    }
    return { wallet, wager: { ...wager, status: "forfeited", settledAt: now, settlementSequence: input.settlementSequence, ...(input.resultKey === undefined ? {} : { resultKey: input.resultKey }), settlementCredit: 0 } };
  });
}

export async function systemInvalidateGameWager(input: InvalidateGameWagerInput): Promise<GameWagerTransactionResult> {
  if (!input.wagerId || !GAME_WAGER_INVALIDATION_REASONS.has(input.reason)) throw new Error("invalid_game_wager_invalidation");
  return finishGameWager(input.wagerId, (wager, wallet, now, transaction) => {
    if (wager.status === "refunded") return { wallet, wager };
    if (wager.status !== "reserved") throw new Error("game_wager_not_refundable");
    const nextWallet: PointWalletSnapshot = { ...wallet, balance: wallet.balance + wager.reservedAmount, updatedAt: now };
    if(wager.counterpartyAccountId){
      const reservation=reservationFromReceipt(wager);
      transaction.objectStore(STORES.casinoTransactions).add(settleCasinoEscrow({reservation,idempotencyKey:`casino-wager:${wager.wagerId}:refund`,occurredAtCasinoSecond:casinoSettlementSecond(wager),credits:{[LOCAL_PLAYER_ACCOUNT_ID]:wager.reservedAmount,[wager.counterpartyAccountId]:wager.counterpartyReservedAmount!},resultKey:input.reason,kind:"system-refund"}));
    }
    return { wallet: nextWallet, wager: { ...wager, status: "refunded", settledAt: now, invalidationReason: input.reason, settlementCredit: wager.reservedAmount } };
  });
}

export async function listGameWagers(sessionId?: string): Promise<GameWagerReceipt[]> {
  const db = await openDatabase(), transaction = db.transaction(STORES.gameWagers, "readonly"), wagers = transaction.objectStore(STORES.gameWagers);
  const records = sessionId === undefined
    ? await request<GameWagerReceipt[]>(wagers.getAll())
    : await request<GameWagerReceipt[]>(wagers.index("by-session-id").getAll(sessionId));
  await complete(transaction); db.close();
  return records.filter((wager) => wager?.contract === "game-wager/0.1").sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function appendCasinoTransaction(transaction: CasinoTransaction): Promise<void> {
  assertCasinoTransaction(transaction);
  const db=await openDatabase(),tx=db.transaction(STORES.casinoTransactions,"readwrite");
  const store=tx.objectStore(STORES.casinoTransactions);
  const existing=await request<CasinoTransaction|undefined>(store.index("by-idempotency-key").get(transaction.idempotencyKey));
  if(!existing)store.add(transaction);
  await complete(tx);db.close();
}

export async function listCasinoTransactions(startCasinoSecond=0): Promise<CasinoTransaction[]> {
  if(!Number.isSafeInteger(startCasinoSecond)||startCasinoSecond<0)throw new Error("casino_transaction_invalid_start");
  const db=await openDatabase(),tx=db.transaction(STORES.casinoTransactions,"readonly");
  const range=IDBKeyRange.lowerBound(startCasinoSecond);
  const values=await request<CasinoTransaction[]>(tx.objectStore(STORES.casinoTransactions).index("by-casino-second").getAll(range));
  await complete(tx);db.close();return values.sort((left,right)=>left.occurredAtCasinoSecond-right.occurredAtCasinoSecond||left.transactionId.localeCompare(right.transactionId));
}

/**
 * Realised casino profit for the player. Collection spending and unresolved
 * reservations are deliberately excluded: this number is game performance,
 * not a second rendering of the wallet balance.
 */
export async function readPlayerCasinoProfitSince(startUtcSecond: number): Promise<number> {
  if (!Number.isSafeInteger(startUtcSecond) || startUtcSecond < 0) throw new Error("invalid_player_profit_period");
  const start = new Date(startUtcSecond * 1_000).toISOString();
  const db = await openDatabase(), transaction = db.transaction([STORES.grants, STORES.wagers, STORES.gameWagers], "readonly");
  const [grants, storedPredictions, gameWagers] = await Promise.all([
    request<PointGrant[]>(transaction.objectStore(STORES.grants).getAll()),
    request<StoredSpectatorPrediction[]>(transaction.objectStore(STORES.wagers).getAll()),
    request<GameWagerReceipt[]>(transaction.objectStore(STORES.gameWagers).getAll()),
  ]);
  await complete(transaction); db.close();
  const completionProfit = grants.reduce((sum, grant) => grant.contract === "point-grant/0.1" && grant.updatedAt >= start ? sum + grant.amount : sum, 0);
  const predictionProfit = storedPredictions.map(normalizePrediction).reduce((sum, prediction) =>
    (prediction.status === "won" || prediction.status === "lost") && prediction.settledAt !== undefined && prediction.settledAt >= start
      ? sum + prediction.settlementCredit - prediction.reservedAmount
      : sum, 0);
  const wagerProfit = gameWagers.reduce((sum, wager) =>
    wager.contract === "game-wager/0.1" && (wager.status === "settled" || wager.status === "forfeited") && wager.settledAt !== undefined && wager.settledAt >= start
      ? sum + wager.settlementCredit - wager.reservedAmount
      : sum, 0);
  const total = completionProfit + predictionProfit + wagerProfit;
  if (!Number.isSafeInteger(total)) throw new Error("invalid_player_profit_total");
  return total;
}

export async function readCollection(id: string): Promise<CollectionSnapshot> {
  const db = await openDatabase(), transaction = db.transaction(STORES.collection, "readonly");
  const stored = await request<CollectionSnapshot | undefined>(transaction.objectStore(STORES.collection).get(id));
  await complete(transaction); db.close();
  return stored ?? { contract: "collection/0.1", id, unlockedFaceIds: [], updatedAt: new Date(0).toISOString() };
}

export async function openCollectionItem(id: string, allFaceIds: readonly string[], casinoOccurredAtSecond = Math.floor(Date.now() / 1_000)): Promise<{ wallet: WalletSnapshot; collection: CollectionSnapshot; unlockedFaceId: string }> {
  const db = await openDatabase(), transaction = db.transaction([STORES.wallet, STORES.collection, STORES.casinoTransactions], "readwrite");
  const wallets = transaction.objectStore(STORES.wallet), collections = transaction.objectStore(STORES.collection);
  const wallet = await request<WalletSnapshot | undefined>(wallets.get("wallet")) ?? newWallet();
  const collection = await request<CollectionSnapshot | undefined>(collections.get(id)) ?? { contract: "collection/0.1", id, unlockedFaceIds: [], updatedAt: new Date(0).toISOString() };
  if (wallet.balance < COLLECTION_COST) { transaction.abort(); db.close(); throw new Error("insufficient_points"); }
  const unlockedFaceId = selectCollectionFace(id, collection.unlockedFaceIds, allFaceIds);
  if (!unlockedFaceId) { transaction.abort(); db.close(); throw new Error("collection_complete"); }
  const now = new Date().toISOString();
  const nextWallet: WalletSnapshot = { ...wallet, balance: wallet.balance - COLLECTION_COST, updatedAt: now };
  const nextCollection: CollectionSnapshot = { ...collection, unlockedFaceIds: [...collection.unlockedFaceIds, unlockedFaceId], updatedAt: now };
  wallets.put(nextWallet); collections.put(nextCollection);
  transaction.objectStore(STORES.casinoTransactions).add(createCollectionPurchaseTransaction({
    transactionId: `collection:${id}:${unlockedFaceId}`,
    occurredAtCasinoSecond: casinoOccurredAtSecond,
    amount: COLLECTION_COST,
    collectionId: id,
  }));
  await complete(transaction); db.close(); return { wallet: nextWallet, collection: nextCollection, unlockedFaceId };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      if (!db.objectStoreNames.contains(STORES.cards)) db.createObjectStore(STORES.cards, { keyPath: "fingerprint" });
      if (!db.objectStoreNames.contains(STORES.sources)) db.createObjectStore(STORES.sources);
      if (!db.objectStoreNames.contains(STORES.sessions)) db.createObjectStore(STORES.sessions, { keyPath: "sessionId" });
      if (!db.objectStoreNames.contains(STORES.recent)) db.createObjectStore(STORES.recent, { keyPath: "cabinetId" });
      if (!db.objectStoreNames.contains(STORES.wallet)) db.createObjectStore(STORES.wallet, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.grants)) db.createObjectStore(STORES.grants, { keyPath: "sessionId" });
      if (!db.objectStoreNames.contains(STORES.collection)) db.createObjectStore(STORES.collection, { keyPath: "id" });
      const wagers = db.objectStoreNames.contains(STORES.wagers) ? opening.transaction!.objectStore(STORES.wagers) : db.createObjectStore(STORES.wagers, { keyPath: "predictionId" });
      if (!wagers.indexNames.contains("by-outcome-key")) wagers.createIndex("by-outcome-key", "outcomeKey", { unique: true });
      if (!wagers.indexNames.contains("by-created-at")) wagers.createIndex("by-created-at", "createdAt");
      const gameWagers = db.objectStoreNames.contains(STORES.gameWagers) ? opening.transaction!.objectStore(STORES.gameWagers) : db.createObjectStore(STORES.gameWagers, { keyPath: "wagerId" });
      if (!gameWagers.indexNames.contains("by-outcome-key")) gameWagers.createIndex("by-outcome-key", "outcomeKey", { unique: true });
      if (!gameWagers.indexNames.contains("by-session-id")) gameWagers.createIndex("by-session-id", "sessionId");
      if (!gameWagers.indexNames.contains("by-created-at")) gameWagers.createIndex("by-created-at", "createdAt");
      const casinoTransactions=db.objectStoreNames.contains(STORES.casinoTransactions)?opening.transaction!.objectStore(STORES.casinoTransactions):db.createObjectStore(STORES.casinoTransactions,{keyPath:"transactionId"});
      if(!casinoTransactions.indexNames.contains("by-idempotency-key"))casinoTransactions.createIndex("by-idempotency-key","idempotencyKey",{unique:true});
      if(!casinoTransactions.indexNames.contains("by-casino-second"))casinoTransactions.createIndex("by-casino-second","occurredAtCasinoSecond");
      const matches = db.objectStoreNames.contains(STORES.matches) ? opening.transaction!.objectStore(STORES.matches) : db.createObjectStore(STORES.matches, { keyPath: "recordId" });
      if (!matches.indexNames.contains("by-completed-at")) matches.createIndex("by-completed-at", "completedAt");
      if (!matches.indexNames.contains("by-session-completed-at")) matches.createIndex("by-session-completed-at", ["sessionId", "completedAt"]);
      const actions = db.objectStoreNames.contains(STORES.actions) ? opening.transaction!.objectStore(STORES.actions) : db.createObjectStore(STORES.actions, { keyPath: "key" });
      if (!actions.indexNames.contains("by-session-sequence")) actions.createIndex("by-session-sequence", ["sessionId", "sequence"], { unique: true });
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error("indexeddb_open_failed"));
  });
}
function request<T>(value: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? new Error("indexeddb_request_failed")); }); }
function collectCursor<T>(cursorRequest: IDBRequest<IDBCursorWithValue | null>, limit: number): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const output: T[] = [];
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("indexeddb_cursor_failed"));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || output.length >= limit) { resolve(output); return; }
      output.push(cursor.value as T);
      cursor.continue();
    };
  });
}
function complete(transaction: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb_transaction_failed")); transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb_transaction_aborted")); }); }
function newWallet(): PointWalletSnapshot { return { contract: "wallet/0.1", id: "wallet", balance: INITIAL_POINT_BALANCE, updatedAt: new Date().toISOString() }; }
function assertPredictionInput(input: ReserveSpectatorPredictionInput): void {
  if (!input.predictionId || !input.outcomeKey || !input.predictedCharacterId || !VALID_STAKES.has(input.stake) || !VALID_MULTIPLIERS.has(input.multiplier) || input.market !== undefined && !VALID_MARKETS.has(input.market)
    || input.counterpartyAccountId !== undefined && (!input.counterpartyAccountId || !isPositiveInteger(input.counterpartyReservedAmount!) || !isNonNegativeInteger(input.counterpartyBaseBalance!) || !isNonNegativeInteger(input.casinoOccurredAtSecond!) || !input.casinoTableId)
    || input.counterpartyAccountId === undefined && (input.counterpartyReservedAmount !== undefined || input.counterpartyBaseBalance !== undefined || input.casinoOccurredAtSecond !== undefined || input.casinoTableId !== undefined)) throw new Error("invalid_prediction");
}
function assertGameWagerReservation(input: ReserveGameWagerInput): void {
  if (!input.wagerId || !input.outcomeKey || !input.cabinetId || !input.sessionId || !input.termsVersion
    || input.choiceKey !== undefined && !input.choiceKey
    || !isPositiveInteger(input.stake) || !isPositiveInteger(input.reservedAmount) || input.reservedAmount < input.stake
    || input.counterpartyAccountId !== undefined && (!input.counterpartyAccountId || !isPositiveInteger(input.counterpartyReservedAmount!) || !isNonNegativeInteger(input.counterpartyBaseBalance!) || !isNonNegativeInteger(input.casinoOccurredAtSecond!))
    || input.counterpartyAccountId === undefined && (input.counterpartyReservedAmount !== undefined || input.counterpartyBaseBalance !== undefined || input.casinoOccurredAtSecond !== undefined)) throw new Error("invalid_game_wager");
}

function casinoAccountDelta(transactions:readonly CasinoTransaction[],accountId:string):number{return transactions.reduce((sum,transaction)=>sum+transaction.postings.filter((posting)=>posting.accountId===accountId).reduce((postingSum,posting)=>postingSum+posting.delta,0),0);}
function reservationFromReceipt(wager:GameWagerReceipt){return reserveCasinoEscrow({wagerId:wager.wagerId,idempotencyKey:`casino-wager:${wager.wagerId}:reserve`,occurredAtCasinoSecond:wager.casinoOccurredAtSecond!,reservations:{[LOCAL_PLAYER_ACCOUNT_ID]:wager.reservedAmount,[wager.counterpartyAccountId!]:wager.counterpartyReservedAmount!},matchId:wager.wagerId,tableId:wager.cabinetId,termsVersion:wager.termsVersion,stake:wager.stake});}
function casinoSettlementSecond(wager:GameWagerReceipt):number{
  const elapsed=Math.max(0,Math.floor((Date.now()-Date.parse(wager.createdAt))/1_000));
  return wager.casinoOccurredAtSecond!+elapsed;
}
function predictionReservation(prediction:SpectatorPrediction){return reserveCasinoEscrow({wagerId:`prediction:${prediction.predictionId}`,idempotencyKey:`casino-prediction:${prediction.predictionId}:reserve`,occurredAtCasinoSecond:prediction.casinoOccurredAtSecond!,reservations:{[LOCAL_PLAYER_ACCOUNT_ID]:prediction.reservedAmount,[prediction.counterpartyAccountId!]:prediction.counterpartyReservedAmount!},matchId:`prediction:${prediction.predictionId}`,tableId:prediction.casinoTableId!,termsVersion:"spectator-prediction/0.3",stake:prediction.stake});}
function predictionSettlementSecond(prediction:SpectatorPrediction):number{const elapsed=Math.max(0,Math.floor((Date.now()-Date.parse(prediction.createdAt))/1_000));return prediction.casinoOccurredAtSecond!+elapsed;}
function isPositiveInteger(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function isNonNegativeInteger(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
async function finishGameWager(
  wagerId: string,
  finish: (wager: GameWagerReceipt, wallet: PointWalletSnapshot, now: string, transaction: IDBTransaction) => GameWagerTransactionResult,
): Promise<GameWagerTransactionResult> {
  const db = await openDatabase();
  const transaction = db.transaction([STORES.wallet, STORES.gameWagers, STORES.casinoTransactions], "readwrite");
  const completion = complete(transaction);
  try {
    const wallets = transaction.objectStore(STORES.wallet), wagers = transaction.objectStore(STORES.gameWagers);
    const wager = await request<GameWagerReceipt | undefined>(wagers.get(wagerId));
    if (!wager || wager.contract !== "game-wager/0.1") throw new Error("game_wager_not_found");
    const wallet = await request<PointWalletSnapshot | undefined>(wallets.get("wallet")) ?? newWallet();
    const result = finish(wager, wallet, new Date().toISOString(), transaction);
    wallets.put(result.wallet);
    wagers.put(result.wager);
    await completion;
    db.close();
    return result;
  } catch (error) {
    await abort(transaction, completion);
    db.close();
    throw error;
  }
}
type StoredSpectatorPrediction = SpectatorPrediction
  | (Omit<SpectatorPrediction, "contract" | "market"> & { contract: "spectator-prediction/0.2" })
  | (Omit<SpectatorPrediction, "contract" | "market" | "multiplier" | "reservedAmount"> & { contract: "spectator-prediction/0.1" });
function normalizePrediction(prediction: StoredSpectatorPrediction): SpectatorPrediction {
  if (prediction.contract === "spectator-prediction/0.3") return prediction;
  if (prediction.contract === "spectator-prediction/0.2") return { ...prediction, contract: "spectator-prediction/0.3", market: "joker-holder" };
  return { ...prediction, contract: "spectator-prediction/0.3", market: "joker-holder", multiplier: 3, reservedAmount: prediction.stake };
}
function isConstraintError(error: unknown): boolean { return error instanceof DOMException && error.name === "ConstraintError"; }
async function abort(transaction: IDBTransaction, completion: Promise<void>): Promise<void> {
  try { transaction.abort(); } catch { /* The transaction may already have completed. */ }
  await completion.catch(() => undefined);
}
function deleteActionsThrough(store: IDBObjectStore, sessionId: string, sequence: number): void {
  const range = IDBKeyRange.bound([sessionId, Number.MIN_SAFE_INTEGER], [sessionId, sequence]);
  const cursorRequest = store.index("by-session-sequence").openKeyCursor(range);
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
}
function deleteActionsAfter(store: IDBObjectStore, sessionId: string, sequence: number): void {
  const range = IDBKeyRange.bound([sessionId, sequence], [sessionId, Number.MAX_SAFE_INTEGER], true, false);
  const cursorRequest = store.index("by-session-sequence").openKeyCursor(range);
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
}
