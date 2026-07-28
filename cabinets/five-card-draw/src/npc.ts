import { standardCardById, standardRankValue, type StandardCardId } from "@lucky-arcade/card-table";
import type { NpcDrawDecision, NpcDrawObservation } from "./contracts.ts";
import { evaluatePokerHand } from "./hand.ts";

export function decideNpcDraw(observation: NpcDrawObservation): NpcDrawDecision {
  validateObservation(observation);
  const hand = [...observation.hand];
  const evaluated = evaluatePokerHand(hand);
  const cards = hand.map((id) => ({ id, card: standardCardById(id), value: standardRankValue(id) }));
  const rankCounts = count(cards.map((card) => card.value));

  if (evaluated.category === "straight-flush" || evaluated.category === "full-house" || evaluated.category === "flush" || evaluated.category === "straight") {
    return { discardCardIds: [], reason: "stand-pat" };
  }
  if (evaluated.category === "four-of-a-kind") {
    return decision(cards.filter((card) => rankCounts.get(card.value) !== 4).map((card) => card.id), "keep-four-kind");
  }
  if (evaluated.category === "three-of-a-kind") {
    return decision(cards.filter((card) => rankCounts.get(card.value) !== 3).map((card) => card.id), "keep-trips");
  }
  if (evaluated.category === "two-pair") {
    return decision(cards.filter((card) => rankCounts.get(card.value) === 1).map((card) => card.id), "keep-two-pair");
  }
  if (evaluated.category === "one-pair") {
    return decision(cards.filter((card) => rankCounts.get(card.value) !== 2).map((card) => card.id), "keep-pair");
  }

  const suits = new Map<string, StandardCardId[]>();
  for (const item of cards) suits.set(item.card.suit, [...(suits.get(item.card.suit) ?? []), item.id]);
  const fourFlush = [...suits.values()].find((ids) => ids.length === 4);
  if (fourFlush) return decision(hand.filter((id) => !fourFlush.includes(id)), "draw-to-flush");

  const straightKeep = bestFourCardStraight(cards);
  if (straightKeep.length === 4) return decision(hand.filter((id) => !straightKeep.includes(id)), "draw-to-straight");

  const highCards = cards
    .filter((card) => card.value >= 11)
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
    .slice(0, 2)
    .map((card) => card.id);
  const keep = highCards.length > 0
    ? highCards
    : [cards.toSorted((a, b) => b.value - a.value || a.id.localeCompare(b.id))[0]?.id as StandardCardId];
  return decision(hand.filter((id) => !keep.includes(id)), "keep-high-cards");
}

function bestFourCardStraight(
  cards: readonly { id: StandardCardId; value: number }[],
): StandardCardId[] {
  const sequences = [
    [14, 5, 4, 3, 2],
    [6, 5, 4, 3, 2],
    [7, 6, 5, 4, 3],
    [8, 7, 6, 5, 4],
    [9, 8, 7, 6, 5],
    [10, 9, 8, 7, 6],
    [11, 10, 9, 8, 7],
    [12, 11, 10, 9, 8],
    [13, 12, 11, 10, 9],
    [14, 13, 12, 11, 10],
  ];
  const candidates = sequences
    .map((sequence, index) => ({
      index,
      cards: sequence.flatMap((rank) => {
        const matches = cards.filter((card) => card.value === rank).sort((a, b) => a.id.localeCompare(b.id));
        return matches.length === 0 ? [] : [matches[0] as { id: StandardCardId; value: number }];
      }),
    }))
    .filter((candidate) => candidate.cards.length === 4)
    .sort((a, b) => b.index - a.index);
  return candidates[0]?.cards.map((card) => card.id) ?? [];
}

function count(values: readonly number[]): Map<number, number> {
  const output = new Map<number, number>();
  for (const value of values) output.set(value, (output.get(value) ?? 0) + 1);
  return output;
}

function decision(discardCardIds: readonly StandardCardId[], reason: NpcDrawDecision["reason"]): NpcDrawDecision {
  return { discardCardIds: [...discardCardIds].sort(), reason };
}

function validateObservation(observation: NpcDrawObservation): void {
  if (observation.hand.length !== 5 || new Set(observation.hand).size !== 5) throw new Error("five_card_draw_npc_hand_invalid");
  if (!Number.isInteger(observation.playerExchangeCount) || observation.playerExchangeCount < 0 || observation.playerExchangeCount > 5) {
    throw new Error("five_card_draw_exchange_count_invalid");
  }
}
