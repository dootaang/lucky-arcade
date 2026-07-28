import { shuffledStandardDeck } from "@lucky-arcade/card-table";
import { resultHash } from "@lucky-arcade/engine";
import {
  TEMEROSA_VIDEO_POKER_PACK_VERSION,
  VIDEO_POKER_ERRORS,
  VIDEO_POKER_STAKES,
  VIDEO_POKER_STATE_CONTRACT,
  VIDEO_POKER_VERSION,
  VIDEO_POKER_WAGER_MULTIPLIERS,
  type VideoPokerAction,
  type VideoPokerState,
  type VideoPokerWagerInput,
} from "./contracts.ts";
import { evaluateJacksOrBetter } from "./hand.ts";

export function createVideoPokerState(packVersion: string = TEMEROSA_VIDEO_POKER_PACK_VERSION, sessionId = "temerosa-video-poker:machine-1"): VideoPokerState {
  assert(packVersion.length > 0, VIDEO_POKER_ERRORS.packVersionInvalid);
  assert(sessionId.length > 0, VIDEO_POKER_ERRORS.sessionInvalid);
  return {
    contract: VIDEO_POKER_STATE_CONTRACT,
    version: VIDEO_POKER_VERSION,
    packVersion,
    sessionId,
    sequence: 0,
    status: "ready",
    seed: "",
    deck: [],
    cursor: 0,
    hand: [],
    heldCardIndexes: [],
    exchangeCount: 0,
    wager: null,
    outcome: null,
  };
}

export function reduceVideoPoker(state: VideoPokerState, action: VideoPokerAction): VideoPokerState {
  if (action.type === "deal") return deal(state, action.seed, action.wager);
  if (action.type === "toggle-hold") return toggleHold(state, action.cardIndex);
  if (action.type === "draw") return draw(state);
  assert(action.type === "restart" && state.status === "complete", VIDEO_POKER_ERRORS.restartInvalid);
  return { ...createVideoPokerState(state.packVersion, state.sessionId), sequence: state.sequence + 1 };
}

export function videoPokerExposure(wager: VideoPokerWagerInput): number {
  validateWager(wager);
  return wager.stake * wager.multiplier;
}

export function videoPokerCredit(state: VideoPokerState): number {
  return state.status === "complete" ? state.outcome?.creditedPoints ?? 0 : 0;
}

export function videoPokerResultHash(state: VideoPokerState): string { return resultHash(state); }

export function isVideoPokerState(value: unknown): value is VideoPokerState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<VideoPokerState>;
  return state.contract === VIDEO_POKER_STATE_CONTRACT && state.version === VIDEO_POKER_VERSION
    && typeof state.packVersion === "string" && state.packVersion.length > 0
    && typeof state.sessionId === "string" && state.sessionId.length > 0
    && Number.isInteger(state.sequence) && Number.isInteger(state.cursor)
    && Array.isArray(state.deck) && Array.isArray(state.hand) && Array.isArray(state.heldCardIndexes)
    && (state.exchangeCount === 0 || state.exchangeCount === 1)
    && (state.status === "ready" || state.status === "holding" || state.status === "complete");
}

function deal(state: VideoPokerState, seed: string, wager: VideoPokerWagerInput): VideoPokerState {
  assert(state.status === "ready" && seed.length > 0, VIDEO_POKER_ERRORS.dealInvalid);
  validateWager(wager);
  const deck = shuffledStandardDeck(`${state.packVersion}:jacks-or-better:${seed}`);
  return {
    ...state,
    sequence: state.sequence + 1,
    status: "holding",
    seed,
    deck,
    cursor: 5,
    hand: deck.slice(0, 5),
    heldCardIndexes: [],
    exchangeCount: 0,
    wager: { ...wager },
    outcome: null,
  };
}

function toggleHold(state: VideoPokerState, cardIndex: number): VideoPokerState {
  assert(state.status === "holding" && Number.isInteger(cardIndex) && cardIndex >= 0 && cardIndex < 5, VIDEO_POKER_ERRORS.holdInvalid);
  const held = new Set(state.heldCardIndexes);
  if (held.has(cardIndex)) held.delete(cardIndex); else held.add(cardIndex);
  return { ...state, sequence: state.sequence + 1, heldCardIndexes: [...held].sort((left, right) => left - right) };
}

function draw(state: VideoPokerState): VideoPokerState {
  assert(state.status === "holding" && state.exchangeCount === 0 && state.hand.length === 5 && state.wager, VIDEO_POKER_ERRORS.drawInvalid);
  const held = new Set(state.heldCardIndexes);
  let cursor = state.cursor;
  const hand = state.hand.map((card, index) => {
    if (held.has(index)) return card;
    const replacement = state.deck[cursor];
    assert(replacement, VIDEO_POKER_ERRORS.drawInvalid);
    cursor += 1;
    return replacement;
  });
  const evaluated = evaluateJacksOrBetter(hand);
  const wageredPoints = videoPokerExposure(state.wager);
  return {
    ...state,
    sequence: state.sequence + 1,
    status: "complete",
    cursor,
    hand,
    exchangeCount: 1,
    outcome: { hand: evaluated, wageredPoints, creditedPoints: wageredPoints * evaluated.payoutMultiplier },
  };
}

function validateWager(wager: VideoPokerWagerInput): void {
  assert(wager.wagerId.length > 0
    && (VIDEO_POKER_STAKES as readonly number[]).includes(wager.stake)
    && (VIDEO_POKER_WAGER_MULTIPLIERS as readonly number[]).includes(wager.multiplier), VIDEO_POKER_ERRORS.wagerInvalid);
}

function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
