import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { openAssetResolver, sniffDisplayImageMime, type AssetResolver } from "@lucky-arcade/card-io";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import sharp from "sharp";
import { TEMEROSA_FORBIDDEN_ASSET_NAME } from "./temerosa-policy.ts";
import { TEMEROSA_SERIES, type SeriesNpcAssetCandidate, type TemerosaSeriesKey, type TemerosaSeriesNpcInventory, type TemerosaSeriesNpcRecord } from "./temerosa-series-npcs.ts";

const MAX_INPUT_PIXELS = 40_000_000;
const PACK_ID = "temerosa-series-npcs";
const EMOTIONS = ["neutral", "pleased", "tense", "despair"] as const;
const EMOTION_PREFERENCES: Readonly<Record<Emotion, readonly string[]>> = {
  neutral: ["neutral", "natural", "standing", "opened-eyes", "closed-eyes", "looking-book"],
  pleased: ["pleased", "smile", "smirk", "blush"],
  tense: ["tense", "angry", "upset", "surprised", "embarrassed", "contempt", "combat-stance", "combat", "fight"],
  despair: ["despair", "sad", "cry", "teardrop", "disappointed"],
};

export type Emotion = (typeof EMOTIONS)[number];
export type PortraitScale = "sm" | "md" | "lg";

export interface SeriesNpcAssetSelection {
  contract: "temerosa-series-npc-asset-selection/0.1";
  inventoryContract: TemerosaSeriesNpcInventory["contract"];
  identityRule: "series-and-source-persona";
  policy: {
    selection: "automatic-safe-expression-priority";
    crossSeriesFallback: false;
    unavailableIsExplicit: true;
    manualVisualPrecheck: false;
  };
  items: SeriesNpcAssetSelectionItem[];
}

export type SeriesNpcAssetSelectionItem = {
  npcId: string;
  series: TemerosaSeriesKey;
  sourceFingerprint: string;
} & (
  | { status: "unavailable"; reason: "no-safe-image-candidates" }
  | { status: "selected"; emotions: Record<Emotion, SelectedCandidate> }
);

export interface SelectedCandidate {
  assetId: string;
  name: string;
  sourceEntryPath: string;
  sourceExpression: string;
  fallbackFrom?: string;
}

export interface SeriesNpcPortraitPackManifest {
  contract: "temerosa-series-npc-portrait-pack/0.1";
  packId: typeof PACK_ID;
  version: string;
  generatedAt: string;
  identityRule: "series-and-source-persona";
  policy: {
    originalsRedistributed: false;
    actualMimeSniffed: true;
    exactSourceDuplicatesCollapsed: true;
    exactDerivedDuplicatesCollapsed: true;
    crossSeriesFallback: false;
    withoutEnlargement: true;
    lgMinimumSourceHeight: number;
  };
  sources: Array<{ series: TemerosaSeriesKey; fingerprint: string }>;
  totals: {
    npcs: number;
    available: number;
    unavailable: number;
    portraitOwnerships: number;
    emotionFallbacks: number;
    uniqueSourceImages: number;
    uniqueImageFiles: number;
    imageBytes: number;
  };
  npcs: SeriesNpcPortraitEntry[];
}

export type SeriesNpcPortraitEntry = {
  npcId: string;
  series: TemerosaSeriesKey;
} & (
  | { status: "unavailable"; reason: "no-safe-image-candidates" }
  | { status: "available"; sm: PortraitVariant; md: Record<Emotion, PortraitVariant>; lg?: PortraitVariant }
);

export interface PortraitVariant {
  scale: PortraitScale;
  emotion: Emotion;
  path: string;
  mime: "image/webp";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  source: {
    series: TemerosaSeriesKey;
    assetId: string;
    entryPath: string;
    name: string;
    expression: string;
    mime: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
  };
  fallbackFrom?: string;
}

export interface SeriesNpcAssetAudit {
  contract: "temerosa-series-npc-portrait-audit/0.1";
  packId: typeof PACK_ID;
  version: string;
  status: "passed";
  missingNpcIds: string[];
  emotionFallbacks: Array<{ npcId: string; emotion: Emotion; fallbackFrom: string }>;
  forbiddenAssetMatches: string[];
  mimeMismatches: string[];
  enlargedVariants: string[];
  crossSeriesFallbacks: string[];
  uniqueImageFiles: number;
  imageBytes: number;
}

