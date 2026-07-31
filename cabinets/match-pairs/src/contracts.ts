export const MATCH_PAIRS_VERSION = "match-pairs/0.4" as const;
export const MATCH_PAIRS_STATE_CONTRACT = "match-pairs-state/0.4" as const;
export const MATCH_PAIRS_TERMS_VERSION = "match-pairs-paytable/0.3" as const;

export type MatchPairsDifficulty = "easy" | "normal";
export type MatchPairsMode = "play" | "spectate";
export type MatchPairsFocus = "relaxed" | "standard" | "sharp";
export type MatchPairsStatus = "ready" | "playing" | "checking" | "complete";
/** Stable internal seat ids. In spectate mode both seats are NPC controlled. */
export type MatchPairsActor = "player" | "npc";
export type MatchPairsOutcome = MatchPairsActor | "draw";
export type MatchPairsReaction = "neutral" | "pleased" | "tense" | "despair";
export type MatchPairsStake = 10 | 50 | 200;
export type MatchPairsWinCreditMultiplier = 1.5 | 2 | 2.5;
export type MatchPairsSearchStyle = "explore" | "recheck" | "mixed";
export type MatchPairsDifficultyTier = 1 | 2 | 3;

export const MATCH_PAIRS_ACTORS: readonly MatchPairsActor[] = ["player", "npc"];
export const MATCH_PAIRS_FOCUS_LEVELS: readonly MatchPairsFocus[] = ["relaxed", "standard", "sharp"];
export const MATCH_PAIRS_PAIR_COUNTS: Readonly<Record<MatchPairsDifficulty, number>> = { easy: 6, normal: 8 };
export const MATCH_PAIRS_STAKES: readonly MatchPairsStake[] = [10, 50, 200];

export interface MatchPairsFace {
  id: string;
  assetId: string;
  characterId: string;
  confusionGroup?: string;
}

export interface MatchPairsCard { cardId: string; pairId: string; }

/**
 * A frozen game-specific interpretation. These values must not be recomputed
 * from another cabinet at runtime because they participate in deterministic replay.
 */
export interface MatchPairsPersona {
  memoryCapacity: number;
  observationRate: number;
  recallAccuracy: number;
  memoryRetention: number;
  consistency: number;
  searchStyle: MatchPairsSearchStyle;
  streakComposure: number;
  difficultyTier: MatchPairsDifficultyTier;
}

export interface MatchPairsOpponent extends MatchPairsPersona {
  id: string;
  name: string;
  portraits: Readonly<Record<"neutral" | "pleased" | "tense", string>>;
  despairPortrait: string;
  /** Total credit after a direct-play win, including the reserved stake. */
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
  actor: MatchPairsActor;
  sequence: number;
  turnNumber: number;
  matchStreak: number;
  cardCount: number;
  openIndexes: readonly number[];
  unavailableIndexes: readonly number[];
  memory: readonly MatchPairsMemoryEntry[];
}

export interface MatchPairsOpponentSelection {
  player: string | null;
  npc: string;
}

export type MatchPairsAction =
  | { type: "start"; seed: string; stake?: MatchPairsStake; wagerId?: string }
  | { type: "player-reveal"; index: number }
  | { type: "npc-reveal" }
  | { type: "resolve" }
  | { type: "set-mode"; mode: MatchPairsMode }
  | { type: "set-focus"; focus: MatchPairsFocus }
  | { type: "select-opponent"; opponentId: string; actor?: MatchPairsActor }
  | { type: "random-opponents" }
  | { type: "restart"; seed: string; difficulty: MatchPairsDifficulty; mode?: MatchPairsMode; focus?: MatchPairsFocus; opponentIds?: MatchPairsOpponentSelection };

export interface MatchPairsHistoryEntry { sequence: number; action: MatchPairsAction; }
export interface MatchPairsLastResolution { actor: MatchPairsActor; matched: boolean; pairId: string | null; }

export interface MatchPairsState {
  contract: typeof MATCH_PAIRS_STATE_CONTRACT;
  version: typeof MATCH_PAIRS_VERSION;
  packVersion: string;
  sessionId: string;
  seed: string;
  sequence: number;
  mode: MatchPairsMode;
  focus: MatchPairsFocus;
  difficulty: MatchPairsDifficulty;
  status: MatchPairsStatus;
  cards: readonly MatchPairsCard[];
  openIndexes: readonly number[];
  matchedPairIds: readonly string[];
  claims: Readonly<Record<MatchPairsActor, readonly string[]>>;
  currentTurn: MatchPairsActor;
  revealActor: MatchPairsActor | null;
  opponentIds: Readonly<MatchPairsOpponentSelection>;
  wagerId: string | null;
  stake: MatchPairsStake | null;
  creditAmount: number;
  npcMemories: Readonly<Record<MatchPairsActor, readonly MatchPairsMemoryEntry[]>>;
  reactions: Readonly<Record<MatchPairsActor, MatchPairsReaction>>;
  matchStreaks: Readonly<Record<MatchPairsActor, number>>;
  turnNumber: number;
  attempts: number;
  lastResolution: MatchPairsLastResolution | null;
  outcome: MatchPairsOutcome | null;
  history: readonly MatchPairsHistoryEntry[];
}

