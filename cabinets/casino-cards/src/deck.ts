import {
  STANDARD_CARD_DECK,
  STANDARD_CARD_RANKS,
  STANDARD_CARD_SUITS,
  shuffledStandardDeck,
  standardCardById,
  standardRankValue,
  type StandardCard,
  type StandardCardRank,
  type StandardCardSuit,
} from "@lucky-arcade/card-table";
import type { PokerHandValue } from "./contracts.ts";

export const SUITS = STANDARD_CARD_SUITS;
export const RANKS = STANDARD_CARD_RANKS;
export type CardSuit = StandardCardSuit;
export type CardRank = StandardCardRank;
export type { StandardCard };
export const STANDARD_DECK = STANDARD_CARD_DECK;
export const cardById = standardCardById;
export const rankValue = standardRankValue;
export const shuffledDeck = shuffledStandardDeck;

export function blackjackValue(cards: readonly string[]): number {
  let total = 0, aces = 0;
  for (const id of cards) { const rank = cardById(id).rank; if (rank === "a") { total += 11; aces += 1; } else total += rank === "j" || rank === "q" || rank === "k" ? 10 : Number(rank); }
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}

export function comparePokerHands(left: readonly string[], right: readonly string[]): number { return compareValues(bestPokerHand(left), bestPokerHand(right)); }
export function bestPokerHand(cards: readonly string[]): PokerHandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error("poker_hand_size_invalid");
  if (new Set(cards).size !== cards.length) throw new Error("poker_card_duplicate");
  let best: PokerHandValue | null = null;
  for (const five of combinations(cards, 5)) { const value = evaluateFive(five); if (!best || compareValues(value, best) > 0) best = value; }
  return best as PokerHandValue;
}
function evaluateFive(ids: readonly string[]): PokerHandValue {
  const cards = ids.map(cardById), values = cards.map((card) => RANKS.indexOf(card.rank) + 2).sort((a, b) => b - a);
  const counts = new Map<number, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const unique = [...new Set(values)]; if (unique[0] === 14) unique.push(1);
  let straightHigh = 0; for (let index = 0; index <= unique.length - 5; index += 1) if ((unique[index] ?? 0) - (unique[index + 4] ?? 0) === 4) { straightHigh = unique[index] ?? 0; break; }
  if (flush && straightHigh) return { category: 8, kickers: [straightHigh], label: "스트레이트 플러시" };
  if (groups[0]?.[1] === 4) return { category: 7, kickers: [groups[0][0], groups[1]?.[0] ?? 0], label: "포카드" };
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) return { category: 6, kickers: [groups[0][0], groups[1][0]], label: "풀하우스" };
  if (flush) return { category: 5, kickers: values, label: "플러시" };
  if (straightHigh) return { category: 4, kickers: [straightHigh], label: "스트레이트" };
  if (groups[0]?.[1] === 3) return { category: 3, kickers: [groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)], label: "트리플" };
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) return { category: 2, kickers: [Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2]?.[0] ?? 0], label: "투 페어" };
  if (groups[0]?.[1] === 2) return { category: 1, kickers: [groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)], label: "원 페어" };
  return { category: 0, kickers: values, label: "하이 카드" };
}
function compareValues(left: PokerHandValue, right: PokerHandValue): number { if (left.category !== right.category) return left.category - right.category; for (let index = 0; index < Math.max(left.kickers.length, right.kickers.length); index += 1) { const difference = (left.kickers[index] ?? 0) - (right.kickers[index] ?? 0); if (difference) return difference; } return 0; }
function combinations<T>(values: readonly T[], count: number): T[][] { const output: T[][] = []; const visit = (start: number, chosen: T[]) => { if (chosen.length === count) { output.push(chosen); return; } for (let index = start; index <= values.length - (count - chosen.length); index += 1) visit(index + 1, [...chosen, values[index] as T]); }; visit(0, []); return output; }
