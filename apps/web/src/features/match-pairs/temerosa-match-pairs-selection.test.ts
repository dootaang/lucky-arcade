import { describe, expect, it } from "vitest";
import manifest from "../../../public/content/temerosa-margin/0.8.0/manifest.json";
import { TEMEROSA_MATCH_PAIRS_FACES } from "./temerosa-match-pairs-selection.ts";

describe("Temerosa match-pairs allowlist", () => {
  it("uses distinct characters and approved compiled portrait assets", () => {
    const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
    expect(TEMEROSA_MATCH_PAIRS_FACES).toHaveLength(24);
    expect(new Set(TEMEROSA_MATCH_PAIRS_FACES.map((face) => face.id)).size).toBe(24);
    expect(new Set(TEMEROSA_MATCH_PAIRS_FACES.map((face) => face.characterId)).size).toBe(24);
    for (const face of TEMEROSA_MATCH_PAIRS_FACES) {
      const asset = assets.get(face.assetId);
      expect(asset?.role).toBe("portrait");
      expect(asset?.characterId).toBe(face.characterId);
      expect(asset?.variants.some((variant) => variant.size === "md")).toBe(true);
    }
  });
});