type Arguments = {
  sources: Record<TemerosaSeriesKey, string>;
  inventory: string;
  selection: string;
  refreshSelection: boolean;
  out: string;
  version: string;
};

type ResolvedSource = PortraitVariant["source"] & { raw: Uint8Array };

export function buildSeriesNpcAssetSelection(inventory: TemerosaSeriesNpcInventory): SeriesNpcAssetSelection {
  assertInventory(inventory);
  const fingerprints = new Map(inventory.sources.map((source) => [source.series, source.fingerprint]));
  return {
    contract: "temerosa-series-npc-asset-selection/0.1",
    inventoryContract: inventory.contract,
    identityRule: "series-and-source-persona",
    policy: { selection: "automatic-safe-expression-priority", crossSeriesFallback: false, unavailableIsExplicit: true, manualVisualPrecheck: false },
    items: inventory.records.map((record) => selectRecord(record, required(fingerprints.get(record.series), `series_source_missing:${record.series}`))),
  };
}

export function assertSeriesNpcAssetSelection(selection: SeriesNpcAssetSelection, inventory: TemerosaSeriesNpcInventory): void {
  if (selection.contract !== "temerosa-series-npc-asset-selection/0.1" || selection.identityRule !== "series-and-source-persona") throw new Error("series_asset_selection_contract_invalid");
  if (selection.policy.crossSeriesFallback || !selection.policy.unavailableIsExplicit) throw new Error("series_asset_selection_policy_invalid");
  if (selection.items.length !== inventory.records.length || new Set(selection.items.map((item) => item.npcId)).size !== selection.items.length) throw new Error("series_asset_selection_count_invalid");
  const records = new Map(inventory.records.map((record) => [record.id, record]));
  const fingerprints = new Map(inventory.sources.map((source) => [source.series, source.fingerprint]));
  for (const item of selection.items) {
    const record = records.get(item.npcId);
    if (!record || item.series !== record.series || item.sourceFingerprint !== fingerprints.get(record.series)) throw new Error(`series_asset_selection_identity_invalid:${item.npcId}`);
    if (item.status === "unavailable") {
      if (record.assetCandidates.length > 0) throw new Error(`series_asset_selection_false_unavailable:${item.npcId}`);
      continue;
    }
    if (record.assetCandidates.length === 0) throw new Error(`series_asset_selection_missing_unavailable:${item.npcId}`);
    const candidates = new Map(record.assetCandidates.map((candidate) => [candidate.assetId, candidate]));
    for (const emotion of EMOTIONS) {
      const selected = item.emotions[emotion], candidate = candidates.get(selected.assetId);
      if (!candidate || candidate.name !== selected.name || (candidate.path ?? "") !== selected.sourceEntryPath || candidate.expression !== selected.sourceExpression) throw new Error(`series_asset_selection_candidate_invalid:${item.npcId}:${emotion}`);
      assertSafeSource(selected.name, selected.sourceEntryPath, item.npcId);
    }
  }
}

