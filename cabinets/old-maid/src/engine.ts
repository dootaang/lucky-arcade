import { XorShift32 } from "@lucky-arcade/engine";
import type { OldMaidAction, OldMaidCard, OldMaidCartridge, OldMaidCpuSeatId, OldMaidDiscard, OldMaidDrawEvent, OldMaidReaction, OldMaidSeatId, OldMaidState } from "./contracts.ts";
import { OLD_MAID_VERSION, TEMEROSA_OLD_MAID_PACK_VERSION } from "./contracts.ts";

export const OLD_MAID_SEAT_ORDER: readonly OldMaidSeatId[] = ["player", "cpu-1", "cpu-2", "cpu-3"];

export function createOldMaidState(cartridge: OldMaidCartridge, seed: string, sessionId = `old-maid-${Date.now().toString(36)}`): OldMaidState {
  validateCartridge(cartridge);
  const shuffled = shuffle(cartridge.cards.map((card) => card.id), new XorShift32(`${cartridge.version}:${seed}:deal`));
  const hands = emptyHands();
  const dealOrder = shuffled.map((cardId, index) => {
    const seatId = OLD_MAID_SEAT_ORDER[index % OLD_MAID_SEAT_ORDER.length] as OldMaidSeatId;
    hands[seatId].push(cardId);
    return { cardId, seatId };
  });
  const selected = shuffle(cartridge.characters.map((character) => character.id), new XorShift32(`${cartridge.version}:${seed}:characters`)).slice(0, 3);
  return {
    contract: "old-maid-state/0.3", version: OLD_MAID_VERSION, packVersion: TEMEROSA_OLD_MAID_PACK_VERSION,
    sessionId, seed, sequence: 0, turn: 0, status: "ready", currentPlayerId: "player", hands, dealOrder,
    characters: { "cpu-1": selected[0] as string, "cpu-2": selected[1] as string, "cpu-3": selected[2] as string },
    reactions: { "cpu-1": "neutral", "cpu-2": "neutral", "cpu-3": "neutral" },
    pendingDraw: null, discardMode: null, discardSeatIndex: null,
    safeOrder: [], loserId: null, discards: [], lastDraw: null,
  };
}

export function reduceOldMaid(cartridge: OldMaidCartridge, state: OldMaidState, action: OldMaidAction): OldMaidState {
  if (action.type === "restart") return { ...createOldMaidState(cartridge, action.seed, state.sessionId), sequence: state.sequence + 1 };
  if (action.type === "start") {
    assert(state.status === "ready", "old_maid_start_invalid");
    return { ...state, sequence: state.sequence + 1, status: "dealing" };
  }
  if (action.type === "finish_deal") {
    assert(state.status === "dealing", "old_maid_finish_deal_invalid");
    return beginInitialDiscard(cartridge, { ...state, sequence: state.sequence + 1 });
  }
  if (action.type === "collect_draw") return collectDraw(cartridge, state);
  if (action.type === "discard_pair") return discardPair(cartridge, state, action.cardIds);

  assert(state.status === "playing", "old_maid_not_playing");
  const actorId = state.currentPlayerId;
  const isPlayer = actorId === "player";
  if (action.type === "draw") assert(isPlayer, "old_maid_player_turn_required");
  if (action.type === "cpu_draw") assert(!isPlayer, "old_maid_cpu_turn_required");
  const targetId = nextActiveSeat(state.hands, actorId);
  const targetHand = state.hands[targetId];
  assert(targetHand.length > 0, "old_maid_target_empty");
  const index = action.type === "draw" ? action.index : cpuDrawIndex(state.seed, state.turn, actorId, targetId, targetHand.length);
  assert(Number.isInteger(index) && index >= 0 && index < targetHand.length, "old_maid_draw_index_invalid");
  const cardId = targetHand[index] as string;
  const card = cardById(cartridge.cards, cardId);
  const willMakePair = card.pairId !== null && state.hands[actorId].some((heldId) => cardById(cartridge.cards, heldId).pairId === card.pairId);
  const hands = cloneHands(state.hands);
  hands[targetId].splice(index, 1);
  const pendingDraw: OldMaidDrawEvent = { actorId, targetId, cardId, faceId: card.faceId, madePair: false };
  return {
    ...state, sequence: state.sequence + 1, status: "revealing", hands, pendingDraw,
    reactions: reactionsAfterDraw(cartridge, state, actorId, targetId, card.faceId === cartridge.oddFaceId, willMakePair),
  };
}

export function availablePairs(cartridge: OldMaidCartridge, state: OldMaidState, ownerId = discardingSeat(state)): [string, string][] {
  if (!ownerId) return [];
  return pairsInHand(state.hands[ownerId], cartridge.cards);
}

