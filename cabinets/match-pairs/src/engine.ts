import { resultHash, XorShift32 } from "@lucky-arcade/engine";
import {
  MATCH_PAIRS_ERRORS,
  MATCH_PAIRS_PAIR_COUNTS,
  MATCH_PAIRS_STATE_CONTRACT,
  MATCH_PAIRS_VERSION,
  type MatchPairsAction,
  type MatchPairsCard,
  type MatchPairsDifficulty,
  type MatchPairsFace,
  type MatchPairsHistoryEntry,
  type MatchPairsState,
} from "./contracts.ts";

export function createMatchPairsState(
  faces: readonly MatchPairsFace[],
  packVersion: string,
  seed: string,
  difficulty: MatchPairsDifficulty,
  sessionId = "match-pairs:table-1",
): MatchPairsState {
  assertNonEmpty(packVersion, MATCH_PAIRS_ERRORS.invalidPackVersion);
  assertNonEmpty(seed, MATCH_PAIRS_ERRORS.invalidSeed);
  assertNonEmpty(sessionId, MATCH_PAIRS_ERRORS.invalidSessionId);
  assertDifficulty(difficulty);

  const selected = selectMatchPairsFaces(faces, packVersion, seed, difficulty);
  const cards = createCards(selected);
  const shuffled = shuffle(cards, new XorShift32(`${packVersion}:${seed}:${difficulty}:board`));
  return {
    contract: MATCH_PAIRS_STATE_CONTRACT,
    version: MATCH_PAIRS_VERSION,
    packVersion,
    sessionId,
    seed,
    sequence: 0,
    difficulty,
    status: "ready",
    cards: shuffled,
    openIndexes: [],
    matchedPairIds: [],
    attempts: 0,
    history: [],
  };
}

export function reduceMatchPairs(
  faces: readonly MatchPairsFace[],
  state: MatchPairsState,
  action: MatchPairsAction,
): MatchPairsState {
  if (action.type === "restart") {
    assertDifficulty(action.difficulty);
    assertNonEmpty(action.seed, MATCH_PAIRS_ERRORS.invalidSeed);
    const restarted = createMatchPairsState(faces, state.packVersion, action.seed, action.difficulty, state.sessionId);
    return recordAction({ ...restarted, sequence: state.sequence }, action, state.history);
  }

  if (action.type === "start") {
    assert(state.status === "ready", MATCH_PAIRS_ERRORS.startInvalid);
    return recordAction({ ...state, status: "playing" }, action);
  }

  if (action.type === "reveal") {
    assert(state.status === "playing", MATCH_PAIRS_ERRORS.revealInvalid);
    assert(Number.isInteger(action.index) && action.index >= 0 && action.index < state.cards.length, MATCH_PAIRS_ERRORS.revealIndexInvalid);
    assert(!state.openIndexes.includes(action.index), MATCH_PAIRS_ERRORS.revealAlreadyOpen);
    const card = state.cards[action.index];
    assert(card, MATCH_PAIRS_ERRORS.revealIndexInvalid);
    assert(!state.matchedPairIds.includes(card.pairId), MATCH_PAIRS_ERRORS.revealAlreadyMatched);
    assert(state.openIndexes.length < 2, MATCH_PAIRS_ERRORS.revealInvalid);

    const openIndexes = [...state.openIndexes, action.index];
    return recordAction({
      ...state,
      openIndexes,
      status: openIndexes.length === 2 ? "checking" : "playing",
      attempts: state.attempts + (openIndexes.length === 2 ? 1 : 0),
    }, action);
  }

  if (action.type === "resolve") {
    assert(state.status === "checking" && state.openIndexes.length === 2, MATCH_PAIRS_ERRORS.resolveInvalid);
    const first = state.cards[state.openIndexes[0]!];
    const second = state.cards[state.openIndexes[1]!];
    assert(first && second, MATCH_PAIRS_ERRORS.resolveInvalid);
    const matches = first.pairId === second.pairId;
    const matchedPairIds = matches ? [...state.matchedPairIds, first.pairId] : state.matchedPairIds;
    const complete = matches && matchedPairIds.length === MATCH_PAIRS_PAIR_COUNTS[state.difficulty];
    return recordAction({
      ...state,
      matchedPairIds,
      openIndexes: [],
      status: complete ? "complete" : "playing",
    }, action);
  }

  throw new Error(MATCH_PAIRS_ERRORS.actionInvalid);
}

