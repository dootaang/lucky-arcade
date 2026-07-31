export interface CasinoClock {
  utcMinute(): number;
}

export interface CasinoPresentationClock extends CasinoClock {
  utcSecond(): number;
}

export type CasinoTableId =
  | "temerosa-old-maid"
  | "temerosa-match-pairs"
  | "temerosa-slot"
  | "indian-poker"
  | "temerosa-high-low"
  | "temerosa-five-card-draw";

export type CasinoLedgerSourceId = CasinoTableId
  | "npc-income"
  | "temerosa-side-market"
  | "temerosa-blackjack"
  | "temerosa-doubt"
  | "temerosa-one-card"
  | "temerosa-texas-holdem";

export type NpcStake = 0 | 10 | 50 | 200;

export type NpcPresencePhase = "idle" | "approaching" | "playing" | "spectating" | "settling" | "leaving";

export type NpcPredictionMarket = "first-place" | "joker-holder";
export type NpcPredictionRole = "self" | "spectator";

export interface NpcSessionRange {
  min: number;
  max: number;
}

export interface NpcActiveWindow {
  startMinute: number;
  endMinute: number;
  weight: number;
}

export interface NpcTableWeight {
  tableId: CasinoTableId;
  weight: number;
}

export interface NpcGamblingProfile {
  id: string;
  name: string;
  /** Story-authored bankroll at the current contract epoch. It is not a target. */
  openingBalance: number;
  /** @deprecated v0.4 compatibility alias. Never use as an outcome target. */
  target: number;
  riskAppetite: number;
  discipline: number;
  lossChasing: number;
  winPressing: number;
  stopLossRatio: number;
  takeProfitRatio: number;
  maxExposureRatio: number;
  incomeBand: "low" | "middle" | "high" | "premium";
  payCycleDays: 7 | 14;
  paydayOffset: number;
  skills: Readonly<{
    oldMaid: number;
    matchPairsMemory: number;
    pokerRead: number;
    pokerBluff: number;
    highLowJudgment: number;
  }>;
  sessionsPerDay: NpcSessionRange;
  tables: readonly NpcTableWeight[];
  activeHours: readonly NpcActiveWindow[];
}

/** Authored off-casino livelihood and leisure-budget inputs. */
export interface NpcExternalIncomeProfile {
  npcId: string;
  /** Lore-backed label, or the neutral fallback `개인 활동 정산`. */
  sourceLabel: string;
  /** Stable lore hashes/keys. Empty only when the neutral fallback is used. */
  evidenceRefs: readonly string[];
  /** Inclusive daily gross-income range, in whole points. */
  dailyIncomeRange: readonly [number, number];
  /** Inclusive share moved to the casino wallet. 10_000 basis points is 100%. */
  casinoBudgetRateBps: readonly [number, number];
  /** Tracked off-casino reserve at the flow-economy epoch. */
  openingExternalReserve: number;
  /** Inclusive KST minute-of-day window for the personal daily settlement. */
  settlementWindow: readonly [number, number];
}

/** Shared decision engine inputs; characters differ through data, not bespoke code. */
export interface CasinoNpcBehavior {
  npcId: string;
  riskAppetite: number;
  stakeAggression: number;
  lossChasing: number;
  stopLossDiscipline: number;
  takeProfitDiscipline: number;
  visitsPerDay: NpcSessionRange;
  roundsPerVisit: NpcSessionRange;
  skills: Readonly<Partial<Record<CasinoTableId, number>>>;
  preferredTables: readonly NpcTableWeight[];
}

export interface HouseOperatingCostPolicy {
  baseFacilityCost: number;
  activeTableHourCost: number;
  perHundredRoundsCost: number;
  positiveGamingRevenueRateBps: number;
  protectedReserve: number;
  settlementSecondOfDay: number;
}

export interface NpcVisit {
  visitId: string;
  tableId: CasinoTableId;
  participantIds: readonly string[];
  startedAtSecondOfDay: number;
  endsAtSecondOfDay: number;
}

export interface NpcMatch {
  matchId: string;
  visitId: string;
  tableId: CasinoTableId;
  participantIds: readonly string[];
  startsAtSecondOfDay: number;
  settlesAtSecondOfDay: number;
  stake: NpcStake;
  multiplier: 1 | 2 | 3 | 4 | 5;
}

export interface CasinoDayPlan {
  visits: readonly NpcVisit[];
  matches: readonly NpcMatch[];
  predictions: readonly NpcPredictionWager[];
  sessions: Readonly<Record<string, readonly NpcSession[]>>;
}

/** A personal-world-line posting that can change later autonomous stakes. */
export interface NpcBalanceEvent {
  eventId: string;
  npcId: string;
  secondOfDay: number;
  delta: number;
}

export interface NpcPredictionWager {
  predictionId: string;
  matchId: string;
  visitId: string;
  bettorNpcId: string;
  predictedNpcId: string;
  market: NpcPredictionMarket;
  role: NpcPredictionRole;
  placedAtSecondOfDay: number;
  settlesAtSecondOfDay: number;
  stake: Exclude<NpcStake, 0>;
  multiplier: 2 | 3 | 4 | 5;
  reservedAmount: number;
  creditAmount: number;
  delta: number;
  won: boolean;
}

