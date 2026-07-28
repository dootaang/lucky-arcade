import { shuffledStandardDeck, type StandardCardId } from "@lucky-arcade/card-table";
import { resultHash } from "@lucky-arcade/engine";
import {
  FIVE_CARD_DRAW_CONTRACT,
  FIVE_CARD_DRAW_RULES_VERSION,
  type FiveCardDrawAction,
  type FiveCardDrawContext,
  type FiveCardDrawOutcome,
  type FiveCardDrawPublicView,
  type FiveCardDrawResult,
  type FiveCardDrawState,
} from "./contracts.ts";
import { comparePokerHands, evaluatePokerHand } from "./hand.ts";
import { decideNpcDraw } from "./npc.ts";

export function createFiveCardDrawState(context: FiveCardDrawContext): FiveCardDrawState {
  if (context.sessionId.trim().length === 0 || context.opponentId.trim().length === 0) throw new Error("five_card_draw_context_invalid");
  return {
    contract: FIVE_CARD_DRAW_CONTRACT,
    rulesVersion: FIVE_CARD_DRAW_RULES_VERSION,
    context: { ...context },
    phase: "ready",
    sequence: 0,
    seed: null,
    deck: [],
    deckCursor: 0,
    playerHand: [],
    npcHand: [],
    playerDiscarded: [],
    npcDiscarded: [],
    npcDecision: null,
    result: null,
  };
}

export function reduceFiveCardDraw(state: FiveCardDrawState, action: FiveCardDrawAction): FiveCardDrawState {
  if (action.type === "reset") {
    if (state.phase !== "complete") throw new Error("five_card_draw_reset_not_allowed");
    return { ...createFiveCardDrawState(state.context), sequence: state.sequence + 1 };
  }
  if (action.type === "start") return startMatch(state, action.seed);
  return exchangeCards(state, action.cardIds);
}

export function fiveCardDrawPublicView(state: FiveCardDrawState): FiveCardDrawPublicView {
  return {
    contract: FIVE_CARD_DRAW_CONTRACT,
    phase: state.phase,
    sequence: state.sequence,
    sessionId: state.context.sessionId,
    opponentId: state.context.opponentId,
    playerHand: state.playerHand,
    npcHand: state.phase === "complete" ? state.npcHand : null,
    npcCardCount: state.npcHand.length,
    playerExchangeCount: state.phase === "complete" ? state.playerDiscarded.length : null,
    npcExchangeCount: state.phase === "complete" ? state.npcDiscarded.length : null,
    result: state.result,
  };
}

function startMatch(state: FiveCardDrawState, seed: string): FiveCardDrawState {
  if (state.phase !== "ready") throw new Error("five_card_draw_already_started");
  if (seed.length === 0) throw new Error("five_card_draw_seed_required");
  const deck = shuffledStandardDeck(`${FIVE_CARD_DRAW_RULES_VERSION}:${seed}`);
  const playerHand: StandardCardId[] = [];
  const npcHand: StandardCardId[] = [];
  for (let index = 0; index < 10; index += 1) {
    const card = deck[index] as StandardCardId;
    (index % 2 === 0 ? playerHand : npcHand).push(card);
  }
  return {
    ...state,
    phase: "player-draw",
    sequence: state.sequence + 1,
    seed,
    deck,
    deckCursor: 10,
    playerHand,
    npcHand,
  };
}

function exchangeCards(state: FiveCardDrawState, selected: readonly StandardCardId[]): FiveCardDrawState {
  if (state.phase !== "player-draw" || state.seed === null) throw new Error("five_card_draw_exchange_not_allowed");
  if (selected.length > 5 || new Set(selected).size !== selected.length) throw new Error("five_card_draw_exchange_invalid");
  if (selected.some((id) => !state.playerHand.includes(id))) throw new Error("five_card_draw_exchange_card_missing");

  const playerDraw = drawReplacements(state.playerHand, selected, state.deck, state.deckCursor);
  const npcDecision = decideNpcDraw({
    hand: state.npcHand,
    playerExchangeCount: selected.length,
  });
  const npcDraw = drawReplacements(state.npcHand, npcDecision.discardCardIds, state.deck, playerDraw.cursor);
  const playerValue = evaluatePokerHand(playerDraw.hand);
  const npcValue = evaluatePokerHand(npcDraw.hand);
  const comparison = comparePokerHands(playerValue, npcValue);
  const outcome: FiveCardDrawOutcome = comparison > 0 ? "player-win" : comparison < 0 ? "npc-win" : "tie";
  const resultBase = {
    contract: FIVE_CARD_DRAW_CONTRACT,
    rulesVersion: FIVE_CARD_DRAW_RULES_VERSION,
    sessionId: state.context.sessionId,
    opponentId: state.context.opponentId,
    seed: state.seed,
    outcome,
    playerHand: playerDraw.hand,
    npcHand: npcDraw.hand,
    playerValue,
    npcValue,
    playerDiscarded: [...selected],
    npcDiscarded: npcDecision.discardCardIds,
  };
  const result: FiveCardDrawResult = { ...resultBase, resultId: resultHash(resultBase) };
  return {
    ...state,
    phase: "complete",
    sequence: state.sequence + 1,
    deckCursor: npcDraw.cursor,
    playerHand: playerDraw.hand,
    npcHand: npcDraw.hand,
    playerDiscarded: [...selected],
    npcDiscarded: npcDecision.discardCardIds,
    npcDecision,
    result,
  };
}

function drawReplacements(
  hand: readonly StandardCardId[],
  discarded: readonly StandardCardId[],
  deck: readonly StandardCardId[],
  cursor: number,
): { hand: StandardCardId[]; cursor: number } {
  const discardedSet = new Set(discarded);
  let nextCursor = cursor;
  const output = hand.map((card) => {
    if (!discardedSet.has(card)) return card;
    const replacement = deck[nextCursor];
    if (replacement === undefined) throw new Error("five_card_draw_deck_exhausted");
    nextCursor += 1;
    return replacement;
  });
  return { hand: output, cursor: nextCursor };
}
