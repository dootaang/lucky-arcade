import type { StandardCardId } from "@lucky-arcade/card-table";
import type { PresentationStep } from "@lucky-arcade/ui/card-stage";
import { standardRankValue } from "@lucky-arcade/card-table";
import type { FiveCardDrawBetAction, FiveCardDrawSeatId, FiveCardDrawState, PokerHandValue } from "../contracts.ts";

/**
 * 코어 상태 두 개의 차이를 표현 이벤트로 옮긴다. 이 파일은 판정에 관여하지
 * 않는다. `game.ts`가 이미 결정한 결과를 어떤 순서로 보여줄지만 정한다.
 */

export interface DrawDealCard { readonly seatId: FiveCardDrawSeatId; readonly cardId: StandardCardId; readonly slot: number }

export type DrawStageEvent =
  | { readonly kind: "deal"; readonly token: string; readonly cards: readonly DrawDealCard[]; readonly stagger: number; readonly flightMs: number }
  | { readonly kind: "check"; readonly token: string; readonly seatId: FiveCardDrawSeatId }
  | { readonly kind: "chips"; readonly token: string; readonly seatId: FiveCardDrawSeatId; readonly action: FiveCardDrawBetAction; readonly units: number; readonly hesitation: number; readonly counterRaise: boolean }
  | { readonly kind: "fold"; readonly token: string; readonly seatId: FiveCardDrawSeatId; readonly cards: readonly StandardCardId[] }
  | { readonly kind: "stand-pat"; readonly token: string; readonly seatId: FiveCardDrawSeatId }
  | { readonly kind: "discard"; readonly token: string; readonly seatId: FiveCardDrawSeatId; readonly cards: readonly StandardCardId[]; readonly slots: readonly number[]; readonly leaving: readonly StandardCardId[] }
  | { readonly kind: "draw"; readonly token: string; readonly seatId: FiveCardDrawSeatId; readonly cards: readonly StandardCardId[]; readonly slots: readonly number[]; readonly leaving: readonly StandardCardId[]; readonly faceUp: boolean }
  | { readonly kind: "showdown-pause"; readonly token: string }
  | { readonly kind: "reveal"; readonly token: string; readonly seatIds: readonly FiveCardDrawSeatId[] }
  | { readonly kind: "verdict"; readonly token: string; readonly seatIds: readonly FiveCardDrawSeatId[]; readonly tier: number }
  | { readonly kind: "award"; readonly token: string; readonly seatIds: readonly FiveCardDrawSeatId[] };

const DEAL_FLIGHT_MS = 380;

export function planFiveCardDrawStage(previous: FiveCardDrawState, next: FiveCardDrawState): readonly PresentationStep<DrawStageEvent>[] {
  const token = `${next.context.sessionId}:${next.sequence}`;
  if (next.phase === "ready") return [];

  if (previous.phase === "ready") {
    const cards = dealSequence(next);
    if (cards.length === 0) return [];
    const stagger = Math.round(Math.min(72, 900 / Math.max(1, cards.length - 1)));
    return [{
      event: { kind: "deal", token, cards, stagger, flightMs: DEAL_FLIGHT_MS },
      duration: Math.min(1_600, (cards.length - 1) * stagger + DEAL_FLIGHT_MS + 260),
      // 손패가 자리에 있어야 좌석 앵커의 폭이 잡힌다. 카드는 비행이 내려앉는
      // 순간까지 투명하게 대기하다가 제자리에 나타난다.
      commit: true,
    }];
  }

  const steps: PresentationStep<DrawStageEvent>[] = [];
  const action = next.lastAction;
  if (action && action !== previous.lastAction) {
    const seatId = action.seatId;
    if (action.action === "fold") {
      steps.push({ event: { kind: "fold", token, seatId, cards: previous.hands[seatId] }, duration: 420 });
    } else if (action.action === "exchange") {
      const leaving = next.discarded[seatId];
      if (leaving.length === 0) steps.push({ event: { kind: "stand-pat", token, seatId }, duration: 420 });
      else {
        const slots = leaving.map((card) => previous.hands[seatId].indexOf(card)).filter((slot) => slot >= 0);
        const cards = slots.map((slot) => next.hands[seatId][slot]).filter((card): card is StandardCardId => card !== undefined);
        steps.push({ event: { kind: "discard", token, seatId, cards: leaving, slots, leaving }, duration: 240 + leaving.length * 70 });
        steps.push({ event: { kind: "draw", token, seatId, cards, slots, leaving, faceUp: seatId === "player" }, duration: 300 + cards.length * 70, commit: true });
      }
    } else if (action.action === "check") {
      steps.push({ event: { kind: "check", token, seatId }, duration: 300 });
    } else {
      const hesitation = hesitationFor(next, seatId);
      steps.push({ event: { kind: "chips", token, seatId, action: action.action, units: Math.max(1, action.amountUnits), hesitation,
        counterRaise: action.action === "raise" && previous.currentBetUnits === 2 }, duration: hesitation + 380 });
    }
  }

  const result = next.result;
  if (next.phase === "complete" && previous.phase !== "complete" && result) {
    const revealOrder = revealSequence(next).filter((seatId) => result.hands[seatId] !== undefined);
    const tier = revealOrder.reduce((best, seatId) => Math.max(best, handTier(result.values[seatId])), 0);
    const revealMs = revealOrder.length >= 4 ? 190 : 240;
    const shown: FiveCardDrawSeatId[] = [];
    if (revealOrder.length > 0) steps.push({ event: { kind: "showdown-pause", token }, duration: 620 });
    for (const [index, seatId] of revealOrder.entries()) {
      shown.push(seatId);
      steps.push({ event: { kind: "reveal", token, seatIds: [...shown] }, duration: revealMs, commit: index === 0 });
    }
    steps.push({
      event: { kind: "verdict", token, seatIds: result.winnerSeatIds, tier },
      duration: tier >= 7 ? 1_400 : tier >= 5 ? 820 : tier >= 3 ? 640 : 480,
      commit: revealOrder.length === 0,
    });
    steps.push({ event: { kind: "award", token, seatIds: result.winnerSeatIds }, duration: 420 });
  }
  return steps;
}

