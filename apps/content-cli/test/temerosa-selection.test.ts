import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { temerosaContentSelectionSchema } from "@lucky-arcade/contracts";
import { describe, expect, it } from "vitest";
import { assertTemerosaSelection, TEMEROSA_FORBIDDEN_ASSET_NAME } from "../src/temerosa-policy.ts";

const selectionPath = fileURLToPath(new URL("../src/temerosa-d1-selection.json", import.meta.url));
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
});
