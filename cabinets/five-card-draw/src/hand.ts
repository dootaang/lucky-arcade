import { standardCardById, standardRankValue, type StandardCardId } from "@lucky-arcade/card-table";
import type { PokerHandValue } from "./contracts.ts";

const LABELS = [
  "하이 카드",
  "원 페어",
  "투 페어",
  "트리플",
  "스트레이트",
  "플러시",
  "풀 하우스",
  "포카드",
  "스트레이트 플러시",
] as const;

export function evaluatePokerHand(hand: readonly StandardCardId[]): PokerHandValue {
  if (hand.length !== 5 || new Set(hand).size !== 5) throw new Error("five_card_draw_hand_invalid");

  const cards = hand.map(standardCardById);
  const values = cards.map(standardRankValue).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const straightHigh = getStraightHigh(values);

  if (flush && straightHigh !== null) return value(8, [straightHigh]);
  if (groups[0]?.[1] === 4) return value(7, [groups[0][0], groups[1]?.[0] ?? 0]);
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) return value(6, [groups[0][0], groups[1][0]]);
  if (flush) return value(5, values);
  if (straightHigh !== null) return value(4, [straightHigh]);
  if (groups[0]?.[1] === 3) {
    const kickers = groups.filter((group) => group[1] === 1).map((group) => group[0]).sort((a, b) => b - a);
    return value(3, [groups[0][0], ...kickers]);
  }

  const pairs = groups.filter((group) => group[1] === 2).map((group) => group[0]).sort((a, b) => b - a);
  if (pairs.length === 2) {
    const kicker = groups.find((group) => group[1] === 1)?.[0] ?? 0;
    return value(2, [...pairs, kicker]);
  }
  if (pairs.length === 1) {
    const kickers = groups.filter((group) => group[1] === 1).map((group) => group[0]).sort((a, b) => b - a);
    return value(1, [pairs[0] as number, ...kickers]);
  }
  return value(0, values);
}

export function comparePokerHands(left: PokerHandValue, right: PokerHandValue): number {
  if (left.categoryRank !== right.categoryRank) return Math.sign(left.categoryRank - right.categoryRank);
  const length = Math.max(left.kickers.length, right.kickers.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left.kickers[index] ?? 0) - (right.kickers[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function getStraightHigh(values: readonly number[]): number | null {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.length !== 5) return null;
  if (unique.join(",") === "14,5,4,3,2") return 5;
  return unique[0] !== undefined && unique[0] - (unique[4] ?? 0) === 4 ? unique[0] : null;
}

function value(categoryRank: number, kickers: readonly number[]): PokerHandValue {
  const category = [
    "high-card",
    "one-pair",
    "two-pair",
    "three-of-a-kind",
    "straight",
    "flush",
    "full-house",
    "four-of-a-kind",
    "straight-flush",
  ] as const;
  return {
    category: category[categoryRank] as PokerHandValue["category"],
    categoryRank,
    kickers,
    label: categoryRank === 8 && kickers[0] === 14 ? "로열 플러시" : LABELS[categoryRank] as string,
  };
}
