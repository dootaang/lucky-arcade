import type { StandardCardId } from "@lucky-arcade/card-table";

export const FIVE_CARD_DRAW_CONTRACT = "five-card-draw-state/0.4" as const;
export const FIVE_CARD_DRAW_RULES_VERSION = "temerosa-five-card-draw/0.4" as const;
export const FIVE_CARD_DRAW_TERMS_VERSION = "temerosa-five-card-draw-preview/0.2" as const;
export const FIVE_CARD_DRAW_STREET_CAP_UNITS = 3 as const;
export const FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS = 7 as const;
export const FIVE_CARD_DRAW_STAKES = [10, 50, 200] as const;

export type FiveCardDrawStake = (typeof FIVE_CARD_DRAW_STAKES)[number];
export type FiveCardDrawPlayerCount = 2 | 3 | 4;
export type FiveCardDrawSeatId = "player" | FiveCardDrawNpcSeatId;
export type FiveCardDrawNpcSeatId = "npc-1" | "npc-2" | "npc-3";
export type FiveCardDrawPhase = "ready" | "opening-bet" | "drawing" | "closing-bet" | "complete";
export type FiveCardDrawBetAction = "check" | "bet" | "call" | "raise" | "fold";
export type FiveCardDrawOutcome = "player-win" | "npc-win" | "tie";
export type FiveCardDrawTell = "confident" | "neutral" | "uneasy";
export type FiveCardDrawTellStyle = "open" | "guarded" | "bluffer" | "standard";

export type PokerHandCategory =
  | "high-card" | "one-pair" | "two-pair" | "three-of-a-kind" | "straight"
  | "flush" | "full-house" | "four-of-a-kind" | "straight-flush";

export interface PokerHandValue {
  category: PokerHandCategory;
  categoryRank: number;
  kickers: readonly number[];
  label: string;
}

export interface FiveCardDrawPersona {
  /** How readily this character changes cards; this is not poker intelligence. */
  drawActivity: number;
  riskAppetite: number;
  signalAttention: number;
  /** -1 treats ambiguous signals as bait, 0 ignores them, +1 reads them literally. */
  signalTrust: number;
  deceptionBias: number;
  consistency: number;
  tellStyle: FiveCardDrawTellStyle;
}

export interface FiveCardDrawOpponent {
  id: string;
  name: string;
  persona: FiveCardDrawPersona;
}

export interface FiveCardDrawContext {
  sessionId: string;
  opponents: readonly FiveCardDrawOpponent[];
}

export interface NpcDrawObservation {
  hand: readonly StandardCardId[];
  visibleExchangeCounts: Readonly<Partial<Record<FiveCardDrawSeatId, number>>>;
  activeSeatCount: number;
  persona: FiveCardDrawPersona;
  seed: string;
}

export interface NpcBetObservation {
  seatId: FiveCardDrawNpcSeatId;
  hand: readonly StandardCardId[];
  phase: "opening-bet" | "closing-bet";
  activeSeatCount: number;
  ownContributionUnits: number;
  currentBetUnits: number;
  potUnits: number;
  visibleExchangeCounts: Readonly<Partial<Record<FiveCardDrawSeatId, number>>>;
  visibleTells: Readonly<Partial<Record<FiveCardDrawNpcSeatId, FiveCardDrawTell>>>;
  betHistory: readonly FiveCardDrawBetRecord[];
  persona: FiveCardDrawPersona;
  planSeed: string;
  seed: string;
}

export interface FiveCardDrawBetRecord {
  seatId: FiveCardDrawSeatId;
  phase: "opening-bet" | "closing-bet";
  action: FiveCardDrawBetAction;
  amountUnits: number;
}

export interface NpcDrawDecision {
  discardCardIds: readonly StandardCardId[];
  reason: "stand-pat" | "bluff-stand-pat" | "keep-four-kind" | "keep-trips" | "keep-two-pair" | "keep-pair" | "draw-to-flush" | "draw-to-straight" | "keep-high-cards";
}

