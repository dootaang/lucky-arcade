import { describe, expect, it } from "vitest";
import { pileOffset } from "../src/react/pile-layout.ts";

describe("old maid discard pile layout", () => {
  it("is deterministic for the same seed, index, and card", () => {
    const expected = pileOffset("same-seed", 4, "card-a");
    for (let sample = 0; sample < 100; sample += 1) expect(pileOffset("same-seed", 4, "card-a")).toEqual(expected);
  });

  it("keeps jitter and rotation inside their visual budgets", () => {
    for (let sample = 0; sample < 1_000; sample += 1) {
      const offset = pileOffset(`seed-${sample}`, sample, `card-${sample}`);
      expect(offset.x).toBeGreaterThanOrEqual(-28); expect(offset.x).toBeLessThanOrEqual(28);
      expect(offset.y).toBeGreaterThanOrEqual(-28); expect(offset.y).toBeLessThanOrEqual(28);
      expect(offset.rotation).toBeGreaterThanOrEqual(-10); expect(offset.rotation).toBeLessThanOrEqual(10);
    }
  });

  it("spreads distinct inputs across mostly distinct poses", () => {
    const poses = new Set(Array.from({ length: 200 }, (_, index) => {
      const offset = pileOffset(`spread-${index}`, index, `card-${index}`);
      return `${offset.x}:${offset.y}:${offset.rotation}`;
    }));
    expect(poses.size).toBeGreaterThan(180);
  });

  it("locks the x then y then rotation draw order", () => {
    expect(pileOffset("motion-seed", 7, "card-alpha")).toEqual({ x: 17, y: 0, rotation: -2 });
  });
});
