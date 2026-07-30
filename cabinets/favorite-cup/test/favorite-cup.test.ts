import { describe, expect, it } from "vitest";
import { createFavoriteCupState, favoriteCupResultHash, reduceFavoriteCup, selectFavoriteCup } from "../src/index.ts";

const candidates = Array.from({ length: 20 }, (_, index) => ({ npcId: `npc-${index}`, displayName: `NPC ${index}`, displayNameSource: "asset-filename" as const, representativeAssetId: `asset-${index}`, variantAssetIds: [`asset-${index}`], confidence: 1, evidence: [] }));
const cartridge = { contract: "favorite-cup-cartridge/0.1" as const, cardFingerprint: "a".repeat(64), cardName: "test", candidates };

describe("favorite cup", () => {
  it("keeps every 9-16 entrant by using byes", () => {
    let state = createFavoriteCupState(cartridge, "day", candidates.slice(0, 11));
    expect(state.entrants).toHaveLength(11);
    while (state.status === "playing") { const match = selectFavoriteCup(state, cartridge).match; expect(match).not.toBeNull(); state = reduceFavoriteCup(state, match?.[0].npcId ?? ""); }
    expect(state.picks).toHaveLength(10);
  });
  it("selects the same daily 16 for the same seed", () => {
    const left = createFavoriteCupState(cartridge, "day", candidates), right = createFavoriteCupState(cartridge, "day", candidates);
    expect(left.todaySelection).toBe(true); expect(left.entrants).toEqual(right.entrants); expect(left.entrants).toHaveLength(16); expect(favoriteCupResultHash(left)).toBe(favoriteCupResultHash(right));
  });
  it.each([[500, 499], [1_000, 999], [1_551, 1_550]])("finishes a %i-entry marathon in exactly %i choices", (entrantCount, choices) => {
    const marathonCandidates = Array.from({ length: 1_600 }, (_, index) => ({ ...candidates[0]!, npcId: `marathon-${index}`, representativeAssetId: `asset-${index}`, variantAssetIds: [`asset-${index}`] }));
    const marathonCartridge = { ...cartridge, candidates: marathonCandidates };
    let state = createFavoriteCupState(marathonCartridge, "marathon", marathonCandidates, { entrantCount });
    while (state.status === "playing") {
      const match = selectFavoriteCup(state, marathonCartridge).match;
      expect(match).not.toBeNull();
      state = reduceFavoriteCup(state, match![0].npcId);
    }
    expect(state.entrants).toHaveLength(entrantCount);
    expect(state.picks).toHaveLength(choices);
  });
  it("separates matching subject groups in the first round when alternatives exist", () => {
    const grouped = Array.from({ length: 16 }, (_, index) => ({ ...candidates[0]!, npcId: `grouped-${index}`, representativeAssetId: `asset-${index}`, variantAssetIds: [`asset-${index}`] }));
    const groupedCartridge = { ...cartridge, candidates: grouped };
    const groupById = Object.fromEntries(grouped.map((item, index) => [item.npcId, `subject-${Math.floor(index / 2)}`]));
    const state = createFavoriteCupState(groupedCartridge, "groups", grouped, { entrantCount: 16, groupById });
    for (let index = 0; index < state.participants.length; index += 2) expect(groupById[state.participants[index]!]).not.toBe(groupById[state.participants[index + 1]!]);
  });
});
