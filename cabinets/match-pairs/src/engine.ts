import { resultHash, XorShift32 } from "@lucky-arcade/engine";
import {
  MATCH_PAIRS_ERRORS,
  MATCH_PAIRS_PAIR_COUNTS,
  MATCH_PAIRS_STATE_CONTRACT,
  MATCH_PAIRS_VERSION,
  type MatchPairsAction,
  type MatchPairsActor,
  type MatchPairsCard,
  type MatchPairsDifficulty,
  type MatchPairsFace,
  type MatchPairsHistoryEntry,
  type MatchPairsMemoryEntry,
  type MatchPairsNpcRead,
  type MatchPairsOpponent,
  type MatchPairsReaction,
  type MatchPairsState,
} from "./contracts.ts";

export function createMatchPairsState(
  faces: readonly MatchPairsFace[],
  opponents: readonly MatchPairsOpponent[],
  packVersion: string,
  seed: string,
  difficulty: MatchPairsDifficulty,
  opponentId: string,
  sessionId = "match-pairs:versus-1",
): MatchPairsState {
  assertNonEmpty(packVersion, MATCH_PAIRS_ERRORS.invalidPackVersion);
  assertNonEmpty(seed, MATCH_PAIRS_ERRORS.invalidSeed);
  assertNonEmpty(sessionId, MATCH_PAIRS_ERRORS.invalidSessionId);
  assertDifficulty(difficulty);
  validateOpponents(opponents);
  findOpponent(opponents, opponentId);
  const selected = selectMatchPairsFaces(faces, packVersion, seed, difficulty);
  const cards = shuffle(createCards(selected), new XorShift32(`${packVersion}:${seed}:${difficulty}:board`));
  return {
    contract: MATCH_PAIRS_STATE_CONTRACT,
    version: MATCH_PAIRS_VERSION,
    packVersion,
    sessionId,
    seed,
    sequence: 0,
    difficulty,
    status: "ready",
    cards,
    openIndexes: [],
    matchedPairIds: [],
    claims: { player: [], npc: [] },
    currentTurn: "player",
    revealActor: null,
    opponentId,
    wagerId: null,
    stake: null,
    creditAmount: 0,
    npcMemory: [],
    npcReaction: "neutral",
    turnNumber: 0,
    attempts: 0,
    lastResolution: null,
    outcome: null,
    history: [],
  };
}

export function reduceMatchPairs(
  faces: readonly MatchPairsFace[],
  opponents: readonly MatchPairsOpponent[],
  state: MatchPairsState,
  action: MatchPairsAction,
): MatchPairsState {
  validateOpponents(opponents);
  const opponent = findOpponent(opponents, state.opponentId);

  if (action.type === "restart") {
    assertDifficulty(action.difficulty);
    assertNonEmpty(action.seed, MATCH_PAIRS_ERRORS.invalidSeed);
    const opponentId = action.opponentId ?? state.opponentId;
    const restarted = createMatchPairsState(faces, opponents, state.packVersion, action.seed, action.difficulty, opponentId, state.sessionId);
    return recordAction({ ...restarted, sequence: state.sequence }, action, state.history);
  }
  if (action.type === "select-opponent") {
    assert(state.status === "ready", MATCH_PAIRS_ERRORS.opponentSelectionInvalid);
    findOpponent(opponents, action.opponentId);
    return recordAction({ ...state, opponentId: action.opponentId, npcMemory: [], npcReaction: "neutral" }, action);
  }
  if (action.type === "random-opponent") {
    assert(state.status === "ready", MATCH_PAIRS_ERRORS.opponentSelectionInvalid);
    const choices = (opponents.length > 1 ? opponents.filter((candidate) => candidate.id !== state.opponentId) : [...opponents])
      .sort((left, right) => compareText(left.id, right.id));
    const rng = new XorShift32(`${state.seed}:opponent:${state.sequence}`);
    const selected = choices[rng.nextUint32() % choices.length];
    assert(selected, MATCH_PAIRS_ERRORS.opponentMissing);
    return recordAction({ ...state, opponentId: selected.id, npcMemory: [], npcReaction: "neutral" }, action);
  }
  if (action.type === "start") {
    assert(state.status === "ready", MATCH_PAIRS_ERRORS.startInvalid);
    assertNonEmpty(action.seed, MATCH_PAIRS_ERRORS.invalidSeed);
    assertNonEmpty(action.wagerId, MATCH_PAIRS_ERRORS.startInvalid);
    assert(action.stake === 10 || action.stake === 50 || action.stake === 200, MATCH_PAIRS_ERRORS.startInvalid);
    const started = createMatchPairsState(faces, opponents, state.packVersion, action.seed, state.difficulty, state.opponentId, state.sessionId);
    return recordAction({ ...started, sequence: state.sequence, status: "playing", currentTurn: "player", wagerId: action.wagerId, stake: action.stake }, action, state.history);
  }
  if (action.type === "player-reveal") {
    assert(state.currentTurn === "player", MATCH_PAIRS_ERRORS.revealInvalid);
    return revealAtIndex(state, action.index, "player", opponent, action);
  }
  if (action.type === "npc-reveal") {
    assert(state.currentTurn === "npc", MATCH_PAIRS_ERRORS.revealInvalid);
    const index = chooseMatchPairsNpcIndex(createNpcRead(state), opponent);
    return revealAtIndex(state, index, "npc", opponent, action);
  }
  if (action.type === "resolve") return resolveOpenCards(state, opponent, action);
  throw new Error(MATCH_PAIRS_ERRORS.actionInvalid);
}

