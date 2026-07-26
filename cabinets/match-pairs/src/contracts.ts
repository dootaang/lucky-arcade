export const MATCH_PAIRS_VERSION = "match-pairs/0.1" as const;
export const MATCH_PAIRS_STATE_CONTRACT = "match-pairs-state/0.1" as const;

export type MatchPairsDifficulty = "easy" | "normal";
export type MatchPairsStatus = "ready" | "playing" | "checking" | "complete";

export const MATCH_PAIRS_PAIR_COUNTS: Readonly<Record<MatchPairsDifficulty, number>> = {
  easy: 6,
  normal: 8,
};

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

export type MatchPairsAction =
  | { type: "start" }
  | { type: "reveal"; index: number }
  | { type: "resolve" }
  | { type: "restart"; seed: string; difficulty: MatchPairsDifficulty };

export interface MatchPairsHistoryEntry {
  sequence: number;
  action: MatchPairsAction;
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
  attempts: number;
  history: readonly MatchPairsHistoryEntry[];
}

export const MATCH_PAIRS_ERRORS = {
  candidatesTooFew: "match_pairs_candidates_too_few",
  constraintConflict: "match_pairs_constraint_conflict",
  duplicateFaceId: "match_pairs_duplicate_face_id",
  invalidFace: "match_pairs_face_invalid",
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
  actionInvalid: "match_pairs_action_invalid",
} as const;

export type MatchPairsErrorCode = (typeof MATCH_PAIRS_ERRORS)[keyof typeof MATCH_PAIRS_ERRORS];
