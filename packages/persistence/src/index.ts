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

export interface RecentPlay {
  contract: "recent-play/0.1";
  cabinetId: string;
  sessionId: string;
  cardFingerprint?: string;
  title: string;
  progressLabel: string;
  updatedAt: string;
}

export interface RecentPlayStore {
  list(): Promise<RecentPlay[]>;
  touch(play: RecentPlay): Promise<void>;
  remove(cabinetId: string): Promise<void>;
}

export interface MatchStanding {
  seatId: string;
  participantId?: string;
  displayName: string;
  rank: number;
  isPlayer: boolean;
}

export interface MatchRecord {
  contract: "match-record/0.1";
  recordId: string;
  cabinetId: string;
  cabinetVersion: string;
  packVersion?: string;
  cardFingerprint?: string;
  sessionId: string;
  sequence: number;
  seed: string;
  completedAt: string;
  turns: number;
  standings: MatchStanding[];
  outcome: "win" | "loss" | "spectated";
  resultHash: string;
}

export interface MatchRecordStore {
  append(record: MatchRecord): Promise<void>;
  list(cabinetId: string, limit: number): Promise<MatchRecord[]>;
  listSession(sessionId: string, limit: number): Promise<MatchRecord[]>;
  prune(maxRecords: number): Promise<void>;
}

export interface WalletSnapshot {
  contract: "wallet/0.1";
  id: "wallet";
  balance: number;
  updatedAt: string;
}

export interface MedalGrant {
  contract: "medal-grant/0.1";
  sessionId: string;
  highestSequence: number;
  updatedAt: string;
}

export interface MedalGrantInput {
  sessionId: string;
  sequence: number;
  cabinetId: string;
  rank: number;
  seatCount: number;
  spectated: boolean;
}

export interface WalletStore {
  read(): Promise<WalletSnapshot>;
  grant(input: MedalGrantInput): Promise<WalletSnapshot>;
}

export interface CollectionSnapshot {
  contract: "collection/0.1";
  id: string;
  unlockedFaceIds: string[];
  updatedAt: string;
}
