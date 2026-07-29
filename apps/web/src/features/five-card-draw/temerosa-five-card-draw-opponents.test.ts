import { describe, expect, it } from "vitest";
import { TEMEROSA_CASINO_BEHAVIOR_PROFILES } from "@lucky-arcade/old-maid";
import { createTemerosaFiveCardDrawOpponents } from "./temerosa-five-card-draw-opponents.ts";
import manifest from "../../../public/content/temerosa-margin/0.8.0/manifest.json";

describe("Temerosa five-card draw opponents", () => {
  it("maps the complete audited 30-seat roster to bounded, distinct poker personas", () => {
    const opponents = createTemerosaFiveCardDrawOpponents(manifest.assets);
    expect(opponents).toHaveLength(30);
    expect(new Set(opponents.map((opponent) => opponent.id))).toHaveLength(30);
    expect(opponents.some((opponent) => opponent.id === "bacikal")).toBe(false);
    for (const opponent of opponents) {
      expect(TEMEROSA_CASINO_BEHAVIOR_PROFILES[opponent.id]).toBeDefined();
      expect(Object.values(opponent.persona).every((value) => value >= 0 && value <= 1)).toBe(true);
    }
    expect(new Set(opponents.map((opponent) => JSON.stringify(opponent.persona))).size).toBeGreaterThan(10);
  });
});