export async function auditSeriesNpcPortraitPack(packRoot: string, manifest: SeriesNpcPortraitPackManifest): Promise<SeriesNpcAssetAudit> {
  const forbiddenAssetMatches: string[] = [], mimeMismatches: string[] = [], enlargedVariants: string[] = [], crossSeriesFallbacks: string[] = [];
  const missingNpcIds = manifest.npcs.filter((npc) => npc.status === "unavailable").map((npc) => npc.npcId);
  const emotionFallbacks: SeriesNpcAssetAudit["emotionFallbacks"] = [];
  const files = new Map<string, PortraitVariant>();
  for (const npc of manifest.npcs) {
    if (npc.status === "unavailable") continue;
    const variants = [npc.sm, ...EMOTIONS.map((emotion) => npc.md[emotion]), ...(npc.lg ? [npc.lg] : [])];
    for (const variant of variants) {
      files.set(variant.path, variant);
      if (variant.source.series !== npc.series) crossSeriesFallbacks.push(`${npc.npcId}:${variant.emotion}:${variant.source.series}`);
      if (variant.width > variant.source.width || variant.height > variant.source.height) enlargedVariants.push(`${npc.npcId}:${variant.scale}:${variant.emotion}`);
      if (variant.fallbackFrom && variant.scale === "md") emotionFallbacks.push({ npcId: npc.npcId, emotion: variant.emotion, fallbackFrom: variant.fallbackFrom });
      if ([variant.path, variant.source.name, variant.source.entryPath].some((value) => TEMEROSA_FORBIDDEN_ASSET_NAME.test(value))) forbiddenAssetMatches.push(`${npc.npcId}:${variant.path}`);
    }
  }
  let imageBytes = 0;
  for (const [path, expected] of files) {
    const full = resolve(packRoot, path), bytes = await readFile(full), info = await stat(full), metadata = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    imageBytes += info.size;
    if (relative(packRoot, full).startsWith("..") || info.size !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256 || metadata.width !== expected.width || metadata.height !== expected.height) throw new Error(`series_asset_manifest_file_mismatch:${path}`);
    if (expected.mime !== "image/webp" || sniffDisplayImageMime(bytes) !== expected.mime) mimeMismatches.push(path);
  }
  if (files.size !== manifest.totals.uniqueImageFiles || imageBytes !== manifest.totals.imageBytes) throw new Error("series_asset_manifest_totals_invalid");
  const audit: SeriesNpcAssetAudit = {
    contract: "temerosa-series-npc-portrait-audit/0.1", packId: PACK_ID, version: manifest.version, status: "passed",
    missingNpcIds, emotionFallbacks, forbiddenAssetMatches, mimeMismatches, enlargedVariants, crossSeriesFallbacks,
    uniqueImageFiles: files.size, imageBytes,
  };
  if (forbiddenAssetMatches.length || mimeMismatches.length || enlargedVariants.length || crossSeriesFallbacks.length) throw new Error("series_asset_audit_failed");
  return audit;
}

