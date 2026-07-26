import type { TableSeatCharacter } from "@lucky-arcade/cabinet-sdk";
import type { StandardCardId } from "@lucky-arcade/card-table";

export const INDIAN_POKER_VERSION = "indian-poker/0.3" as const;
export const INDIAN_POKER_STATE_CONTRACT = "indian-poker-state/0.2" as const;
export const TEMEROSA_INDIAN_POKER_PACK_VERSION = "temerosa-indian-poker/0.3" as const;
export const INDIAN_POKER_TERMS_VERSION = "temerosa-indian-poker-paytable/0.2" as const;
export const INDIAN_POKER_STAKES = [10, 50, 200] as const;
export const INDIAN_POKER_ROUNDS = 5;
export const INDIAN_POKER_STARTING_CHIPS = 10;

export type IndianPokerStake = (typeof INDIAN_POKER_STAKES)[number];
export type IndianPokerStatus = "ready" | "player-action" | "npc-response" | "showdown" | "complete";
export type IndianPokerPlayerAction = "check" | "call" | "raise" | "fold";
export type IndianPokerNpcAction = "check" | "raise" | "call" | "fold";
export type IndianPokerOutcome = "player" | "npc" | "draw" | null;

export interface IndianPokerPersona {
  riskAppetite: number;
  readAccuracy: number;
  deceptionBias: number;
  consistency: number;
}

export interface IndianPokerCharacter extends TableSeatCharacter {
  persona: IndianPokerPersona;
}

export interface IndianPokerCartridge {
  contract: "indian-poker-cartridge/0.2";
  version: string;
  title: string;
  characters: readonly IndianPokerCharacter[];
}

export interface IndianPokerRoundResult {
  round: number;
  playerCardId: StandardCardId;
  npcCardId: StandardCardId;
  npcOpening: "check" | "raise";
  playerAction: IndianPokerPlayerAction;
  npcResponse: "call" | "fold" | null;
  pot: number;
  winner: "player" | "npc" | "draw";
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
  deck: readonly StandardCardId[];
  cursor: number;
  playerCardId: StandardCardId | null;
  npcCardId: StandardCardId | null;
  npcOpening: "check" | "raise" | null;
  playerAction: IndianPokerPlayerAction | null;
  npcResponse: "call" | "fold" | null;
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

export type IndianPokerAction =
  | { type: "select-opponent"; opponentId: string }
  | { type: "random-opponent" }
  | { type: "start"; seed: string; stake: IndianPokerStake; wagerId: string }
  | { type: "player-act"; action: IndianPokerPlayerAction }
  | { type: "npc-respond" }
  | { type: "next-round" }
  | { type: "restart"; seed: string };

export function isIndianPokerState(value: unknown): value is IndianPokerState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<IndianPokerState>;
  return state.contract === INDIAN_POKER_STATE_CONTRACT && state.version === INDIAN_POKER_VERSION
    && typeof state.packVersion === "string" && typeof state.sessionId === "string" && typeof state.seed === "string"
    && typeof state.opponentId === "string" && Number.isInteger(state.sequence) && Number.isInteger(state.round)
    && Number.isInteger(state.cursor) && Number.isInteger(state.playerChips) && Number.isInteger(state.npcChips)
    && Number.isInteger(state.pot) && Array.isArray(state.deck) && Array.isArray(state.history)
    && ["ready", "player-action", "npc-response", "showdown", "complete"].includes(state.status ?? "");
}
