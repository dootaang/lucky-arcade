import type { BuiltInContentPack } from "@lucky-arcade/contracts";
import { describe, expect, it } from "vitest";
import { inspectBuiltInContentPack, supportsBuiltInCabinet } from "../src/index.ts";

function pack(packId: string, characters: number, expressions: number): BuiltInContentPack {
  return {
    contract: "built-in-content-pack/0.1", packId, version: "1", title: packId, loreEntryCount: 3,
    characters: Array.from({ length: characters }, (_, index) => ({
      id: `${packId}-${index}`, name: `인물 ${index}`,
      assets: Object.fromEntries(Array.from({ length: expressions }, (__, expression) => [`emotion-${expression}`, `/${packId}/${index}/${expression}.webp`])),
    })),
  };
}

describe("built-in content pack onboarding", () => {
  it("opens the same cabinets for two unrelated qualifying worlds", () => {
    for (const fixture of [pack("first-world", 12, 9), pack("second-world", 8, 3)]) {
      expect(supportsBuiltInCabinet(fixture, "favorite-cup")).toBe(true);
      expect(supportsBuiltInCabinet(fixture, "sprite-memory")).toBe(true);
    }
  });

  it("reports why a small pack cannot open the shared cabinets", () => {
    const capabilities = inspectBuiltInContentPack(pack("small-world", 4, 1));
    expect(capabilities).toMatchObject({ characterCount: 4, charactersWithPortrait: 4, minimumExpressions: 1 });
    expect(supportsBuiltInCabinet(pack("small-world", 4, 1), "favorite-cup")).toBe(false);
    expect(supportsBuiltInCabinet(pack("small-world", 4, 1), "sprite-memory")).toBe(false);
  });
});
