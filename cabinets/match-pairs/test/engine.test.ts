import { describe, expect, it } from "vitest";
import {
  MATCH_PAIRS_ERRORS,
  createMatchPairsState,
  matchPairsResultHash,
  reduceMatchPairs,
  selectMatchPairsFaces,
  type MatchPairsDifficulty,
  type MatchPairsFace,
  type MatchPairsState,
} from "../src/index.ts";

const faces: MatchPairsFace[] = Array.from({ length: 12 }, (_, index) => ({
  id: `face-${String(index).padStart(2, "0")}`,
  assetId: `portrait-${index}`,
  characterId: `character-${index}`,
  confusionGroup: `group-${index}`,
}));

describe("match pairs board generation", () => {
  it.each([
    ["easy", 6, 12],
    ["normal", 8, 16],
  ] as const)("creates the exact %s board size", (difficulty, pairCount, cardCount) => {
    const state = createMatchPairsState(faces, "pack/0.8.0", "board-size", difficulty);
    expect(state.cards).toHaveLength(cardCount);
    expect(new Set(state.cards.map((card) => card.pairId)).size).toBe(pairCount);
    expect(new Set(state.cards.map((card) => card.cardId)).size).toBe(cardCount);
    for (const pairId of new Set(state.cards.map((card) => card.pairId))) {
      expect(state.cards.filter((card) => card.pairId === pairId)).toHaveLength(2);
    }
  });

  it("sorts candidates before deterministic constrained selection and shuffling", () => {
    const left = createMatchPairsState(faces, "pack/0.8.0", "stable", "easy", "session");
    const right = createMatchPairsState([...faces].reverse(), "pack/0.8.0", "stable", "easy", "session");
    expect(right.cards).toEqual(left.cards);
    expect(matchPairsResultHash(right)).toBe(matchPairsResultHash(left));
  });

  it("selects distinct characters and confusion groups", () => {
    const candidates: MatchPairsFace[] = [
      { id: "a-1", assetId: "a1", characterId: "a", confusionGroup: "red" },
      { id: "a-2", assetId: "a2", characterId: "a", confusionGroup: "blue" },
      { id: "b-1", assetId: "b1", characterId: "b", confusionGroup: "red" },
      { id: "b-2", assetId: "b2", characterId: "b", confusionGroup: "green" },
      { id: "c", assetId: "c", characterId: "c", confusionGroup: "yellow" },
      { id: "d", assetId: "d", characterId: "d", confusionGroup: "purple" },
      { id: "e", assetId: "e", characterId: "e", confusionGroup: "orange" },
      { id: "f", assetId: "f", characterId: "f", confusionGroup: "white" },
    ];
    const selected = selectMatchPairsFaces(candidates, "pack", "matching", "easy");
    expect(new Set(selected.map((face) => face.characterId)).size).toBe(6);
    expect(new Set(selected.map((face) => face.confusionGroup)).size).toBe(6);
  });

  it("distinguishes an insufficient pool from incompatible constraints", () => {
    expect(() => createMatchPairsState(faces.slice(0, 5), "pack", "few", "easy"))
      .toThrow(MATCH_PAIRS_ERRORS.candidatesTooFew);
    const conflicts = Array.from({ length: 8 }, (_, index): MatchPairsFace => ({
      id: `conflict-${index}`,
      assetId: `asset-${index}`,
      characterId: "same-character",
    }));
    expect(() => createMatchPairsState(conflicts, "pack", "conflict", "easy"))
      .toThrow(MATCH_PAIRS_ERRORS.constraintConflict);
  });

  it("rejects malformed and duplicate candidates explicitly", () => {
    expect(() => createMatchPairsState([{ ...faces[0]!, id: "" }, ...faces.slice(1)], "pack", "bad", "easy"))
      .toThrow(MATCH_PAIRS_ERRORS.invalidFace);
    expect(() => createMatchPairsState([faces[0]!, { ...faces[1]!, id: faces[0]!.id }, ...faces.slice(2)], "pack", "duplicate", "easy"))
      .toThrow(`${MATCH_PAIRS_ERRORS.duplicateFaceId}:${faces[0]!.id}`);
  });
});

