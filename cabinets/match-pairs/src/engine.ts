import { resultHash, XorShift32 } from "@lucky-arcade/engine";
import {
  MATCH_PAIRS_ACTORS, MATCH_PAIRS_ERRORS, MATCH_PAIRS_PAIR_COUNTS, MATCH_PAIRS_STATE_CONTRACT, MATCH_PAIRS_VERSION,
  type MatchPairsAction, type MatchPairsActor, type MatchPairsCard, type MatchPairsDifficulty, type MatchPairsFace,
  type MatchPairsFocus, type MatchPairsMemoryEntry, type MatchPairsMode, type MatchPairsNpcRead, type MatchPairsOpponent,
  type MatchPairsOpponentSelection, type MatchPairsReaction, type MatchPairsState,
} from "./contracts.ts";

export function createMatchPairsState(
  faces: readonly MatchPairsFace[], opponents: readonly MatchPairsOpponent[], packVersion: string, seed: string,
  difficulty: MatchPairsDifficulty, opponentId: string, sessionId = "match-pairs:versus-2",
  mode: MatchPairsMode = "play", spectatorOpponentId?: string, focus: MatchPairsFocus = "relaxed",
): MatchPairsState {
  assertNonEmpty(packVersion, MATCH_PAIRS_ERRORS.invalidPackVersion); assertNonEmpty(seed, MATCH_PAIRS_ERRORS.invalidSeed);
  assertNonEmpty(sessionId, MATCH_PAIRS_ERRORS.invalidSessionId); assertDifficulty(difficulty); validateOpponents(opponents);
  const opponentIds = selectionForMode(opponents, mode, opponentId, spectatorOpponentId);
  const selected = selectMatchPairsFaces(faces, packVersion, seed, difficulty);
  const cards = shuffle(createCards(selected), new XorShift32(`${packVersion}:${seed}:${difficulty}:board`));
  return {
    contract: MATCH_PAIRS_STATE_CONTRACT, version: MATCH_PAIRS_VERSION, packVersion, sessionId, seed, sequence: 0,
    mode, focus, difficulty, status: "ready", cards, openIndexes: [], matchedPairIds: [], claims: emptyClaims(),
    currentTurn: openingActor(mode, seed), revealActor: null, opponentIds, wagerId: null, stake: null, creditAmount: 0,
    npcMemories: emptyMemories(), reactions: neutralReactions(), matchStreaks: emptyStreaks(), turnNumber: 0,
    attempts: 0, lastResolution: null, outcome: null, history: [],
  };
}

