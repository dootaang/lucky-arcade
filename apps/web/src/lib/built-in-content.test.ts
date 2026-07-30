import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TemerosaManifest } from "./temerosa-content.ts";
import { createTemerosaBuiltInArcadePack, createTemerosaExpeditionPack, toFavoriteCupCartridge } from "./built-in-content.ts";

const versions = ["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0"] as const;

function checkedInContent() {
  const manifests = versions.map((version) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../public/content/temerosa-margin/${version}/manifest.json`, import.meta.url)), "utf8")) as TemerosaManifest);
  const assets: Record<string, string> = {};
  for (const manifest of manifests) for (const asset of manifest.assets) {
    const variant = asset.variants.find((candidate) => candidate.size === "md") ?? asset.variants[0];
    if (variant) assets[asset.id] = `/content/temerosa-margin/${manifest.version}/${variant.path}`;
  }
  return { casino: manifests.find((manifest) => manifest.version === "0.8.0")!, assets };
}

describe("Temerosa built-in content adapters", () => {
  it("builds the audited 30-person world-cup and memory roster without GFL ids", () => {
    const { casino, assets } = checkedInContent(), pack = createTemerosaBuiltInArcadePack(casino.assets, assets);
    expect(pack.characters).toHaveLength(30);
    expect(new Set(pack.characters.map((character) => character.id)).size).toBe(30);
    expect(pack.characters.every((character) => Object.keys(character.assets).length === 4)).toBe(true);
    expect(JSON.stringify(pack)).not.toMatch(/gfl|소녀전선/i);
    expect(toFavoriteCupCartridge(pack).candidates).toHaveLength(30);
  });

  it("hydrates only the three canonical companions and Trainhead", () => {
    const { assets } = checkedInContent(), pack = createTemerosaExpeditionPack(assets);
    expect(pack.companions.map((companion) => companion.id)).toEqual(["pale", "kano", "nemo"]);
    expect(pack.boss.id).toBe("trainhead");
    expect(Object.keys(pack.assets)).toHaveLength(12);
    expect(JSON.stringify(pack)).not.toMatch(/gfl|소녀전선|m4a1|scarecrow/i);
  });
});