/** 딜러 다음 좌석부터 한 장씩, 다섯 바퀴. `game.ts`의 배분 순서와 같다. */
export function dealSequence(state: FiveCardDrawState): readonly DrawDealCard[] {
  const order = seatsAfterDealer(state);
  const cards: DrawDealCard[] = [];
  for (let round = 0; round < 5; round += 1) {
    for (const seatId of order) {
      const cardId = state.hands[seatId][round];
      if (cardId) cards.push({ seatId, cardId, slot: round });
    }
  }
  return cards;
}

/** 쇼다운 공개 순서. 딜러 다음 좌석부터 돌아 마지막이 딜러다. */
export function revealSequence(state: FiveCardDrawState): readonly FiveCardDrawSeatId[] {
  return seatsAfterDealer(state).filter((seatId) => !state.foldedSeatIds.includes(seatId));
}

export function handTier(value: PokerHandValue | undefined): number {
  if (!value) return 0;
  if (value.categoryRank === 8) return value.kickers[0] === 14 ? 7 : 6;
  if (value.categoryRank === 7) return 5;
  if (value.categoryRank === 6) return 4;
  if (value.categoryRank >= 4) return 3;
  if (value.categoryRank >= 2) return 2;
  return 1;
}

/** 족보를 이루는 카드와 곁다리 키커를 나눈다. 공개 시 테두리 색이 갈린다. */
export function handHighlight(hand: readonly StandardCardId[], value: PokerHandValue | undefined): ReadonlySet<StandardCardId> {
  if (!value) return new Set();
  if (value.categoryRank === 8 || value.categoryRank === 5 || value.categoryRank === 4) return new Set(hand);
  const ranks = new Set<number>();
  if (value.categoryRank === 6 || value.categoryRank === 2) { addRank(ranks, value.kickers[0]); addRank(ranks, value.kickers[1]); }
  else addRank(ranks, value.kickers[0]);
  return new Set(hand.filter((card) => ranks.has(standardRankValue(card))));
}

function addRank(ranks: Set<number>, value: number | undefined): void { if (value !== undefined) ranks.add(value); }

/** 공격적인 상대는 칩을 곧장 밀고, 신중한 상대는 한 박자 쉬었다 놓는다. */
function hesitationFor(state: FiveCardDrawState, seatId: FiveCardDrawSeatId): number {
  if (seatId === "player") return 0;
  const opponent = state.context.opponents[Number(seatId.slice(-1)) - 1];
  if (!opponent) return 90;
  return Math.round((1 - opponent.persona.riskAppetite) * 170);
}

function seatsAfterDealer(state: FiveCardDrawState): readonly FiveCardDrawSeatId[] {
  const seats = state.seatOrder;
  const dealer = seats[((state.dealerIndex % seats.length) + seats.length) % seats.length];
  const index = dealer ? seats.indexOf(dealer) : -1;
  return index < 0 ? [...seats] : [...seats.slice(index + 1), ...seats.slice(0, index + 1)];
}
