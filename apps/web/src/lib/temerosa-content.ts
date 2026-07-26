interface ManifestVariant { size: "sm" | "md" | "lg"; path: string; }
export interface TemerosaManifestAsset { id: string; characterId?: string; expression?: string; appearanceSet?: string; variants: ManifestVariant[]; }
interface TemerosaManifest { version: string; assets: TemerosaManifestAsset[]; }

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

export interface TemerosaCasinoAssetBundle {
  thumbAssets: Readonly<Record<string, string>>;
  assets: Readonly<Record<string, string>>;
  detailAssets: Readonly<Record<string, string>>;
  contentAssets: readonly TemerosaManifestAsset[];
}

export function loadTemerosaPilotAssets(): Promise<Readonly<Record<string, string>>> {
  assetPromise ??= Promise.all(PACKS.map(async (version) => {
    const response = await fetch(`/content/temerosa-margin/${version}/manifest.json`);
    if (!response.ok) throw new Error(`temerosa_manifest_missing:${version}`);
    return response.json() as Promise<TemerosaManifest>;
  })).then((manifests) => {
    const assets: Record<string, string> = {};
    for (const manifest of manifests) for (const asset of manifest.assets) {
      const variant = asset.variants.find((candidate) => candidate.size === "md") ?? asset.variants[0];
      if (variant) assets[asset.id] = `/content/temerosa-margin/${manifest.version}/${variant.path}`;
    }
    for (const required of REQUIRED_ASSETS) {
      if (!assets[required]) throw new Error(`temerosa_pilot_asset_missing:${required}`);
    }
    return Object.freeze(assets);
  });
  return assetPromise;
}

export function loadTemerosaCasinoAssets(): Promise<TemerosaCasinoAssetBundle> {
  casinoAssetPromise ??= Promise.all(PACKS.map(fetchManifest)).then((manifests) => {
    const thumbAssets: Record<string, string> = {};
    const assets: Record<string, string> = {};
    const detailAssets: Record<string, string> = {};
    for (const manifest of manifests) for (const asset of manifest.assets) {
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
    });
  });
  return casinoAssetPromise;
}

async function fetchManifest(version: string): Promise<TemerosaManifest> {
  const response = await fetch(`/content/temerosa-margin/${version}/manifest.json`);
  if (!response.ok) throw new Error(`temerosa_manifest_missing:${version}`);
  return response.json() as Promise<TemerosaManifest>;
}
function contentUrl(version: string, path: string): string { return `/content/temerosa-margin/${version}/${path}`; }
