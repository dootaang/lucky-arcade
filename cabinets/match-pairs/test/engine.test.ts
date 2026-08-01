import { describe, expect, it } from "vitest";
import { XorShift32 } from "@lucky-arcade/engine";
import {
  MATCH_PAIRS_ERRORS, chooseMatchPairsNpcIndex, createMatchPairsState, matchPairsResultHash, reduceMatchPairs,
  selectMatchPairsFaces, type MatchPairsDifficulty, type MatchPairsFace, type MatchPairsOpponent, type MatchPairsState,
} from "../src/index.ts";

const faces: MatchPairsFace[] = Array.from({ length: 12 }, (_, index) => ({ id: `face-${String(index).padStart(2, "0")}`, assetId: `portrait-${index}`, characterId: `character-${index}`, confusionGroup: `group-${index}` }));
const opponents = [opponent("steady", 7, .86, .86, .94, .9, "recheck", .9, 3, 2.5), opponent("curious", 4, .6, .62, .8, .5, "explore", .74, 1, 1.5)];

describe("match pairs board and public information", () => {
  it.each([["easy", 6, 12], ["normal", 8, 16]] as const)("creates the exact %s board size", (difficulty, pairCount, cardCount) => {
    const state = fresh("board-size", difficulty);
    expect(state.cards).toHaveLength(cardCount); expect(new Set(state.cards.map((card) => card.pairId)).size).toBe(pairCount);
    expect(state).toMatchObject({ mode: "play", opponentIds: { player: null, npc: "steady" }, currentTurn: "player", claims: { player: [], npc: [] } });
  });

  it("sorts candidates before deterministic selection and shuffling", () => {
    const left = fresh("stable"), right = createMatchPairsState([...faces].reverse(), [...opponents].reverse(), "pack", "stable", "easy", "steady", "session");
    expect(right.cards).toEqual(left.cards); expect(matchPairsResultHash(right)).toBe(matchPairsResultHash(left));
  });

  it("selects distinct characters and confusion groups", () => {
    const candidates: MatchPairsFace[] = [
      { id: "a-1", assetId: "a1", characterId: "a", confusionGroup: "red" }, { id: "a-2", assetId: "a2", characterId: "a", confusionGroup: "blue" },
      { id: "b-1", assetId: "b1", characterId: "b", confusionGroup: "red" }, { id: "b-2", assetId: "b2", characterId: "b", confusionGroup: "green" },
      ...["c", "d", "e", "f"].map((id) => ({ id, assetId: id, characterId: id, confusionGroup: id })),
    ];
    const selected = selectMatchPairsFaces(candidates, "pack", "matching", "easy");
    expect(new Set(selected.map((face) => face.characterId)).size).toBe(6); expect(new Set(selected.map((face) => face.confusionGroup)).size).toBe(6);
  });

  it("chooses a remembered counterpart without receiving hidden cards", () => {
    const read = { seed: "public", actor: "npc", sequence: 4, turnNumber: 2, matchStreak: 0, cardCount: 8, openIndexes: [3], unavailableIndexes: [3, 6, 7], memory: [
      { index: 3, pairId: "known", seenAtTurn: 2, confidence: 1 }, { index: 1, pairId: "known", seenAtTurn: 1, confidence: 1 },
    ] } as const;
    expect(chooseMatchPairsNpcIndex(read, opponent("perfect", 7, 1, 1, 1, 1, "explore", 1, 3, 2.5))).toBe(1);
  });
});

describe("turns, observation, and two CPU seats", () => {
  it("separates free entry from a pre-reserved spread wager", () => {
    const practice = fresh("entry-practice");
    expect(() => reduce(practice, { type: "start", seed: "entry:deal", stake: 10, wagerId: "legacy" })).toThrow(MATCH_PAIRS_ERRORS.startInvalid);
    const spread = reduce(practice, { type: "set-entry", entryKind: "spread-wager" });
    expect(() => reduce(spread, { type: "start", seed: "entry:deal" })).toThrow(MATCH_PAIRS_ERRORS.startInvalid);
    expect(reduce(spread, { type: "start", seed: "entry:deal", stake: 50, wagerId: "reserved" })).toMatchObject({ status: "playing", entryKind: "spread-wager", stake: 50, wagerId: "reserved" });
  });

  it("changes memory pressure without erasing the selected character profile", () => {
    const relaxed = reduce(fresh("focus-relaxed"), { type: "set-focus", focus: "relaxed" });
    const sharp = reduce(fresh("focus-sharp"), { type: "set-focus", focus: "sharp" });
    expect(relaxed.focus).toBe("relaxed");
    expect(sharp.focus).toBe("sharp");
    expect(relaxed.opponentIds).toEqual(sharp.opponentIds);
  });

  it("keeps the turn after a match and gives it away after a mismatch", () => {
    let state = reduce(fresh("turns"), start("turns")); const first = 0;
    const pair = state.cards.findIndex((card, index) => index !== first && card.pairId === state.cards[first]!.pairId);
    state = revealPlayer(state, first, pair); expect(state.currentTurn).toBe("player");
    const available = state.cards.flatMap((card, index) => state.matchedPairIds.includes(card.pairId) ? [] : [index]);
    const different = available.find((index) => state.cards[index]!.pairId !== state.cards[available[0]!]!.pairId)!;
    state = revealPlayer(state, available[0]!, different); expect(state.currentTurn).toBe("npc");
  });

  it("records only observed public cards and respects capacity", () => {
    const limited = [opponent("limited", 2, 0, .7, .8, .5, "explore", .8, 1, 1.5), opponents[0]!];
    let state = createMatchPairsState(faces, limited, "pack", "observation", "easy", "limited", "session");
    state = reduceMatchPairs(faces, limited, state, start("observation"));
    const different = state.cards.findIndex((card) => card.pairId !== state.cards[0]!.pairId);
    state = reduceMatchPairs(faces, limited, state, { type: "player-reveal", index: 0 });
    state = reduceMatchPairs(faces, limited, state, { type: "player-reveal", index: different });
    expect(state.npcMemories.npc).toHaveLength(0);
  });

  it("runs NPC versus NPC with independent memories", () => {
    let state = createMatchPairsState(faces, opponents, "pack", "spectate", "easy", "steady", "session", "spectate", "curious");
    state = reduce(state, { type: "start", seed: "spectate:deal" });
    const firstActor = state.currentTurn;
    state = reduce(state, { type: "npc-reveal" }); state = reduce(state, { type: "npc-reveal" }); state = reduce(state, { type: "resolve" });
    expect(state.attempts).toBe(1); expect(state.opponentIds).toEqual({ player: "curious", npc: "steady" });
    expect(state.npcMemories.player).not.toBe(state.npcMemories.npc); expect([firstActor, firstActor === "player" ? "npc" : "player"]).toContain(state.currentTurn);
  });

  it("selects two distinct spectators only while ready", () => {
    let state = reduce(fresh("selection"), { type: "set-mode", mode: "spectate" });
    expect(state.opponentIds.player).not.toBe(state.opponentIds.npc);
    expect(() => reduce(state, { type: "select-opponent", actor: "player", opponentId: state.opponentIds.npc })).toThrow(MATCH_PAIRS_ERRORS.opponentDuplicate);
    state = reduce(state, { type: "random-opponents" }); expect(state.opponentIds.player).not.toBe(state.opponentIds.npc);
    state = reduce(state, { type: "start", seed: "selection:deal" });
    expect(() => reduce(state, { type: "select-opponent", opponentId: "curious" })).toThrow(MATCH_PAIRS_ERRORS.opponentSelectionInvalid);
  });
});

