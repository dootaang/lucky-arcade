export interface StoredActionReceipt<Action = unknown> {
  sequence: number;
  action: Action;
  previousHash: string;
  resultHash: string;
  rngPosition: number;
}

export interface ActionLogStore<Action = unknown> {
  append(sessionId: string, receipt: StoredActionReceipt<Action>): Promise<void>;
  listAfter(sessionId: string, sequence: number): Promise<StoredActionReceipt<Action>[]>;
  truncateAfter(sessionId: string, sequence: number): Promise<void>;
}

export interface SnapshotRecord<State = unknown> {
  contract: "snapshot-record/0.1";
  sessionId: string;
  sequence: number;
  state: State;
  stateHash: string;
  engineVersion: string;
  cabinetVersion: string;
  packVersion?: string;
}

export interface SnapshotStore<State = unknown> {
  load(sessionId: string): Promise<SnapshotRecord<State> | null>;
  save(snapshot: SnapshotRecord<State>): Promise<void>;
  remove(sessionId: string): Promise<void>;
}

export interface AssetCache {
  get(key: string): Promise<Blob | null>;
  put(key: string, value: Blob): Promise<void>;
  remove(key: string): Promise<void>;
  prune(maxEntries: number, maxBytes: number): Promise<void>;
}

export interface CardSourceStore {
  get(id: string): Promise<Blob | null>;
  put(id: string, value: Blob): Promise<void>;
  remove(id: string): Promise<void>;
}