export function discardingSeat(state: OldMaidState): OldMaidSeatId | null {
  if (state.status !== "discarding") return null;
  if (state.discardMode === "draw") return state.currentPlayerId;
  return state.discardSeatIndex === null ? null : OLD_MAID_SEAT_ORDER[state.discardSeatIndex] ?? null;
}

export function targetSeat(state: OldMaidState): OldMaidSeatId { return nextActiveSeat(state.hands, state.currentPlayerId); }

export function cpuDrawIndex(seed: string, turn: number, actorId: OldMaidSeatId, targetId: OldMaidSeatId, targetCardCount: number): number {
  assert(Number.isInteger(targetCardCount) && targetCardCount > 0, "old_maid_target_count_invalid");
  const rng = new XorShift32(`${seed}:turn:${turn}:actor:${actorId}:target:${targetId}:count:${targetCardCount}`);
  return rng.nextUint32() % targetCardCount;
}

export function validateCartridge(cartridge: OldMaidCartridge): void {
  assert(cartridge.contract === "old-maid-cartridge/0.3", "old_maid_cartridge_contract");
  assert(cartridge.characters.length >= 3, "old_maid_characters_too_few");
  assert(new Set(cartridge.characters.map((character) => character.id)).size === cartridge.characters.length, "old_maid_character_duplicate");
  assert(new Set(cartridge.faces.map((face) => face.id)).size === cartridge.faces.length, "old_maid_face_duplicate");
  assert(new Set(cartridge.cards.map((card) => card.id)).size === cartridge.cards.length, "old_maid_card_duplicate");
  const faceIds = new Set(cartridge.faces.map((face) => face.id));
  for (const card of cartridge.cards) assert(faceIds.has(card.faceId), `old_maid_face_missing:${card.faceId}`);
  const oddCards = cartridge.cards.filter((card) => card.pairId === null);
  assert(oddCards.length === 1 && oddCards[0]?.faceId === cartridge.oddFaceId, "old_maid_odd_card_invalid");
  const pairs = new Map<string, number>();
  for (const card of cartridge.cards) if (card.pairId) pairs.set(card.pairId, (pairs.get(card.pairId) ?? 0) + 1);
  assert([...pairs.values()].every((count) => count === 2), "old_maid_pair_count_invalid");
}

function collectDraw(cartridge: OldMaidCartridge, state: OldMaidState): OldMaidState {
  assert(state.status === "revealing" && state.pendingDraw, "old_maid_collect_invalid");
  const hands = cloneHands(state.hands);
  hands[state.pendingDraw.actorId].push(state.pendingDraw.cardId);
  const pair = pairsInHand(hands[state.pendingDraw.actorId], cartridge.cards)[0];
  const collected = { ...state, sequence: state.sequence + 1, hands };
  if (pair) return { ...collected, status: "discarding", discardMode: "draw", discardSeatIndex: null };
  return finalizeDraw(collected, false);
}

function discardPair(cartridge: OldMaidCartridge, state: OldMaidState, cardIds: [string, string]): OldMaidState {
  const ownerId = discardingSeat(state);
  assert(state.status === "discarding" && ownerId, "old_maid_discard_invalid");
  const valid = pairsInHand(state.hands[ownerId], cartridge.cards).some((pair) => pair[0] === cardIds[0] && pair[1] === cardIds[1] || pair[0] === cardIds[1] && pair[1] === cardIds[0]);
  assert(valid, "old_maid_discard_pair_invalid");
  const card = cardById(cartridge.cards, cardIds[0]);
  const hands = cloneHands(state.hands);
  hands[ownerId] = hands[ownerId].filter((cardId) => !cardIds.includes(cardId));
  const discards = [...state.discards, { turn: state.turn, ownerId, faceId: card.faceId, cardIds }];
  const next = { ...state, sequence: state.sequence + 1, hands, discards };
  if (state.discardMode === "draw") return finalizeDraw(next, true);
  return continueInitialDiscard(cartridge, next, state.discardSeatIndex ?? 0);
}

function beginInitialDiscard(cartridge: OldMaidCartridge, state: OldMaidState): OldMaidState { return continueInitialDiscard(cartridge, { ...state, discardMode: "initial", discardSeatIndex: 0 }, 0); }

function continueInitialDiscard(cartridge: OldMaidCartridge, state: OldMaidState, fromIndex: number): OldMaidState {
  for (let index = fromIndex; index < OLD_MAID_SEAT_ORDER.length; index += 1) {
    const seatId = OLD_MAID_SEAT_ORDER[index] as OldMaidSeatId;
    if (pairsInHand(state.hands[seatId], cartridge.cards).length > 0) return { ...state, status: "discarding", discardMode: "initial", discardSeatIndex: index };
  }
  return finalizeInitialDiscard(state);
}

