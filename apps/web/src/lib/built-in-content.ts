import type { BuiltInContentPack, FavoriteCupCartridge } from "@lucky-arcade/contracts";
import { bundledPack, contentPackSchema, toBuiltInContentPack, type GflContentPack } from "@lucky-arcade/gfl-ember";

interface GflManifest { contract: "gfl-content-manifest/0.1"; version: string; assets: Record<string, string>; }
export interface GflContentBundle { game: GflContentPack; arcade: BuiltInContentPack; }

let gflBundlePromise: Promise<GflContentBundle> | null = null;

export function loadGflContentBundle(): Promise<GflContentBundle> {
  gflBundlePromise ??= fetch(`/content/gfl-ember/${bundledPack.version}/manifest.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error("content_manifest_missing");
      const manifest = await response.json() as GflManifest;
      const game = contentPackSchema.parse({ ...bundledPack, assets: manifest.assets });
      return { game, arcade: toBuiltInContentPack(game) };
    });
  return gflBundlePromise;
}

export function toFavoriteCupCartridge(pack: BuiltInContentPack): FavoriteCupCartridge {
  return {
    contract: "favorite-cup-cartridge/0.1",
    cardFingerprint: stablePackFingerprint(pack.packId, pack.version),
    cardName: pack.title,
    candidates: pack.characters.map((character) => ({
      npcId: character.id,
      displayName: character.name,
      displayNameSource: "card-explicit",
      representativeAssetId: character.assets.natural ? `${character.id}:natural` : `${character.id}:${Object.keys(character.assets)[0] ?? "default"}`,
      variantAssetIds: Object.keys(character.assets).map((expression) => `${character.id}:${expression}`),
      confidence: 1,
      evidence: ["built-in-content-pack"],
    })),
  };
}

export function builtInAsset(pack: BuiltInContentPack, assetId: string): string {
  const separator = assetId.indexOf(":");
  const character = pack.characters.find((item) => item.id === assetId.slice(0, separator));
  const expression = assetId.slice(separator + 1);
  const source = character?.assets[expression] ?? character?.assets.natural ?? (character ? Object.values(character.assets)[0] : undefined);
  if (!source) throw new Error(`built_in_asset_missing:${assetId}`);
  return source;
}

function stablePackFingerprint(packId: string, version: string): string {
  const input = `${packId}:${version}`;
  let left = 0x811c9dc5, right = 0x9e3779b9;
  for (const character of input) {
    left = Math.imul(left ^ character.charCodeAt(0), 0x01000193) >>> 0;
    right = Math.imul(right ^ character.charCodeAt(0), 0x85ebca6b) >>> 0;
  }
  const block = left.toString(16).padStart(8, "0") + right.toString(16).padStart(8, "0");
  return block.repeat(4);
}