export function reduceMatchPairs(faces: readonly MatchPairsFace[], opponents: readonly MatchPairsOpponent[], state: MatchPairsState, action: MatchPairsAction): MatchPairsState {
  validateOpponents(opponents);
  if (action.type === "restart") {
    assertDifficulty(action.difficulty);
    const mode = action.mode ?? state.mode, selection = action.opponentIds ?? state.opponentIds, focus = action.focus ?? state.focus;
    const restarted = createMatchPairsState(faces, opponents, state.packVersion, action.seed, action.difficulty, selection.npc, state.sessionId, mode, selection.player ?? undefined, focus);
    return recordAction({ ...restarted, sequence: state.sequence }, action, state.history);
  }
  if (action.type === "set-mode") {
    assert(state.status === "ready", MATCH_PAIRS_ERRORS.opponentSelectionInvalid);
    const selection = selectionForMode(opponents, action.mode, state.opponentIds.npc, state.opponentIds.player ?? undefined);
    return recordAction({ ...state, mode: action.mode, opponentIds: selection, currentTurn: openingActor(action.mode, state.seed), npcMemories: emptyMemories(), reactions: neutralReactions(), matchStreaks: emptyStreaks() }, action);
  }
  if (action.type === "set-focus") {
    assert(state.status === "ready" && ["relaxed", "standard", "sharp"].includes(action.focus), MATCH_PAIRS_ERRORS.opponentSelectionInvalid);
    return recordAction({ ...state, focus: action.focus, npcMemories: emptyMemories(), reactions: neutralReactions(), matchStreaks: emptyStreaks() }, action);
  }
  if (action.type === "select-opponent") {
    assert(state.status === "ready", MATCH_PAIRS_ERRORS.opponentSelectionInvalid); findOpponent(opponents, action.opponentId);
    const actor = action.actor ?? "npc";
    assert(state.mode === "spectate" || actor === "npc", MATCH_PAIRS_ERRORS.opponentSelectionInvalid);
    const opponentIds = { ...state.opponentIds, [actor]: action.opponentId };
    assert(opponentIds.player === null || opponentIds.player !== opponentIds.npc, MATCH_PAIRS_ERRORS.opponentDuplicate);
    return recordAction({ ...state, opponentIds, npcMemories: emptyMemories(), reactions: neutralReactions(), matchStreaks: emptyStreaks() }, action);
  }
  if (action.type === "random-opponents") {
    assert(state.status === "ready", MATCH_PAIRS_ERRORS.opponentSelectionInvalid);
    const ordered = [...opponents].sort((left, right) => compareText(left.id, right.id));
    const shuffled = shuffle(ordered, new XorShift32(`${state.seed}:opponents:${state.sequence}:${state.mode}`));
    const opponentIds = state.mode === "play"
      ? { player: null, npc: (shuffled.find((item) => item.id !== state.opponentIds.npc) ?? shuffled[0])!.id }
      : { player: shuffled[0]!.id, npc: shuffled[1]!.id };
    return recordAction({ ...state, opponentIds, npcMemories: emptyMemories(), reactions: neutralReactions(), matchStreaks: emptyStreaks() }, action);
  }
  if (action.type === "start") {
    assert(state.status === "ready", MATCH_PAIRS_ERRORS.startInvalid); assertNonEmpty(action.seed, MATCH_PAIRS_ERRORS.invalidSeed);
    if (state.mode === "play") {
      assertNonEmpty(action.wagerId ?? "", MATCH_PAIRS_ERRORS.startInvalid);
      assert(action.stake === 10 || action.stake === 50 || action.stake === 200, MATCH_PAIRS_ERRORS.startInvalid);
    } else assert(action.wagerId === undefined && action.stake === undefined, MATCH_PAIRS_ERRORS.startInvalid);
    const started = createMatchPairsState(faces, opponents, state.packVersion, action.seed, state.difficulty, state.opponentIds.npc, state.sessionId, state.mode, state.opponentIds.player ?? undefined, state.focus);
    return recordAction({ ...started, sequence: state.sequence, status: "playing", wagerId: action.wagerId ?? null, stake: action.stake ?? null }, action, state.history);
  }
  if (action.type === "player-reveal") {
    assert(state.mode === "play" && state.currentTurn === "player", MATCH_PAIRS_ERRORS.revealInvalid);
    return revealAtIndex(state, action.index, "player", opponents, action);
  }
  if (action.type === "npc-reveal") {
    const actor = state.currentTurn;
    assert(isCpuActor(state, actor), MATCH_PAIRS_ERRORS.revealInvalid);
    const opponent = effectiveOpponent(opponentForActor(state, opponents, actor), state.focus);
    const index = chooseMatchPairsNpcIndex(createNpcRead(state, actor), opponent);
    return revealAtIndex(state, index, actor, opponents, action);
  }
  if (action.type === "resolve") return resolveOpenCards(state, opponents, action);
  throw new Error(MATCH_PAIRS_ERRORS.actionInvalid);
}

