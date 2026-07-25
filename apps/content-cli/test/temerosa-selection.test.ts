import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { temerosaContentSelectionSchema } from "@lucky-arcade/contracts";
import { describe, expect, it } from "vitest";
import { assertTemerosaSelection, TEMEROSA_FORBIDDEN_ASSET_NAME } from "../src/temerosa-policy.ts";

const selectionPath = fileURLToPath(new URL("../src/temerosa-d1-selection.json", import.meta.url));
const reviewSelectionPath = fileURLToPath(new URL("../src/temerosa-d1-review-selection.json", import.meta.url));
const appearanceReviewSelectionPath = fileURLToPath(new URL("../src/temerosa-d1-appearance-review-selection.json", import.meta.url));
const v4ExpressionReviewSelectionPath = fileURLToPath(new URL("../src/temerosa-d1-v4-expression-review-selection.json", import.meta.url));
const nemoOldMaidSelectionPath = fileURLToPath(new URL("../src/temerosa-nemo-old-maid-selection.json", import.meta.url));
const oldMaidGallerySelectionPath = fileURLToPath(new URL("../src/temerosa-old-maid-gallery-selection.json", import.meta.url));
describe("Temerosa D1 content selection", () => {
  it("is an explicit, unique SFW allowlist", async () => {
    const selection = temerosaContentSelectionSchema.parse(JSON.parse(await readFile(selectionPath, "utf8")));
    expect(selection.assets).toHaveLength(45);
    expect(new Set(selection.assets.map((asset) => asset.id)).size).toBe(selection.assets.length);
    expect(new Set(selection.assets.map((asset) => `${asset.source}:${asset.sourcePath}`)).size).toBe(selection.assets.length);
    expect(() => assertTemerosaSelection(selection)).not.toThrow();
    expect(selection.assets.some((asset) => [asset.id, asset.sourcePath, asset.characterId ?? "", asset.expression ?? ""].some((value) => TEMEROSA_FORBIDDEN_ASSET_NAME.test(value)))).toBe(false);
    expect(new Set(selection.assets.map((asset) => asset.chunk))).toEqual(new Set(["bootstrap", "pequod", "metro", "records", "trainhead", "margin"]));
  });

  it("rejects a forbidden state even when it is added to the explicit list", async () => {
    const selection = temerosaContentSelectionSchema.parse(JSON.parse(await readFile(selectionPath, "utf8")));
    const unsafe = { ...selection, assets: [{ ...selection.assets[0]!, id: "nieun-naked", expression: "naked" }] };
    expect(() => assertTemerosaSelection(unsafe)).toThrow("selected_asset_forbidden");
  });

  it.each(["pale-naked", "pale-aroused", "kano-cowgirl-position", "nieun-masturbation", "wares-fellatio", "pale-missionary-position-cum"])("rejects known adult expression name %s", (name) => {
    expect(TEMEROSA_FORBIDDEN_ASSET_NAME.test(name)).toBe(true);
  });

  it.each(["nemo-cunnilingus", "nemo-paizuri", "nemo-deep_throat", "nemo-thighjob", "nemo-mating_press", "nemo-tongue_kiss"])("rejects additional adult expression name %s", (name) => {
    expect(TEMEROSA_FORBIDDEN_ASSET_NAME.test(name)).toBe(true);
  });

  it("keeps the magical-girl Nemo Old Maid set explicit, unique, and SFW", async () => {
    const selection = temerosaContentSelectionSchema.parse(JSON.parse(await readFile(nemoOldMaidSelectionPath, "utf8")));
    expect(selection.version).toBe("0.5.0");
    expect(selection.assets).toHaveLength(3);
    expect(selection.assets.every((asset) => asset.source === "nemo" && asset.appearanceSet === "nemo/magical-girl/current")).toBe(true);
    expect(() => assertTemerosaSelection(selection)).not.toThrow();
  });

  it("keeps the four-series Old Maid gallery explicit, unique, and SFW", async () => {
    const selection = temerosaContentSelectionSchema.parse(JSON.parse(await readFile(oldMaidGallerySelectionPath, "utf8")));
    expect(selection.version).toBe("0.6.0");
    expect(selection.assets).toHaveLength(54);
    expect(new Set(selection.assets.map((asset) => asset.source))).toEqual(new Set(["overture", "root2", "bestiaization", "finale"]));
    expect(new Set(selection.assets.map((asset) => asset.id)).size).toBe(selection.assets.length);
    expect(() => assertTemerosaSelection(selection)).not.toThrow();
  });

  it("keeps the owner review shortlist explicit, unique, and SFW by name", async () => {
    const selection = temerosaContentSelectionSchema.parse(JSON.parse(await readFile(reviewSelectionPath, "utf8")));
    expect(selection.version).toBe("0.2.0");
    expect(selection.assets).toHaveLength(32);
    expect(new Set(selection.assets.map((asset) => asset.id)).size).toBe(selection.assets.length);
    expect(() => assertTemerosaSelection(selection)).not.toThrow();
  });

  it("keeps the era-aware owner shortlist explicit and appearance-scoped", async () => {
    const selection = temerosaContentSelectionSchema.parse(JSON.parse(await readFile(appearanceReviewSelectionPath, "utf8")));
    expect(selection.version).toBe("0.3.0");
    expect(selection.assets).toHaveLength(15);
    expect(new Set(selection.assets.map((asset) => asset.id)).size).toBe(selection.assets.length);
    expect(selection.assets.every((asset) => Boolean(asset.appearanceSet))).toBe(true);
    expect(() => assertTemerosaSelection(selection)).not.toThrow();
  });

  it("keeps the V4 expression gate explicit, unique, SFW, and current-era scoped", async () => {
    const selection = temerosaContentSelectionSchema.parse(JSON.parse(await readFile(v4ExpressionReviewSelectionPath, "utf8")));
    expect(selection.version).toBe("0.4.0");
    expect(selection.assets).toHaveLength(12);
    expect(new Set(selection.assets.map((asset) => asset.id)).size).toBe(selection.assets.length);
    expect(selection.assets.every((asset) => asset.source === "finale" && asset.appearanceSet?.endsWith("/finale/current"))).toBe(true);
    expect(() => assertTemerosaSelection(selection)).not.toThrow();
  });
});
