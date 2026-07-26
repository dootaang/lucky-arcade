export const MATCH_PAIRS_VERSION = "match-pairs/0.3" as const;
export const MATCH_PAIRS_STATE_CONTRACT = "match-pairs-state/0.3" as const;
export const MATCH_PAIRS_TERMS_VERSION = "match-pairs-paytable/0.1" as const;

export type MatchPairsDifficulty = "easy" | "normal";
export type MatchPairsStatus = "ready" | "playing" | "checking" | "complete";
export type MatchPairsActor = "player" | "npc";
export type MatchPairsOutcome = MatchPairsActor | "draw";
export type MatchPairsReaction = "neutral" | "pleased" | "tense" | "despair";
export type MatchPairsStake = 10 | 50 | 200;
export type MatchPairsWinCreditMultiplier = 1.5 | 2 | 2.5;

export const MATCH_PAIRS_PAIR_COUNTS: Readonly<Record<MatchPairsDifficulty, number>> = { easy: 6, normal: 8 };
export const MATCH_PAIRS_STAKES: readonly MatchPairsStake[] = [10, 50, 200];

export interface MatchPairsFace {
  id: string;
  assetId: string;
  characterId: string;
  confusionGroup?: string;
}

export interface MatchPairsCard {
  cardId: string;
  pairId: string;
}

export interface MatchPairsOpponent {
  id: string;
  name: string;
  portraits: Readonly<Record<"neutral" | "pleased" | "tense", string>>;
  despairPortrait: string;
  memoryCapacity: number;
  recallAccuracy: number;
  memoryRetention: number;
  consistency: number;
  /** Total credit after a win, including the reserved stake. */
  winCreditMultiplier: MatchPairsWinCreditMultiplier;
}

export interface MatchPairsMemoryEntry {
  index: number;
  pairId: string;
  seenAtTurn: number;
  confidence: number;
}

export interface MatchPairsNpcRead {
  seed: string;
  sequence: number;
  turnNumber: number;
  cardCount: number;
  openIndexes: readonly number[];
  unavailableIndexes: readonly number[];
  memory: readonly MatchPairsMemoryEntry[];
}

export type MatchPairsAction =
  | { type: "start"; seed: string; stake: MatchPairsStake; wagerId: string }
  | { type: "player-reveal"; index: number }
  | { type: "npc-reveal" }
  | { type: "resolve" }
  | { type: "select-opponent"; opponentId: string }
  | { type: "random-opponent" }
  | { type: "restart"; seed: string; difficulty: MatchPairsDifficulty; opponentId?: string };

export interface MatchPairsHistoryEntry {
  sequence: number;
  action: MatchPairsAction;
}

export interface MatchPairsLastResolution {
  actor: MatchPairsActor;
  matched: boolean;
  pairId: string | null;
}

export interface MatchPairsState {
  contract: typeof MATCH_PAIRS_STATE_CONTRACT;
  version: typeof MATCH_PAIRS_VERSION;
  packVersion: string;
  sessionId: string;
  seed: string;
  sequence: number;
  difficulty: MatchPairsDifficulty;
  status: MatchPairsStatus;
  cards: readonly MatchPairsCard[];
  openIndexes: readonly number[];
  matchedPairIds: readonly string[];
  claims: Readonly<Record<MatchPairsActor, readonly string[]>>;
  currentTurn: MatchPairsActor;
  revealActor: MatchPairsActor | null;
  opponentId: string;
  wagerId: string | null;
  stake: MatchPairsStake | null;
  creditAmount: number;
  npcMemory: readonly MatchPairsMemoryEntry[];
  npcReaction: MatchPairsReaction;
  turnNumber: number;
  attempts: number;
  lastResolution: MatchPairsLastResolution | null;
  outcome: MatchPairsOutcome | null;
  history: readonly MatchPairsHistoryEntry[];
}

export const MATCH_PAIRS_ERRORS = {
  candidatesTooFew: "match_pairs_candidates_too_few",
  constraintConflict: "match_pairs_constraint_conflict",
  duplicateFaceId: "match_pairs_duplicate_face_id",
  duplicateOpponentId: "match_pairs_duplicate_opponent_id",
  invalidFace: "match_pairs_face_invalid",
  invalidOpponent: "match_pairs_opponent_invalid",
  opponentMissing: "match_pairs_opponent_missing",
  invalidPackVersion: "match_pairs_pack_version_invalid",
  invalidSessionId: "match_pairs_session_id_invalid",
  invalidSeed: "match_pairs_seed_invalid",
  invalidDifficulty: "match_pairs_difficulty_invalid",
  startInvalid: "match_pairs_start_invalid",
  revealInvalid: "match_pairs_reveal_invalid",
  revealIndexInvalid: "match_pairs_reveal_index_invalid",
  revealAlreadyOpen: "match_pairs_reveal_already_open",
  revealAlreadyMatched: "match_pairs_reveal_already_matched",
  resolveInvalid: "match_pairs_resolve_invalid",
  opponentSelectionInvalid: "match_pairs_opponent_selection_invalid",
  actionInvalid: "match_pairs_action_invalid",
} as const;

export type MatchPairsErrorCode = (typeof MATCH_PAIRS_ERRORS)[keyof typeof MATCH_PAIRS_ERRORS];

export function isMatchPairsState(value: unknown): value is MatchPairsState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<MatchPairsState>;
  if (state.contract !== MATCH_PAIRS_STATE_CONTRACT || state.version !== MATCH_PAIRS_VERSION) return false;
  if (typeof state.packVersion !== "string" || typeof state.sessionId !== "string" || typeof state.seed !== "string" || typeof state.opponentId !== "string") return false;
  if (!Number.isInteger(state.sequence) || !Number.isInteger(state.attempts) || !Number.isInteger(state.turnNumber) || !Number.isInteger(state.creditAmount) || state.creditAmount! < 0) return false;
  if (!state.difficulty || !(state.difficulty in MATCH_PAIRS_PAIR_COUNTS) || !state.status || !["ready", "playing", "checking", "complete"].includes(state.status)) return false;
  if (state.currentTurn !== "player" && state.currentTurn !== "npc") return false;
  if (state.revealActor !== null && state.revealActor !== "player" && state.revealActor !== "npc") return false;
  if (!Array.isArray(state.cards) || !Array.isArray(state.openIndexes) || !Array.isArray(state.matchedPairIds) || !Array.isArray(state.npcMemory) || !Array.isArray(state.history)) return false;
  if (!state.claims || !Array.isArray(state.claims.player) || !Array.isArray(state.claims.npc)) return false;
  if (!("wagerId" in state) || !("stake" in state) || state.wagerId !== null && typeof state.wagerId !== "string" || state.stake != null && !MATCH_PAIRS_STAKES.includes(state.stake)) return false;
  if (state.status === "ready" ? state.wagerId !== null || state.stake !== null : !state.wagerId || state.stake === null) return false;
  return state.cards.every((card) => Boolean(card) && typeof card.cardId === "string" && typeof card.pairId === "string")
    && state.openIndexes.every(Number.isInteger)
    && state.matchedPairIds.every((id) => typeof id === "string")
    && state.npcMemory.every((entry) => Boolean(entry) && Number.isInteger(entry.index) && typeof entry.pairId === "string" && Number.isFinite(entry.confidence))
    && state.history.every((entry) => Boolean(entry) && Number.isInteger(entry.sequence) && Boolean(entry.action));
}
