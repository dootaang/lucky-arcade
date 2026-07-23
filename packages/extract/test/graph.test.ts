import { describe, expect, it } from "vitest";
import { buildLoreGraph, graphMetrics, normalizeLoreEntries, verifiedPuzzles } from "../src/index.ts";

const entries = normalizeLoreEntries([
  { id: "a", keys: ["alpha"], content: "beta의 문이 열린다", recursive: true },
  { id: "b", keys: ["beta"], content: "gamma의 흔적이 보인다", recursive: true },
  { id: "c", keys: ["gamma"], content: "목표 방", recursive: true },
  { id: "regex", keys: ["g.*"], content: "정규식", useRegex: true },
]);

describe("lore graph", () => {
  it("compresses and measures a deterministic chain", () => {
    const metrics = graphMetrics(buildLoreGraph(entries));
    expect(metrics).toMatchObject({ nodes: 4, edges: 2, dagDepth: 2, shortestPathDiameter: 2 });
  });

  it("only emits candidates verified by the imported activation runtime", () => {
    const puzzles = verifiedPuzzles(buildLoreGraph(entries), entries);
    expect(puzzles).toContainEqual({ startKeyword: "alpha", targetLoreId: "c", activationHops: 2, verified: true });
  });
});
