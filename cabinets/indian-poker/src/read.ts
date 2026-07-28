import type { StandardCardId } from "@lucky-arcade/card-table";
import type { IndianPokerState } from "./contracts.ts";

/** Legal NPC information: its own current card is deliberately absent. */
export interface IndianPokerNpcRead {
  visiblePlayerCardId: StandardCardId;
  previouslyRevealedCardIds: readonly StandardCardId[];
  round: number;
  playerChips: number;
  npcChips: number;
  pot: number;
  playerBets: number;
  playerFolds: number;
}

export interface IndianPokerExpressionRead { playerCardId: StandardCardId; round: number; }

export function npcRead(state: IndianPokerState): IndianPokerNpcRead {
  if (!state.playerCardId) throw new Error("indian_poker_player_card_missing");
  return {
    visiblePlayerCardId: state.playerCardId,
    previouslyRevealedCardIds: state.history.flatMap((round) => [round.playerCardId, round.npcCardId]),
    round: state.round,
    playerChips: state.playerChips,
    npcChips: state.npcChips,
    pot: state.pot,
    playerBets: state.history.flatMap((round) => round.moves).filter((move) => move.seatId === "player" && move.kind === "bet").length,
    playerFolds: state.history.flatMap((round) => round.moves).filter((move) => move.seatId === "player" && move.kind === "fold").length,
  };
}

export function expressionRead(state: IndianPokerState): IndianPokerExpressionRead {
  if (!state.playerCardId) throw new Error("indian_poker_player_card_missing");
  return { playerCardId: state.playerCardId, round: state.round };
}
