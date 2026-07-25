import { describe, expect, it } from "vitest";
import { weightedChoice } from "../src/persona.ts";

describe("persona weighted choice", () => {
  it("is deterministic and handles empty weight", () => { expect(weightedChoice([1, 4], "same")).toBe(weightedChoice([1, 4], "same")); expect(weightedChoice([0, 0], "zero")).toBe(0); });
  it("respects a strong weight over many seeds", () => { const first = Array.from({ length: 1000 }, (_, index) => weightedChoice([10, 1], String(index))).filter((value) => value === 0).length; expect(first).toBeGreaterThan(820); });
});
