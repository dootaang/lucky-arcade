import { PERSONA_PRESETS, XorShift32, expressSignal, fnv1a32, weightedChoice, type Persona } from "@lucky-arcade/engine";
import type { OldMaidAction, OldMaidCard, OldMaidCartridge, OldMaidCpuSeatId, OldMaidDiscard, OldMaidDrawEvent, OldMaidReaction, OldMaidSeatId, OldMaidState } from "./contracts.ts";
import { OLD_MAID_LEGACY_VERSION, OLD_MAID_PREVIOUS_VERSION, OLD_MAID_VERSION } from "./contracts.ts";
import { publicRead, type OldMaidPublicRead } from "./read.ts";

export const OLD_MAID_SEAT_ORDER: readonly OldMaidSeatId[] = ["player", "cpu-1", "cpu-2", "cpu-3"];

export function isOldMaidState(value: unknown): value is OldMaidState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<OldMaidState>;
  const compatible = state.version === OLD_MAID_VERSION
    ? state.contract === "old-maid-state/0.7"
    : state.contract === "old-maid-state/0.6";
  return compatible
    && (state.version === OLD_MAID_VERSION || state.version === OLD_MAID_PREVIOUS_VERSION || state.version === OLD_MAID_LEGACY_VERSION)
    && typeof state.packVersion === "string"
    && typeof state.sessionId === "string"
    && Boolean(state.hands && state.characters);
}

export function restoreOldMaidState(cabinetVersion: string, value: unknown): OldMaidState {
  assert(isOldMaidState(value) && value.version === cabinetVersion, "old_maid_snapshot_version");
  return value;
}

export function createOldMaidState(cartridge: OldMaidCartridge, seed: string, sessionId = `old-maid-${Date.now().toString(36)}`): OldMaidState {
  validateCartridge(cartridge);
  const rng = new XorShift32(`${cartridge.version}:${seed}:deal`);
  const pairIds = shuffle([...new Set(cartridge.cards.map((card) => card.pairId).filter((pairId): pairId is string => pairId !== null))], rng).slice(0, dealPairCount(cartridge));
  const shuffled = shuffle(cartridge.cards.filter((card) => card.pairId === null || pairIds.includes(card.pairId)).map((card) => card.id), rng);
  const hands = emptyHands();
  const dealOrder = shuffled.map((cardId, index) => {
    const seatId = OLD_MAID_SEAT_ORDER[index % OLD_MAID_SEAT_ORDER.length] as OldMaidSeatId;
    hands[seatId].push(cardId);
    return { cardId, seatId };
  });
  const selected = automaticCharacterIds(cartridge, seed, "play");
  return {
    contract: "old-maid-state/0.7", version: OLD_MAID_VERSION, packVersion: cartridge.version,
    sessionId, seed, sequence: 0, turn: 0, status: "ready", mode: "play", currentPlayerId: "player", hands, dealOrder,
    characters: { "cpu-1": selected[0] as string, "cpu-2": selected[1] as string, "cpu-3": selected[2] as string },
    spectatorCharacterId: null,
    reactions: { player: "neutral", "cpu-1": "neutral", "cpu-2": "neutral", "cpu-3": "neutral" },
    pendingDraw: null, discardMode: null, discardSeatIndex: null,
    safeOrder: [], loserId: null, discards: [], lastDraw: null, history: [], lastReorder: null, lastReorders: {}, offer: null,
  };
}