export const MATCH_PAIRS_ERRORS = {
  candidatesTooFew: "match_pairs_candidates_too_few", constraintConflict: "match_pairs_constraint_conflict",
  duplicateFaceId: "match_pairs_duplicate_face_id", duplicateOpponentId: "match_pairs_duplicate_opponent_id",
  invalidFace: "match_pairs_face_invalid", invalidOpponent: "match_pairs_opponent_invalid",
  opponentMissing: "match_pairs_opponent_missing", opponentDuplicate: "match_pairs_opponent_duplicate",
  invalidPackVersion: "match_pairs_pack_version_invalid", invalidSessionId: "match_pairs_session_id_invalid",
  invalidSeed: "match_pairs_seed_invalid", invalidDifficulty: "match_pairs_difficulty_invalid",
  startInvalid: "match_pairs_start_invalid", revealInvalid: "match_pairs_reveal_invalid",
  revealIndexInvalid: "match_pairs_reveal_index_invalid", revealAlreadyOpen: "match_pairs_reveal_already_open",
  revealAlreadyMatched: "match_pairs_reveal_already_matched", resolveInvalid: "match_pairs_resolve_invalid",
  opponentSelectionInvalid: "match_pairs_opponent_selection_invalid", actionInvalid: "match_pairs_action_invalid",
} as const;

export type MatchPairsErrorCode = (typeof MATCH_PAIRS_ERRORS)[keyof typeof MATCH_PAIRS_ERRORS];

export function isMatchPairsState(value: unknown): value is MatchPairsState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<MatchPairsState>;
  if (state.contract !== MATCH_PAIRS_STATE_CONTRACT || state.version !== MATCH_PAIRS_VERSION) return false;
  if (typeof state.packVersion !== "string" || typeof state.sessionId !== "string" || typeof state.seed !== "string") return false;
  if (!Number.isInteger(state.sequence) || !Number.isInteger(state.attempts) || !Number.isInteger(state.turnNumber) || !Number.isInteger(state.creditAmount) || state.creditAmount! < 0) return false;
  if (state.mode !== "play" && state.mode !== "spectate" || !state.difficulty || !(state.difficulty in MATCH_PAIRS_PAIR_COUNTS)) return false;
  if (!MATCH_PAIRS_FOCUS_LEVELS.includes(state.focus as MatchPairsFocus)) return false;
  if (!state.status || !["ready", "playing", "checking", "complete"].includes(state.status)) return false;
  if (!MATCH_PAIRS_ACTORS.includes(state.currentTurn as MatchPairsActor)
    || state.revealActor !== null && !MATCH_PAIRS_ACTORS.includes(state.revealActor as MatchPairsActor)) return false;
  if (!Array.isArray(state.cards) || !Array.isArray(state.openIndexes) || !Array.isArray(state.matchedPairIds) || !Array.isArray(state.history)) return false;
  if (!state.claims || !state.npcMemories || !state.reactions || !state.matchStreaks || !state.opponentIds) return false;
  if (typeof state.opponentIds.npc !== "string" || state.opponentIds.player !== null && typeof state.opponentIds.player !== "string") return false;
  if (state.mode === "play" ? state.opponentIds.player !== null : !state.opponentIds.player || state.opponentIds.player === state.opponentIds.npc) return false;
  if (!("wagerId" in state) || !("stake" in state) || state.wagerId !== null && typeof state.wagerId !== "string" || state.stake != null && !MATCH_PAIRS_STAKES.includes(state.stake)) return false;
  if (state.status !== "ready" && state.mode === "play" ? (state.wagerId === null) !== (state.stake === null) : false) return false;
  if (state.status !== "ready" && state.mode === "spectate" ? state.wagerId !== null || state.stake !== null : false) return false;
  return MATCH_PAIRS_ACTORS.every((actor) => Array.isArray(state.claims![actor]) && Array.isArray(state.npcMemories![actor])
      && Number.isInteger(state.matchStreaks![actor]) && state.matchStreaks![actor] >= 0
      && ["neutral", "pleased", "tense", "despair"].includes(state.reactions![actor]))
    && state.cards.every((card) => Boolean(card) && typeof card.cardId === "string" && typeof card.pairId === "string")
    && state.openIndexes.every(Number.isInteger) && state.matchedPairIds.every((id) => typeof id === "string")
    && MATCH_PAIRS_ACTORS.every((actor) => state.npcMemories![actor].every(validMemoryEntry))
    && state.history.every((entry) => Boolean(entry) && Number.isInteger(entry.sequence) && Boolean(entry.action));
}

function validMemoryEntry(value: MatchPairsMemoryEntry): boolean {
  return Boolean(value) && Number.isInteger(value.index) && typeof value.pairId === "string"
    && Number.isInteger(value.seenAtTurn) && Number.isFinite(value.confidence);
}