/** The chooser deliberately receives no board faces or hidden card array. */
export function chooseMatchPairsNpcIndex(read: MatchPairsNpcRead, opponent: MatchPairsOpponent): number {
  const unavailable = new Set(read.unavailableIndexes);
  const available = Array.from({ length: read.cardCount }, (_, index) => index).filter((index) => !unavailable.has(index));
  assert(available.length > 0, MATCH_PAIRS_ERRORS.revealInvalid);
  const remembered = read.memory.filter((entry) => available.includes(entry.index));
  const rng = new XorShift32(`${read.seed}:npc:${read.turnNumber}:${read.sequence}:${read.openIndexes.length}`);

  if (read.openIndexes.length === 1) {
    const open = read.memory.find((entry) => entry.index === read.openIndexes[0]);
    const counterpart = open && bestRemembered(remembered.filter((entry) => entry.index !== open.index && entry.pairId === open.pairId));
    if (counterpart && recalls(counterpart, opponent, rng)) return counterpart.index;
  } else {
    const byPair = new Map<string, MatchPairsMemoryEntry[]>();
    for (const entry of remembered) byPair.set(entry.pairId, [...(byPair.get(entry.pairId) ?? []), entry]);
    const knownPairs = [...byPair.values()].filter((entries) => entries.length >= 2).sort(compareMemoryGroups);
    const first = knownPairs[0]?.sort(compareMemory)[0];
    if (first && recalls(first, opponent, rng)) return first.index;
  }

  const knownIndexes = new Set(read.memory.map((entry) => entry.index));
  const unknown = available.filter((index) => !knownIndexes.has(index));
  // A remembered singleton has no information value while an unseen card remains.
  // Personality changes what the NPC remembers, never whether it knowingly wastes a reveal.
  if (unknown.length > 0) return unknown[rng.nextUint32() % unknown.length]!;
  if (remembered.length > 0) return weightedRememberedIndex(remembered, opponent, rng);
  return available[rng.nextUint32() % available.length]!;
}

export function selectMatchPairsFaces(faces: readonly MatchPairsFace[], packVersion: string, seed: string, difficulty: MatchPairsDifficulty): MatchPairsFace[] {
  assertNonEmpty(packVersion, MATCH_PAIRS_ERRORS.invalidPackVersion);
  assertNonEmpty(seed, MATCH_PAIRS_ERRORS.invalidSeed);
  assertDifficulty(difficulty);
  validateFaces(faces);
  const required = MATCH_PAIRS_PAIR_COUNTS[difficulty];
  assert(faces.length >= required, MATCH_PAIRS_ERRORS.candidatesTooFew);
  const prioritized = shuffle([...faces].sort(compareFaces), new XorShift32(`${packVersion}:${seed}:${difficulty}:selection`));
  const maximum = maximumConstraintMatching(prioritized);
  assert(maximum.length >= required, MATCH_PAIRS_ERRORS.constraintConflict);
  return maximum.slice(0, required);
}

