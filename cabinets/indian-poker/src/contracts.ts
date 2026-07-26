import type { SeatReaction, TableSeatCharacter } from "@lucky-arcade/cabinet-sdk";

export const INDIAN_POKER_VERSION = "indian-poker/0.2" as const;
export const TEMEROSA_INDIAN_POKER_PACK_VERSION = "temerosa-indian-poker/0.2" as const;
export const INDIAN_POKER_TERMS_VERSION = "temerosa-indian-poker-paytable/0.1" as const;
export const INDIAN_POKER_STAKES = [10, 50, 200] as const;
export type IndianPokerSeatId = "player" | "cpu-1" | "cpu-2" | "cpu-3";
export type IndianPokerStake = (typeof INDIAN_POKER_STAKES)[number];
export type IndianPokerChoice = "call" | "raise" | "fold";
export type PlayingSuit = "spades" | "hearts" | "diamonds" | "clubs";
export type PlayingRank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "j" | "q" | "k" | "a";
export interface IndianPokerCard { id: string; suit: PlayingSuit; rank: PlayingRank; }
export interface IndianPokerCartridge { contract: "indian-poker-cartridge/0.1"; version: string; title: string; characters: TableSeatCharacter[]; }
export interface IndianPokerRoundResult {
  round: number;
  choices: Record<IndianPokerSeatId, IndianPokerChoice>;
  cards: Record<IndianPokerSeatId, string>;
  winnerId: IndianPokerSeatId | null;
  scoreDelta: Record<IndianPokerSeatId, number>;
}
export interface IndianPokerState {
  contract: "indian-poker-state/0.1";
  version: typeof INDIAN_POKER_VERSION;
  packVersion: string;
  sessionId: string;
  seed: string;
  sequence: number;
  round: number;
  status: "ready" | "choosing" | "revealing" | "complete";
  seats: Record<IndianPokerSeatId, { characterId: string | null; score: number }>;
  hands: Record<IndianPokerSeatId, string | null>;
  choices: Record<IndianPokerSeatId, IndianPokerChoice | null>;
  reactions: Record<IndianPokerSeatId, SeatReaction>;
  lastRound: IndianPokerRoundResult | null;
  history: IndianPokerRoundResult[];
  stake: IndianPokerStake | null;
  wagerId: string | null;
  creditAmount: number;
}
export type IndianPokerAction = { type: "start"; seed: string; stake: IndianPokerStake; wagerId: string } | { type: "choose"; choice: IndianPokerChoice } | { type: "next_round" } | { type: "restart"; seed: string };
