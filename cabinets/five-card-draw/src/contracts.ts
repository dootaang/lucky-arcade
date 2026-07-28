import type { StandardCardId } from "@lucky-arcade/card-table";

export const FIVE_CARD_DRAW_CONTRACT = "five-card-draw/0.1" as const;
export const FIVE_CARD_DRAW_RULES_VERSION = "temerosa-five-card-draw/0.1" as const;

export type FiveCardDrawPhase = "ready" | "player-draw" | "complete";
export type FiveCardDrawOutcome = "player-win" | "npc-win" | "tie";

export type PokerHandCategory =
  | "high-card"
  | "one-pair"
  | "two-pair"
  | "three-of-a-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-of-a-kind"
  | "straight-flush";

export interface PokerHandValue {
  category: PokerHandCategory;
  categoryRank: number;
  kickers: readonly number[];
  label: string;
}

export interface FiveCardDrawContext {
  /** Stable external identifier for settlement and replay adapters. */
  sessionId: string;
  /** Stable persona identifier for dialogue adapters. */
  opponentId: string;
}

export interface NpcDrawObservation {
  /** NPC-owned cards are the only private cards exposed to the strategy. */
  hand: readonly StandardCardId[];
  /** The sole piece of opponent information revealed by draw poker. */
  playerExchangeCount: number;
}

export interface NpcDrawDecision {
  discardCardIds: readonly StandardCardId[];
  reason:
    | "stand-pat"
    | "keep-four-kind"
    | "keep-trips"
    | "keep-two-pair"
    | "keep-pair"
    | "draw-to-flush"
    | "draw-to-straight"
    | "keep-high-cards";
}

export interface FiveCardDrawResult {
  contract: typeof FIVE_CARD_DRAW_CONTRACT;
  rulesVersion: typeof FIVE_CARD_DRAW_RULES_VERSION;
  sessionId: string;
  opponentId: string;
  seed: string;
  outcome: FiveCardDrawOutcome;
  playerHand: readonly StandardCardId[];
  npcHand: readonly StandardCardId[];
  playerValue: PokerHandValue;
  npcValue: PokerHandValue;
  playerDiscarded: readonly StandardCardId[];
  npcDiscarded: readonly StandardCardId[];
  resultId: string;
}

export interface FiveCardDrawState {
  contract: typeof FIVE_CARD_DRAW_CONTRACT;
  rulesVersion: typeof FIVE_CARD_DRAW_RULES_VERSION;
  context: FiveCardDrawContext;
  phase: FiveCardDrawPhase;
  sequence: number;
  seed: string | null;
  deck: readonly StandardCardId[];
  deckCursor: number;
  playerHand: readonly StandardCardId[];
  npcHand: readonly StandardCardId[];
  playerDiscarded: readonly StandardCardId[];
  npcDiscarded: readonly StandardCardId[];
  npcDecision: NpcDrawDecision | null;
  result: FiveCardDrawResult | null;
}

export type FiveCardDrawAction =
  | { type: "start"; seed: string }
  | { type: "exchange"; cardIds: readonly StandardCardId[] }
  | { type: "reset" };

export interface FiveCardDrawPublicView {
  contract: typeof FIVE_CARD_DRAW_CONTRACT;
  phase: FiveCardDrawPhase;
  sequence: number;
  sessionId: string;
  opponentId: string;
  playerHand: readonly StandardCardId[];
  npcHand: readonly StandardCardId[] | null;
  npcCardCount: number;
  playerExchangeCount: number | null;
  npcExchangeCount: number | null;
  result: FiveCardDrawResult | null;
}
