import type { IndianPokerCard, IndianPokerSeatId, IndianPokerState } from "./contracts.ts";
import { cardStrength } from "./deck.ts";

export interface IndianPokerDecisionRead { visibleStrengths: number[]; round: number; scoreGap: number; foldsSoFar: number; }
export interface IndianPokerExpressionRead { playerCardStrength: number; round: number; }

export function decisionRead(state: IndianPokerState, seatId: IndianPokerSeatId, cards: ReadonlyMap<string, IndianPokerCard>): IndianPokerDecisionRead {
  const visibleStrengths = Object.entries(state.hands).filter(([otherId, cardId]) => otherId !== seatId && cardId !== null).map(([, cardId]) => cardStrength(requireCard(cards, cardId as string)));
  const lead = Math.max(...Object.values(state.seats).map((seat) => seat.score));
  return { visibleStrengths, round: state.round, scoreGap: lead - state.seats[seatId].score, foldsSoFar: state.history.filter((round) => round.choices[seatId] === "fold").length };
}

export function expressionRead(state: IndianPokerState, cards: ReadonlyMap<string, IndianPokerCard>): IndianPokerExpressionRead {
  const cardId = state.hands.player;
  if (!cardId) throw new Error("indian_poker_player_card_missing");
  return { playerCardStrength: cardStrength(requireCard(cards, cardId)), round: state.round };
}

function requireCard(cards: ReadonlyMap<string, IndianPokerCard>, id: string): IndianPokerCard { const card = cards.get(id); if (!card) throw new Error(`indian_poker_card_missing:${id}`); return card; }
