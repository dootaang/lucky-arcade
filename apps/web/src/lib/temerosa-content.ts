import { casinoClockSampleFromResponse, type CasinoClockSample } from "./casino-clock.ts";

interface ManifestVariant { size: "sm" | "md" | "lg"; path: string; }
export interface TemerosaManifestAsset { id: string; characterId?: string; expression?: string; appearanceSet?: string; variants: ManifestVariant[]; }
export interface TemerosaManifest { version: string; assets: TemerosaManifestAsset[]; }
export interface ResolvedTemerosaManifestAsset extends TemerosaManifestAsset { packVersion: string; }
export interface TemerosaManifestLoad { manifest: TemerosaManifest; clockSample: CasinoClockSample; }

const PACKS = ["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0"] as const;
const REQUIRED_ASSETS = [
  "pequod-ruins",
  "review-nieun-current-angry",
  "review-nieun-current-smirk-alt",
  "review-alger-standing",
  "review-alger-smirk",
  "review-alger-disappointed",
  "review-alger-smile",
  "review-kano-standing",
  "review-kano-angry",
  "review-kano-upset",
  "review-pale-standing",
  "review-pale-smirk",
  "review-bacikal-standing",
  "review-bacikal-smile",
  "review-bacikal-disappointed",
  "nemo-natural",
  "nemo-smile",
  "nemo-angry",
  "nemo-magical-neutral",
  "nemo-magical-smile",
  "nemo-magical-tense",
  "nemo-magical-despair",
  "review-nieun-sad",
  "alger-sad",
  "bacikal-sad",
  "wares-sad",
  "nieun-standing",
  "nieun-smile",
  "nieun-surprised",
  "alger-surprised",
  "pale-angry",
  "pale-sad",
  "pale-combat",
  "kano-smile",
  "kano-angry",
  "kano-sad",
  "kano-combat",
  "lyla-natural",
  "lyla-smile",
  "lyla-angry",
  "riel-natural",
  "riel-smile",
  "riel-sad",
  "wares-standing",
  "wares-smile",
  "wares-surprised",
] as const;
let assetPromise: Promise<Readonly<Record<string, string>>> | null = null;
let casinoAssetPromise: Promise<TemerosaCasinoAssetBundle> | null = null;
let seriesNpcAssetPromise: Promise<TemerosaSeriesNpcAssetBundle> | null = null;
const manifestPromises = new Map<string, Promise<TemerosaManifestLoad>>();

export interface TemerosaCasinoAssetBundle {
  thumbAssets: Readonly<Record<string, string>>;
  assets: Readonly<Record<string, string>>;
  detailAssets: Readonly<Record<string, string>>;
  contentAssets: readonly TemerosaManifestAsset[];
  allContentAssets: readonly ResolvedTemerosaManifestAsset[];
}

interface SeriesPortraitVariant { path: string; emotion: string; }
interface SeriesNpcPortraitRecord {
  npcId: string;
  status: "available" | "unavailable";
  sm?: SeriesPortraitVariant;
  md?: Readonly<Partial<Record<"neutral" | "pleased" | "tense" | "despair",SeriesPortraitVariant>>>;
  lg?: SeriesPortraitVariant;
}
interface TemerosaSeriesNpcManifest {
  contract: "temerosa-series-npc-portrait-pack/0.1";
  packId: "temerosa-series-npcs";
  version: "0.1.0";
  npcs: readonly SeriesNpcPortraitRecord[];
}
export interface TemerosaSeriesNpcAssetBundle {
  thumbAssets: Readonly<Record<string,string>>;
  assets: Readonly<Record<string,Readonly<Record<string,string>>>>;
  detailAssets: Readonly<Record<string,string>>;
  unavailableNpcIds: readonly string[];
}

export type TemerosaSeriesNpcPortraitIntent = "sm" | "detail";

export function loadTemerosaPilotAssets(): Promise<Readonly<Record<string, string>>> {
  assetPromise ??= Promise.all(PACKS.map((version) => fetchManifest(version).then((loaded) => loaded.manifest))).then((manifests) => {
    const assets: Record<string, string> = {};
    for (const manifest of manifests) for (const asset of manifest.assets) {
      const variant = asset.variants.find((candidate) => candidate.size === "md") ?? asset.variants[0];
      if (variant) assets[asset.id] = `/content/temerosa-margin/${manifest.version}/${variant.path}`;
    }
    for (const required of REQUIRED_ASSETS) {
      if (!assets[required]) throw new Error(`temerosa_pilot_asset_missing:${required}`);
    }
    return Object.freeze(assets);
  }).catch((error: unknown) => { assetPromise = null; throw error; });
  return assetPromise;
}