export interface NpcSession {
  matchId: string;
  visitId: string;
  participantIds: readonly string[];
  secondOfDay: number;
  minuteOfDay: number;
  tableId: CasinoLedgerSourceId;
  stake: NpcStake;
  reservedAmount: number;
  creditAmount: number;
  delta: number;
  resultKind: string;
  termsVersion: string;
  rankReward?: Readonly<{ rank: number; amount: number }>;
  prediction?: NpcPredictionWager;
}

export interface NpcLedgerContract {
  version: "npc-ledger/1.0" | "npc-ledger/1.1" | "npc-ledger/1.2";
  /** Frozen deterministic seed domain; changing calendar boundaries must not reroll history. */
  seedVersion: "npc-ledger/0.9" | "casino-flow/1.0";
  /** First casino calendar day, counted at KST midnight. */
  epochKstDay: number;
  profiles: readonly NpcGamblingProfile[];
  /** Exact house close carried into this epoch. Legacy contracts default to 150,000 P. */
  houseOpeningBalance?: number;
  houseOperatingPolicy?: Readonly<HouseOperatingCostPolicy>;
  /** Required by npc-ledger/1.2; ignored by frozen legacy contracts. */
  externalIncomeProfiles?: readonly NpcExternalIncomeProfile[];
  /** Optional authored overrides. Existing NpcGamblingProfile fields remain the fallback. */
  behaviors?: readonly CasinoNpcBehavior[];
  /**
   * Completed daily profits carried across a contract rebase. These are
   * presentation analytics only: they never seed balances or game outcomes.
   */
  profitHistory: readonly Readonly<{ kstDay: number; profits: Readonly<Record<string, number>> }>[];
}

export interface NpcBalanceSnapshot {
  balance: number;
  today: readonly NpcSession[];
  dayIndex: number;
}

export interface NpcActivity {
  npcId: string;
  utcSecond: number;
  utcMinute: number;
  session: NpcSession;
}

/** One real, player-scale result inside a longer NPC casino visit. */
export interface NpcRoundSettlement {
  roundId: string;
  matchId: string;
  visitId: string;
  participantIds: readonly string[];
  npcId: string;
  tableId: CasinoLedgerSourceId;
  utcSecond: number;
  stake: NpcStake;
  reservedAmount: number;
  creditAmount: number;
  delta: number;
  resultKind: string;
  termsVersion: string;
  rankReward?: Readonly<{ rank: number; amount: number }>;
  prediction?: NpcPredictionWager;
}

export interface NpcMatchSettlement {
  matchId: string;
  visitId: string;
  tableId: CasinoLedgerSourceId;
  utcSecond: number;
  participantIds: readonly string[];
  entries: readonly NpcRoundSettlement[];
}

export type NpcPlayEventCode =
  | "table-enter"
  | "wager-placed"
  | "prediction-wager-placed"
  | "old-maid-draw"
  | "old-maid-discard"
  | "old-maid-reorder"
  | "old-maid-watch"
  | "pairs-open-first"
  | "pairs-open-second"
  | "pairs-match"
  | "pairs-turn"
  | "slot-spin"
  | "slot-reel-stop"
  | "slot-line-check"
  | "slot-reach"
  | "poker-check"
  | "poker-call"
  | "poker-raise"
  | "poker-read"
  | "high-low-guess"
  | "high-low-hit"
  | "high-low-cashout";

/** Presentation-only activity. It never changes either ledger balance. */
export interface NpcPlayEvent {
  eventId: string;
  matchId: string;
  kind: "match-action";
  npcId: string;
  tableId: CasinoTableId;
  utcSecond: number;
  code: NpcPlayEventCode;
  stake: NpcStake;
  multiplier?: 2 | 3 | 4 | 5;
  predictionMarket?: NpcPredictionMarket;
  predictedNpcId?: string;
  predictionRole?: NpcPredictionRole;
}

export interface NpcPresence {
  npcId: string;
  phase: NpcPresencePhase;
  tableId?: CasinoTableId;
  session?: NpcSession;
  visitId?: string;
  matchId?: string;
  openingBalance?: number;
  startedAtUtcSecond?: number;
  settlesAtUtcSecond?: number;
  availableAtUtcSecond?: number;
  role?: "playing" | "spectating";
}

export interface NpcPresenceInterval {
  npcId: string;
  tableId: CasinoTableId;
  visit: NpcVisit;
  sessions: readonly NpcSession[];
  session?: NpcSession;
  openingBalance: number;
  startedAtUtcSecond: number;
  settlesAtUtcSecond: number;
  availableAtUtcSecond: number;
  role: "playing" | "spectating";
}

export interface NpcAvailability {
  npcId: string;
  available: boolean;
  phase: NpcPresencePhase;
  tableId?: CasinoTableId;
  availableAtUtcSecond?: number;
}