describe("match pairs transitions", () => {
  it("starts, reveals, checks, resolves, and records monotonic input history", () => {
    let state = createMatchPairsState(faces, "pack", "transitions", "easy");
    state = reduceMatchPairs(faces, state, { type: "start" });
    expect(state.status).toBe("playing");
    expect(state.attempts).toBe(0);

    const firstIndex = 0;
    const pairIndex = state.cards.findIndex((card, index) => index !== firstIndex && card.pairId === state.cards[firstIndex]!.pairId);
    state = reduceMatchPairs(faces, state, { type: "reveal", index: firstIndex });
    expect(state).toMatchObject({ status: "playing", attempts: 0, openIndexes: [firstIndex] });
    state = reduceMatchPairs(faces, state, { type: "reveal", index: pairIndex });
    expect(state).toMatchObject({ status: "checking", attempts: 1, openIndexes: [firstIndex, pairIndex] });
    state = reduceMatchPairs(faces, state, { type: "resolve" });
    expect(state).toMatchObject({ status: "playing", attempts: 1, openIndexes: [] });
    expect(state.matchedPairIds).toEqual([state.cards[firstIndex]!.pairId]);
    expect(state.sequence).toBe(4);
    expect(state.history.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4]);
  });

  it("counts every second reveal as exactly one attempt, including mismatches", () => {
    let state = reduceMatchPairs(faces, createMatchPairsState(faces, "pack", "attempts", "easy"), { type: "start" });
    const first = 0;
    const different = state.cards.findIndex((card) => card.pairId !== state.cards[first]!.pairId);
    state = reduceMatchPairs(faces, state, { type: "reveal", index: first });
    state = reduceMatchPairs(faces, state, { type: "reveal", index: different });
    expect(state.attempts).toBe(1);
    state = reduceMatchPairs(faces, state, { type: "resolve" });
    expect(state.matchedPairIds).toEqual([]);
    expect(state.attempts).toBe(1);
  });

  it("persists a checking state and resolves the same pair after restoration", () => {
    let state = reduceMatchPairs(faces, createMatchPairsState(faces, "pack", "restore", "easy"), { type: "start" });
    const first = 0;
    const second = state.cards.findIndex((card, index) => index !== first && card.pairId === state.cards[first]!.pairId);
    state = reduceMatchPairs(faces, state, { type: "reveal", index: first });
    state = reduceMatchPairs(faces, state, { type: "reveal", index: second });
    const restored = JSON.parse(JSON.stringify(state)) as MatchPairsState;
    expect(restored.status).toBe("checking");
    expect(reduceMatchPairs(faces, restored, { type: "resolve" }).matchedPairIds).toEqual([state.cards[first]!.pairId]);
  });

  it("rejects invalid transitions and card indexes without mutating state", () => {
    const ready = createMatchPairsState(faces, "pack", "invalid", "easy");
    const before = matchPairsResultHash(ready);
    expect(() => reduceMatchPairs(faces, ready, { type: "reveal", index: 0 })).toThrow(MATCH_PAIRS_ERRORS.revealInvalid);
    expect(() => reduceMatchPairs(faces, ready, { type: "resolve" })).toThrow(MATCH_PAIRS_ERRORS.resolveInvalid);
    let playing = reduceMatchPairs(faces, ready, { type: "start" });
    expect(() => reduceMatchPairs(faces, playing, { type: "start" })).toThrow(MATCH_PAIRS_ERRORS.startInvalid);
    expect(() => reduceMatchPairs(faces, playing, { type: "reveal", index: -1 })).toThrow(MATCH_PAIRS_ERRORS.revealIndexInvalid);
    playing = reduceMatchPairs(faces, playing, { type: "reveal", index: 0 });
    expect(() => reduceMatchPairs(faces, playing, { type: "reveal", index: 0 })).toThrow(MATCH_PAIRS_ERRORS.revealAlreadyOpen);
    const second = playing.cards.findIndex((card) => card.pairId !== playing.cards[0]!.pairId);
    const checking = reduceMatchPairs(faces, playing, { type: "reveal", index: second });
    expect(() => reduceMatchPairs(faces, checking, { type: "reveal", index: 2 })).toThrow(MATCH_PAIRS_ERRORS.revealInvalid);
    const matchedSecond = checking.cards.findIndex((card, index) => index !== 0 && card.pairId === checking.cards[0]!.pairId);
    const matchingCheck = reduceMatchPairs(faces, playing, { type: "reveal", index: matchedSecond });
    const afterMatch = reduceMatchPairs(faces, matchingCheck, { type: "resolve" });
    expect(() => reduceMatchPairs(faces, afterMatch, { type: "reveal", index: 0 })).toThrow(MATCH_PAIRS_ERRORS.revealAlreadyMatched);
    expect(matchPairsResultHash(ready)).toBe(before);
  });

  it("restarts with a fresh board while retaining the session WAL sequence", () => {
    let state = reduceMatchPairs(faces, createMatchPairsState(faces, "pack", "old", "easy", "saved-session"), { type: "start" });
    state = reduceMatchPairs(faces, state, { type: "restart", seed: "new", difficulty: "normal" });
    expect(state).toMatchObject({ sessionId: "saved-session", seed: "new", difficulty: "normal", status: "ready", attempts: 0, sequence: 2 });
    expect(state.cards).toHaveLength(16);
    expect(state.history.map((entry) => entry.action.type)).toEqual(["start", "restart"]);
  });
});

