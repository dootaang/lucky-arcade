import { describe, expect, it } from "vitest";
import { selectCollectionFace } from "./collection-rules.ts";

describe("collection unlock", () => {
  it("always selects a new face until complete", () => {
    const all = Array.from({ length: 100 }, (_, index) => `face-${index}`), unlocked: string[] = [];
    while (unlocked.length < all.length) { const next = selectCollectionFace("deck", unlocked, all); expect(next).not.toBeNull(); expect(unlocked).not.toContain(next); unlocked.push(next!); }
    expect(selectCollectionFace("deck", unlocked, all)).toBeNull(); expect(new Set(unlocked).size).toBe(100);
  });
  it("is deterministic for the same collection state", () => { expect(selectCollectionFace("a", ["1"], ["1", "2", "3"])).toBe(selectCollectionFace("a", ["1"], ["1", "2", "3"])); });
});