function finalizeInitialDiscard(state: OldMaidState): OldMaidState {
  const safeOrder = OLD_MAID_SEAT_ORDER.filter((seatId) => state.hands[seatId].length === 0);
  const active = OLD_MAID_SEAT_ORDER.filter((seatId) => state.hands[seatId].length > 0);
  return {
    ...state, status: active.length <= 1 ? "complete" : "playing", currentPlayerId: active[0] ?? "player",
    safeOrder, loserId: active.length <= 1 ? active[0] ?? null : null, discardMode: null, discardSeatIndex: null,
  };
}

function finalizeDraw(state: OldMaidState, madePair: boolean): OldMaidState {
  assert(state.pendingDraw, "old_maid_finalize_draw_missing");
  const event = { ...state.pendingDraw, madePair };
  const safeOrder = [...state.safeOrder];
  for (const seatId of OLD_MAID_SEAT_ORDER) if (state.hands[seatId].length === 0 && !safeOrder.includes(seatId)) safeOrder.push(seatId);
  const active = OLD_MAID_SEAT_ORDER.filter((seatId) => state.hands[seatId].length > 0);
  const complete = active.length <= 1;
  const nextId = complete ? active[0] ?? event.actorId : nextActiveSeat(state.hands, event.actorId);
  return {
    ...state, turn: state.turn + 1, status: complete ? "complete" : "playing", currentPlayerId: nextId,
    safeOrder, loserId: complete ? active[0] ?? null : null, pendingDraw: null, discardMode: null, discardSeatIndex: null,
    lastDraw: event,
  };
}

function reactionsAfterDraw(cartridge: OldMaidCartridge, state: OldMaidState, actorId: OldMaidSeatId, targetId: OldMaidSeatId, drewJoker: boolean, madePair: boolean): Record<OldMaidCpuSeatId, OldMaidReaction> {
  const next = { ...state.reactions };
  if (actorId !== "player") next[actorId] = tellReaction(cartridge, state, actorId, drewJoker ? "tense" : madePair ? "pleased" : "neutral", "actor");
  if (targetId !== "player") next[targetId] = tellReaction(cartridge, state, targetId, drewJoker ? "pleased" : "neutral", "target");
  return next;
}

function tellReaction(cartridge: OldMaidCartridge, state: OldMaidState, seatId: OldMaidCpuSeatId, truth: OldMaidReaction, role: string): OldMaidReaction {
  const character = cartridge.characters.find((candidate) => candidate.id === state.characters[seatId]);
  assert(character, `old_maid_character_missing:${state.characters[seatId]}`);
  const rng = new XorShift32(`${state.seed}:tell:${state.turn}:${seatId}:${role}`);
  const roll = rng.nextUint32() % 100;
  if (character.tellStyle === "open") return roll < 80 ? truth : "neutral";
  if (character.tellStyle === "guarded") return roll < 45 ? truth : "neutral";
  if (roll < 40) return truth === "tense" ? "pleased" : "tense";
  return roll < 70 ? truth : "neutral";
}

function pairsInHand(hand: string[], cards: OldMaidCard[]): [string, string][] {
  const byPair = new Map<string, string[]>();
  for (const cardId of hand) {
    const pairId = cardById(cards, cardId).pairId;
    if (pairId) byPair.set(pairId, [...(byPair.get(pairId) ?? []), cardId]);
  }
  return [...byPair.values()].filter((ids) => ids.length >= 2).map((ids) => [ids[0] as string, ids[1] as string]);
}

function nextActiveSeat(hands: Record<OldMaidSeatId, string[]>, from: OldMaidSeatId): OldMaidSeatId {
  const start = OLD_MAID_SEAT_ORDER.indexOf(from);
  for (let offset = 1; offset <= OLD_MAID_SEAT_ORDER.length; offset += 1) { const candidate = OLD_MAID_SEAT_ORDER[(start + offset) % OLD_MAID_SEAT_ORDER.length] as OldMaidSeatId; if (hands[candidate].length > 0) return candidate; }
  return from;
}

function emptyHands(): Record<OldMaidSeatId, string[]> { return { player: [], "cpu-1": [], "cpu-2": [], "cpu-3": [] }; }
function cloneHands(hands: Record<OldMaidSeatId, string[]>): Record<OldMaidSeatId, string[]> { return { player: [...hands.player], "cpu-1": [...hands["cpu-1"]], "cpu-2": [...hands["cpu-2"]], "cpu-3": [...hands["cpu-3"]] }; }
function cardById(cards: OldMaidCard[], cardId: string): OldMaidCard { const card = cards.find((candidate) => candidate.id === cardId); assert(card, `old_maid_card_missing:${cardId}`); return card; }
function shuffle<T>(input: readonly T[], rng: XorShift32): T[] { const output = [...input]; for (let index = output.length - 1; index > 0; index -= 1) { const target = rng.nextUint32() % (index + 1); [output[index], output[target]] = [output[target] as T, output[index] as T]; } return output; }
function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