describe("match pairs exhaustive deterministic runs", () => {
  it("generates and automatically completes 10,000 seeded boards", () => {
    for (let seedIndex = 0; seedIndex < 10_000; seedIndex += 1) {
      const difficulty: MatchPairsDifficulty = seedIndex % 2 === 0 ? "easy" : "normal";
      let state = createMatchPairsState(faces, "pack/0.8.0", `seed-${seedIndex}`, difficulty, `session-${seedIndex}`);
      const expectedPairs = difficulty === "easy" ? 6 : 8;
      expect(new Set(state.cards.map((card) => card.cardId)).size, `card ids at seed ${seedIndex}`).toBe(expectedPairs * 2);
      const pairIds = [...new Set(state.cards.map((card) => card.pairId))];
      expect(pairIds.length, `pair ids at seed ${seedIndex}`).toBe(expectedPairs);
      for (const pairId of pairIds) expect(state.cards.filter((card) => card.pairId === pairId), `${pairId} at seed ${seedIndex}`).toHaveLength(2);

      state = reduceMatchPairs(faces, state, { type: "start" });
      for (const pairId of pairIds) {
        const indexes = state.cards.flatMap((card, index) => card.pairId === pairId ? [index] : []);
        state = reduceMatchPairs(faces, state, { type: "reveal", index: indexes[0]! });
        state = reduceMatchPairs(faces, state, { type: "reveal", index: indexes[1]! });
        state = reduceMatchPairs(faces, state, { type: "resolve" });
      }
      expect(state.status, `completion at seed ${seedIndex}`).toBe("complete");
      expect(state.attempts, `attempts at seed ${seedIndex}`).toBe(expectedPairs);
      expect(state.matchedPairIds, `matches at seed ${seedIndex}`).toHaveLength(expectedPairs);
    }
  }, 30_000);

  it("replays the same inputs to the same final result hash", () => {
    const run = (candidateOrder: readonly MatchPairsFace[]): MatchPairsState => {
      let state = reduceMatchPairs(candidateOrder, createMatchPairsState(candidateOrder, "pack", "replay", "normal", "session"), { type: "start" });
      const pairIds = [...new Set(state.cards.map((card) => card.pairId))];
      for (const pairId of pairIds) {
        const indexes = state.cards.flatMap((card, index) => card.pairId === pairId ? [index] : []);
        state = reduceMatchPairs(candidateOrder, state, { type: "reveal", index: indexes[0]! });
        state = reduceMatchPairs(candidateOrder, state, { type: "reveal", index: indexes[1]! });
        state = reduceMatchPairs(candidateOrder, state, { type: "resolve" });
      }
      return state;
    };
    expect(matchPairsResultHash(run([...faces].reverse()))).toBe(matchPairsResultHash(run(faces)));
  });
});
