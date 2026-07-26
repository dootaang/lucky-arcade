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
  wager?: {
    market?: PredictionMarket;
    predictedCharacterId: string;
    stake: PredictionStake;
    multiplier: PredictionMultiplier;
    reservedAmount: number;
    won: boolean;
  };
  psychology?: {
    inspectedCards: number;
    reorderActions: number;
    reorderTurns: number;
    reorderSignals: number;
    movedSlotDraws: number;
    successfulBaits: number;
    offers: number;
    reorderedOffers: number;
    playerOfferConfirms: number;
    npcToNpcOffers: number;
  };
}

export interface MatchRecordStore {
  append(record: MatchRecord): Promise<void>;
  list(cabinetId: string, limit: number): Promise<MatchRecord[]>;
  listSession(sessionId: string, limit: number): Promise<MatchRecord[]>;
  prune(maxRecords: number): Promise<void>;
}

/**
 * The persisted contract name intentionally stays at wallet/0.1 so existing
 * medal balances are migrated to points without rewriting or rescaling them.
 */
export interface PointWalletSnapshot {
  contract: "wallet/0.1";
  id: "wallet";
  balance: number;
  updatedAt: string;
}

/** @deprecated Use PointWalletSnapshot. Kept for source compatibility. */
export type WalletSnapshot = PointWalletSnapshot;

export interface LegacyMedalGrant {
  contract: "medal-grant/0.1";
  sessionId: string;
  highestSequence: number;
  updatedAt: string;
}

export interface CompletionPointGrant {
  contract: "point-grant/0.1";
  sessionId: string;
  highestSequence: number;
  amount: number;
  updatedAt: string;
}

export type PointGrant = LegacyMedalGrant | CompletionPointGrant;

export interface CompletionPointGrantInput {
  sessionId: string;
  sequence: number;
  cabinetId: string;
  spectated: boolean;
  amount?: number;
}

/** @deprecated Medal-era request shape. Use CompletionPointGrantInput.amount for the caller's reward policy. */
export interface MedalGrantInput extends CompletionPointGrantInput {
  rank: number;
  seatCount: number;
}

/** @deprecated Use LegacyMedalGrant when reading pre-point records. */
export type MedalGrant = LegacyMedalGrant;

export interface WalletStore {
  read(): Promise<PointWalletSnapshot>;
  grantCompletion(input: CompletionPointGrantInput): Promise<PointWalletSnapshot>;
}

export type PredictionStake = 10 | 50 | 200;
export type PredictionMultiplier = 2 | 3 | 4 | 5;
export type PredictionMarket = "joker-holder" | "first-place";
export type SpectatorPredictionStatus = "reserved" | "won" | "lost" | "refunded";
export type PredictionInvalidationReason = "outcome-unavailable" | "pack-version-mismatch" | "corrupt-state";

export interface SpectatorPrediction {
  contract: "spectator-prediction/0.3";
  predictionId: string;
  outcomeKey: string;
  market: PredictionMarket;
  predictedCharacterId: string;
  stake: PredictionStake;
  multiplier: PredictionMultiplier;
  /** Amount actually debited when the prediction was reserved. */
  reservedAmount: number;
  status: SpectatorPredictionStatus;
  createdAt: string;
  settledAt?: string;
  winningCharacterId?: string;
  invalidationReason?: PredictionInvalidationReason;
  /** Points credited at settlement. Reservation debits reservedAmount immediately. */
  settlementCredit: number;
}

export interface ReserveSpectatorPredictionInput {
  predictionId: string;
  outcomeKey: string;
  predictedCharacterId: string;
  stake: PredictionStake;
  multiplier: PredictionMultiplier;
  market?: PredictionMarket;
}

export interface SettleSpectatorPredictionInput {
  predictionId: string;
  winningCharacterId: string;
}

export interface InvalidateSpectatorPredictionInput {
  predictionId: string;
  reason: PredictionInvalidationReason;
}

export interface PredictionTransactionResult {
  wallet: PointWalletSnapshot;
  prediction: SpectatorPrediction;
}

export interface SpectatorPredictionStore {
  reserve(input: ReserveSpectatorPredictionInput): Promise<PredictionTransactionResult>;
  settle(input: SettleSpectatorPredictionInput): Promise<PredictionTransactionResult>;
  systemInvalidate(input: InvalidateSpectatorPredictionInput): Promise<PredictionTransactionResult>;
  list(): Promise<SpectatorPrediction[]>;
}

export interface CollectionSnapshot {
  contract: "collection/0.1";
  id: string;
  unlockedFaceIds: string[];
  updatedAt: string;
}