export function selectMatchPairsFaces(
  faces: readonly MatchPairsFace[],
  packVersion: string,
  seed: string,
  difficulty: MatchPairsDifficulty,
): MatchPairsFace[] {
  assertNonEmpty(packVersion, MATCH_PAIRS_ERRORS.invalidPackVersion);
  assertNonEmpty(seed, MATCH_PAIRS_ERRORS.invalidSeed);
  assertDifficulty(difficulty);
  validateFaces(faces);

  const required = MATCH_PAIRS_PAIR_COUNTS[difficulty];
  assert(faces.length >= required, MATCH_PAIRS_ERRORS.candidatesTooFew);
  const sorted = [...faces].sort(compareFaces);
  const prioritized = shuffle(sorted, new XorShift32(`${packVersion}:${seed}:${difficulty}:selection`));
  const maximum = maximumConstraintMatching(prioritized);
  assert(maximum.length >= required, MATCH_PAIRS_ERRORS.constraintConflict);
  return maximum.slice(0, required);
}

export function matchPairsResultHash(state: MatchPairsState): string {
  return resultHash(state);
}

function maximumConstraintMatching(prioritized: readonly MatchPairsFace[]): MatchPairsFace[] {
  const byCharacter = new Map<string, MatchPairsFace[]>();
  for (const face of prioritized) {
    const candidates = byCharacter.get(face.characterId);
    if (candidates) candidates.push(face);
    else byCharacter.set(face.characterId, [face]);
  }

  const matchedByGroup = new Map<string, MatchPairsFace>();
  const match = (characterId: string, visitedGroups: Set<string>): boolean => {
    for (const face of byCharacter.get(characterId) ?? []) {
      const group = constraintKey(face);
      if (visitedGroups.has(group)) continue;
      visitedGroups.add(group);
      const previous = matchedByGroup.get(group);
      if (!previous || match(previous.characterId, visitedGroups)) {
        matchedByGroup.set(group, face);
        return true;
      }
    }
    return false;
  };

  for (const characterId of byCharacter.keys()) match(characterId, new Set());
  const selectedIds = new Set([...matchedByGroup.values()].map((face) => face.id));
  return prioritized.filter((face) => selectedIds.has(face.id));
}

function createCards(faces: readonly MatchPairsFace[]): MatchPairsCard[] {
  return faces.flatMap((face) => [
    { cardId: `${face.id}:copy-1`, pairId: face.id },
    { cardId: `${face.id}:copy-2`, pairId: face.id },
  ]);
}

function recordAction(state: MatchPairsState, action: MatchPairsAction, priorHistory = state.history): MatchPairsState {
  const sequence = state.sequence + 1;
  const entry: MatchPairsHistoryEntry = { sequence, action: cloneAction(action) };
  return { ...state, sequence, history: [...priorHistory, entry] };
}

function cloneAction(action: MatchPairsAction): MatchPairsAction {
  if (action.type === "reveal") return { type: "reveal", index: action.index };
  if (action.type === "restart") return { type: "restart", seed: action.seed, difficulty: action.difficulty };
  return { type: action.type };
}

function validateFaces(faces: readonly MatchPairsFace[]): void {
  const ids = new Set<string>();
  for (const face of faces) {
    assertNonEmpty(face.id, MATCH_PAIRS_ERRORS.invalidFace);
    assertNonEmpty(face.assetId, MATCH_PAIRS_ERRORS.invalidFace);
    assertNonEmpty(face.characterId, MATCH_PAIRS_ERRORS.invalidFace);
    if (face.confusionGroup !== undefined) assertNonEmpty(face.confusionGroup, MATCH_PAIRS_ERRORS.invalidFace);
    assert(!ids.has(face.id), `${MATCH_PAIRS_ERRORS.duplicateFaceId}:${face.id}`);
    ids.add(face.id);
  }
}

function compareFaces(left: MatchPairsFace, right: MatchPairsFace): number {
  return compareText(left.id, right.id)
    || compareText(left.characterId, right.characterId)
    || compareText(left.confusionGroup ?? "", right.confusionGroup ?? "")
    || compareText(left.assetId, right.assetId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function constraintKey(face: MatchPairsFace): string {
  return face.confusionGroup === undefined ? `face:${face.id}` : `group:${face.confusionGroup}`;
}

function shuffle<T>(input: readonly T[], rng: XorShift32): T[] {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = rng.nextUint32() % (index + 1);
    [output[index], output[target]] = [output[target] as T, output[index] as T];
  }
  return output;
}

function assertDifficulty(difficulty: string): asserts difficulty is MatchPairsDifficulty {
  assert(difficulty === "easy" || difficulty === "normal", MATCH_PAIRS_ERRORS.invalidDifficulty);
}

function assertNonEmpty(value: string, code: string): void {
  assert(typeof value === "string" && value.length > 0, code);
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