/** The chooser deliberately receives no board faces or hidden card array. */
export function chooseMatchPairsNpcIndex(read: MatchPairsNpcRead, opponent: MatchPairsOpponent): number {
  const unavailable = new Set(read.unavailableIndexes);
  const available = Array.from({ length: read.cardCount }, (_, index) => index).filter((index) => !unavailable.has(index));
  assert(available.length > 0, MATCH_PAIRS_ERRORS.revealInvalid);
  const remembered = read.memory.filter((entry) => available.includes(entry.index));
  const rng = new XorShift32(`${read.seed}:npc:${read.actor}:${read.turnNumber}:${read.sequence}:${read.openIndexes.length}`);
  if (read.openIndexes.length === 1) {
    const open = read.memory.find((entry) => entry.index === read.openIndexes[0]);
    const counterpart = open && bestRemembered(remembered.filter((entry) => entry.index !== open.index && entry.pairId === open.pairId));
    if (counterpart && recalls(counterpart, opponent, read.matchStreak, rng)) return counterpart.index;
  } else {
    const byPair = new Map<string, MatchPairsMemoryEntry[]>();
    for (const entry of remembered) byPair.set(entry.pairId, [...(byPair.get(entry.pairId) ?? []), entry]);
    const first = [...byPair.values()].filter((entries) => entries.length >= 2).sort(compareMemoryGroups)[0]?.sort(compareMemory)[0];
    if (first && recalls(first, opponent, read.matchStreak, rng)) return first.index;
  }
  const knownIndexes = new Set(read.memory.map((entry) => entry.index));
  const unknown = available.filter((index) => !knownIndexes.has(index));
  const recheckChance = opponent.searchStyle === "recheck" ? 0.42 : opponent.searchStyle === "mixed" ? 0.18 : 0;
  if (unknown.length > 0 && (remembered.length === 0 || rng.next() >= recheckChance)) return unknown[rng.nextUint32() % unknown.length]!;
  if (remembered.length > 0) return weightedRememberedIndex(remembered, opponent, rng);
  return available[rng.nextUint32() % available.length]!;
}

export function selectMatchPairsFaces(faces: readonly MatchPairsFace[], packVersion: string, seed: string, difficulty: MatchPairsDifficulty): MatchPairsFace[] {
  assertNonEmpty(packVersion, MATCH_PAIRS_ERRORS.invalidPackVersion); assertNonEmpty(seed, MATCH_PAIRS_ERRORS.invalidSeed); assertDifficulty(difficulty); validateFaces(faces);
  const required = MATCH_PAIRS_PAIR_COUNTS[difficulty]; assert(faces.length >= required, MATCH_PAIRS_ERRORS.candidatesTooFew);
  const prioritized = shuffle([...faces].sort(compareFaces), new XorShift32(`${packVersion}:${seed}:${difficulty}:selection`));
  const maximum = maximumConstraintMatching(prioritized); assert(maximum.length >= required, MATCH_PAIRS_ERRORS.constraintConflict);
  return maximum.slice(0, required);
}

export function matchPairsResultHash(state: MatchPairsState): string { return resultHash(state); }
export function matchPairsWinCreditRate(opponent: MatchPairsOpponent, focus: MatchPairsFocus): number { return opponent.winCreditMultiplier + (focus === "relaxed" ? -0.25 : focus === "sharp" ? 0.25 : 0); }
export function isCpuActor(state: Pick<MatchPairsState, "mode">, actor: MatchPairsActor): boolean { return state.mode === "spectate" || actor === "npc"; }
export function characterIdForMatchPairsActor(state: Pick<MatchPairsState, "opponentIds">, actor: MatchPairsActor): string | null { return state.opponentIds[actor]; }

function revealAtIndex(state: MatchPairsState, index: number, actor: MatchPairsActor, opponents: readonly MatchPairsOpponent[], action: MatchPairsAction): MatchPairsState {
  assert(state.status === "playing" && state.currentTurn === actor, MATCH_PAIRS_ERRORS.revealInvalid);
  assert(state.revealActor === null || state.revealActor === actor, MATCH_PAIRS_ERRORS.revealInvalid);
  assert(Number.isInteger(index) && index >= 0 && index < state.cards.length, MATCH_PAIRS_ERRORS.revealIndexInvalid);
  assert(!state.openIndexes.includes(index), MATCH_PAIRS_ERRORS.revealAlreadyOpen);
  const card = state.cards[index]; assert(card, MATCH_PAIRS_ERRORS.revealIndexInvalid);
  assert(!state.matchedPairIds.includes(card.pairId), MATCH_PAIRS_ERRORS.revealAlreadyMatched); assert(state.openIndexes.length < 2, MATCH_PAIRS_ERRORS.revealInvalid);
  const openIndexes = [...state.openIndexes, index];
  const npcMemories = observeCard(state, opponents, actor, index, card.pairId);
  return recordAction({ ...state, openIndexes, revealActor: actor, npcMemories, status: openIndexes.length === 2 ? "checking" : "playing", attempts: state.attempts + (openIndexes.length === 2 ? 1 : 0) }, action);
}

