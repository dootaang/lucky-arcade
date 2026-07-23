import type { AnalyzedCard, AnyAnalyzedCard } from "@lucky-arcade/contracts";
import type { SnapshotRecord, StoredActionReceipt } from "@lucky-arcade/persistence";

const DATABASE = "lucky-arcade";
const VERSION = 1;
const STORES = { cards: "cards", sources: "sources", sessions: "sessions", actions: "actions" } as const;

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
    .filter((item) => item?.analyzed?.contract === "analyzed-card/0.1" || item?.analyzed?.contract === "analyzed-card/0.2")
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
export async function saveSnapshot<State>(snapshot: SnapshotRecord<State>): Promise<void> {
  const db = await openDatabase(), transaction = db.transaction(STORES.sessions, "readwrite");
  transaction.objectStore(STORES.sessions).put(snapshot); await complete(transaction); db.close();
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
  const all = await request<Array<StoredActionReceipt<Action> & { sessionId: string }>>(transaction.objectStore(STORES.actions).getAll());
  await complete(transaction); db.close();
  return all.filter((item) => item.sessionId === sessionId && item.sequence > sequence).sort((a, b) => a.sequence - b.sequence);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      if (!db.objectStoreNames.contains(STORES.cards)) db.createObjectStore(STORES.cards, { keyPath: "fingerprint" });
      if (!db.objectStoreNames.contains(STORES.sources)) db.createObjectStore(STORES.sources);
      if (!db.objectStoreNames.contains(STORES.sessions)) db.createObjectStore(STORES.sessions, { keyPath: "sessionId" });
      if (!db.objectStoreNames.contains(STORES.actions)) db.createObjectStore(STORES.actions, { keyPath: "key" });
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error("indexeddb_open_failed"));
  });
}
function request<T>(value: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? new Error("indexeddb_request_failed")); }); }
function complete(transaction: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb_transaction_failed")); transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb_transaction_aborted")); }); }
