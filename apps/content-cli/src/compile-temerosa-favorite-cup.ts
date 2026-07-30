import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { openAssetResolver, type AssetResolver } from "@lucky-arcade/card-io";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import sharp from "sharp";

const MAX_INPUT_PIXELS = 40_000_000;
const SOURCES = ["overture", "root2", "bestiaization", "finale"] as const;
type SourceKey = (typeof SOURCES)[number];
type Geometry = "portrait" | "square" | "landscape";

type AuditItem = {
  sourceCard: SourceKey | "nemo";
  sourceEntryPath: string;
  originalName: string;
  normalizedName: string;
  detectedMime: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  perceptualHash: string;
  perceptualDuplicateCandidates: string[];
  geometryQueue: Geometry | "other";
  reviewStatus: "candidate" | "approved" | "rejected";
};

type AuditReport = {
  contract: "temerosa-casino-asset-audit/0.1";
  inventory: AuditItem[];
};
type EligibleItem = AuditItem & { sourceCard: SourceKey; geometryQueue: Geometry };

export type FavoriteAssetManifest = {
  contract: "temerosa-favorite-asset-pack/0.1";
  version: string;
  sources: readonly SourceKey[];
  generatedAt: string;
  policy: {
    rejectedStatesExcluded: true;
    exactDuplicatesCollapsed: true;
    perceptualDuplicatesAreReviewHintsOnly: true;
    originalsRedistributed: false;
  };
  totals: { sourceEntries: number; eligibleEntries: number; exactUniqueAssets: number; bytes: number };
  sourceCounts: Record<SourceKey, number>;
  geometryCounts: Record<Geometry, number>;
  assets: FavoriteAsset[];
};

export type FavoriteAsset = {
  id: string;
  source: SourceKey;
  sourceEntryPath: string;
  sourceName: string;
  normalizedName: string;
  subject: { value: string; source: "asset-filename"; confidence: number; evidence: string[] };
  geometry: Geometry;
  sourceSha256: string;
  sourceWidth: number;
  sourceHeight: number;
  exactDuplicateOccurrences: number;
  perceptualReviewHint: boolean;
  display: { path: string; mime: "image/webp"; width: number; height: number; bytes: number; sha256: string };
};

type Arguments = { sources: Record<SourceKey, string>; audit: string; out: string; version: string };

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = process.env.INIT_CWD ?? process.cwd();
  const audit = JSON.parse(await readFile(resolve(root, args.audit), "utf8")) as AuditReport;
  if (audit.contract !== "temerosa-casino-asset-audit/0.1") throw new Error("favorite_asset_audit_contract_invalid");

  const sourceEntries = audit.inventory.filter((item): item is AuditItem & { sourceCard: SourceKey } => SOURCES.includes(item.sourceCard as SourceKey));
  const eligible = sourceEntries.filter((item): item is EligibleItem => item.reviewStatus !== "rejected" && item.geometryQueue !== "other");
  const groups = new Map<string, EligibleItem[]>();
  for (const item of eligible) {
    const group = groups.get(item.sha256) ?? [];
    group.push(item);
    groups.set(item.sha256, group);
  }
  const selected = [...groups.values()].map((group) => [...group].sort(compareAuditItem)[0]!).sort(compareAuditItem);
  const resolvers = {} as Record<SourceKey, AssetResolver>;
  const output = resolve(root, args.out, args.version), staging = `${output}.building`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    for (const source of SOURCES) resolvers[source] = await openAssetResolver(await NodeFileSource.open(args.sources[source]));
    const assets: FavoriteAsset[] = [];
    for (let index = 0; index < selected.length; index += 1) {
      const item = selected[index]!, group = groups.get(item.sha256)!;
      const bytes = await readVerified(item, resolvers[item.sourceCard]);
      const id = `asset-${item.sha256.slice(0, 24)}`, relative = `assets/${id}.webp`, target = resolve(staging, relative);
      await mkdir(dirname(target), { recursive: true });
      const bounds = displayBounds(item.geometryQueue);
      const encoded = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate()
        .resize({ ...bounds, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80, alphaQuality: 90, effort: 5, smartSubsample: true }).toBuffer({ resolveWithObject: true });
      await writeFile(target, encoded.data);
      assets.push({
        id, source: item.sourceCard, sourceEntryPath: item.sourceEntryPath, sourceName: item.originalName,
        normalizedName: item.normalizedName, subject: inferSubject(item.normalizedName), geometry: item.geometryQueue,
        sourceSha256: item.sha256, sourceWidth: item.width, sourceHeight: item.height,
        exactDuplicateOccurrences: group.length, perceptualReviewHint: item.perceptualDuplicateCandidates.length > 0,
        display: { path: relative, mime: "image/webp", width: encoded.info.width, height: encoded.info.height, bytes: encoded.data.byteLength, sha256: createHash("sha256").update(encoded.data).digest("hex") },
      });
      if ((index + 1) % 100 === 0) process.stderr.write(`favorite_assets_compiled:${index + 1}/${selected.length}\n`);
    }
    const manifest: FavoriteAssetManifest = {
      contract: "temerosa-favorite-asset-pack/0.1", version: args.version, sources: SOURCES,
      generatedAt: new Date().toISOString(),
      policy: { rejectedStatesExcluded: true, exactDuplicatesCollapsed: true, perceptualDuplicatesAreReviewHintsOnly: true, originalsRedistributed: false },
      totals: { sourceEntries: sourceEntries.length, eligibleEntries: eligible.length, exactUniqueAssets: assets.length, bytes: assets.reduce((sum, item) => sum + item.display.bytes, 0) },
      sourceCounts: Object.fromEntries(SOURCES.map((source) => [source, assets.filter((item) => item.source === source).length])) as Record<SourceKey, number>,
      geometryCounts: Object.fromEntries((["portrait", "square", "landscape"] as const).map((geometry) => [geometry, assets.filter((item) => item.geometry === geometry).length])) as Record<Geometry, number>,
      assets,
    };
    assertManifest(manifest);
    await writeFile(resolve(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rm(output, { recursive: true, force: true });
    await mkdir(dirname(output), { recursive: true });
    await cp(staging, output, { recursive: true, errorOnExist: true, force: false });
    process.stdout.write(`${JSON.stringify({ output, ...manifest.totals, sourceCounts: manifest.sourceCounts, geometryCounts: manifest.geometryCounts }, null, 2)}\n`);
  } finally {
    await rm(staging, { recursive: true, force: true });
    for (const resolver of Object.values(resolvers)) resolver?.dispose();
  }
}