function resolveOpenCards(state: MatchPairsState, opponents: readonly MatchPairsOpponent[], action: MatchPairsAction): MatchPairsState {
  assert(state.status === "checking" && state.openIndexes.length === 2 && state.revealActor, MATCH_PAIRS_ERRORS.resolveInvalid);
  const [firstIndex, secondIndex] = state.openIndexes, first = state.cards[firstIndex!], second = state.cards[secondIndex!];
  assert(first && second, MATCH_PAIRS_ERRORS.resolveInvalid);
  const actor = state.revealActor, matched = first.pairId === second.pairId;
  const matchedPairIds = matched ? [...state.matchedPairIds, first.pairId] : state.matchedPairIds;
  const claims = matched ? { ...state.claims, [actor]: [...state.claims[actor], first.pairId] } : state.claims;
  const complete = matchedPairIds.length === MATCH_PAIRS_PAIR_COUNTS[state.difficulty], outcome = complete ? compareClaims(claims) : null;
  const matchStreaks = matched ? { ...emptyStreaks(), [actor]: state.matchStreaks[actor] + 1 } : emptyStreaks();
  const npcMemories = Object.fromEntries(MATCH_PAIRS_ACTORS.map((seat) => {
    if (!isCpuActor(state, seat)) return [seat, []];
    const aged = decayMemory(state.npcMemories[seat], effectiveOpponent(opponentForActor(state, opponents, seat), state.focus));
    return [seat, matched ? aged.filter((entry) => entry.pairId !== first.pairId) : aged];
  })) as unknown as Record<MatchPairsActor, readonly MatchPairsMemoryEntry[]>;
  const creditAmount = state.mode === "play" && outcome === "player" && state.stake !== null
    ? Math.round(state.stake * matchPairsWinCreditRate(opponentForActor(state, opponents, "npc"), state.focus))
    : state.mode === "play" && outcome === "draw" && state.stake !== null ? state.stake : 0;
  return recordAction({
    ...state, matchedPairIds, claims, currentTurn: matched ? actor : otherActor(actor), revealActor: null, openIndexes: [], npcMemories,
    reactions: reactionsAfterResolution(state, actor, matched, outcome), matchStreaks, turnNumber: state.turnNumber + 1,
    lastResolution: { actor, matched, pairId: matched ? first.pairId : null }, outcome, creditAmount, status: complete ? "complete" : "playing",
  }, action);
}

function createNpcRead(state: MatchPairsState, actor: MatchPairsActor): MatchPairsNpcRead {
  const matched = new Set(state.matchedPairIds);
  return { seed: state.seed, actor, sequence: state.sequence, turnNumber: state.turnNumber, matchStreak: state.matchStreaks[actor], cardCount: state.cards.length,
    openIndexes: [...state.openIndexes], unavailableIndexes: state.cards.flatMap((card, index) => matched.has(card.pairId) || state.openIndexes.includes(index) ? [index] : []),
    memory: state.npcMemories[actor].map((entry) => ({ ...entry })) };
}

function observeCard(state: MatchPairsState, opponents: readonly MatchPairsOpponent[], revealingActor: MatchPairsActor, index: number, pairId: string): Record<MatchPairsActor, readonly MatchPairsMemoryEntry[]> {
  return Object.fromEntries(MATCH_PAIRS_ACTORS.map((observer) => {
    if (!isCpuActor(state, observer)) return [observer, []];
    const opponent = effectiveOpponent(opponentForActor(state, opponents, observer), state.focus);
    const notices = observer === revealingActor || new XorShift32(`${state.seed}:observe:${observer}:${state.turnNumber}:${state.sequence}:${index}`).next() < opponent.observationRate;
    return [observer, notices ? rememberCard(state.npcMemories[observer], index, pairId, state.turnNumber, opponent) : state.npcMemories[observer]];
  })) as unknown as Record<MatchPairsActor, readonly MatchPairsMemoryEntry[]>;
}