export function loadTemerosaCasinoAssets(): Promise<TemerosaCasinoAssetBundle> {
  casinoAssetPromise ??= Promise.all(PACKS.map((version) => fetchManifest(version).then((loaded) => loaded.manifest))).then((manifests) => {
    const thumbAssets: Record<string, string> = {};
    const assets: Record<string, string> = {};
    const detailAssets: Record<string, string> = {};
    const allContentAssets: ResolvedTemerosaManifestAsset[] = [];
    for (const manifest of manifests) for (const asset of manifest.assets) {
      allContentAssets.push({ ...asset, packVersion: manifest.version });
      const small = asset.variants.find((candidate) => candidate.size === "sm") ?? asset.variants[0];
      const medium = asset.variants.find((candidate) => candidate.size === "md") ?? small;
      const detail = asset.variants.find((candidate) => candidate.size === "lg") ?? medium;
      if (small) thumbAssets[asset.id] = contentUrl(manifest.version, small.path);
      if (medium) assets[asset.id] = contentUrl(manifest.version, medium.path);
      if (detail) detailAssets[asset.id] = contentUrl(manifest.version, detail.path);
    }
    for (const required of REQUIRED_ASSETS) if (!assets[required]) throw new Error(`temerosa_pilot_asset_missing:${required}`);
    const casinoManifest = manifests.find((manifest) => manifest.version === "0.8.0");
    if (!casinoManifest) throw new Error("temerosa_casino_manifest_missing");
    return Object.freeze({
      thumbAssets: Object.freeze(thumbAssets),
      assets: Object.freeze(assets),
      detailAssets: Object.freeze(detailAssets),
      contentAssets: Object.freeze(casinoManifest.assets),
      allContentAssets: Object.freeze(allContentAssets),
    });
  }).catch((error: unknown) => { casinoAssetPromise = null; throw error; });
  return casinoAssetPromise;
}

export function loadTemerosaCasinoManifest(): Promise<TemerosaManifestLoad> {
  return fetchManifest("0.8.0");
}

/** Loads the four-series portrait pack only after a series-NPC surface asks for it. */
export function loadTemerosaSeriesNpcAssets():Promise<TemerosaSeriesNpcAssetBundle>{
  seriesNpcAssetPromise??=fetch("/content/temerosa-series-npcs/0.1.0/manifest.json").then(async(response)=>{
    if(!response.ok)throw new Error("temerosa_series_npc_manifest_missing");
    const manifest=await response.json() as TemerosaSeriesNpcManifest;
    if(manifest.contract!=="temerosa-series-npc-portrait-pack/0.1"||manifest.packId!=="temerosa-series-npcs"||manifest.version!=="0.1.0")throw new Error("temerosa_series_npc_manifest_invalid");
    const thumbAssets:Record<string,string>={},assets:Record<string,Readonly<Record<string,string>>>={},detailAssets:Record<string,string>={};
    const unavailable:string[]=[];
    for(const npc of manifest.npcs){
      if(npc.status!=="available"){unavailable.push(npc.npcId);continue;}
      if(!npc.sm||!npc.md)throw new Error(`temerosa_series_npc_asset_incomplete:${npc.npcId}`);
      thumbAssets[npc.npcId]=seriesNpcContentUrl(npc.sm.path);
      assets[npc.npcId]=Object.freeze(Object.fromEntries(Object.entries(npc.md).map(([emotion,variant])=>[emotion,seriesNpcContentUrl(variant.path)])));
      detailAssets[npc.npcId]=seriesNpcContentUrl(npc.lg?.path??npc.md.neutral?.path??npc.sm.path);
    }
    return Object.freeze({thumbAssets:Object.freeze(thumbAssets),assets:Object.freeze(assets),detailAssets:Object.freeze(detailAssets),unavailableNpcIds:Object.freeze(unavailable.toSorted())});
  }).catch((error:unknown)=>{seriesNpcAssetPromise=null;throw error;});
  return seriesNpcAssetPromise;
}

/** Resolves one mounted NPC at a time; image bytes remain browser-lazy. */
export async function resolveTemerosaSeriesNpcPortrait(npcId:string,intent:TemerosaSeriesNpcPortraitIntent):Promise<string|undefined>{
  if(!npcId.startsWith("temerosa:"))return undefined;
  const bundle=await loadTemerosaSeriesNpcAssets();
  if(bundle.unavailableNpcIds.includes(npcId))return undefined;
  return intent==="detail"?bundle.detailAssets[npcId]:bundle.thumbAssets[npcId];
}

function fetchManifest(version: string): Promise<TemerosaManifestLoad> {
  const existing = manifestPromises.get(version);
  if (existing) return existing;
  const started = performance.now();
  const promise = fetch(`/content/temerosa-margin/${version}/manifest.json`, version === "0.8.0" ? { cache: "no-store" } : undefined).then(async (response) => {
    const received = performance.now();
    const clockSample = casinoClockSampleFromResponse(response, started, received);
    if (!response.ok) throw new Error(`temerosa_manifest_missing:${version}`);
    const manifest = await response.json() as TemerosaManifest;
    return Object.freeze({ manifest, clockSample });
  }).catch((error: unknown) => {
    manifestPromises.delete(version);
    throw error;
  });
  manifestPromises.set(version, promise);
  return promise;
}
export function temerosaContentUrl(version: string, path: string): string { return `/content/temerosa-margin/${version}/${path}`; }
function contentUrl(version: string, path: string): string { return temerosaContentUrl(version, path); }
function seriesNpcContentUrl(path:string):string{return `/content/temerosa-series-npcs/0.1.0/${path}`;}
