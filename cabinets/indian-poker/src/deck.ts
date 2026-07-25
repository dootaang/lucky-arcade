import type { IndianPokerCard, PlayingRank, PlayingSuit } from "./contracts.ts";

export const PLAYING_SUITS: readonly PlayingSuit[] = ["clubs", "diamonds", "hearts", "spades"];
export const PLAYING_RANKS: readonly PlayingRank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"];
export const INDIAN_POKER_DECK: readonly IndianPokerCard[] = PLAYING_RANKS.flatMap((rank) => PLAYING_SUITS.map((suit) => ({ id: `${suit}-${rank}`, suit, rank })));

export function cardStrength(card: IndianPokerCard): number { return PLAYING_RANKS.indexOf(card.rank) * PLAYING_SUITS.length + PLAYING_SUITS.indexOf(card.suit); }