function compareAuditItem(left: AuditItem & { sourceCard: SourceKey }, right: AuditItem & { sourceCard: SourceKey }): number {
  return SOURCES.indexOf(left.sourceCard) - SOURCES.indexOf(right.sourceCard) || left.sourceEntryPath.localeCompare(right.sourceEntryPath);
}

async function readVerified(item: AuditItem & { sourceCard: SourceKey }, resolver: AssetResolver): Promise<Uint8Array> {
  const matches = resolver.assets.filter((asset) => normalizePath(asset.path ?? "") === normalizePath(item.sourceEntryPath));
  if (matches.length !== 1) throw new Error(`favorite_asset_source_${matches.length === 0 ? "missing" : "ambiguous"}:${item.sourceCard}:${item.sourceEntryPath}`);
  const resolved = await resolver.read(matches[0]!.id);
  const hash = createHash("sha256").update(resolved.bytes).digest("hex");
  if (hash !== item.sha256 || resolved.bytes.byteLength !== item.bytes) throw new Error(`favorite_asset_source_drift:${item.sourceCard}:${item.sourceEntryPath}`);
  return resolved.bytes;
}

function inferSubject(normalizedName: string): FavoriteAsset["subject"] {
  const suffixes = [
    "combat-stance", "closed-eyes", "opened-eyes", "disappointed", "embarrassed", "surprised", "motivated", "exhausted",
    "contempt", "teardrop", "natural", "default", "serious", "despair", "pleased", "smirk", "smile", "blush", "angry",
    "tense", "worry", "fight", "combat", "defeat", "cry", "sad",
  ];
  for (const suffix of suffixes) {
    if (normalizedName.endsWith(`-${suffix}`)) return { value: normalizedName.slice(0, -(suffix.length + 1)), source: "asset-filename", confidence: 0.82, evidence: [`expression-suffix:${suffix}`] };
  }
  return { value: normalizedName, source: "asset-filename", confidence: 0.5, evidence: ["normalized-source-name"] };
}

function displayBounds(geometry: Geometry): { width: number; height: number } {
  if (geometry === "portrait") return { width: 530, height: 768 };
  if (geometry === "landscape") return { width: 960, height: 540 };
  return { width: 512, height: 512 };
}

function assertManifest(manifest: FavoriteAssetManifest): void {
  if (manifest.assets.length !== manifest.totals.exactUniqueAssets || new Set(manifest.assets.map((item) => item.id)).size !== manifest.assets.length) throw new Error("favorite_asset_manifest_id_mismatch");
  if (new Set(manifest.assets.map((item) => item.sourceSha256)).size !== manifest.assets.length) throw new Error("favorite_asset_manifest_exact_duplicate");
  if (manifest.assets.some((item) => !item.subject.value || item.display.bytes < 1 || !/^[a-f0-9]{64}$/u.test(item.display.sha256))) throw new Error("favorite_asset_manifest_invalid_item");
  if (Object.values(manifest.geometryCounts).reduce((sum, value) => sum + value, 0) !== manifest.assets.length) throw new Error("favorite_asset_manifest_geometry_total");
  if (Object.values(manifest.sourceCounts).reduce((sum, value) => sum + value, 0) !== manifest.assets.length) throw new Error("favorite_asset_manifest_source_total");
}

function normalizePath(value: string): string { return value.replace(/\\/gu, "/").replace(/^\.\//u, ""); }

function parseArgs(values: string[]): Arguments {
  const sources = {} as Record<SourceKey, string>; let audit = "", out = "", version = "";
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index], value = values[index + 1]; if (!key || !value) continue;
    if (key === "--audit") audit = value; else if (key === "--out") out = value; else if (key === "--version") version = value;
    else if (key.startsWith("--") && SOURCES.includes(key.slice(2) as SourceKey)) sources[key.slice(2) as SourceKey] = value; else continue;
    index += 1;
  }
  const missing = SOURCES.filter((source) => !sources[source]);
  if (!audit || !out || !/^\d+\.\d+\.\d+$/u.test(version) || missing.length) throw new Error(`usage: four source arguments --audit <json> --out <dir> --version <semver>; missing:${missing.join(",")}`);
  return { sources, audit, out, version };
}

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
