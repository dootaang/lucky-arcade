import { describe, expect, it } from "vitest";
import {
  MATCH_PAIRS_ERRORS,
  chooseMatchPairsNpcIndex,
  createMatchPairsState,
  matchPairsResultHash,
  reduceMatchPairs,
  selectMatchPairsFaces,
  type MatchPairsDifficulty,
  type MatchPairsFace,
  type MatchPairsOpponent,
  type MatchPairsState,
} from "../src/index.ts";

const faces: MatchPairsFace[] = Array.from({ length: 12 }, (_, index) => ({
  id: `face-${String(index).padStart(2, "0")}`,
  assetId: `portrait-${index}`,
  characterId: `character-${index}`,
  confusionGroup: `group-${index}`,
}));
const opponents: MatchPairsOpponent[] = [opponent("steady", 8, 0.92, 0.97, 0.9, 2.5), opponent("curious", 5, 0.68, 0.84, 0.55, 1.5)];

describe("match pairs versus board generation", () => {
  it.each([["easy", 6, 12], ["normal", 8, 16]] as const)("creates the exact %s board size", (difficulty, pairCount, cardCount) => {
    const state = fresh("board-size", difficulty);
    expect(state.cards).toHaveLength(cardCount);
    expect(new Set(state.cards.map((card) => card.pairId)).size).toBe(pairCount);
    expect(state).toMatchObject({ opponentId: "steady", currentTurn: "player", claims: { player: [], npc: [] } });
  });

  it("sorts candidates before deterministic constrained selection and shuffling", () => {
    const left = createMatchPairsState(faces, opponents, "pack", "stable", "easy", "steady", "session");
    const right = createMatchPairsState([...faces].reverse(), [...opponents].reverse(), "pack", "stable", "easy", "steady", "session");
    expect(right.cards).toEqual(left.cards);
    expect(matchPairsResultHash(right)).toBe(matchPairsResultHash(left));
  });

  it("selects distinct characters and confusion groups", () => {
    const candidates: MatchPairsFace[] = [
      { id: "a-1", assetId: "a1", characterId: "a", confusionGroup: "red" }, { id: "a-2", assetId: "a2", characterId: "a", confusionGroup: "blue" },
      { id: "b-1", assetId: "b1", characterId: "b", confusionGroup: "red" }, { id: "b-2", assetId: "b2", characterId: "b", confusionGroup: "green" },
      { id: "c", assetId: "c", characterId: "c", confusionGroup: "yellow" }, { id: "d", assetId: "d", characterId: "d", confusionGroup: "purple" },
      { id: "e", assetId: "e", characterId: "e", confusionGroup: "orange" }, { id: "f", assetId: "f", characterId: "f", confusionGroup: "white" },
    ];
    const selected = selectMatchPairsFaces(candidates, "pack", "matching", "easy");
    expect(new Set(selected.map((face) => face.characterId)).size).toBe(6);
    expect(new Set(selected.map((face) => face.confusionGroup)).size).toBe(6);
  });

  it("rejects invalid pools and opponents explicitly", () => {
    expect(() => createMatchPairsState(faces.slice(0, 5), opponents, "pack", "few", "easy", "steady")).toThrow(MATCH_PAIRS_ERRORS.candidatesTooFew);
    expect(() => createMatchPairsState(faces, opponents, "pack", "missing", "easy", "absent")).toThrow(MATCH_PAIRS_ERRORS.opponentMissing);
    expect(() => createMatchPairsState(faces, [opponents[0]!, { ...opponents[1]!, id: "steady" }], "pack", "duplicate", "easy", "steady")).toThrow(MATCH_PAIRS_ERRORS.duplicateOpponentId);
  });
});

