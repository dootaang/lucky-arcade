import { standardCardById, standardRankValue, type StandardCardId } from "@lucky-arcade/card-table";
import { XorShift32, expressSignal, weightedChoice } from "@lucky-arcade/engine";
import type {
  FiveCardDrawBetAction,
  FiveCardDrawPersona,
  FiveCardDrawTell,
  NpcBetObservation,
  NpcDrawDecision,
  NpcDrawObservation,
} from "./contracts.ts";
import { FIVE_CARD_DRAW_STREET_CAP_UNITS } from "./contracts.ts";
import { evaluatePokerHand } from "./hand.ts";

export function decideNpcDraw(observation: NpcDrawObservation): NpcDrawDecision {
  validateDrawObservation(observation);
  const rng = new XorShift32(observation.seed);
  const basic = basicDrawDecision(observation.hand);
  const value = evaluatePokerHand(observation.hand);
  const weak = value.categoryRank <= 1;
  const standPatBluff = weak
    && observation.persona.deceptionBias > .45
    && rng.next() < observation.persona.deceptionBias * (.12 + observation.persona.riskAppetite * .16);
  if (standPatBluff) return { discardCardIds: [], reason: "bluff-stand-pat" };
  if (observation.persona.drawActivity < .42 && basic.discardCardIds.length > 1 && rng.next() > observation.persona.consistency + .08) {
    return { ...basic, discardCardIds: basic.discardCardIds.slice(0, Math.max(1, basic.discardCardIds.length - 1)) };
  }
  return basic;
}

export function chooseNpcBetAction(observation: NpcBetObservation): FiveCardDrawBetAction {
  validateBetObservation(observation);
  const value = evaluatePokerHand(observation.hand);
  const strength = pokerDecisionStrength(observation.hand, observation.phase);
  const read = publicReadAdjustment(observation);
  const plan = pokerPlan(observation.planSeed, observation.persona, strength);
  const toCall = observation.currentBetUnits - observation.ownContributionUnits;
  const canRaise = observation.currentBetUnits >= 1 && observation.currentBetUnits < FIVE_CARD_DRAW_STREET_CAP_UNITS;
  const isCounterRaise = observation.currentBetUnits === FIVE_CARD_DRAW_STREET_CAP_UNITS - 1;
  const potOdds = toCall > 0 ? toCall / Math.max(1, observation.potUnits + toCall) : 0;
  const multiway = Math.max(0, observation.activeSeatCount - 2);
  const temperature = .065 + (1 - observation.persona.consistency) * .085;
  const planBoost = plan === "bluff" && strength < .5 ? .12 : plan === "protect" ? .035 : 0;
  const effective = clamp01(strength + read + planBoost);

  if (toCall > 0) {
    const callLine = (observation.phase === "opening-bet" ? .42 : .43)
      + toCall * .035 + multiway * .018 - Math.min(.07, potOdds * .35)
      - (observation.persona.riskAppetite - .5) * .09;
    const margin = effective - callLine;
    const foldSafety = value.categoryRank >= 4 ? 0 : value.categoryRank >= 2 ? .055 : 1;
    const foldWeight = Math.exp(clamp(-margin / temperature, -5, 5)) * foldSafety;
    const callWeight = Math.exp(clamp(margin / temperature, -5, 5));
    if (!canRaise) return weightedAction(["fold", "call"], [foldWeight, callWeight], observation.seed);
    const raiseLine = isCounterRaise ? .75 : .64;
    const raiseDrive = effective + observation.persona.riskAppetite * (isCounterRaise ? .1 : .13)
      + (plan === "bluff" ? observation.persona.deceptionBias * (isCounterRaise ? .07 : .12) : 0) - raiseLine;
    const raiseWeight = Math.exp(clamp(raiseDrive / temperature, -5, 4));
    return weightedAction(["fold", "call", "raise"], [foldWeight, callWeight, raiseWeight], observation.seed);
  }
  const initiativeLine = observation.phase === "opening-bet" ? .43 : .48;
  const initiative = effective + observation.persona.riskAppetite * .12
    + (plan === "bluff" ? observation.persona.deceptionBias * .13 : 0) - initiativeLine;
  const aggressiveWeight = Math.exp(clamp(initiative / temperature, -5, 5));
  const passiveWeight = Math.exp(clamp(-initiative / temperature, -5, 5)) * (plan === "trap" ? 1.8 : 1);
  if (observation.currentBetUnits === 0) {
    return weightedAction(["check", "bet"], [passiveWeight, aggressiveWeight], observation.seed);
  }
  if (canRaise) return weightedAction(["check", "raise"], [passiveWeight, aggressiveWeight], observation.seed);
  return "check";
}

