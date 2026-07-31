import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertSeriesNpcAssetSelection,
  auditSeriesNpcPortraitPack,
  type Emotion,
  type SeriesNpcAssetAudit,
  type SeriesNpcAssetSelection,
  type SeriesNpcPortraitPackManifest,
  type PortraitVariant,
} from "../src/compile-temerosa-series-assets.ts";
import type { TemerosaSeriesNpcInventory } from "../src/temerosa-series-npcs.ts";

const inventoryPath = fileURLToPath(new URL("../src/temerosa-series-npc-roster.generated.json", import.meta.url));
const selectionPath = fileURLToPath(new URL("../src/temerosa-series-npc-asset-selection.json", import.meta.url));
const packRoot = fileURLToPath(new URL("../../web/public/content/temerosa-series-npcs/0.1.0", import.meta.url));
const emotions = ["neutral", "pleased", "tense", "despair"] as const satisfies readonly Emotion[];

describe("Temerosa four-series NPC portrait pack", () => {
  it("keeps all 116 series-scoped identities in an explicit selection", async () => {
    const inventory = await json<TemerosaSeriesNpcInventory>(inventoryPath), selection = await json<SeriesNpcAssetSelection>(selectionPath);
    expect(() => assertSeriesNpcAssetSelection(selection, inventory)).not.toThrow();
    expect(selection.items).toHaveLength(116);
    expect(selection.items.filter((item) => item.status === "selected")).toHaveLength(108);
    expect(selection.items.filter((item) => item.status === "unavailable")).toHaveLength(8);
    expect(selection.policy).toMatchObject({ crossSeriesFallback: false, manualVisualPrecheck: false });
    expect(selection.items.filter((item) => item.npcId.endsWith(":pale")).map((item) => item.npcId).sort()).toEqual([
      "temerosa:finale:pale", "temerosa:overture:pale", "temerosa:root2:pale",
    ]);
  });

  it("retains unavailable NPCs and emotion fallbacks as auditable manifest data", async () => {
    const manifest = await json<SeriesNpcPortraitPackManifest>(`${packRoot}/manifest.json`), audit = await json<SeriesNpcAssetAudit>(`${packRoot}/audit.json`);
    expect(manifest).toMatchObject({ contract: "temerosa-series-npc-portrait-pack/0.1", packId: "temerosa-series-npcs", version: "0.1.0" });
    expect(manifest.totals).toMatchObject({ npcs: 116, available: 108, unavailable: 8, portraitOwnerships: 647, emotionFallbacks: 13, uniqueSourceImages: 391, uniqueImageFiles: 588, imageBytes: 24_257_462 });
    expect(audit.missingNpcIds).toEqual([
      "temerosa:overture:licanica", "temerosa:overture:mortem", "temerosa:bestiaization:boris-leblanc", "temerosa:bestiaization:gestas",
      "temerosa:bestiaization:iweleth", "temerosa:bestiaization:kudryavka", "temerosa:bestiaization:leviathan", "temerosa:bestiaization:sherirus",
    ]);
    expect(audit.emotionFallbacks).toHaveLength(13);
  });

  it("never crosses a series boundary or enlarges a derived portrait", async () => {
    const manifest = await json<SeriesNpcPortraitPackManifest>(`${packRoot}/manifest.json`);
    for (const npc of manifest.npcs) {
      expect(npc.npcId.startsWith(`temerosa:${npc.series}:`)).toBe(true);
      if (npc.status === "unavailable") continue;
      const variants = [npc.sm, ...emotions.map((emotion) => npc.md[emotion]), ...(npc.lg ? [npc.lg] : [])];
      for (const variant of variants) {
        expect(variant.source.series).toBe(npc.series);
        expect(variant.width).toBeLessThanOrEqual(variant.source.width);
        expect(variant.height).toBeLessThanOrEqual(variant.source.height);
      }
    }
  });

  it("verifies every unique path, byte size, hash, dimensions, and actual MIME", async () => {
    const manifest = await json<SeriesNpcPortraitPackManifest>(`${packRoot}/manifest.json`);
    const audit = await auditSeriesNpcPortraitPack(packRoot, manifest);
    expect(audit).toMatchObject({ status: "passed", uniqueImageFiles: 588, imageBytes: 24_257_462 });
    expect(audit.forbiddenAssetMatches).toEqual([]);
    expect(audit.mimeMismatches).toEqual([]);
    expect(audit.enlargedVariants).toEqual([]);
    expect(audit.crossSeriesFallbacks).toEqual([]);
    expect(uniqueVariants(manifest).size).toBe(manifest.totals.uniqueImageFiles);
  });

  it("publishes only derived images and review metadata, never CHARX or extraction trees", async () => {
    const files = await walk(packRoot);
    expect(files).toContain("manifest.json");
    expect(files).toContain("audit.json");
    expect(files).toContain("review.html");
    expect(files.filter((path) => path.endsWith(".webp"))).toHaveLength(588);
    expect(files.every((path) => /^(?:assets\/(?:sm|md|lg)\/[a-f0-9]{32}\.webp|manifest\.json|audit\.json|review\.html)$/u.test(path))).toBe(true);
    expect(files.some((path) => /(?:charx|\.tmp-|extracted|assets\/other\/image)/iu.test(path))).toBe(false);
  });
});

function uniqueVariants(manifest: SeriesNpcPortraitPackManifest): Map<string, PortraitVariant> {
  const values = new Map<string, PortraitVariant>();
  for (const npc of manifest.npcs) if (npc.status === "available") for (const variant of [npc.sm, ...emotions.map((emotion) => npc.md[emotion]), ...(npc.lg ? [npc.lg] : [])]) values.set(variant.path, variant);
  return values;
}

async function json<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, "utf8")) as T; }
async function walk(directory: string, prefix = ""): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) output.push(...await walk(`${directory}/${entry.name}`, relative)); else output.push(relative);
  }
  return output.sort();
}