export function matchPairsResultHash(state: MatchPairsState): string { return resultHash(state); }

function revealAtIndex(state: MatchPairsState, index: number, actor: MatchPairsActor, opponent: MatchPairsOpponent, action: MatchPairsAction): MatchPairsState {
  assert(state.status === "playing", MATCH_PAIRS_ERRORS.revealInvalid);
  assert(state.revealActor === null || state.revealActor === actor, MATCH_PAIRS_ERRORS.revealInvalid);
  assert(Number.isInteger(index) && index >= 0 && index < state.cards.length, MATCH_PAIRS_ERRORS.revealIndexInvalid);
  assert(!state.openIndexes.includes(index), MATCH_PAIRS_ERRORS.revealAlreadyOpen);
  const card = state.cards[index];
  assert(card, MATCH_PAIRS_ERRORS.revealIndexInvalid);
  assert(!state.matchedPairIds.includes(card.pairId), MATCH_PAIRS_ERRORS.revealAlreadyMatched);
  assert(state.openIndexes.length < 2, MATCH_PAIRS_ERRORS.revealInvalid);
  const openIndexes = [...state.openIndexes, index];
  const npcMemory = rememberCard(state.npcMemory, index, card.pairId, state.turnNumber, opponent);
  return recordAction({
    ...state,
    openIndexes,
    revealActor: actor,
    npcMemory,
    status: openIndexes.length === 2 ? "checking" : "playing",
    attempts: state.attempts + (openIndexes.length === 2 ? 1 : 0),
  }, action);
}

function resolveOpenCards(state: MatchPairsState, opponent: MatchPairsOpponent, action: MatchPairsAction): MatchPairsState {
  assert(state.status === "checking" && state.openIndexes.length === 2 && state.revealActor, MATCH_PAIRS_ERRORS.resolveInvalid);
  const [firstIndex, secondIndex] = state.openIndexes;
  const first = state.cards[firstIndex!], second = state.cards[secondIndex!];
  assert(first && second, MATCH_PAIRS_ERRORS.resolveInvalid);
  const actor = state.revealActor;
  const matched = first.pairId === second.pairId;
  const matchedPairIds = matched ? [...state.matchedPairIds, first.pairId] : state.matchedPairIds;
  const claims = matched ? { ...state.claims, [actor]: [...state.claims[actor], first.pairId] } : state.claims;
  const complete = matchedPairIds.length === MATCH_PAIRS_PAIR_COUNTS[state.difficulty];
  const outcome = complete ? compareClaims(claims) : null;
  const currentTurn = matched ? actor : otherActor(actor);
  const agedMemory = decayMemory(state.npcMemory, opponent);
  const npcMemory = matched ? agedMemory.filter((entry) => entry.pairId !== first.pairId) : agedMemory;
  const creditAmount = outcome === "player" && state.stake !== null
    ? Math.round(state.stake * opponent.winCreditMultiplier)
    : outcome === "draw" && state.stake !== null ? state.stake : 0;
  return recordAction({
    ...state,
    matchedPairIds,
    claims,
    currentTurn,
    revealActor: null,
    openIndexes: [],
    npcMemory,
    npcReaction: reactionAfterResolution(actor, matched, outcome),
    turnNumber: state.turnNumber + 1,
    lastResolution: { actor, matched, pairId: matched ? first.pairId : null },
    outcome,
    creditAmount,
    status: complete ? "complete" : "playing",
  }, action);
}

function createNpcRead(state: MatchPairsState): MatchPairsNpcRead {
  const matched = new Set(state.matchedPairIds);
  return {
    seed: state.seed,
    sequence: state.sequence,
    turnNumber: state.turnNumber,
    cardCount: state.cards.length,
    openIndexes: [...state.openIndexes],
    unavailableIndexes: state.cards.flatMap((card, index) => matched.has(card.pairId) || state.openIndexes.includes(index) ? [index] : []),
    memory: state.npcMemory.map((entry) => ({ ...entry })),
  };
}

