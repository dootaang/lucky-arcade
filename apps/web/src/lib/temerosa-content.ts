interface ManifestVariant { size: "sm" | "md" | "lg"; path: string; }
interface ManifestAsset { id: string; variants: ManifestVariant[]; }
interface TemerosaManifest { version: string; assets: ManifestAsset[]; }

const PACKS = ["0.1.0", "0.3.0", "0.4.0"] as const;
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
  "nieun-standing",
  "nieun-smile",
  "pale-angry",
  "kano-smile",
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
