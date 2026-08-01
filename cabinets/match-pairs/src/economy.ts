import { MATCH_PAIRS_PAIR_COUNTS, MATCH_PAIRS_SPREAD_TERMS_VERSION, type MatchPairsDifficulty, type MatchPairsFocus, type MatchPairsState } from "./contracts.ts";

export interface MatchPairsPerformance {
  playerPairs: number;
  npcPairs: number;
  scoreDifference: number;
  attempts: number;
  excessAttempts: number;
  performanceScore: number;
  outcome: "win" | "draw" | "loss";
}

export interface MatchPairsSpreadQuote {
  contract: typeof MATCH_PAIRS_SPREAD_TERMS_VERSION;
  quoteId: string;
  pricingVersion: string;
  opponentId: string;
  difficulty: MatchPairsDifficulty;
  focus: MatchPairsFocus;
  targetScore: number;
  estimatedCoverRateBps: number;
  sampleSize: number;
  available: boolean;
}

export interface MatchPairsSpreadChoice {
  seed: string;
  quoteId: string;
  pricingVersion: string;
  opponentId: string;
  difficulty: MatchPairsDifficulty;
  focus: MatchPairsFocus;
  targetScore: number;
}

export const MATCH_PAIRS_SPREAD_PRICING_VERSION = "temerosa-match-pairs-spread/0.1" as const;

/**
 * Ten points per pair of margin keeps the result legible while excess attempts
 * add enough resolution to price strong and weak opponents without peeking at
 * hidden cards. The metric is entirely derived from the completed public game.
 */
export function matchPairsPerformance(state: Pick<MatchPairsState, "claims" | "attempts" | "difficulty" | "outcome">): MatchPairsPerformance {
  const playerPairs = state.claims.player.length;
  const npcPairs = state.claims.npc.length;
  const scoreDifference = playerPairs - npcPairs;
  const excessAttempts = Math.max(0, state.attempts - MATCH_PAIRS_PAIR_COUNTS[state.difficulty]);
  return Object.freeze({
    playerPairs,
    npcPairs,
    scoreDifference,
    attempts: state.attempts,
    excessAttempts,
    performanceScore: scoreDifference * 10 - excessAttempts,
    outcome: state.outcome === "player" ? "win" : state.outcome === "npc" ? "loss" : "draw",
  });
}

export function matchPairsChallengeReward(state: Pick<MatchPairsState, "claims" | "attempts" | "difficulty" | "outcome">): number {
  const performance = matchPairsPerformance(state);
  const resultReward = performance.outcome === "win" ? 5 : performance.outcome === "draw" ? 2 : 1;
  const efficiency = performance.excessAttempts <= 2 ? 3 : performance.excessAttempts <= 4 ? 2 : performance.excessAttempts <= 6 ? 1 : 0;
  return Math.min(8, resultReward + efficiency);
}

export function matchPairsSpreadCovered(state: Pick<MatchPairsState, "claims" | "attempts" | "difficulty" | "outcome">, quote: MatchPairsSpreadQuote | MatchPairsSpreadChoice): boolean {
  return matchPairsPerformance(state).performanceScore > quote.targetScore;
}

export function matchPairsSpreadChoiceKey(choice: MatchPairsSpreadChoice): string {
  return `spread:${JSON.stringify(choice)}`;
}

export function parseMatchPairsSpreadChoice(value: string | undefined): MatchPairsSpreadChoice | null {
  if (!value?.startsWith("spread:")) return null;
  try {
    const parsed = JSON.parse(value.slice(7)) as Partial<MatchPairsSpreadChoice>;
    if (typeof parsed.seed !== "string" || typeof parsed.quoteId !== "string" || parsed.pricingVersion !== MATCH_PAIRS_SPREAD_PRICING_VERSION
      || typeof parsed.opponentId !== "string" || !["easy", "normal"].includes(parsed.difficulty ?? "")
      || !["relaxed", "standard", "sharp"].includes(parsed.focus ?? "") || !Number.isSafeInteger(parsed.targetScore)) return null;
    return parsed as MatchPairsSpreadChoice;
  } catch { return null; }
}