function rememberCard(memory: readonly MatchPairsMemoryEntry[], index: number, pairId: string, turnNumber: number, opponent: MatchPairsOpponent): MatchPairsMemoryEntry[] {
  const next = [...memory.filter((entry) => entry.index !== index), { index, pairId, seenAtTurn: turnNumber, confidence: 1 }].sort(compareMemory);
  return next.slice(0, opponent.memoryCapacity);
}

function decayMemory(memory: readonly MatchPairsMemoryEntry[], opponent: MatchPairsOpponent): MatchPairsMemoryEntry[] {
  return memory.map((entry) => ({ ...entry, confidence: Math.max(0.08, entry.confidence * opponent.memoryRetention) }));
}

function recalls(entry: MatchPairsMemoryEntry, opponent: MatchPairsOpponent, rng: XorShift32): boolean {
  return rng.next() < Math.min(0.99, opponent.recallAccuracy * entry.confidence);
}

function weightedRememberedIndex(entries: readonly MatchPairsMemoryEntry[], opponent: MatchPairsOpponent, rng: XorShift32): number {
  const ordered = [...entries].sort(compareMemory);
  if (rng.next() < opponent.consistency) return ordered[0]!.index;
  return ordered[rng.nextUint32() % ordered.length]!.index;
}

function bestRemembered(entries: readonly MatchPairsMemoryEntry[]): MatchPairsMemoryEntry | null { return [...entries].sort(compareMemory)[0] ?? null; }
function compareMemory(left: MatchPairsMemoryEntry, right: MatchPairsMemoryEntry): number { return right.confidence - left.confidence || right.seenAtTurn - left.seenAtTurn || left.index - right.index; }
function compareMemoryGroups(left: MatchPairsMemoryEntry[], right: MatchPairsMemoryEntry[]): number { return compareMemory(left.sort(compareMemory)[0]!, right.sort(compareMemory)[0]!); }
function compareClaims(claims: Readonly<Record<MatchPairsActor, readonly string[]>>): "player" | "npc" | "draw" { return claims.player.length > claims.npc.length ? "player" : claims.npc.length > claims.player.length ? "npc" : "draw"; }
function otherActor(actor: MatchPairsActor): MatchPairsActor { return actor === "player" ? "npc" : "player"; }
function reactionAfterResolution(actor: MatchPairsActor, matched: boolean, outcome: MatchPairsState["outcome"]): MatchPairsReaction {
  if (outcome === "npc") return "pleased";
  if (outcome === "player") return "despair";
  if (outcome === "draw") return "neutral";
  if (actor === "npc") return matched ? "pleased" : "tense";
  return matched ? "tense" : "neutral";
}

function maximumConstraintMatching(prioritized: readonly MatchPairsFace[]): MatchPairsFace[] {
  const byCharacter = new Map<string, MatchPairsFace[]>();
  for (const face of prioritized) byCharacter.set(face.characterId, [...(byCharacter.get(face.characterId) ?? []), face]);
  const matchedByGroup = new Map<string, MatchPairsFace>();
  const match = (characterId: string, visitedGroups: Set<string>): boolean => {
    for (const face of byCharacter.get(characterId) ?? []) {
      const group = constraintKey(face);
      if (visitedGroups.has(group)) continue;
      visitedGroups.add(group);
      const previous = matchedByGroup.get(group);
      if (!previous || match(previous.characterId, visitedGroups)) { matchedByGroup.set(group, face); return true; }
    }
    return false;
  };
  for (const characterId of byCharacter.keys()) match(characterId, new Set());
  const ids = new Set([...matchedByGroup.values()].map((face) => face.id));
  return prioritized.filter((face) => ids.has(face.id));
}