describe("completion and replay", () => {
  it("completes 10,000 deterministic player-perfect boards", () => {
    for (let seedIndex = 0; seedIndex < 10_000; seedIndex += 1) {
      const difficulty: MatchPairsDifficulty = seedIndex % 2 ? "normal" : "easy", state = autoplayPlayer(`seed-${seedIndex}`, difficulty);
      expect(state.status).toBe("complete"); expect(state.outcome).toBe("player");
    }
  }, 30_000);

  it("completes 1,000 deterministic spectator boards", () => {
    for (let seedIndex = 0; seedIndex < 1_000; seedIndex += 1) expect(autoplaySpectator(`spectator-${seedIndex}`).status).toBe("complete");
  }, 30_000);

  it("replays identical inputs to the same result hash", () => { expect(matchPairsResultHash(autoplayPlayer("replay", "normal", [...faces].reverse()))).toBe(matchPairsResultHash(autoplayPlayer("replay", "normal", faces))); });
});

function fresh(seed: string, difficulty: MatchPairsDifficulty = "easy"): MatchPairsState { return createMatchPairsState(faces, opponents, "pack", seed, difficulty, "steady", "session"); }
function reduce(state: MatchPairsState, action: Parameters<typeof reduceMatchPairs>[3]): MatchPairsState { return reduceMatchPairs(faces, opponents, state, action); }
function revealPlayer(state: MatchPairsState, first: number, second: number): MatchPairsState { state = reduce(state, { type: "player-reveal", index: first }); state = reduce(state, { type: "player-reveal", index: second }); return reduce(state, { type: "resolve" }); }
function autoplayPlayer(seed: string, difficulty: MatchPairsDifficulty, candidates: readonly MatchPairsFace[] = faces): MatchPairsState { let state = reduceMatchPairs(candidates, opponents, createMatchPairsState(candidates, opponents, "pack", seed, difficulty, "steady", "session"), start(seed)); for (const pairId of [...new Set(state.cards.map((card) => card.pairId))]) { const indexes = state.cards.flatMap((card, index) => card.pairId === pairId ? [index] : []); state = reduceMatchPairs(candidates, opponents, state, { type: "player-reveal", index: indexes[0]! }); state = reduceMatchPairs(candidates, opponents, state, { type: "player-reveal", index: indexes[1]! }); state = reduceMatchPairs(candidates, opponents, state, { type: "resolve" }); } return state; }
function autoplaySpectator(seed: string): MatchPairsState { let state = createMatchPairsState(faces, opponents, "pack", seed, "easy", "steady", "session", "spectate", "curious"); state = reduce(state, { type: "start", seed: `${seed}:deal` }); for (let guard = 0; state.status !== "complete" && guard < 300; guard += 1) state = reduce(state, state.status === "checking" ? { type: "resolve" } : { type: "npc-reveal" }); return state; }
function opponent(id: string, memoryCapacity: number, observationRate: number, recallAccuracy: number, memoryRetention: number, consistency: number, searchStyle: MatchPairsOpponent["searchStyle"], streakComposure: number, difficultyTier: MatchPairsOpponent["difficultyTier"], winCreditMultiplier: 1.5 | 2 | 2.5): MatchPairsOpponent { return { id, name: id, portraits: { neutral: `${id}-neutral`, pleased: `${id}-pleased`, tense: `${id}-tense` }, despairPortrait: `${id}-despair`, memoryCapacity, observationRate, recallAccuracy, memoryRetention, consistency, searchStyle, streakComposure, difficultyTier, winCreditMultiplier }; }
function start(seed: string) { return { type: "start", seed: `${seed}:deal` } as const; }