export interface FiveCardDrawResult {
  contract: typeof FIVE_CARD_DRAW_CONTRACT;
  rulesVersion: typeof FIVE_CARD_DRAW_RULES_VERSION;
  sessionId: string;
  seed: string;
  outcome: FiveCardDrawOutcome;
  winnerSeatIds: readonly FiveCardDrawSeatId[];
  foldedSeatIds: readonly FiveCardDrawSeatId[];
  hands: Readonly<Partial<Record<FiveCardDrawSeatId, readonly StandardCardId[]>>>;
  values: Readonly<Partial<Record<FiveCardDrawSeatId, PokerHandValue>>>;
  contributions: Readonly<Record<FiveCardDrawSeatId, number>>;
  payouts: Readonly<Record<FiveCardDrawSeatId, number>>;
  pot: number;
  playerCredit: number;
  resultId: string;
}

export interface FiveCardDrawState {
  contract: typeof FIVE_CARD_DRAW_CONTRACT;
  rulesVersion: typeof FIVE_CARD_DRAW_RULES_VERSION;
  context: FiveCardDrawContext;
  phase: FiveCardDrawPhase;
  sequence: number;
  seed: string | null;
  baseStake: FiveCardDrawStake | null;
  deck: readonly StandardCardId[];
  deckCursor: number;
  seatOrder: readonly FiveCardDrawSeatId[];
  dealerIndex: number;
  currentActorId: FiveCardDrawSeatId | null;
  pendingSeatIds: readonly FiveCardDrawSeatId[];
  activeSeatIds: readonly FiveCardDrawSeatId[];
  foldedSeatIds: readonly FiveCardDrawSeatId[];
  hands: Readonly<Record<FiveCardDrawSeatId, readonly StandardCardId[]>>;
  discarded: Readonly<Record<FiveCardDrawSeatId, readonly StandardCardId[]>>;
  exchangeCounts: Readonly<Partial<Record<FiveCardDrawSeatId, number>>>;
  contributionsUnits: Readonly<Record<FiveCardDrawSeatId, number>>;
  streetContributionsUnits: Readonly<Record<FiveCardDrawSeatId, number>>;
  currentBetUnits: number;
  betHistory: readonly FiveCardDrawBetRecord[];
  lastAction: { seatId: FiveCardDrawSeatId; action: FiveCardDrawBetAction | "exchange"; amountUnits: number } | null;
  result: FiveCardDrawResult | null;
}

export type FiveCardDrawAction =
  | { type: "start"; seed: string; stake: FiveCardDrawStake }
  | { type: "bet"; action: FiveCardDrawBetAction }
  | { type: "exchange"; cardIds: readonly StandardCardId[] }
  | { type: "advance" }
  | { type: "reset" };

export interface FiveCardDrawPublicView {
  contract: typeof FIVE_CARD_DRAW_CONTRACT;
  phase: FiveCardDrawPhase;
  sequence: number;
  sessionId: string;
  seatOrder: readonly FiveCardDrawSeatId[];
  currentActorId: FiveCardDrawSeatId | null;
  activeSeatIds: readonly FiveCardDrawSeatId[];
  foldedSeatIds: readonly FiveCardDrawSeatId[];
  playerHand: readonly StandardCardId[];
  npcHands: Readonly<Record<FiveCardDrawNpcSeatId, readonly StandardCardId[] | null>>;
  exchangeCounts: Readonly<Partial<Record<FiveCardDrawSeatId, number>>>;
  npcTells: Readonly<Partial<Record<FiveCardDrawNpcSeatId, FiveCardDrawTell>>>;
  betHistory: readonly FiveCardDrawBetRecord[];
  pot: number;
  result: FiveCardDrawResult | null;
}

export interface FiveCardDrawGuide {
  handLabel: string;
  strength: "약함" | "보통" | "강함" | "매우 강함";
  summary: string;
  recommendation: string;
  keepCardIds: readonly StandardCardId[];
  discardCardIds: readonly StandardCardId[];
}
