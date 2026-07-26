import type { AnalyzedCard, AnyAnalyzedCard } from "@lucky-arcade/contracts";
import type {
  CollectionSnapshot,
  CompletionPointGrant,
  CompletionPointGrantInput,
  InvalidateSpectatorPredictionInput,
  MatchRecord,
  MedalGrantInput,
  PointGrant,
  PointWalletSnapshot,
  PredictionMultiplier,
  PredictionTransactionResult,
  RecentPlay,
  ReserveSpectatorPredictionInput,
  SettleSpectatorPredictionInput,
  SnapshotRecord,
  SpectatorPrediction,
  StoredActionReceipt,
  WalletSnapshot,
} from "@lucky-arcade/persistence";
import { selectCollectionFace } from "./collection-rules.ts";

const DATABASE = "lucky-arcade";
const VERSION = 6;
const STORES = { cards: "cards", sources: "sources", sessions: "sessions", actions: "actions", recent: "recent", matches: "matches", wallet: "wallet", grants: "grants", collection: "collection", wagers: "wagers" } as const;
const INITIAL_POINT_BALANCE = 0;
const COLLECTION_COST = 12;
const COMPLETION_REWARD = 5;
const VALID_STAKES = new Set([10, 50, 200]);
const VALID_MULTIPLIERS = new Set<PredictionMultiplier>([2, 3, 4, 5]);
const INVALIDATION_REASONS = new Set(["outcome-unavailable", "pack-version-mismatch", "corrupt-state"]);

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
  const db = await openDatabase(), transaction = db.transaction([STORES.wallet, STORES.grants], "readwrite");
  const wallets = transaction.objectStore(STORES.wallet), grants = transaction.objectStore(STORES.grants);
  const storedWallet = await request<PointWalletSnapshot | undefined>(wallets.get("wallet"));
  const current = storedWallet ?? newWallet();
  const previousGrant = await request<PointGrant | undefined>(grants.get(input.sessionId));
  if (input.spectated || (previousGrant?.highestSequence ?? -1) >= input.sequence) {
    if (!storedWallet) wallets.put(current);
    await complete(transaction); db.close(); return { wallet: current, amount: 0 };
  }
  const now = new Date().toISOString();
  const wallet: PointWalletSnapshot = { ...current, balance: current.balance + COMPLETION_REWARD, updatedAt: now };
  wallets.put(wallet);
  grants.put({ contract: "point-grant/0.1", sessionId: input.sessionId, highestSequence: input.sequence, amount: COMPLETION_REWARD, updatedAt: now } satisfies CompletionPointGrant);
  await complete(transaction); db.close(); return { wallet, amount: COMPLETION_REWARD };
}

/** @deprecated Kept until non-old-maid callers adopt the point-named API. */
export function grantMedals(input: MedalGrantInput): Promise<{ wallet: PointWalletSnapshot; amount: number }> {
  return grantCompletionPoints(input);
}

export async function reserveSpectatorPrediction(input: ReserveSpectatorPredictionInput): Promise<PredictionTransactionResult> {
  assertPredictionInput(input);
  const db = await openDatabase();
  const transaction = db.transaction([STORES.wallet, STORES.wagers], "readwrite");
  const completion = complete(transaction);
  try {
    const wallets = transaction.objectStore(STORES.wallet);
    const wagers = transaction.objectStore(STORES.wagers);
    const existingId = await request<IDBValidKey | undefined>(wagers.index("by-outcome-key").getKey(input.outcomeKey));
    if (existingId !== undefined) throw new Error("outcome_already_wagered");
    const wallet = await request<PointWalletSnapshot | undefined>(wallets.get("wallet")) ?? newWallet();
    const reservedAmount = input.stake * input.multiplier;
    if (wallet.balance < reservedAmount) throw new Error("insufficient_points");
    const now = new Date().toISOString();
    const nextWallet: PointWalletSnapshot = { ...wallet, balance: wallet.balance - reservedAmount, updatedAt: now };
    const prediction: SpectatorPrediction = {
      contract: "spectator-prediction/0.2",
      predictionId: input.predictionId,
      outcomeKey: input.outcomeKey,
      predictedCharacterId: input.predictedCharacterId,
      stake: input.stake,
      multiplier: input.multiplier,
      reservedAmount,
      status: "reserved",
      createdAt: now,
      settlementCredit: 0,
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
  const transaction = db.transaction([STORES.wallet, STORES.wagers], "readwrite");
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
  const transaction = db.transaction([STORES.wallet, STORES.wagers], "readwrite");
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
  return predictions.filter((prediction) => prediction?.contract === "spectator-prediction/0.1" || prediction?.contract === "spectator-prediction/0.2").map(normalizePrediction).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function readCollection(id: string): Promise<CollectionSnapshot> {
  const db = await openDatabase(), transaction = db.transaction(STORES.collection, "readonly");
  const stored = await request<CollectionSnapshot | undefined>(transaction.objectStore(STORES.collection).get(id));
  await complete(transaction); db.close();
  return stored ?? { contract: "collection/0.1", id, unlockedFaceIds: [], updatedAt: new Date(0).toISOString() };
}

export async function openCollectionItem(id: string, allFaceIds: readonly string[]): Promise<{ wallet: WalletSnapshot; collection: CollectionSnapshot; unlockedFaceId: string }> {
  const db = await openDatabase(), transaction = db.transaction([STORES.wallet, STORES.collection], "readwrite");
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
  if (!input.predictionId || !input.outcomeKey || !input.predictedCharacterId || !VALID_STAKES.has(input.stake) || !VALID_MULTIPLIERS.has(input.multiplier)) throw new Error("invalid_prediction");
}
type StoredSpectatorPrediction = SpectatorPrediction | (Omit<SpectatorPrediction, "contract" | "multiplier" | "reservedAmount"> & { contract: "spectator-prediction/0.1" });
function normalizePrediction(prediction: StoredSpectatorPrediction): SpectatorPrediction {
  if (prediction.contract === "spectator-prediction/0.2") return prediction;
  return { ...prediction, contract: "spectator-prediction/0.2", multiplier: 3, reservedAmount: prediction.stake };
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