function rememberCard(memory: readonly MatchPairsMemoryEntry[], index: number, pairId: string, turnNumber: number, opponent: MatchPairsOpponent): MatchPairsMemoryEntry[] {
  const next = [...memory.filter((entry) => entry.index !== index), { index, pairId, seenAtTurn: turnNumber, confidence: 1 }].sort(compareMemory);
  return next.slice(0, opponent.memoryCapacity);
}
function decayMemory(memory: readonly MatchPairsMemoryEntry[], opponent: MatchPairsOpponent): MatchPairsMemoryEntry[] { return memory.map((entry) => ({ ...entry, confidence: Math.max(0.05, entry.confidence * opponent.memoryRetention) })); }
function recalls(entry: MatchPairsMemoryEntry, opponent: MatchPairsOpponent, streak: number, rng: XorShift32): boolean { return rng.next() < Math.min(0.95, opponent.recallAccuracy * entry.confidence * Math.pow(opponent.streakComposure, Math.max(0, streak - 1))); }
function weightedRememberedIndex(entries: readonly MatchPairsMemoryEntry[], opponent: MatchPairsOpponent, rng: XorShift32): number { const ordered = [...entries].sort(compareMemory); return rng.next() < opponent.consistency ? ordered[0]!.index : ordered[rng.nextUint32() % ordered.length]!.index; }
function bestRemembered(entries: readonly MatchPairsMemoryEntry[]): MatchPairsMemoryEntry | null { return [...entries].sort(compareMemory)[0] ?? null; }
function compareMemory(left: MatchPairsMemoryEntry, right: MatchPairsMemoryEntry): number { return right.confidence - left.confidence || right.seenAtTurn - left.seenAtTurn || left.index - right.index; }
function compareMemoryGroups(left: MatchPairsMemoryEntry[], right: MatchPairsMemoryEntry[]): number { return compareMemory(left.sort(compareMemory)[0]!, right.sort(compareMemory)[0]!); }
function compareClaims(claims: Readonly<Record<MatchPairsActor, readonly string[]>>): MatchPairsActor | "draw" { return claims.player.length > claims.npc.length ? "player" : claims.npc.length > claims.player.length ? "npc" : "draw"; }
function otherActor(actor: MatchPairsActor): MatchPairsActor { return actor === "player" ? "npc" : "player"; }
function reactionsAfterResolution(state: MatchPairsState, actor: MatchPairsActor, matched: boolean, outcome: MatchPairsState["outcome"]): Record<MatchPairsActor, MatchPairsReaction> {
  const other = otherActor(actor);
  if (outcome === "draw") return neutralReactions();
  if (outcome) return { [outcome]: "pleased", [otherActor(outcome)]: "despair" } as Record<MatchPairsActor, MatchPairsReaction>;
  return { ...state.reactions, [actor]: matched ? "pleased" : "tense", [other]: matched ? "tense" : "neutral" };
}

