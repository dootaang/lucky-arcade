import { describe, expect, it } from "vitest";
import manifest from "../../../public/content/temerosa-margin/0.8.0/manifest.json";
import { buildTemerosaIndianPokerCartridge } from "./temerosa-indian-poker-cartridge.ts";
import { TEMEROSA_INDIAN_POKER_PERSONAS } from "./temerosa-indian-poker-personas.ts";

describe("Temerosa Indian poker cartridge", () => {
  it("uses thirty audited NPCs and only compiled portrait variants", () => {
    const cartridge = buildTemerosaIndianPokerCartridge(manifest.assets);
    const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
    expect(cartridge.characters).toHaveLength(30);
    expect(new Set(cartridge.characters.map((character) => character.id)).size).toBe(30);
    expect(Object.keys(TEMEROSA_INDIAN_POKER_PERSONAS).sort()).toEqual(cartridge.characters.map((character) => character.id).sort());
    expect(new Set(Object.values(TEMEROSA_INDIAN_POKER_PERSONAS).map((persona) => JSON.stringify(persona))).size).toBeGreaterThanOrEqual(15);
    expect(cartridge.characters.some((character) => character.id === "bacikal")).toBe(false);

    for (const character of cartridge.characters) {
      expect(["open", "guarded", "bluffer"]).toContain(character.tellStyle);
      for (const value of Object.values(character.persona)) expect(value).toBeGreaterThanOrEqual(0);
      for (const assetId of [...Object.values(character.portraits), character.despairPortrait]) {
        const asset = assets.get(assetId);
        expect(asset?.role).toBe("portrait");
        expect(asset?.variants.some((variant) => variant.size === "md")).toBe(true);
      }
    }

    const nemo = cartridge.characters.find((character) => character.id === "nemo");
    expect(nemo).toBeDefined();
    expect(Object.values(nemo?.portraits ?? {}).every((assetId) => assetId.startsWith("npc-"))).toBe(true);
  });
});
