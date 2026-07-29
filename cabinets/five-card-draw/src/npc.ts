import { standardCardById, standardRankValue, type StandardCardId } from "@lucky-arcade/card-table";
import { XorShift32 } from "@lucky-arcade/engine";
import type { FiveCardDrawBetAction, NpcBetObservation, NpcDrawDecision, NpcDrawObservation } from "./contracts.ts";
import { evaluatePokerHand } from "./hand.ts";

export function decideNpcDraw(observation: NpcDrawObservation): NpcDrawDecision {
  validateDrawObservation(observation);
  const rng = new XorShift32(observation.seed);
  const basic = basicDrawDecision(observation.hand);
  const value = evaluatePokerHand(observation.hand);
  const weak = value.categoryRank <= 1;
  const standPatBluff = weak
    && observation.persona.bluffFrequency > .45
    && rng.next() < observation.persona.bluffFrequency * (.16 + observation.persona.counterRead * .2);
  if (standPatBluff) return { discardCardIds: [], reason: "bluff-stand-pat" };
  if (observation.persona.drawSkill < .42 && basic.discardCardIds.length > 1 && rng.next() > observation.persona.drawSkill + .2) {
    return { ...basic, discardCardIds: basic.discardCardIds.slice(0, Math.max(1, basic.discardCardIds.length - 1)) };
  }
  return basic;
}

export function chooseNpcBetAction(observation: NpcBetObservation): FiveCardDrawBetAction {
  validateBetObservation(observation);
  const rng = new XorShift32(observation.seed);
  const value = evaluatePokerHand(observation.hand);
  const high = (value.kickers[0] ?? 2) / 14;
  const made = value.categoryRank / 8;
  const exchangeSignal = opponentStrengthSignal(observation.visibleExchangeCounts);
  const multiwayPenalty = Math.max(0, observation.activeSeatCount - 2) * .055;
  const reading = observation.persona.handReading * exchangeSignal * .2;
  const noise = (rng.next() - .5) * (.42 - observation.persona.discipline * .2);
  const bluff = rng.next() < observation.persona.bluffFrequency * (observation.phase === "opening-bet" ? .32 : .22);
  const strength = made * .74 + high * .16 + reading - multiwayPenalty + noise + (bluff ? .34 : 0);
  const toCall = observation.currentBetUnits - observation.ownContributionUnits;
  const canRaise = observation.currentBetUnits === 1;

  if (toCall > 0) {
    const foldLine = .24 + toCall * .13 + observation.persona.discipline * .12;
    if (strength < foldLine && !bluff) return "fold";
    if (canRaise && strength > .72 - observation.persona.aggression * .18) return "raise";
    return "call";
  }
  if (observation.currentBetUnits === 0) {
    return strength > .47 - observation.persona.aggression * .2 ? "bet" : "check";
  }
  if (canRaise && strength > .78 - observation.persona.aggression * .2) return "raise";
  return "check";
}

export function basicDrawDecision(hand: readonly StandardCardId[]): NpcDrawDecision {
  if (hand.length !== 5 || new Set(hand).size !== 5) throw new Error("five_card_draw_npc_hand_invalid");
  const evaluated = evaluatePokerHand(hand);
  const cards = hand.map((id) => ({ id, card: standardCardById(id), value: standardRankValue(id) }));
  const rankCounts = count(cards.map((card) => card.value));

  if (["straight-flush", "full-house", "flush", "straight"].includes(evaluated.category)) return { discardCardIds: [], reason: "stand-pat" };
  if (evaluated.category === "four-of-a-kind") return decision(cards.filter((card) => rankCounts.get(card.value) !== 4).map((card) => card.id), "keep-four-kind");
  if (evaluated.category === "three-of-a-kind") return decision(cards.filter((card) => rankCounts.get(card.value) !== 3).map((card) => card.id), "keep-trips");
  if (evaluated.category === "two-pair") return decision(cards.filter((card) => rankCounts.get(card.value) === 1).map((card) => card.id), "keep-two-pair");
  if (evaluated.category === "one-pair") return decision(cards.filter((card) => rankCounts.get(card.value) !== 2).map((card) => card.id), "keep-pair");

  const suits = new Map<string, StandardCardId[]>();
  for (const item of cards) suits.set(item.card.suit, [...(suits.get(item.card.suit) ?? []), item.id]);
  const fourFlush = [...suits.values()].find((ids) => ids.length === 4);
  if (fourFlush) return decision(hand.filter((id) => !fourFlush.includes(id)), "draw-to-flush");
  const straightKeep = bestFourCardStraight(cards);
  if (straightKeep.length === 4) return decision(hand.filter((id) => !straightKeep.includes(id)), "draw-to-straight");
  const highCards = cards.filter((card) => card.value >= 11).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)).slice(0, 2).map((card) => card.id);
  const keep = highCards.length > 0 ? highCards : [cards.toSorted((a, b) => b.value - a.value || a.id.localeCompare(b.id))[0]!.id];
  return decision(hand.filter((id) => !keep.includes(id)), "keep-high-cards");
}

function opponentStrengthSignal(counts: Readonly<Partial<Record<string, number>>>): number {
  const visible = Object.values(counts).filter((value): value is number => value !== undefined);
  if (visible.length === 0) return 0;
  return visible.reduce((sum, count) => sum + (count === 0 ? .65 : count === 1 ? .45 : count === 2 ? .15 : -.15), 0) / visible.length;
}

function bestFourCardStraight(cards: readonly { id: StandardCardId; value: number }[]): StandardCardId[] {
  const sequences = [[14,5,4,3,2],[6,5,4,3,2],[7,6,5,4,3],[8,7,6,5,4],[9,8,7,6,5],[10,9,8,7,6],[11,10,9,8,7],[12,11,10,9,8],[13,12,11,10,9],[14,13,12,11,10]];
  return sequences.map((sequence, index) => ({ index, cards: sequence.flatMap((rank) => {
    const found = cards.filter((card) => card.value === rank).toSorted((a,b)=>a.id.localeCompare(b.id))[0];
    return found ? [found] : [];
  }) })).filter((candidate) => candidate.cards.length === 4).toSorted((a,b)=>b.index-a.index)[0]?.cards.map((card)=>card.id) ?? [];
}

function decision(discardCardIds: readonly StandardCardId[], reason: NpcDrawDecision["reason"]): NpcDrawDecision {
  return { discardCardIds: [...discardCardIds].sort().slice(0, 3), reason };
}
function count(values: readonly number[]): Map<number, number> { const output=new Map<number,number>();for(const value of values)output.set(value,(output.get(value)??0)+1);return output; }
function validateDrawObservation(value:NpcDrawObservation):void {
  if(value.hand.length!==5||new Set(value.hand).size!==5)throw new Error("five_card_draw_npc_hand_invalid");
  if(value.activeSeatCount<2||value.activeSeatCount>4)throw new Error("five_card_draw_active_seats_invalid");
}
function validateBetObservation(value:NpcBetObservation):void {
  if(value.hand.length!==5||new Set(value.hand).size!==5)throw new Error("five_card_draw_npc_hand_invalid");
  if(value.currentBetUnits<0||value.currentBetUnits>2||value.ownContributionUnits<0||value.ownContributionUnits>2)throw new Error("five_card_draw_bet_observation_invalid");
}