function createCards(faces: readonly MatchPairsFace[]): MatchPairsCard[] { return faces.flatMap((face) => [{ cardId: `${face.id}:copy-1`, pairId: face.id }, { cardId: `${face.id}:copy-2`, pairId: face.id }]); }
function recordAction(state: MatchPairsState, action: MatchPairsAction, history = state.history): MatchPairsState { const sequence = state.sequence + 1; return { ...state, sequence, history: [...history, { sequence, action: cloneAction(action) }] }; }
function cloneAction(action: MatchPairsAction): MatchPairsAction {
  if (action.type === "player-reveal") return { type: "player-reveal", index: action.index };
  if (action.type === "restart") return { type: "restart", seed: action.seed, difficulty: action.difficulty, ...(action.opponentId ? { opponentId: action.opponentId } : {}) };
  if (action.type === "select-opponent") return { type: "select-opponent", opponentId: action.opponentId };
  if (action.type === "start") return { type: "start", seed: action.seed, stake: action.stake, wagerId: action.wagerId };
  if (action.type === "npc-reveal") return { type: "npc-reveal" };
  if (action.type === "resolve") return { type: "resolve" };
  return { type: "random-opponent" };
}

function validateFaces(faces: readonly MatchPairsFace[]): void {
  const ids = new Set<string>();
  for (const face of faces) { assertNonEmpty(face.id, MATCH_PAIRS_ERRORS.invalidFace); assertNonEmpty(face.assetId, MATCH_PAIRS_ERRORS.invalidFace); assertNonEmpty(face.characterId, MATCH_PAIRS_ERRORS.invalidFace); if (face.confusionGroup !== undefined) assertNonEmpty(face.confusionGroup, MATCH_PAIRS_ERRORS.invalidFace); assert(!ids.has(face.id), `${MATCH_PAIRS_ERRORS.duplicateFaceId}:${face.id}`); ids.add(face.id); }
}
function validateOpponents(opponents: readonly MatchPairsOpponent[]): void {
  assert(opponents.length > 0, MATCH_PAIRS_ERRORS.opponentMissing);
  const ids = new Set<string>();
  for (const opponent of opponents) {
    assertNonEmpty(opponent.id, MATCH_PAIRS_ERRORS.invalidOpponent); assertNonEmpty(opponent.name, MATCH_PAIRS_ERRORS.invalidOpponent);
    for (const portrait of [...Object.values(opponent.portraits), opponent.despairPortrait]) assertNonEmpty(portrait, MATCH_PAIRS_ERRORS.invalidOpponent);
    assert(Number.isInteger(opponent.memoryCapacity) && opponent.memoryCapacity > 0, MATCH_PAIRS_ERRORS.invalidOpponent);
    for (const value of [opponent.recallAccuracy, opponent.memoryRetention, opponent.consistency]) assert(Number.isFinite(value) && value >= 0 && value <= 1, MATCH_PAIRS_ERRORS.invalidOpponent);
    assert(opponent.winCreditMultiplier === 1.5 || opponent.winCreditMultiplier === 2 || opponent.winCreditMultiplier === 2.5, MATCH_PAIRS_ERRORS.invalidOpponent);
    assert(!ids.has(opponent.id), `${MATCH_PAIRS_ERRORS.duplicateOpponentId}:${opponent.id}`); ids.add(opponent.id);
  }
}
function findOpponent(opponents: readonly MatchPairsOpponent[], id: string): MatchPairsOpponent { const opponent = opponents.find((candidate) => candidate.id === id); assert(opponent, `${MATCH_PAIRS_ERRORS.opponentMissing}:${id}`); return opponent; }
function compareFaces(left: MatchPairsFace, right: MatchPairsFace): number { return compareText(left.id, right.id) || compareText(left.characterId, right.characterId) || compareText(left.confusionGroup ?? "", right.confusionGroup ?? "") || compareText(left.assetId, right.assetId); }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function constraintKey(face: MatchPairsFace): string { return face.confusionGroup === undefined ? `face:${face.id}` : `group:${face.confusionGroup}`; }
function shuffle<T>(input: readonly T[], rng: XorShift32): T[] { const output = [...input]; for (let index = output.length - 1; index > 0; index -= 1) { const target = rng.nextUint32() % (index + 1); [output[index], output[target]] = [output[target] as T, output[index] as T]; } return output; }
function assertDifficulty(difficulty: string): asserts difficulty is MatchPairsDifficulty { assert(difficulty === "easy" || difficulty === "normal", MATCH_PAIRS_ERRORS.invalidDifficulty); }
function assertNonEmpty(value: string, code: string): void { assert(typeof value === "string" && value.length > 0, code); }
function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
