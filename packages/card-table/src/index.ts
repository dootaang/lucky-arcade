import { XorShift32 } from "@lucky-arcade/engine";

export const STANDARD_CARD_SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export const STANDARD_CARD_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"] as const;
export type StandardCardSuit = (typeof STANDARD_CARD_SUITS)[number];
export type StandardCardRank = (typeof STANDARD_CARD_RANKS)[number];
export type StandardCardId = `${StandardCardSuit}-${StandardCardRank}`;
export interface StandardCard { id: StandardCardId; suit: StandardCardSuit; rank: StandardCardRank; }

export const STANDARD_CARD_DECK: readonly StandardCard[] = STANDARD_CARD_RANKS.flatMap((rank) => STANDARD_CARD_SUITS.map((suit) => ({ id: `${suit}-${rank}` as StandardCardId, suit, rank })));
const STANDARD_CARD_BY_ID = new Map(STANDARD_CARD_DECK.map((card) => [card.id, card]));

export function standardCardById(id: string): StandardCard {
  const card = STANDARD_CARD_BY_ID.get(id as StandardCardId);
  if (!card) throw new Error(`standard_card_missing:${id}`);
  return card;
}

export function standardRankValue(cardOrId: StandardCard | string): number {
  const card = typeof cardOrId === "string" ? standardCardById(cardOrId) : cardOrId;
  return STANDARD_CARD_RANKS.indexOf(card.rank) + 2;
}

export function standardCardStrength(cardOrId: StandardCard | string): number {
  const card = typeof cardOrId === "string" ? standardCardById(cardOrId) : cardOrId;
  return STANDARD_CARD_RANKS.indexOf(card.rank) * STANDARD_CARD_SUITS.length + STANDARD_CARD_SUITS.indexOf(card.suit);
}

export function shuffledStandardDeck(seed: string): StandardCardId[] {
  const output = STANDARD_CARD_DECK.map((card) => card.id);
  const rng = new XorShift32(seed);
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = rng.nextUint32() % (index + 1);
    [output[index], output[target]] = [output[target] as StandardCardId, output[index] as StandardCardId];
  }
  return output;
}
