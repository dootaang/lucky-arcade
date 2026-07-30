import { XorShift32 } from "@lucky-arcade/engine";

export const TEMEROSA_FAVORITE_PACK_VERSION = "0.1.0" as const;
export type TemerosaFavoriteSource = "overture" | "root2" | "bestiaization" | "finale";
export type TemerosaFavoriteGeometry = "portrait" | "square" | "landscape";
export type TemerosaFavoriteMode = "character" | TemerosaFavoriteGeometry | "all";

export interface TemerosaFavoriteAsset {
  id: string;
  source: TemerosaFavoriteSource;
  sourceEntryPath: string;
  sourceName: string;
  normalizedName: string;
  subject: { value: string; source: "asset-filename"; confidence: number; evidence: string[] };
  geometry: TemerosaFavoriteGeometry;
  sourceSha256: string;
  sourceWidth: number;
  sourceHeight: number;
  exactDuplicateOccurrences: number;
  perceptualReviewHint: boolean;
  display: { path: string; mime: "image/webp"; width: number; height: number; bytes: number; sha256: string };
}

export interface TemerosaFavoriteManifest {
  contract: "temerosa-favorite-asset-pack/0.1";
  version: string;
  sources: readonly TemerosaFavoriteSource[];
  totals: { sourceEntries: number; eligibleEntries: number; exactUniqueAssets: number; bytes: number };
  sourceCounts: Record<TemerosaFavoriteSource, number>;
  geometryCounts: Record<TemerosaFavoriteGeometry, number>;
  assets: TemerosaFavoriteAsset[];
}

let manifestPromise: Promise<TemerosaFavoriteManifest> | null = null;

export function loadTemerosaFavoriteManifest(): Promise<TemerosaFavoriteManifest> {
  manifestPromise ??= fetch(`/content/temerosa-favorite/${TEMEROSA_FAVORITE_PACK_VERSION}/manifest.json`, { cache: "force-cache" })
    .then(async (response) => { if (!response.ok) throw new Error(`temerosa_favorite_manifest_${response.status}`); return validateManifest(await response.json()); })
    .catch((error: unknown) => { manifestPromise = null; throw error; });
  return manifestPromise;
}

export function favoriteAssetUrl(asset: TemerosaFavoriteAsset): string {
  return `/content/temerosa-favorite/${TEMEROSA_FAVORITE_PACK_VERSION}/${asset.display.path}`;
}

export function assetsForMode(manifest: TemerosaFavoriteManifest, mode: Exclude<TemerosaFavoriteMode, "character">): TemerosaFavoriteAsset[] {
  return mode === "all" ? manifest.assets : manifest.assets.filter((asset) => asset.geometry === mode);
}

export function selectBalancedFavoriteAssets(assets: readonly TemerosaFavoriteAsset[], count: number, seed: string): TemerosaFavoriteAsset[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > assets.length) throw new Error("temerosa_favorite_invalid_selection_count");
  const sources: readonly TemerosaFavoriteSource[] = ["overture", "root2", "bestiaization", "finale"];
  const queues = new Map(sources.map((source) => [source, shuffle(assets.filter((asset) => asset.source === source), new XorShift32(`${seed}:${source}`))]));
  const selected: TemerosaFavoriteAsset[] = [];
  let cursor = new XorShift32(`${seed}:source-order`).nextUint32() % sources.length;
  while (selected.length < count) {
    let added = false;
    for (let offset = 0; offset < sources.length && selected.length < count; offset += 1) {
      const source = sources[(cursor + offset) % sources.length]!, queue = queues.get(source)!;
      const asset = queue.shift();
      if (asset) { selected.push(asset); added = true; }
    }
    if (!added) break;
    cursor = (cursor + 1) % sources.length;
  }
  if (selected.length !== count) throw new Error("temerosa_favorite_selection_exhausted");
  return shuffle(selected, new XorShift32(`${seed}:bracket`));
}

export function validateManifest(input: unknown): TemerosaFavoriteManifest {
  const manifest = input as Partial<TemerosaFavoriteManifest>;
  if (manifest.contract !== "temerosa-favorite-asset-pack/0.1" || manifest.version !== TEMEROSA_FAVORITE_PACK_VERSION || !Array.isArray(manifest.assets)) throw new Error("temerosa_favorite_manifest_invalid");
  const ids = new Set<string>(), hashes = new Set<string>();
  for (const asset of manifest.assets) {
    if (!asset?.id || ids.has(asset.id) || !asset.sourceSha256 || hashes.has(asset.sourceSha256) || !asset.display?.path || !asset.subject?.value) throw new Error("temerosa_favorite_manifest_asset_invalid");
    ids.add(asset.id); hashes.add(asset.sourceSha256);
  }
  if (manifest.totals?.exactUniqueAssets !== manifest.assets.length) throw new Error("temerosa_favorite_manifest_total_invalid");
  return manifest as TemerosaFavoriteManifest;
}

function shuffle<T>(input: readonly T[], rng: XorShift32): T[] {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = rng.nextUint32() % (index + 1);
    [output[index], output[target]] = [output[target] as T, output[index] as T];
  }
  return output;
}