export function reduceOldMaid(cartridge: OldMaidCartridge, state: OldMaidState, action: OldMaidAction): OldMaidState {
  if (action.type === "restart") {
    const fresh = createOldMaidState(cartridge, action.seed, state.sessionId);
    const mode = action.mode ?? "play";
    const ids = action.characterIds ?? automaticCharacterIds(cartridge, action.seed, mode);
    const selection = selectedCharacters(cartridge, ids, mode);
    return {
      ...fresh,
      sequence: state.sequence + 1,
      mode,
      characters: selection.characters,
      spectatorCharacterId: selection.spectatorCharacterId,
    };
  }
  if (action.type === "start") {
    assert(state.status === "ready", "old_maid_start_invalid");
    const mode = action.mode ?? "play";
    const ids = action.characterIds ?? (mode === "play" ? Object.values(state.characters) : automaticCharacterIds(cartridge, state.seed, mode));
    const selection = selectedCharacters(cartridge, ids, mode);
    return { ...state, sequence: state.sequence + 1, status: "dealing", mode, characters: selection.characters, spectatorCharacterId: selection.spectatorCharacterId };
  }
  if (action.type === "finish_deal") {
    assert(state.status === "dealing", "old_maid_finish_deal_invalid");
    return beginInitialDiscard(cartridge, { ...state, sequence: state.sequence + 1 });
  }
  if (action.type === "collect_draw") return collectDraw(cartridge, state);
  if (action.type === "discard_pair") return discardPair(cartridge, state, action.cardIds);

  if (action.type === "prepare_cpu_offer") return prepareCpuOffer(cartridge, state);
  if (action.type === "reorder_offer") return reorderOffer(state, action.from, action.to);
  if (action.type === "finish_offer") return finishOffer(state);

  assert(state.status === "playing", "old_maid_not_playing");
  const actorId = state.currentPlayerId;
  const isHuman = actorId === "player" && state.mode === "play";
  if (action.type === "reorder_hand") {
    assert(state.version !== OLD_MAID_VERSION, "old_maid_legacy_reorder_only");
    assert(isHuman, "old_maid_player_turn_required");
    assert(Number.isInteger(action.from) && Number.isInteger(action.to) && action.from >= 0 && action.to >= 0 && action.from < state.hands.player.length && action.to < state.hands.player.length, "old_maid_reorder_index_invalid");
    const count = state.lastReorder?.turn === state.turn ? state.lastReorder.count : 0;
    assert(count < 3, "old_maid_reorder_limit");
    const hands = cloneHands(state.hands);
    const [cardId] = hands.player.splice(action.from, 1);
    hands.player.splice(action.to, 0, cardId as string);
    const reorder = { turn: state.turn, fromIndex: action.from, toIndex: action.to, count: count + 1 };
    return {
      ...state, sequence: state.sequence + 1, hands,
      lastReorder: { turn: reorder.turn, toIndex: reorder.toIndex, count: reorder.count },
      ...(state.version === OLD_MAID_LEGACY_VERSION ? {} : { lastReorders: { ...state.lastReorders, player: reorder } }),
    };
  }
  if (action.type === "draw") assert(isHuman, "old_maid_player_turn_required");
  if (action.type === "cpu_draw") assert(!isHuman, "old_maid_cpu_turn_required");
  const targetId = state.version === OLD_MAID_VERSION ? requireReadyOffer(state, actorId).targetId : nextActiveSeat(state.hands, actorId);
  const targetHand = state.hands[targetId];
  assert(targetHand.length > 0, "old_maid_target_empty");
  const actorCharacter = cartridge.characters.find((character) => character.id === characterIdForSeat(state, actorId));
  const persona = actorCharacter ? PERSONA_PRESETS[tellStyleForState(actorCharacter, state)] : PERSONA_PRESETS.standard;
  const index = action.type === "draw" ? action.index : state.version === OLD_MAID_LEGACY_VERSION
    ? legacyCpuDrawIndex(persona, publicRead(state, targetId), state.seed, state.turn, actorId, targetId, targetHand.length)
    : cpuDrawIndex(persona, publicRead(state, targetId), state.seed, state.turn, actorId, targetId, targetHand.length);
  assert(Number.isInteger(index) && index >= 0 && index < targetHand.length, "old_maid_draw_index_invalid");
  const cardId = targetHand[index] as string;
  const card = cardById(cartridge.cards, cardId);
  const willMakePair = card.pairId !== null && state.hands[actorId].some((heldId) => cardById(cartridge.cards, heldId).pairId === card.pairId);
  const hands = cloneHands(state.hands);
  hands[targetId].splice(index, 1);
  const pendingDraw: OldMaidDrawEvent = { actorId, targetId, cardId, faceId: card.faceId, madePair: false };
  return {
    ...state, sequence: state.sequence + 1, status: "revealing", hands, pendingDraw,
    ...(state.version === OLD_MAID_VERSION ? { offer: null } : {}),
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

export function targetSeat(state: OldMaidState): OldMaidSeatId { return state.offer?.targetId ?? nextActiveSeat(state.hands, state.currentPlayerId); }

export function cpuDrawIndex(persona: Persona, read: OldMaidPublicRead, seed: string, turn: number, actorId: OldMaidSeatId, targetId: OldMaidSeatId, targetCardCount: number): number {
  assert(Number.isInteger(targetCardCount) && targetCardCount > 0, "old_maid_target_count_invalid");
  const choiceSeed = `${seed}:turn:${turn}:actor:${actorId}:target:${targetId}:count:${targetCardCount}`;
  const weights = Array.from({ length: targetCardCount }, (_, index) => {
    const jitterUnit = (fnv1a32(`${choiceSeed}:jitter:${index}`) % 2_001) / 1_000 - 1;
    let weight = 1 + jitterUnit * (1 - persona.consistency) * 0.35;
    if (read.reorderedSinceTargetDraw && read.reorderIndex !== null) {
      const salience = Math.min(1.4, 0.75 + Math.max(0, read.reorderCount - 1) * 0.15 + (read.reorderedImmediatelyAfterDraw ? 0.25 : 0));
      const strength = persona.signalAttention * Math.abs(persona.signalTrust) * salience;
      if (persona.signalTrust > 0) {
        if (index === read.reorderIndex) weight *= 1 + strength * 2;
        else if (Math.abs(index - read.reorderIndex) === 1) weight *= Math.max(0.2, 1 - strength * 0.35);
      } else if (persona.signalTrust < 0) {
        if (index === read.reorderIndex) weight *= Math.max(0.15, 1 - strength * 0.75);
        else if (Math.abs(index - read.reorderIndex) === 1) weight *= 1 + strength * 1.2;
      }
    }
    return Math.max(0.01, weight);
  });
  return weightedChoice(weights, choiceSeed);
}

/** Exact 0.6 policy retained so saved games replay with their original hashes. */
export function legacyCpuDrawIndex(persona: Persona, read: OldMaidPublicRead, seed: string, turn: number, actorId: OldMaidSeatId, targetId: OldMaidSeatId, targetCardCount: number): number {
  assert(Number.isInteger(targetCardCount) && targetCardCount > 0, "old_maid_target_count_invalid");
  const choiceSeed = `${seed}:turn:${turn}:actor:${actorId}:target:${targetId}:count:${targetCardCount}`;
  const weights = Array.from({ length: targetCardCount }, (_, index) => {
    const jitterUnit = (fnv1a32(`${choiceSeed}:jitter:${index}`) % 2_001) / 1_000 - 1;
    let weight = 1 + jitterUnit * (1 - persona.consistency) * 0.35;
    if (read.reorderedSinceTargetDraw && read.reorderIndex !== null) {
      if (index === read.reorderIndex) weight *= 1 + persona.readAccuracy * persona.riskAppetite * 1.4;
      else if (Math.abs(index - read.reorderIndex) === 1) weight *= 1 - persona.readAccuracy * 0.25;
    }
    return Math.max(0.01, weight);
  });
  return weightedChoice(weights, choiceSeed);
}

export function inspectCardReaction(cartridge: OldMaidCartridge, state: OldMaidState, targetId: OldMaidCpuSeatId, cardId: string): OldMaidReaction {
  const character = cartridge.characters.find((candidate) => candidate.id === state.characters[targetId]);
  assert(character, `old_maid_character_missing:${state.characters[targetId]}`);
  assert(state.hands[targetId].includes(cardId), "old_maid_inspection_card_missing");
  const truth: OldMaidReaction = cardById(cartridge.cards, cardId).faceId === cartridge.oddFaceId ? "pleased" : "tense";
  const deceptive = truth === "pleased" ? "tense" : "pleased";
  const style = tellStyleForState(character, state);
  const weights = style === "open" ? { truth: 1, neutral: 0, deceptive: 0 } : style === "guarded" ? { truth: 35, neutral: 65, deceptive: 0 } : style === "bluffer" ? { truth: 0, neutral: 45, deceptive: 55 } : { truth: 30, neutral: 70, deceptive: 0 };
  return expressSignal(truth, "neutral", deceptive, weights, `${state.seed}:inspect:${state.turn}:${targetId}:${cardId}`);
}

export function validateCartridge(cartridge: OldMaidCartridge): void {
  assert(cartridge.contract === "old-maid-cartridge/0.6", "old_maid_cartridge_contract");
  assert(cartridge.characters.length >= 4, "old_maid_characters_too_few");
  assert(new Set(cartridge.characters.map((character) => character.id)).size === cartridge.characters.length, "old_maid_character_duplicate");
  const selectableIds = selectableCharacterIds(cartridge);
  assert(selectableIds.length >= 4, "old_maid_selectable_characters_too_few");
  assert(new Set(selectableIds).size === selectableIds.length, "old_maid_selectable_character_duplicate");
  const characterIds = new Set(cartridge.characters.map((character) => character.id));
  assert(selectableIds.every((id) => characterIds.has(id)), "old_maid_selectable_character_missing");
  assert(new Set(cartridge.faces.map((face) => face.id)).size === cartridge.faces.length, "old_maid_face_duplicate");
  assert(new Set(cartridge.cards.map((card) => card.id)).size === cartridge.cards.length, "old_maid_card_duplicate");
  const faceIds = new Set(cartridge.faces.map((face) => face.id));
  for (const card of cartridge.cards) assert(faceIds.has(card.faceId), `old_maid_face_missing:${card.faceId}`);
  const oddCards = cartridge.cards.filter((card) => card.pairId === null);
  assert(oddCards.length === 1 && oddCards[0]?.faceId === cartridge.oddFaceId, "old_maid_odd_card_invalid");
  const pairs = new Map<string, number>();
  for (const card of cartridge.cards) if (card.pairId) pairs.set(card.pairId, (pairs.get(card.pairId) ?? 0) + 1);
  assert([...pairs.values()].every((count) => count === 2), "old_maid_pair_count_invalid");
  const requestedPairCount = dealPairCount(cartridge);
  assert(Number.isInteger(requestedPairCount) && requestedPairCount > 0, "old_maid_deal_pair_count_invalid");
  assert(pairs.size >= requestedPairCount, "old_maid_deal_pairs_insufficient");
}

function collectDraw(cartridge: OldMaidCartridge, state: OldMaidState): OldMaidState {
  assert(state.status === "revealing" && state.pendingDraw, "old_maid_collect_invalid");
  const hands = cloneHands(state.hands);
  hands[state.pendingDraw.actorId].push(state.pendingDraw.cardId);
  const pair = pairsInHand(hands[state.pendingDraw.actorId], cartridge.cards)[0];
  const collected = { ...state, sequence: state.sequence + 1, hands };
  if (pair) return { ...collected, status: "discarding", discardMode: "draw", discardSeatIndex: null };
  return finalizeDraw(cartridge, collected, false);
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
  const discardEntry = { type: "discard" as const, turn: state.turn, ownerId, faceId: card.faceId };
  const history = state.discardMode === "draw" && state.pendingDraw
    ? [...state.history, { type: "draw" as const, turn: state.turn, actorId: state.pendingDraw.actorId, targetId: state.pendingDraw.targetId, faceId: state.pendingDraw.faceId, madePair: true }, discardEntry]
    : [...state.history, discardEntry];
  const next = { ...state, sequence: state.sequence + 1, hands, discards, history };
  if (state.discardMode === "draw") return finalizeDraw(cartridge, next, true);
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
  const currentPlayerId = active[0] ?? "player";
  const complete = active.length <= 1;
  return {
    ...state, status: complete ? "complete" : state.version === OLD_MAID_VERSION ? "offering" : "playing", currentPlayerId,
    safeOrder, loserId: complete ? active[0] ?? null : null, discardMode: null, discardSeatIndex: null,
    ...(state.version === OLD_MAID_VERSION && !complete ? { offer: beginOffer(state, currentPlayerId) } : {}),
  };
}

function finalizeDraw(cartridge: OldMaidCartridge, state: OldMaidState, madePair: boolean): OldMaidState {
  assert(state.pendingDraw, "old_maid_finalize_draw_missing");
  const event = { ...state.pendingDraw, madePair };
  const safeOrder = [...state.safeOrder];
  for (const seatId of OLD_MAID_SEAT_ORDER) if (state.hands[seatId].length === 0 && !safeOrder.includes(seatId)) safeOrder.push(seatId);
  const active = OLD_MAID_SEAT_ORDER.filter((seatId) => state.hands[seatId].length > 0);
  const complete = active.length <= 1;
  const nextId = complete ? active[0] ?? event.actorId : nextActiveSeat(state.hands, event.actorId);
  const drawAlreadyLogged = state.history.some((entry) => entry.type === "draw" && entry.turn === state.turn && entry.actorId === event.actorId && entry.targetId === event.targetId);
  const reordered = complete ? state : maybeReorderCpuHand(cartridge, state, event.actorId);
  return {
    ...reordered, turn: state.turn + 1, status: complete ? "complete" : state.version === OLD_MAID_VERSION ? "offering" : "playing", currentPlayerId: nextId,
    safeOrder, loserId: complete ? active[0] ?? null : null, pendingDraw: null, discardMode: null, discardSeatIndex: null,
    lastDraw: event, history: drawAlreadyLogged ? state.history : [...state.history, { type: "draw", turn: state.turn, actorId: event.actorId, targetId: event.targetId, faceId: event.faceId, madePair }],
    ...(state.version === OLD_MAID_VERSION ? { offer: complete ? null : beginOffer(state, nextId, state.sequence + 1) } : {}),
  };
}

function beginOffer(state: OldMaidState, actorId: OldMaidSeatId, revision = state.sequence): NonNullable<OldMaidState["offer"]> {
  return {
    actorId,
    targetId: nextActiveSeat(state.hands, actorId),
    phase: "arranging",
    reorderCount: 0,
    lastMove: null,
    revision,
  };
}

function requireOffer(state: OldMaidState): NonNullable<OldMaidState["offer"]> {
  assert(state.version === OLD_MAID_VERSION && state.status === "offering" && state.offer, "old_maid_offer_required");
  assert(state.offer.actorId === state.currentPlayerId && state.offer.targetId === nextActiveSeat(state.hands, state.currentPlayerId), "old_maid_offer_seat_invalid");
  return state.offer;
}

function requireReadyOffer(state: OldMaidState, actorId: OldMaidSeatId): NonNullable<OldMaidState["offer"]> {
  const offer = state.offer;
  assert(offer && offer.phase === "ready" && offer.actorId === actorId, "old_maid_offer_not_ready");
  assert(offer.targetId === nextActiveSeat(state.hands, actorId), "old_maid_offer_seat_invalid");
  return offer;
}

function isHumanSeat(state: OldMaidState, seatId: OldMaidSeatId): boolean {
  return state.mode === "play" && seatId === "player";
}

function prepareCpuOffer(cartridge: OldMaidCartridge, state: OldMaidState): OldMaidState {
  const offer = requireOffer(state);
  assert(offer.phase === "arranging", "old_maid_offer_phase_invalid");
  assert(!isHumanSeat(state, offer.targetId), "old_maid_cpu_offer_target_human");
  const moved = reorderOfferedHand(cartridge, state, offer.targetId);
  return {
    ...moved.state,
    sequence: state.sequence + 1,
    offer: {
      ...offer,
      phase: "settling",
      reorderCount: moved.move ? 1 : 0,
      lastMove: moved.move,
      revision: offer.revision + 1,
    },
  };
}

function reorderOffer(state: OldMaidState, fromIndex: number, toIndex: number): OldMaidState {
  const offer = requireOffer(state);
  assert(offer.phase === "arranging" && isHumanSeat(state, offer.targetId), "old_maid_player_offer_required");
  assert(Number.isInteger(fromIndex) && Number.isInteger(toIndex) && fromIndex >= 0 && toIndex >= 0 && fromIndex < state.hands.player.length && toIndex < state.hands.player.length, "old_maid_reorder_index_invalid");
  assert(fromIndex !== toIndex, "old_maid_reorder_same_index");
  assert(offer.reorderCount < 3, "old_maid_reorder_limit");
  const hands = cloneHands(state.hands);
  const [cardId] = hands.player.splice(fromIndex, 1);
  hands.player.splice(toIndex, 0, cardId as string);
  const record = { turn: state.turn, fromIndex, toIndex, count: offer.reorderCount + 1 };
  return {
    ...state,
    sequence: state.sequence + 1,
    hands,
    lastReorder: { turn: state.turn, toIndex, count: record.count },
    lastReorders: { ...state.lastReorders, player: record },
    offer: { ...offer, reorderCount: record.count, lastMove: { fromIndex, toIndex }, revision: offer.revision + 1 },
  };
}

function finishOffer(state: OldMaidState): OldMaidState {
  const offer = requireOffer(state);
  const humanTarget = isHumanSeat(state, offer.targetId);
  assert(humanTarget ? offer.phase === "arranging" : offer.phase === "settling", "old_maid_offer_finish_invalid");
  return {
    ...state,
    sequence: state.sequence + 1,
    status: "playing",
    offer: { ...offer, phase: "ready", revision: offer.revision + 1 },
  };
}

function reorderOfferedHand(cartridge: OldMaidCartridge, state: OldMaidState, seatId: OldMaidSeatId): { state: OldMaidState; move: { fromIndex: number; toIndex: number } | null } {
  const hand = state.hands[seatId];
  if (hand.length < 2) return { state, move: null };
  const characterId = characterIdForSeat(state, seatId);
  const character = cartridge.characters.find((candidate) => candidate.id === characterId);
  if (!character) return { state, move: null };
  const jokerIndex = hand.findIndex((cardId) => cardById(cartridge.cards, cardId).faceId === cartridge.oddFaceId);
  const hasJoker = jokerIndex >= 0;
  const chance = character.tellStyle === "open" ? (hasJoker ? 0.75 : 0.05)
    : character.tellStyle === "guarded" ? (hasJoker ? 0.25 : 0.04)
      : character.tellStyle === "bluffer" ? (hasJoker ? 0.55 : 0.4)
        : (hasJoker ? 0.2 : 0.08);
  const seed = `${state.seed}:cpu-reorder:${state.turn}:${seatId}:${hand.length}`;
  if ((fnv1a32(`${seed}:chance`) % 10_000) / 10_000 >= chance) return { state, move: null };
  const moveJoker = hasJoker && (character.tellStyle !== "bluffer" || fnv1a32(`${seed}:truth`) % 2 === 0);
  const fromIndex = moveJoker ? jokerIndex : fnv1a32(`${seed}:from`) % hand.length;
  let toIndex = fnv1a32(`${seed}:to`) % (hand.length - 1);
  if (toIndex >= fromIndex) toIndex += 1;
  const hands = cloneHands(state.hands);
  const [cardId] = hands[seatId].splice(fromIndex, 1);
  hands[seatId].splice(toIndex, 0, cardId as string);
  const record = { turn: state.turn, fromIndex, toIndex, count: 1 };
  return { state: { ...state, hands, lastReorders: { ...state.lastReorders, [seatId]: record } }, move: { fromIndex, toIndex } };
}

function reactionsAfterDraw(cartridge: OldMaidCartridge, state: OldMaidState, actorId: OldMaidSeatId, targetId: OldMaidSeatId, drewJoker: boolean, madePair: boolean): Record<OldMaidSeatId, OldMaidReaction> {
  const next = { ...state.reactions };
  if (characterIdForSeat(state, actorId)) next[actorId] = tellReaction(cartridge, state, actorId, drewJoker ? "tense" : madePair ? "pleased" : "neutral", "actor");
  if (characterIdForSeat(state, targetId)) next[targetId] = tellReaction(cartridge, state, targetId, drewJoker ? "pleased" : "neutral", "target");
  return next;
}

function tellReaction(cartridge: OldMaidCartridge, state: OldMaidState, seatId: OldMaidSeatId, truth: OldMaidReaction, role: string): OldMaidReaction {
  const characterId = characterIdForSeat(state, seatId);
  const character = cartridge.characters.find((candidate) => candidate.id === characterId);
  assert(character, `old_maid_character_missing:${characterId ?? seatId}`);
  const deceptive = truth === "tense" ? "pleased" : "tense";
  const style = tellStyleForState(character, state);
  const weights = style === "open" ? { truth: 80, neutral: 20, deceptive: 0 } : style === "guarded" ? { truth: 45, neutral: 55, deceptive: 0 } : style === "bluffer" ? { truth: 30, neutral: 30, deceptive: 40 } : { truth: 45, neutral: 55, deceptive: 0 };
  return expressSignal(truth, "neutral", deceptive, weights, `${state.seed}:tell:${state.turn}:${seatId}:${role}`);
}

function maybeReorderCpuHand(cartridge: OldMaidCartridge, state: OldMaidState, seatId: OldMaidSeatId): OldMaidState {
  if (state.version !== OLD_MAID_PREVIOUS_VERSION || seatId === "player" && state.mode === "play" || state.hands[seatId].length < 2) return state;
  const characterId = characterIdForSeat(state, seatId);
  const character = cartridge.characters.find((candidate) => candidate.id === characterId);
  if (!character) return state;
  const hand = state.hands[seatId];
  const jokerIndex = hand.findIndex((cardId) => cardById(cartridge.cards, cardId).faceId === cartridge.oddFaceId);
  const hasJoker = jokerIndex >= 0;
  const chance = character.tellStyle === "open" ? (hasJoker ? 0.75 : 0.05)
    : character.tellStyle === "guarded" ? (hasJoker ? 0.25 : 0.04)
      : character.tellStyle === "bluffer" ? (hasJoker ? 0.55 : 0.4)
        : (hasJoker ? 0.2 : 0.08);
  const seed = `${state.seed}:cpu-reorder:${state.turn}:${seatId}:${hand.length}`;
  if ((fnv1a32(`${seed}:chance`) % 10_000) / 10_000 >= chance) return state;
  const moveJoker = hasJoker && (character.tellStyle !== "bluffer" || fnv1a32(`${seed}:truth`) % 2 === 0);
  const fromIndex = moveJoker ? jokerIndex : fnv1a32(`${seed}:from`) % hand.length;
  let toIndex = fnv1a32(`${seed}:to`) % (hand.length - 1);
  if (toIndex >= fromIndex) toIndex += 1;
  const hands = cloneHands(state.hands);
  const [cardId] = hands[seatId].splice(fromIndex, 1);
  hands[seatId].splice(toIndex, 0, cardId as string);
  const record = { turn: state.turn, fromIndex, toIndex, count: 1 };
  return { ...state, hands, lastReorders: { ...state.lastReorders, [seatId]: record } };
}

function tellStyleForState(character: OldMaidCartridge["characters"][number], state: OldMaidState): OldMaidCartridge["characters"][number]["tellStyle"] {
  if (state.version !== OLD_MAID_LEGACY_VERSION || character.tellStyle !== "standard") return character.tellStyle;
  const styles = ["open", "guarded", "bluffer"] as const;
  const score = [...character.id].reduce((sum, value) => sum + value.charCodeAt(0), 0);
  return styles[score % styles.length] ?? "open";
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
function selectedCharacters(cartridge: OldMaidCartridge, ids: string[], mode: OldMaidState["mode"]): { characters: Record<OldMaidCpuSeatId, string>; spectatorCharacterId: string | null } {
  const required = mode === "spectate" ? 4 : 3;
  assert(ids.length === required && new Set(ids).size === required, "old_maid_character_selection_duplicate");
  const valid = new Set(selectableCharacterIds(cartridge));
  assert(ids.every((id) => valid.has(id)), "old_maid_character_selection_invalid");
  return { characters: { "cpu-1": ids[0] as string, "cpu-2": ids[1] as string, "cpu-3": ids[2] as string }, spectatorCharacterId: mode === "spectate" ? ids[3] as string : null };
}
function selectableCharacterIds(cartridge: OldMaidCartridge): readonly string[] { return cartridge.selectableCharacterIds ?? cartridge.characters.map((character) => character.id); }
function dealPairCount(cartridge: OldMaidCartridge): number { return cartridge.dealPairCount ?? 12; }
function automaticCharacterIds(cartridge: OldMaidCartridge, seed: string, mode: OldMaidState["mode"]): string[] {
  const required = mode === "spectate" ? 4 : 3;
  return shuffle(selectableCharacterIds(cartridge), new XorShift32(`${cartridge.version}:${seed}:characters`)).slice(0, required);
}
export function characterIdForSeat(state: OldMaidState, seatId: OldMaidSeatId): string | null { return seatId === "player" ? state.spectatorCharacterId : state.characters[seatId]; }
function cloneHands(hands: Record<OldMaidSeatId, string[]>): Record<OldMaidSeatId, string[]> { return { player: [...hands.player], "cpu-1": [...hands["cpu-1"]], "cpu-2": [...hands["cpu-2"]], "cpu-3": [...hands["cpu-3"]] }; }
function cardById(cards: OldMaidCard[], cardId: string): OldMaidCard { const card = cards.find((candidate) => candidate.id === cardId); assert(card, `old_maid_card_missing:${cardId}`); return card; }
function shuffle<T>(input: readonly T[], rng: XorShift32): T[] { const output = [...input]; for (let index = output.length - 1; index > 0; index -= 1) { const target = rng.nextUint32() % (index + 1); [output[index], output[target]] = [output[target] as T, output[index] as T]; } return output; }
function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
