import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assetsForMode, selectBalancedFavoriteAssets, validateManifest, type TemerosaFavoriteManifest } from "./temerosa-favorite-content.ts";

const manifest = validateManifest(JSON.parse(readFileSync(fileURLToPath(new URL("../../public/content/temerosa-favorite/0.1.0/manifest.json", import.meta.url)), "utf8")));

describe("Temerosa favorite marathon content", () => {
  it("ships every eligible exact-unique asset from the four series", () => {
    expect(manifest.totals).toMatchObject({ sourceEntries: 1_826, eligibleEntries: 1_592, exactUniqueAssets: 1_551 });
    expect(manifest.assets).toHaveLength(1_551);
    expect(new Set(manifest.assets.map((asset) => asset.sourceSha256)).size).toBe(1_551);
    expect(assetsForMode(manifest, "portrait")).toHaveLength(1_224);
    expect(assetsForMode(manifest, "square")).toHaveLength(126);
    expect(assetsForMode(manifest, "landscape")).toHaveLength(201);
  });
  it("selects deterministic and source-balanced 256-entry brackets", () => {
    const first = selectBalancedFavoriteAssets(manifest.assets, 256, "same"), second = selectBalancedFavoriteAssets(manifest.assets, 256, "same");
    expect(first.map((asset) => asset.id)).toEqual(second.map((asset) => asset.id));
    const counts = sourceCounts(first);
    expect(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))).toBeLessThanOrEqual(1);
  });
  it("supports 500, 1000, and the full unique inventory", () => {
    for (const count of [500, 1_000, manifest.assets.length]) expect(new Set(selectBalancedFavoriteAssets(manifest.assets, count, `size-${count}`).map((asset) => asset.id)).size).toBe(count);
  });
});

function sourceCounts(assets: TemerosaFavoriteManifest["assets"]): Record<string, number> {
  return Object.fromEntries(["overture", "root2", "bestiaization", "finale"].map((source) => [source, assets.filter((asset) => asset.source === source).length]));
}