function opponentForActor(state: Pick<MatchPairsState, "opponentIds">, opponents: readonly MatchPairsOpponent[], actor: MatchPairsActor): MatchPairsOpponent { const id = state.opponentIds[actor]; assert(id, MATCH_PAIRS_ERRORS.opponentMissing); return findOpponent(opponents, id); }
function effectiveOpponent(opponent: MatchPairsOpponent, focus: MatchPairsFocus): MatchPairsOpponent {
  if (focus === "standard") return opponent;
  if (focus === "relaxed") return { ...opponent, memoryCapacity: Math.max(2, opponent.memoryCapacity - 2), observationRate: opponent.observationRate * .78, recallAccuracy: opponent.recallAccuracy * .82, memoryRetention: opponent.memoryRetention * .96, streakComposure: opponent.streakComposure * .9 };
  return { ...opponent, memoryCapacity: Math.min(8, opponent.memoryCapacity + 1), observationRate: Math.min(.95, opponent.observationRate * 1.08), recallAccuracy: Math.min(.95, opponent.recallAccuracy * 1.08), memoryRetention: Math.min(.97, opponent.memoryRetention * 1.03), streakComposure: Math.min(.97, opponent.streakComposure * 1.04) };
}
function selectionForMode(opponents: readonly MatchPairsOpponent[], mode: MatchPairsMode, opponentId: string, spectatorOpponentId?: string): MatchPairsOpponentSelection {
  findOpponent(opponents, opponentId); if (mode === "play") return { player: null, npc: opponentId };
  const playerId = spectatorOpponentId && spectatorOpponentId !== opponentId ? spectatorOpponentId : opponents.find((item) => item.id !== opponentId)?.id;
  assert(playerId, MATCH_PAIRS_ERRORS.opponentMissing); findOpponent(opponents, playerId); return { player: playerId, npc: opponentId };
}
function openingActor(mode: MatchPairsMode, seed: string): MatchPairsActor { return mode === "play" || new XorShift32(`${seed}:opening-seat`).nextUint32() % 2 === 0 ? "player" : "npc"; }
function emptyClaims(): Record<MatchPairsActor, readonly string[]> { return { player: [], npc: [] }; }
function emptyMemories(): Record<MatchPairsActor, readonly MatchPairsMemoryEntry[]> { return { player: [], npc: [] }; }
function neutralReactions(): Record<MatchPairsActor, MatchPairsReaction> { return { player: "neutral", npc: "neutral" }; }
function emptyStreaks(): Record<MatchPairsActor, number> { return { player: 0, npc: 0 }; }