describe("alternating turns and memory", () => {
  it("keeps the turn after a match and gives the turn away after a mismatch", () => {
    let state = reduce(fresh("turns"), start("turns"));
    const first = 0;
    const pair = state.cards.findIndex((card, index) => index !== first && card.pairId === state.cards[first]!.pairId);
    state = reduce(state, { type: "player-reveal", index: first });
    state = reduce(state, { type: "player-reveal", index: pair });
    state = reduce(state, { type: "resolve" });
    expect(state).toMatchObject({ currentTurn: "player", claims: { player: [state.cards[first]!.pairId], npc: [] } });

    const available = state.cards.flatMap((card, index) => state.matchedPairIds.includes(card.pairId) ? [] : [index]);
    const different = available.find((index) => state.cards[index]!.pairId !== state.cards[available[0]!]!.pairId)!;
    state = reduce(state, { type: "player-reveal", index: available[0]! });
    state = reduce(state, { type: "player-reveal", index: different });
    state = reduce(state, { type: "resolve" });
    expect(state.currentTurn).toBe("npc");
  });

  it("lets the NPC reveal through a public-memory chooser and respects memory capacity", () => {
    const smallMemory = [opponent("small", 1, 1, 1, 1, 1.5)];
    let state = createMatchPairsState(faces, smallMemory, "pack", "memory", "easy", "small", "session");
    state = reduceMatchPairs(faces, smallMemory, state, start("memory"));
    const different = state.cards.findIndex((card) => card.pairId !== state.cards[0]!.pairId);
    state = reduceMatchPairs(faces, smallMemory, state, { type: "player-reveal", index: 0 });
    state = reduceMatchPairs(faces, smallMemory, state, { type: "player-reveal", index: different });
    state = reduceMatchPairs(faces, smallMemory, state, { type: "resolve" });
    state = reduceMatchPairs(faces, smallMemory, state, { type: "npc-reveal" });
    expect(state.openIndexes).toHaveLength(1);
    expect(state.npcMemory.length).toBeLessThanOrEqual(1);
  });

  it("ages observed cards once per completed attempt", () => {
    let state = reduce(fresh("retention"), start("retention"));
    const second = state.cards.findIndex((card) => card.pairId !== state.cards[0]!.pairId);
    state = reduce(state, { type: "player-reveal", index: 0 });
    state = reduce(state, { type: "player-reveal", index: second });
    expect(state.npcMemory.map((entry) => entry.confidence)).toEqual([1, 1]);
    state = reduce(state, { type: "resolve" });
    expect(state.npcMemory.map((entry) => entry.confidence)).toEqual([0.97, 0.97]);
  });

  it("chooses a remembered counterpart without receiving hidden cards", () => {
    const read = { seed: "public", sequence: 4, turnNumber: 2, cardCount: 8, openIndexes: [3], unavailableIndexes: [3, 6, 7], memory: [
      { index: 3, pairId: "known", seenAtTurn: 2, confidence: 1 }, { index: 1, pairId: "known", seenAtTurn: 1, confidence: 1 },
    ] } as const;
    expect(chooseMatchPairsNpcIndex(read, opponent("perfect", 8, 1, 1, 1, 2.5))).toBe(1);
  });

  it("explores an unseen card instead of repeating a remembered singleton", () => {
    const read = { seed: "singleton", sequence: 8, turnNumber: 3, cardCount: 8, openIndexes: [], unavailableIndexes: [6, 7], memory: [
      { index: 2, pairId: "recent-a", seenAtTurn: 3, confidence: 1 }, { index: 4, pairId: "recent-b", seenAtTurn: 3, confidence: 1 },
    ] } as const;
    const choice = chooseMatchPairsNpcIndex(read, opponent("perfect", 8, 1, 1, 1, 2.5));
    expect([0, 1, 3, 5]).toContain(choice);
  });

  it("explores another unseen card when the first reveal has no remembered mate", () => {
    const read = { seed: "second", sequence: 9, turnNumber: 4, cardCount: 8, openIndexes: [2], unavailableIndexes: [2, 6, 7], memory: [
      { index: 2, pairId: "recent-a", seenAtTurn: 4, confidence: 1 }, { index: 4, pairId: "other", seenAtTurn: 3, confidence: 1 },
    ] } as const;
    const choice = chooseMatchPairsNpcIndex(read, opponent("perfect", 8, 1, 1, 1, 2.5));
    expect([0, 1, 3, 5]).toContain(choice);
  });

  it("selects and randomizes opponents only while ready", () => {
    let state = fresh("opponents");
    state = reduce(state, { type: "select-opponent", opponentId: "curious" });
    expect(state.opponentId).toBe("curious");
    state = reduce(state, { type: "random-opponent" });
    expect(state.opponentId).toBe("steady");
    state = reduce(state, start("opponents"));
    expect(() => reduce(state, { type: "select-opponent", opponentId: "curious" })).toThrow(MATCH_PAIRS_ERRORS.opponentSelectionInvalid);
  });
});

describe("completion and replay", () => {
  it("completes 10,000 deterministic player-perfect boards", () => {
    for (let seedIndex = 0; seedIndex < 10_000; seedIndex += 1) {
      const difficulty: MatchPairsDifficulty = seedIndex % 2 ? "normal" : "easy";
      const state = autoplay(`seed-${seedIndex}`, difficulty);
      expect(state.status).toBe("complete");
      expect(state.outcome).toBe("player");
      expect(state.claims.player).toHaveLength(difficulty === "easy" ? 6 : 8);
    }
  }, 30_000);

  it("replays identical inputs to the same result hash", () => {
    expect(matchPairsResultHash(autoplay("replay", "normal", [...faces].reverse()))).toBe(matchPairsResultHash(autoplay("replay", "normal", faces)));
  });

  it("returns opponent-rated winnings", () => {
    const won = autoplay("credit", "easy");
    expect(won).toMatchObject({ outcome: "player", stake: 10, creditAmount: 25 });
  });
});

function fresh(seed: string, difficulty: MatchPairsDifficulty = "easy"): MatchPairsState { return createMatchPairsState(faces, opponents, "pack", seed, difficulty, "steady", "session"); }
function reduce(state: MatchPairsState, action: Parameters<typeof reduceMatchPairs>[3]): MatchPairsState { return reduceMatchPairs(faces, opponents, state, action); }
function autoplay(seed: string, difficulty: MatchPairsDifficulty, candidates: readonly MatchPairsFace[] = faces): MatchPairsState {
  let state = reduceMatchPairs(candidates, opponents, createMatchPairsState(candidates, opponents, "pack", seed, difficulty, "steady", "session"), start(seed));
  for (const pairId of [...new Set(state.cards.map((card) => card.pairId))]) {
    const indexes = state.cards.flatMap((card, index) => card.pairId === pairId ? [index] : []);
    state = reduceMatchPairs(candidates, opponents, state, { type: "player-reveal", index: indexes[0]! });
    state = reduceMatchPairs(candidates, opponents, state, { type: "player-reveal", index: indexes[1]! });
    state = reduceMatchPairs(candidates, opponents, state, { type: "resolve" });
  }
  return state;
}
function opponent(id: string, memoryCapacity: number, recallAccuracy: number, memoryRetention: number, consistency: number, winCreditMultiplier: 1.5 | 2 | 2.5): MatchPairsOpponent {
  return { id, name: id, portraits: { neutral: `${id}-neutral`, pleased: `${id}-pleased`, tense: `${id}-tense` }, despairPortrait: `${id}-despair`, memoryCapacity, recallAccuracy, memoryRetention, consistency, winCreditMultiplier };
}
function start(seed: string) { return { type: "start", seed: `${seed}:deal`, stake: 10, wagerId: `wager:${seed}` } as const; }
