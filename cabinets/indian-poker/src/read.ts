import type { StandardCardId } from "@lucky-arcade/card-table";
import type { IndianPokerState } from "./contracts.ts";

/** Legal NPC information: its own current card is deliberately absent. */
export interface IndianPokerNpcRead {
  visiblePlayerCardId: StandardCardId;
  previouslyRevealedCardIds: readonly StandardCardId[];
  round: number;
  playerChips: number;
  npcChips: number;
  playerRaises: number;
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
    playerRaises: state.history.filter((round) => round.playerAction === "raise").length,
    playerFolds: state.history.filter((round) => round.playerAction === "fold").length,
  };
}

export function expressionRead(state: IndianPokerState): IndianPokerExpressionRead {
  if (!state.playerCardId) throw new Error("indian_poker_player_card_missing");
  return { playerCardId: state.playerCardId, round: state.round };
}