function maximumConstraintMatching(prioritized: readonly MatchPairsFace[]): MatchPairsFace[] { const byCharacter = new Map<string, MatchPairsFace[]>(); for (const face of prioritized) byCharacter.set(face.characterId, [...(byCharacter.get(face.characterId) ?? []), face]); const matchedByGroup = new Map<string, MatchPairsFace>(); const match = (characterId: string, visitedGroups: Set<string>): boolean => { for (const face of byCharacter.get(characterId) ?? []) { const group = constraintKey(face); if (visitedGroups.has(group)) continue; visitedGroups.add(group); const previous = matchedByGroup.get(group); if (!previous || match(previous.characterId, visitedGroups)) { matchedByGroup.set(group, face); return true; } } return false; }; for (const characterId of byCharacter.keys()) match(characterId, new Set()); const ids = new Set([...matchedByGroup.values()].map((face) => face.id)); return prioritized.filter((face) => ids.has(face.id)); }
function createCards(faces: readonly MatchPairsFace[]): MatchPairsCard[] { return faces.flatMap((face) => [{ cardId: `${face.id}:copy-1`, pairId: face.id }, { cardId: `${face.id}:copy-2`, pairId: face.id }]); }
function recordAction(state: MatchPairsState, action: MatchPairsAction, history = state.history): MatchPairsState { const sequence = state.sequence + 1; return { ...state, sequence, history: [...history, { sequence, action: cloneAction(action) }] }; }
function cloneAction(action: MatchPairsAction): MatchPairsAction { if (action.type === "player-reveal") return { type: action.type, index: action.index }; if (action.type === "restart") return { type: action.type, seed: action.seed, difficulty: action.difficulty, ...(action.mode ? { mode: action.mode } : {}), ...(action.focus ? { focus: action.focus } : {}), ...(action.opponentIds ? { opponentIds: { ...action.opponentIds } } : {}) }; if (action.type === "select-opponent") return { type: action.type, opponentId: action.opponentId, ...(action.actor ? { actor: action.actor } : {}) }; if (action.type === "set-mode") return { type: action.type, mode: action.mode }; if (action.type === "set-focus") return { type: action.type, focus: action.focus }; if (action.type === "start") return { type: action.type, seed: action.seed, ...(action.stake ? { stake: action.stake } : {}), ...(action.wagerId ? { wagerId: action.wagerId } : {}) }; return { type: action.type }; }
function validateFaces(faces: readonly MatchPairsFace[]): void { const ids = new Set<string>(); for (const face of faces) { assertNonEmpty(face.id, MATCH_PAIRS_ERRORS.invalidFace); assertNonEmpty(face.assetId, MATCH_PAIRS_ERRORS.invalidFace); assertNonEmpty(face.characterId, MATCH_PAIRS_ERRORS.invalidFace); if (face.confusionGroup !== undefined) assertNonEmpty(face.confusionGroup, MATCH_PAIRS_ERRORS.invalidFace); assert(!ids.has(face.id), `${MATCH_PAIRS_ERRORS.duplicateFaceId}:${face.id}`); ids.add(face.id); } }
function validateOpponents(opponents: readonly MatchPairsOpponent[]): void { assert(opponents.length > 1, MATCH_PAIRS_ERRORS.opponentMissing); const ids = new Set<string>(); for (const opponent of opponents) { assertNonEmpty(opponent.id, MATCH_PAIRS_ERRORS.invalidOpponent); assertNonEmpty(opponent.name, MATCH_PAIRS_ERRORS.invalidOpponent); for (const portrait of [...Object.values(opponent.portraits), opponent.despairPortrait]) assertNonEmpty(portrait, MATCH_PAIRS_ERRORS.invalidOpponent); assert(Number.isInteger(opponent.memoryCapacity) && opponent.memoryCapacity >= 2 && opponent.memoryCapacity <= 8, MATCH_PAIRS_ERRORS.invalidOpponent); for (const value of [opponent.observationRate, opponent.recallAccuracy, opponent.memoryRetention, opponent.consistency, opponent.streakComposure]) assert(Number.isFinite(value) && value >= 0 && value <= 1, MATCH_PAIRS_ERRORS.invalidOpponent); assert(["explore", "recheck", "mixed"].includes(opponent.searchStyle), MATCH_PAIRS_ERRORS.invalidOpponent); assert([1, 2, 3].includes(opponent.difficultyTier), MATCH_PAIRS_ERRORS.invalidOpponent); assert(opponent.winCreditMultiplier === 1.5 || opponent.winCreditMultiplier === 2 || opponent.winCreditMultiplier === 2.5, MATCH_PAIRS_ERRORS.invalidOpponent); assert(!ids.has(opponent.id), `${MATCH_PAIRS_ERRORS.duplicateOpponentId}:${opponent.id}`); ids.add(opponent.id); } }
function findOpponent(opponents: readonly MatchPairsOpponent[], id: string): MatchPairsOpponent { const opponent = opponents.find((candidate) => candidate.id === id); assert(opponent, `${MATCH_PAIRS_ERRORS.opponentMissing}:${id}`); return opponent; }
function compareFaces(left: MatchPairsFace, right: MatchPairsFace): number { return compareText(left.id, right.id) || compareText(left.characterId, right.characterId) || compareText(left.confusionGroup ?? "", right.confusionGroup ?? "") || compareText(left.assetId, right.assetId); }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function constraintKey(face: MatchPairsFace): string { return face.confusionGroup === undefined ? `face:${face.id}` : `group:${face.confusionGroup}`; }
function shuffle<T>(input: readonly T[], rng: XorShift32): T[] { const output = [...input]; for (let index = output.length - 1; index > 0; index -= 1) { const target = rng.nextUint32() % (index + 1); [output[index], output[target]] = [output[target] as T, output[index] as T]; } return output; }
function assertDifficulty(difficulty: string): asserts difficulty is MatchPairsDifficulty { assert(difficulty === "easy" || difficulty === "normal", MATCH_PAIRS_ERRORS.invalidDifficulty); }
function assertNonEmpty(value: string, code: string): void { assert(value.trim().length > 0, code); }
function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
