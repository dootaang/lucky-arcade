import { describe, expect, it } from "vitest";
import { TEMEROSA_MATCH_PAIRS_PERSONAS } from "./temerosa-match-pairs-personas.ts";

describe("Temerosa match-pairs personas", () => {
  it("freezes exactly 30 explainable game-specific profiles", () => {
    const entries = Object.entries(TEMEROSA_MATCH_PAIRS_PERSONAS);
    expect(entries).toHaveLength(30);
    expect(entries.every(([, profile]) => profile.memoryCapacity >= 3 && profile.memoryCapacity <= 7)).toBe(true);
    expect(entries.every(([, profile]) => profile.observationRate <= .88 && profile.recallAccuracy <= .88)).toBe(true);
    expect(new Set(entries.map(([, profile]) => JSON.stringify(profile))).size).toBeGreaterThanOrEqual(20);
  });

  it("keeps the owner-approved difficulty distribution", () => {
    const tiers = Object.values(TEMEROSA_MATCH_PAIRS_PERSONAS).reduce<Record<number, number>>((counts, profile) => {
      counts[profile.difficultyTier] = (counts[profile.difficultyTier] ?? 0) + 1; return counts;
    }, {});
    expect(tiers).toEqual({ 1: 8, 2: 16, 3: 6 });
  });
});
