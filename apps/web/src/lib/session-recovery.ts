import { ENGINE_VERSION, resultHash } from "@lucky-arcade/engine";
import type { SnapshotRecord, StoredActionReceipt } from "@lucky-arcade/persistence";
import { listActionsAfter, loadSnapshot, truncateActionsAfter } from "./database.ts";

export interface SessionRecoveryOptions<State, Action> {
  sessionId: string;
  fresh: State;
  cabinetVersion: string;
  packVersion?: string;
  isState(value: unknown): value is State;
  restoreSnapshot?(cabinetVersion: string, value: unknown): State;
  reduce(state: State, action: Action): State;
  store?: SessionRecoveryStore;
}

export interface RecoveredSession<State> { state: State; sequence: number; }
export interface SessionRecoveryStore {
  loadSnapshot<State>(sessionId: string): Promise<SnapshotRecord<State> | null>;
  listActionsAfter<Action>(sessionId: string, sequence: number): Promise<StoredActionReceipt<Action>[]>;
  truncateAfter?(sessionId: string, sequence: number): Promise<void>;
}

const databaseStore: SessionRecoveryStore = { loadSnapshot, listActionsAfter, truncateAfter: truncateActionsAfter };

export async function recoverSession<State, Action>(options: SessionRecoveryOptions<State, Action>): Promise<RecoveredSession<State>> {
  const store = options.store ?? databaseStore;
  const snapshot = await store.loadSnapshot<State>(options.sessionId);
  let state = options.fresh;
  let sequence = 0;
  const restored = restoreSnapshot(snapshot, options);
  if (restored) {
    state = restored;
    sequence = snapshot?.sequence ?? 0;
  }
  let corruptTail = false;
  for (const receipt of await store.listActionsAfter<Action>(options.sessionId, sequence)) {
    if (receipt.sequence !== sequence + 1 || receipt.previousHash !== resultHash(state)) { corruptTail = true; break; }
    let next: State;
    try { next = options.reduce(state, receipt.action); }
    catch { corruptTail = true; break; }
    if (receipt.resultHash !== resultHash(next)) { corruptTail = true; break; }
    state = next;
    sequence = receipt.sequence;
  }
  if (corruptTail) await store.truncateAfter?.(options.sessionId, sequence);
  return { state, sequence };
}

function restoreSnapshot<State, Action>(snapshot: SnapshotRecord<State> | null, options: SessionRecoveryOptions<State, Action>): State | null {
  if (!snapshot || snapshot.engineVersion !== ENGINE_VERSION || snapshot.packVersion !== options.packVersion) return null;
  let state: State;
  try {
    if (options.restoreSnapshot) state = options.restoreSnapshot(snapshot.cabinetVersion, snapshot.state);
    else {
      if (snapshot.cabinetVersion !== options.cabinetVersion || !options.isState(snapshot.state)) return null;
      state = snapshot.state;
    }
  } catch { return null; }
  return snapshot.stateHash === resultHash(state) ? state : null;
}
