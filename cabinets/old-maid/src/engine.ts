import { XorShift32 } from "@lucky-arcade/engine";
import type { OldMaidAction, OldMaidCard, OldMaidCartridge, OldMaidCpuSeatId, OldMaidDiscard, OldMaidReaction, OldMaidSeatId, OldMaidState } from "./contracts.ts";
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
  const discards: OldMaidDiscard[] = [];
  for (const seatId of OLD_MAID_SEAT_ORDER) discardAllPairs(hands, seatId, cartridge.cards, discards, 0);
  const safeOrder = OLD_MAID_SEAT_ORDER.filter((seatId) => hands[seatId].length === 0);
  const active = OLD_MAID_SEAT_ORDER.filter((seatId) => hands[seatId].length > 0);
  const complete = active.length <= 1;
  const selected = shuffle(cartridge.characters.map((character) => character.id), new XorShift32(`${cartridge.version}:${seed}:characters`)).slice(0, 3);
  return {
    contract: "old-maid-state/0.2", version: OLD_MAID_VERSION, packVersion: TEMEROSA_OLD_MAID_PACK_VERSION,
    sessionId, seed, sequence: 0, turn: 0, status: complete ? "complete" : "ready",
    currentPlayerId: active[0] ?? "player", hands, dealOrder,
    characters: { "cpu-1": selected[0] as string, "cpu-2": selected[1] as string, "cpu-3": selected[2] as string },
    reactions: { "cpu-1": "neutral", "cpu-2": "neutral", "cpu-3": "neutral" },
    safeOrder, loserId: complete ? active[0] ?? null : null, discards, lastDraw: null,
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
    return { ...state, sequence: state.sequence + 1, status: "playing" };
  }
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
  const hands = cloneHands(state.hands);
  hands[targetId].splice(index, 1);
  hands[actorId].push(cardId);
  const discards = [...state.discards];
  const madePair = discardDrawnPair(hands, actorId, card, cartridge.cards, discards, state.turn + 1);
  const safeOrder = [...state.safeOrder];
  for (const seatId of OLD_MAID_SEAT_ORDER) if (hands[seatId].length === 0 && !safeOrder.includes(seatId)) safeOrder.push(seatId);
  const active = OLD_MAID_SEAT_ORDER.filter((seatId) => hands[seatId].length > 0);
  const complete = active.length <= 1;
  const nextId = complete ? active[0] ?? actorId : nextActiveSeat(hands, actorId);
  const reactions = reactionsAfterDraw(cartridge, state, actorId, targetId, card.faceId === cartridge.oddFaceId, madePair);
  return {
    ...state, sequence: state.sequence + 1, turn: state.turn + 1,
    status: complete ? "complete" : "playing", currentPlayerId: nextId, hands, reactions,
    safeOrder, loserId: complete ? active[0] ?? null : null, discards,
    lastDraw: { actorId, targetId, cardId, faceId: card.faceId, madePair },
  };
}

export function targetSeat(state: OldMaidState): OldMaidSeatId { return nextActiveSeat(state.hands, state.currentPlayerId); }

export function cpuDrawIndex(seed: string, turn: number, actorId: OldMaidSeatId, targetId: OldMaidSeatId, targetCardCount: number): number {
  assert(Number.isInteger(targetCardCount) && targetCardCount > 0, "old_maid_target_count_invalid");
  const rng = new XorShift32(`${seed}:turn:${turn}:actor:${actorId}:target:${targetId}:count:${targetCardCount}`);
  return rng.nextUint32() % targetCardCount;
}

export function validateCartridge(cartridge: OldMaidCartridge): void {
  assert(cartridge.contract === "old-maid-cartridge/0.2", "old_maid_cartridge_contract");
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

function discardAllPairs(hands: Record<OldMaidSeatId, string[]>, ownerId: OldMaidSeatId, cards: OldMaidCard[], discards: OldMaidDiscard[], turn: number): void {
  const byPair = new Map<string, string[]>();
  for (const cardId of hands[ownerId]) { const card = cardById(cards, cardId); if (card.pairId) byPair.set(card.pairId, [...(byPair.get(card.pairId) ?? []), cardId]); }
  for (const [pairId, cardIds] of byPair) if (cardIds.length === 2) { const pair = cardIds as [string, string]; hands[ownerId] = hands[ownerId].filter((cardId) => !pair.includes(cardId)); discards.push({ turn, ownerId, faceId: pairId, cardIds: pair }); }
}

function discardDrawnPair(hands: Record<OldMaidSeatId, string[]>, ownerId: OldMaidSeatId, drawn: OldMaidCard, cards: OldMaidCard[], discards: OldMaidDiscard[], turn: number): boolean {
  if (!drawn.pairId) return false;
  const pair = hands[ownerId].filter((cardId) => cardById(cards, cardId).pairId === drawn.pairId);
  if (pair.length !== 2) return false;
  hands[ownerId] = hands[ownerId].filter((cardId) => !pair.includes(cardId));
  discards.push({ turn, ownerId, faceId: drawn.faceId, cardIds: [pair[0] as string, pair[1] as string] });
  return true;
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
