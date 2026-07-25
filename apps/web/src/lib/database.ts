import type { AnalyzedCard, AnyAnalyzedCard } from "@lucky-arcade/contracts";
import { medalAward } from "@lucky-arcade/contracts";
import type { CollectionSnapshot, MatchRecord, MedalGrant, MedalGrantInput, RecentPlay, SnapshotRecord, StoredActionReceipt, WalletSnapshot } from "@lucky-arcade/persistence";
import { selectCollectionFace } from "./collection-rules.ts";

const DATABASE = "lucky-arcade";
const VERSION = 5;
const STORES = { cards: "cards", sources: "sources", sessions: "sessions", actions: "actions", recent: "recent", matches: "matches", wallet: "wallet", grants: "grants", collection: "collection" } as const;
const INITIAL_BALANCE = 100;
const COLLECTION_COST = 12;

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
  let wallet = await request<WalletSnapshot | undefined>(store.get("wallet"));
  if (!wallet) {
    wallet = { contract: "wallet/0.1", id: "wallet", balance: INITIAL_BALANCE, updatedAt: new Date().toISOString() };
    store.put(wallet);
  }
  await complete(transaction); db.close(); return wallet;
}

export async function grantMedals(input: MedalGrantInput): Promise<{ wallet: WalletSnapshot; amount: number }> {
  const db = await openDatabase(), transaction = db.transaction([STORES.wallet, STORES.grants], "readwrite");
  const wallets = transaction.objectStore(STORES.wallet), grants = transaction.objectStore(STORES.grants);
  const current = await request<WalletSnapshot | undefined>(wallets.get("wallet")) ?? { contract: "wallet/0.1", id: "wallet", balance: INITIAL_BALANCE, updatedAt: new Date().toISOString() };
  const previousGrant = await request<MedalGrant | undefined>(grants.get(input.sessionId));
  if (input.spectated || (previousGrant?.highestSequence ?? -1) >= input.sequence) {
    if (!await request<WalletSnapshot | undefined>(wallets.get("wallet"))) wallets.put(current);
    await complete(transaction); db.close(); return { wallet: current, amount: 0 };
  }
  const amount = medalAward(current.balance, input);
  const now = new Date().toISOString();
  const wallet: WalletSnapshot = { ...current, balance: Math.max(0, current.balance + amount), updatedAt: now };
  wallets.put(wallet);
  grants.put({ contract: "medal-grant/0.1", sessionId: input.sessionId, highestSequence: input.sequence, updatedAt: now } satisfies MedalGrant);
  await complete(transaction); db.close(); return { wallet, amount };
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
  const wallet = await request<WalletSnapshot | undefined>(wallets.get("wallet")) ?? { contract: "wallet/0.1", id: "wallet", balance: INITIAL_BALANCE, updatedAt: new Date().toISOString() };
  const collection = await request<CollectionSnapshot | undefined>(collections.get(id)) ?? { contract: "collection/0.1", id, unlockedFaceIds: [], updatedAt: new Date(0).toISOString() };
  if (wallet.balance < COLLECTION_COST) { transaction.abort(); db.close(); throw new Error("insufficient_medals"); }
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