export function pokerDecisionStrength(hand: readonly StandardCardId[], phase: NpcBetObservation["phase"]): number {
  const value = evaluatePokerHand(hand);
  const opening = [.255, .445, .68, .77, .84, .87, .93, .985, 1] as const;
  const closing = [.16, .385, .63, .73, .82, .86, .93, .985, 1] as const;
  const baseline = (phase === "opening-bet" ? opening : closing)[value.categoryRank] ?? 0;
  const rankDetail = Math.max(0, Math.min(12, (value.kickers[0] ?? 2) - 2)) / 12 * (value.categoryRank <= 1 ? .065 : .025);
  if (phase === "closing-bet" || value.categoryRank > 0) return clamp01(baseline + rankDetail);
  const draw = basicDrawDecision(hand).reason;
  const drawBonus = draw === "draw-to-flush" ? .12 : draw === "draw-to-straight" ? .105 : draw === "keep-high-cards" ? .02 : 0;
  return clamp01(baseline + rankDetail + drawBonus);
}

export function selectPokerTell(
  hand: readonly StandardCardId[],
  phase: NpcBetObservation["phase"],
  persona: FiveCardDrawPersona,
  seed: string,
): FiveCardDrawTell {
  const strength = pokerDecisionStrength(hand, phase);
  const truth: FiveCardDrawTell = strength >= .61 ? "confident" : strength <= .31 ? "uneasy" : "neutral";
  if (truth === "neutral") return truth;
  const deceptive: FiveCardDrawTell = truth === "confident" ? "uneasy" : "confident";
  const weights = persona.tellStyle === "open" ? { truth: 80, neutral: 20, deceptive: 0 }
    : persona.tellStyle === "guarded" ? { truth: 42, neutral: 58, deceptive: 0 }
      : persona.tellStyle === "bluffer" ? { truth: 25, neutral: 30, deceptive: 45 }
        : { truth: 45, neutral: 55, deceptive: 0 };
  return expressSignal(truth, "neutral", deceptive, weights, seed);
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

function publicReadAdjustment(observation: NpcBetObservation): number {
  const exchange = opponentStrengthSignal(observation.visibleExchangeCounts, observation.seatId);
  const tells = opponentTellSignal(observation.visibleTells, observation.seatId);
  const actions = actionStrengthSignal(observation);
  const ambiguous = -(exchange * .09 + tells * .065) * observation.persona.signalTrust;
  return observation.persona.signalAttention * (ambiguous - actions * .075);
}

function opponentStrengthSignal(counts: Readonly<Partial<Record<string, number>>>, ownSeatId: string): number {
  const visible = Object.entries(counts)
    .filter((entry): entry is [string, number] => entry[0] !== ownSeatId && entry[1] !== undefined)
    .map(([, value]) => value);
  if (visible.length === 0) return 0;
  return visible.reduce((sum, count) => sum + (count === 0 ? .65 : count === 1 ? .45 : count === 2 ? .15 : -.15), 0) / visible.length;
}

function opponentTellSignal(tells: NpcBetObservation["visibleTells"], ownSeatId: string): number {
  const visible = Object.entries(tells).filter(([seatId]) => seatId !== ownSeatId).map(([, tell]) => tell);
  if (visible.length === 0) return 0;
  return visible.reduce((sum, tell) => sum + (tell === "confident" ? .6 : tell === "uneasy" ? -.45 : 0), 0) / visible.length;
}

function actionStrengthSignal(observation: NpcBetObservation): number {
  const visible = observation.betHistory.filter((entry) => entry.phase === observation.phase && entry.seatId !== observation.seatId).slice(-4);
  if (visible.length === 0) return 0;
  return visible.reduce((sum, entry) => sum + (entry.action === "raise" ? .75 : entry.action === "bet" ? .5 : entry.action === "call" ? .15 : entry.action === "check" ? -.12 : 0), 0) / visible.length;
}

function pokerPlan(seed: string, persona: FiveCardDrawPersona, strength: number): "value" | "protect" | "bluff" | "trap" | "yield" {
  const rng = new XorShift32(seed);
  const first = rng.next();
  const second = rng.next();
  if (strength >= .72 && second < persona.consistency * .28) return "trap";
  if (strength >= .54) return "value";
  if (first < persona.deceptionBias * (.24 + persona.riskAppetite * .24)) return "bluff";
  if (strength >= .34 || second < persona.riskAppetite * .42) return "protect";
  return "yield";
}

function weightedAction<T extends FiveCardDrawBetAction>(actions: readonly T[], weights: readonly number[], seed: string): T {
  return actions[weightedChoice(weights, seed)] ?? actions[0]!;
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
  if(value.currentBetUnits<0||value.currentBetUnits>FIVE_CARD_DRAW_STREET_CAP_UNITS
    ||value.ownContributionUnits<0||value.ownContributionUnits>FIVE_CARD_DRAW_STREET_CAP_UNITS)throw new Error("five_card_draw_bet_observation_invalid");
  if(!Number.isInteger(value.potUnits)||value.potUnits<0||!value.planSeed)throw new Error("five_card_draw_bet_observation_invalid");
}
function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,value));}
function clamp01(value:number):number{return clamp(value,0,1);}
