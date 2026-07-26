import { STANDARD_CARD_DECK, standardRankValue, type StandardCard } from "@lucky-arcade/card-table";

export const INDIAN_POKER_DECK: readonly StandardCard[] = STANDARD_CARD_DECK;
/** Indian poker compares ranks only; equal ranks split the pot. */
export function cardStrength(card: StandardCard): number { return standardRankValue(card); }
