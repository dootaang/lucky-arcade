import type { BuiltInContentPack, FavoriteCupCartridge } from "@lucky-arcade/contracts";
import { bundledPack, contentPackSchema, type TemerosaExpeditionContentPack } from "@lucky-arcade/temerosa-expedition";
import type { TemerosaCasinoPortraitAsset } from "@lucky-arcade/old-maid";
import { createTemerosaCasinoRoster } from "./temerosa-casino-roster.ts";
import { loadTemerosaCasinoAssets } from "./temerosa-content.ts";

export interface TemerosaContentBundle {
  arcade: BuiltInContentPack;
  expedition: TemerosaExpeditionContentPack;
  assets: Readonly<Record<string, string>>;
}

let temerosaBundlePromise: Promise<TemerosaContentBundle> | null = null;

export function loadTemerosaContentBundle(): Promise<TemerosaContentBundle> {
  temerosaBundlePromise ??= loadTemerosaCasinoAssets().then((bundle) => {
    const arcade = createTemerosaBuiltInArcadePack(bundle.contentAssets, bundle.assets);
    const expedition = createTemerosaExpeditionPack(bundle.assets);
    return { arcade, expedition, assets: bundle.assets };
  }).catch((error: unknown) => { temerosaBundlePromise = null; throw error; });
  return temerosaBundlePromise;
}

export function createTemerosaBuiltInArcadePack(contentAssets: readonly TemerosaCasinoPortraitAsset[], assets: Readonly<Record<string, string>>): BuiltInContentPack {
  const roster = createTemerosaCasinoRoster(contentAssets);
  return {
    contract: "built-in-content-pack/0.1",
    packId: "temerosa-casino",
    version: "0.8.0",
    title: "테메로세",
    loreEntryCount: 0,
    characters: roster.map((character) => ({
      id: character.id,
      name: character.name,
      assets: {
        natural: requireAsset(assets, character.portraits.neutral),
        pleased: requireAsset(assets, character.portraits.pleased),
        tense: requireAsset(assets, character.portraits.tense),
        despair: requireAsset(assets, character.despairPortrait ?? character.portraits.tense),
      },
    })),
  };
}

export function createTemerosaExpeditionPack(assets: Readonly<Record<string, string>>): TemerosaExpeditionContentPack {
  return contentPackSchema.parse({
      ...bundledPack,
      assets: {
        "portrait:pale:natural": requireAsset(assets, "review-pale-standing"),
        "portrait:pale:angry": requireAsset(assets, "pale-angry"),
        "portrait:pale:default": requireAsset(assets, "review-pale-standing"),
        "portrait:kano:natural": requireAsset(assets, "review-kano-standing"),
        "portrait:kano:angry": requireAsset(assets, "kano-angry"),
        "portrait:kano:default": requireAsset(assets, "review-kano-standing"),
        "portrait:nemo:natural": requireAsset(assets, "nemo-magical-neutral"),
        "portrait:nemo:angry": requireAsset(assets, "nemo-magical-tense"),
        "portrait:nemo:default": requireAsset(assets, "nemo-magical-neutral"),
        "portrait:trainhead:natural": requireAsset(assets, "trainhead"),
        "portrait:trainhead:angry": requireAsset(assets, "trainhead"),
        "portrait:trainhead:default": requireAsset(assets, "trainhead"),
      },
    });
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
  const separator = assetId.indexOf(":"), character = pack.characters.find((item) => item.id === assetId.slice(0, separator)), expression = assetId.slice(separator + 1);
  const source = character?.assets[expression] ?? character?.assets.natural ?? (character ? Object.values(character.assets)[0] : undefined);
  if (!source) throw new Error(`built_in_asset_missing:${assetId}`);
  return source;
}

function requireAsset(assets: Readonly<Record<string, string>>, id: string): string {
  const source = assets[id];
  if (!source) throw new Error(`temerosa_built_in_asset_missing:${id}`);
  return source;
}

function stablePackFingerprint(packId: string, version: string): string {
  const input = `${packId}:${version}`;
  let left = 0x811c9dc5, right = 0x9e3779b9;
  for (const character of input) { left = Math.imul(left ^ character.charCodeAt(0), 0x01000193) >>> 0; right = Math.imul(right ^ character.charCodeAt(0), 0x85ebca6b) >>> 0; }
  const block = left.toString(16).padStart(8, "0") + right.toString(16).padStart(8, "0");
  return block.repeat(4);
}
