import { describe, expect, it } from "vitest";
import { generateRestorationDeck } from "../src/index.ts";
const candidates = Array.from({ length: 6 }, (_, index) => ({ npcId: `n${index}`, displayName: `N${index}`, displayNameSource: "asset-filename" as const, representativeAssetId: `a${index}-0`, variantAssetIds: [`a${index}-0`, `a${index}-1`, `a${index}-2`], confidence: 1, evidence: [] }));
const cartridge = { contract: "favorite-cup-cartridge/0.1" as const, cardFingerprint: "b".repeat(64), cardName: "test", candidates };
describe("restoration generator", () => {
  it("is deterministic and every mutation has a unique original", () => { const a = generateRestorationDeck(cartridge, "seed"), b = generateRestorationDeck(cartridge, "seed"); expect(a).toEqual(b); expect(a.problems).toHaveLength(5); for (const problem of a.problems) { if (problem.type === "portrait-swap") expect(problem.shownAssetId).not.toBe(problem.originalAssetId); if (problem.type === "name-swap") expect(problem.shownName).not.toBe(problem.originalName); if (problem.type === "expression-intruder") expect(problem.assetIds.filter((id) => id === problem.intruderAssetId)).toHaveLength(1); } });
  it("closes honestly with fewer than four people", () => expect(generateRestorationDeck({ ...cartridge, candidates: candidates.slice(0, 3) }, "seed").problems).toHaveLength(0));
});