async function compile(args: Arguments, root: string): Promise<{ manifest: SeriesNpcPortraitPackManifest; audit: SeriesNpcAssetAudit; output: string }> {
  const inventory = JSON.parse(await readFile(resolve(root, args.inventory), "utf8")) as TemerosaSeriesNpcInventory;
  assertInventory(inventory);
  const selectionPath = resolve(root, args.selection);
  if (args.refreshSelection) await writeFile(selectionPath, `${JSON.stringify(buildSeriesNpcAssetSelection(inventory), null, 2)}\n`, "utf8");
  const selection = JSON.parse(await readFile(selectionPath, "utf8")) as SeriesNpcAssetSelection;
  assertSeriesNpcAssetSelection(selection, inventory);
  const output = resolve(root, args.out, args.version), staging = `${output}.building`;
  const resolvers = {} as Record<TemerosaSeriesKey, AssetResolver>;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    for (const series of TEMEROSA_SERIES) resolvers[series] = await openAssetResolver(await NodeFileSource.open(resolve(root, args.sources[series])));
    const entries: SeriesNpcPortraitEntry[] = [], derived = new Map<string, PortraitVariant>();
    const sourceCache = new Map<string, ResolvedSource>();
    for (let index = 0; index < selection.items.length; index += 1) {
      const item = selection.items[index]!;
      if (item.status === "unavailable") { entries.push({ npcId: item.npcId, series: item.series, status: "unavailable", reason: item.reason }); continue; }
      const sources = {} as Record<Emotion, ResolvedSource>;
      for (const emotion of EMOTIONS) sources[emotion] = await resolveSource(item, item.emotions[emotion], resolvers[item.series], sourceCache);
      const neutralChoice = item.emotions.neutral;
      const sm = await createVariant(staging, "sm", "neutral", neutralChoice, sources.neutral, derived);
      const md = {} as Record<Emotion, PortraitVariant>;
      for (const emotion of EMOTIONS) md[emotion] = await createVariant(staging, "md", emotion, item.emotions[emotion], sources[emotion], derived);
      const lg = sources.neutral.height >= 900 ? await createVariant(staging, "lg", "neutral", neutralChoice, sources.neutral, derived) : undefined;
      entries.push({ npcId: item.npcId, series: item.series, status: "available", sm, md, ...(lg ? { lg } : {}) });
      if ((index + 1) % 20 === 0) process.stderr.write(`series_npc_assets_compiled:${index + 1}/${selection.items.length}\n`);
    }
    const uniqueFiles = new Map([...derived.values()].map((variant) => [variant.path, variant]));
    const manifest: SeriesNpcPortraitPackManifest = {
      contract: "temerosa-series-npc-portrait-pack/0.1", packId: PACK_ID, version: args.version, generatedAt: new Date().toISOString(), identityRule: "series-and-source-persona",
      policy: { originalsRedistributed: false, actualMimeSniffed: true, exactSourceDuplicatesCollapsed: true, exactDerivedDuplicatesCollapsed: true, crossSeriesFallback: false, withoutEnlargement: true, lgMinimumSourceHeight: 900 },
      sources: inventory.sources.map(({ series, fingerprint }) => ({ series, fingerprint })),
      totals: {
        npcs: entries.length, available: entries.filter((entry) => entry.status === "available").length, unavailable: entries.filter((entry) => entry.status === "unavailable").length,
        portraitOwnerships: entries.filter((entry) => entry.status === "available").reduce((sum, entry) => sum + 5 + (entry.status === "available" && entry.lg ? 1 : 0), 0),
        emotionFallbacks: entries.filter((entry): entry is Extract<SeriesNpcPortraitEntry, { status: "available" }> => entry.status === "available").flatMap((entry) => EMOTIONS.map((emotion) => entry.md[emotion])).filter((variant) => variant.fallbackFrom).length,
        uniqueSourceImages: new Set([...sourceCache.values()].map((source) => source.sha256)).size, uniqueImageFiles: uniqueFiles.size, imageBytes: [...uniqueFiles.values()].reduce((sum, variant) => sum + variant.bytes, 0),
      },
      npcs: entries,
    };
    assertManifest(manifest, inventory);
    await writeFile(resolve(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const audit = await auditSeriesNpcPortraitPack(staging, manifest);
    await writeFile(resolve(staging, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    await writeFile(resolve(staging, "review.html"), renderReviewHtml(manifest), "utf8");
    await rm(output, { recursive: true, force: true });
    await mkdir(dirname(output), { recursive: true });
    await cp(staging, output, { recursive: true, errorOnExist: true, force: false });
    return { manifest, audit, output };
  } finally {
    await rm(staging, { recursive: true, force: true });
    for (const resolver of Object.values(resolvers)) resolver?.dispose();
  }
}

function selectRecord(record: TemerosaSeriesNpcRecord, sourceFingerprint: string): SeriesNpcAssetSelectionItem {
  if (record.assetCandidates.length === 0) return { npcId: record.id, series: record.series, sourceFingerprint, status: "unavailable", reason: "no-safe-image-candidates" };
  const neutral = selectCandidate(record.assetCandidates, "neutral") ?? [...record.assetCandidates].sort(compareCandidate)[0]!;
  const emotions = {} as Record<Emotion, SelectedCandidate>;
  for (const emotion of EMOTIONS) {
    const native = selectCandidate(record.assetCandidates, emotion), selected = native ?? neutral;
    emotions[emotion] = {
      assetId: selected.assetId, name: selected.name, sourceEntryPath: selected.path ?? "", sourceExpression: selected.expression,
      ...(!native || !EMOTION_PREFERENCES[emotion].includes(selected.expression) ? { fallbackFrom: native ? selected.expression : "neutral" } : {}),
    };
  }
  if (!EMOTION_PREFERENCES.neutral.includes(neutral.expression)) emotions.neutral.fallbackFrom = neutral.expression;
  return { npcId: record.id, series: record.series, sourceFingerprint, status: "selected", emotions };
}

function selectCandidate(candidates: readonly SeriesNpcAssetCandidate[], emotion: Emotion): SeriesNpcAssetCandidate | undefined {
  const priorities = EMOTION_PREFERENCES[emotion];
  return [...candidates].filter((candidate) => priorities.includes(candidate.expression)).sort((left, right) => priorities.indexOf(left.expression) - priorities.indexOf(right.expression) || compareCandidate(left, right))[0];
}

function compareCandidate(left: SeriesNpcAssetCandidate, right: SeriesNpcAssetCandidate): number { return (left.path ?? "").localeCompare(right.path ?? "") || left.assetId.localeCompare(right.assetId); }

async function resolveSource(item: Extract<SeriesNpcAssetSelectionItem, { status: "selected" }>, choice: SelectedCandidate, resolver: AssetResolver, cache: Map<string, ResolvedSource>): Promise<ResolvedSource> {
  const key = `${item.series}:${choice.assetId}`, existing = cache.get(key); if (existing) return existing;
  const asset = resolver.assets.find((candidate) => candidate.id === choice.assetId);
  if (!asset || (asset.path ?? "") !== choice.sourceEntryPath || asset.name !== choice.name) throw new Error(`series_asset_source_drift:${item.npcId}:${choice.assetId}`);
  assertSafeSource(asset.name, asset.path ?? "", item.npcId);
  const resolved = await resolver.read(asset.id), actualMime = sniffDisplayImageMime(resolved.bytes);
  if (!actualMime || actualMime !== resolved.mime) throw new Error(`series_asset_source_mime_invalid:${item.npcId}:${choice.assetId}`);
  const rotated = sharp(resolved.bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate(), metadata = await rotated.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`series_asset_source_dimensions_missing:${item.npcId}:${choice.assetId}`);
  const source: ResolvedSource = {
    series: item.series, assetId: choice.assetId, entryPath: choice.sourceEntryPath, name: choice.name, expression: choice.sourceExpression,
    mime: actualMime, width: metadata.width, height: metadata.height, bytes: resolved.bytes.byteLength,
    sha256: createHash("sha256").update(resolved.bytes).digest("hex"), raw: resolved.bytes,
  };
  cache.set(key, source);
  return source;
}

async function createVariant(staging: string, scale: PortraitScale, emotion: Emotion, choice: SelectedCandidate, source: ResolvedSource, derived: Map<string, PortraitVariant>): Promise<PortraitVariant> {
  const bounds = scale === "sm" ? { width: 160, height: 200, quality: 78 } : scale === "md" ? { width: 480, height: 600, quality: 84 } : { width: 960, height: 1200, quality: 88 };
  const encoded = await sharp(source.raw, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate()
    .resize({ width: bounds.width, height: bounds.height, fit: "inside", withoutEnlargement: true })
    .webp({ quality: bounds.quality, alphaQuality: 90, effort: 5, smartSubsample: true }).toBuffer({ resolveWithObject: true });
  if (encoded.info.width > source.width || encoded.info.height > source.height) throw new Error(`series_asset_variant_enlarged:${source.series}:${source.assetId}:${scale}`);
  const sha256 = createHash("sha256").update(encoded.data).digest("hex"), path = `assets/${scale}/${sha256.slice(0, 32)}.webp`;
  const variant: PortraitVariant = {
    scale, emotion, path, mime: "image/webp", width: encoded.info.width, height: encoded.info.height, bytes: encoded.data.byteLength, sha256,
    source: withoutRaw(source), ...(choice.fallbackFrom ? { fallbackFrom: choice.fallbackFrom } : {}),
  };
  const existing = derived.get(`${scale}:${sha256}`);
  if (!existing) {
    const target = resolve(staging, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, encoded.data); derived.set(`${scale}:${sha256}`, variant);
  }
  if (!existing) return variant;
  const { fallbackFrom: _fallbackFrom, emotion: _emotion, source: _source, ...file } = existing;
  return { ...file, emotion, source: withoutRaw(source), ...(choice.fallbackFrom ? { fallbackFrom: choice.fallbackFrom } : {}) };
}

function withoutRaw(source: ResolvedSource): PortraitVariant["source"] { const { raw: _raw, ...value } = source; return value; }

function assertInventory(inventory: TemerosaSeriesNpcInventory): void {
  if (inventory.contract !== "temerosa-series-npc-inventory/0.1" || inventory.identityRule !== "series-and-source-persona" || inventory.records.length !== 116 || inventory.totals.assetCandidates !== 1616) throw new Error("series_asset_inventory_invalid");
}

function assertManifest(manifest: SeriesNpcPortraitPackManifest, inventory: TemerosaSeriesNpcInventory): void {
  if (manifest.npcs.length !== inventory.records.length || manifest.totals.npcs !== inventory.records.length || manifest.totals.available + manifest.totals.unavailable !== manifest.totals.npcs) throw new Error("series_asset_manifest_npc_total_invalid");
  if (new Set(manifest.npcs.map((npc) => npc.npcId)).size !== manifest.npcs.length) throw new Error("series_asset_manifest_npc_duplicate");
  for (const npc of manifest.npcs) {
    const record = inventory.records.find((candidate) => candidate.id === npc.npcId);
    if (!record || record.series !== npc.series) throw new Error(`series_asset_manifest_identity_invalid:${npc.npcId}`);
    if (npc.status === "available") for (const variant of [npc.sm, ...EMOTIONS.map((emotion) => npc.md[emotion]), ...(npc.lg ? [npc.lg] : [])]) {
      if (variant.source.series !== npc.series || variant.width > variant.source.width || variant.height > variant.source.height || !/^[a-f0-9]{64}$/u.test(variant.sha256) || variant.bytes < 1) throw new Error(`series_asset_manifest_variant_invalid:${npc.npcId}:${variant.scale}:${variant.emotion}`);
    }
  }
}

function assertSafeSource(name: string, path: string, npcId: string): void {
  if (!path || TEMEROSA_FORBIDDEN_ASSET_NAME.test(name) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(path)) throw new Error(`series_asset_forbidden_or_missing_path:${npcId}`);
}

function renderReviewHtml(manifest: SeriesNpcPortraitPackManifest): string {
  const cards = manifest.npcs.map((npc) => npc.status === "available"
    ? `<article><img loading="lazy" src="${escapeHtml(npc.sm.path)}" alt=""><code>${escapeHtml(npc.npcId)}</code><span>${npc.series}</span></article>`
    : `<article class="missing"><div>unavailable</div><code>${escapeHtml(npc.npcId)}</code><span>${npc.series}</span></article>`).join("\n");
  return `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Temerosa series NPC portrait review</title><style>body{margin:0;background:#111827;color:#e5e7eb;font:14px system-ui}header{position:sticky;top:0;background:#111827ee;padding:16px;z-index:1}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:16px}article{background:#1f2937;border:1px solid #374151;border-radius:10px;padding:10px;display:grid;gap:6px}img,article>div{width:100%;height:200px;object-fit:contain;background:#030712;border-radius:6px}article>div{display:grid;place-items:center;color:#fca5a5}.missing{border-color:#7f1d1d}code{overflow-wrap:anywhere;color:#f9fafb}span{color:#9ca3af}</style></head><body><header><strong>Temerosa 4-series NPC — sm review</strong> · ${manifest.totals.available} available · ${manifest.totals.unavailable} unavailable</header><main>${cards}</main></body></html>\n`;
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!); }
function required<T>(value: T | undefined, code: string): T { if (value === undefined) throw new Error(code); return value; }

function parseArgs(values: string[]): Arguments {
  const sources = {} as Record<TemerosaSeriesKey, string>; let inventory = "", selection = "", out = "", version = "", refreshSelection = false;
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === "--refresh-selection") { refreshSelection = true; continue; }
    const value = values[index + 1]; if (!key || !value) continue;
    if (key === "--inventory") inventory = value; else if (key === "--selection") selection = value; else if (key === "--out") out = value; else if (key === "--version") version = value;
    else if (key.startsWith("--") && TEMEROSA_SERIES.includes(key.slice(2) as TemerosaSeriesKey)) sources[key.slice(2) as TemerosaSeriesKey] = value; else continue;
    index += 1;
  }
  const missing = TEMEROSA_SERIES.filter((series) => !sources[series]);
  if (!inventory || !selection || !out || !/^\d+\.\d+\.\d+$/u.test(version) || missing.length) throw new Error(`usage: four sources --inventory <json> --selection <json> [--refresh-selection] --out <content-root> --version <semver>; missing:${missing.join(",")}`);
  return { sources, inventory, selection, refreshSelection, out, version };
}

async function main(): Promise<void> {
  const root = process.env.INIT_CWD ?? process.cwd(), result = await compile(parseArgs(process.argv.slice(2)), root);
  process.stdout.write(`${JSON.stringify({ output: result.output, ...result.manifest.totals, missing: result.audit.missingNpcIds.length, fallbacks: result.audit.emotionFallbacks.length }, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("compile-temerosa-series-assets.ts")) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
