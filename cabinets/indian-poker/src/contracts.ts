import type { TableSeatCharacter } from "@lucky-arcade/cabinet-sdk";
import type { StandardCardId } from "@lucky-arcade/card-table";

export const INDIAN_POKER_VERSION = "indian-poker/0.4" as const;
export const INDIAN_POKER_STATE_CONTRACT = "indian-poker-state/0.3" as const;
export const TEMEROSA_INDIAN_POKER_PACK_VERSION = "temerosa-indian-poker/0.4" as const;
export const INDIAN_POKER_TERMS_VERSION = "temerosa-indian-poker-paytable/0.4" as const;
export const INDIAN_POKER_STAKES = [10, 50, 200] as const;
export const INDIAN_POKER_ROUND_COUNTS = [5, 7] as const;
export const INDIAN_POKER_DEFAULT_ROUND_COUNT = 7;
export const INDIAN_POKER_STARTING_CHIPS = 12;
export const INDIAN_POKER_BET_SIZES = [1, 2] as const;

export type IndianPokerStake = (typeof INDIAN_POKER_STAKES)[number];
export type IndianPokerRoundCount = (typeof INDIAN_POKER_ROUND_COUNTS)[number];
export type IndianPokerBetSize = (typeof INDIAN_POKER_BET_SIZES)[number];
export type IndianPokerSeatId = "player" | "npc";
export type IndianPokerStatus = "ready" | "player-action" | "npc-action" | "showdown" | "complete";
export type IndianPokerMoveKind = "check" | "bet" | "call" | "fold";
export type IndianPokerOutcome = "player" | "npc" | "draw" | null;

export interface IndianPokerPersona {
  aggression: number;
  bluffFrequency: number;
  slowPlay: number;
  estimationNoise: number;
  tellReliability: number;
  tiltResponse: number;
}

export interface IndianPokerCharacter extends TableSeatCharacter {
  persona: IndianPokerPersona;
}

export interface IndianPokerCartridge {
  contract: "indian-poker-cartridge/0.3";
  version: string;
  title: string;
  characters: readonly IndianPokerCharacter[];
}

export interface IndianPokerRoundMove {
  seatId: IndianPokerSeatId;
  kind: IndianPokerMoveKind;
  amount: 0 | IndianPokerBetSize;
}

export interface IndianPokerRoundResult {
  round: number;
  opener: IndianPokerSeatId;
  playerCardId: StandardCardId;
  npcCardId: StandardCardId;
  moves: readonly IndianPokerRoundMove[];
  pot: number;
  winner: "player" | "npc" | "draw";
  playerCardRevealed: boolean;
  playerChipDelta: number;
  npcChipDelta: number;
}

export interface IndianPokerState {
  contract: typeof INDIAN_POKER_STATE_CONTRACT;
  version: typeof INDIAN_POKER_VERSION;
  packVersion: string;
  sessionId: string;
  seed: string;
  sequence: number;
  status: IndianPokerStatus;
  opponentId: string;
  round: number;
  roundCount: IndianPokerRoundCount;
  firstOpener: IndianPokerSeatId;
  roundOpener: IndianPokerSeatId | null;
  deck: readonly StandardCardId[];
  cursor: number;
  playerCardId: StandardCardId | null;
  npcCardId: StandardCardId | null;
  roundMoves: readonly IndianPokerRoundMove[];
  currentBet: 0 | IndianPokerBetSize;
  npcReaction: "neutral" | "pleased" | "tense";
  playerChips: number;
  npcChips: number;
  roundStartPlayerChips: number;
  roundStartNpcChips: number;
  pot: number;
  history: readonly IndianPokerRoundResult[];
  stake: IndianPokerStake | null;
  wagerId: string | null;
  creditAmount: number;
  outcome: IndianPokerOutcome;
}

export type IndianPokerPlayerDecision =
  | { kind: "check" | "call" | "fold" }
  | { kind: "bet"; amount: IndianPokerBetSize };

export type IndianPokerAction =
  | { type: "select-opponent"; opponentId: string }
  | { type: "select-round-count"; roundCount: IndianPokerRoundCount }
  | { type: "random-opponent" }
  | { type: "start"; seed: string; stake: IndianPokerStake; wagerId: string; roundCount: IndianPokerRoundCount }
  | { type: "player-act"; decision: IndianPokerPlayerDecision }
  | { type: "npc-act" }
  | { type: "next-round" }
  | { type: "restart"; seed: string };

export function isIndianPokerState(value: unknown): value is IndianPokerState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<IndianPokerState>;
  return state.contract === INDIAN_POKER_STATE_CONTRACT && state.version === INDIAN_POKER_VERSION
    && typeof state.packVersion === "string" && typeof state.sessionId === "string" && typeof state.seed === "string"
    && typeof state.opponentId === "string" && Number.isInteger(state.sequence) && Number.isInteger(state.round)
    && INDIAN_POKER_ROUND_COUNTS.includes(state.roundCount as IndianPokerRoundCount)
    && (state.firstOpener === "player" || state.firstOpener === "npc")
    && (state.roundOpener === null || state.roundOpener === "player" || state.roundOpener === "npc")
    && Number.isInteger(state.cursor) && Number.isInteger(state.playerChips) && Number.isInteger(state.npcChips)
    && Number.isInteger(state.pot) && Array.isArray(state.deck) && Array.isArray(state.history) && Array.isArray(state.roundMoves)
    && ["ready", "player-action", "npc-action", "showdown", "complete"].includes(state.status ?? "");
}
