import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  assertInventoryShape, assertManifest, assertReviewQueue, sha256,
  type VipAsset, type VipAssetCandidate, type VipAssetManifest, type VipInventoryReport, type VipReviewQueue,
} from "./temerosa-vip-assets.ts";

const MAX_INPUT_PIXELS = 40_000_000;
type CompileOptions = { sources: Record<string, string>; inventory: VipInventoryReport; reviews: VipReviewQueue; out: string; version: string };
type Arguments = { sources: Record<string, string>; inventory: string; reviews: string; out: string; version: string };

export async function compileVipAssets(options: CompileOptions): Promise<VipAssetManifest> {
  assertInventoryShape(options.inventory);
  assertReviewQueue(options.reviews, options.inventory);
  if (options.version !== "0.1.0") throw new Error("vip_pack_version_invalid");
  const selected = options.reviews.items.filter((item) => item.reviewStatus === "approved" && item.approvedUses.includes("host-art"))
    .sort((left, right) => left.sortIndex - right.sortIndex);
  const verified = [];
  // Verify every selected source before creating output, including staging.
  for (const review of selected) {
    const item = options.inventory.inventory.find((candidate) => candidate.role === "source" && candidate.sourceKey === options.reviews.sourceKey && candidate.originalName === review.originalName)!;
    const source = options.sources[item.sourceKey];
    if (!source || item.sourceKey !== "creator-vip-nieun") throw new Error(`vip_source_missing_or_forbidden:${item.sourceKey}`);
    verified.push({ review, item, bytes: await readVerified(item, source) });
  }
  const packRoot = resolve(options.out, "temerosa-vip"), output = resolve(packRoot, options.version);
  const staging = `${output}.building`, backup = `${output}.previous`;
  for (const target of [output, staging, backup]) {
    if (!target.startsWith(`${packRoot}${sep}`) || dirname(target) !== packRoot) throw new Error(`vip_output_path_escape:${target}`);
  }
  // A leftover backup requires recovery, never silently discard an earlier pack.
  const { existsSync } = await import("node:fs");
  if (existsSync(backup)) throw new Error(`vip_output_backup_exists:${backup}`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(resolve(staging, "assets"), { recursive: true });
  try {
    const assets: VipAsset[] = [];
    for (const { review, item, bytes } of verified) {
      const id = `nieun-vip-${item.sha256.slice(0, 24)}`, relative = `assets/${id}.webp`;
      const encoded = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate()
        .resize({ height: 1536, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 5 }).toBuffer({ resolveWithObject: true });
      await writeFile(resolve(staging, relative), encoded.data);
      assets.push({
        id, characterId: "nieun", use: "host-art", sortIndex: review.sortIndex, expressionGroup: review.expressionGroup,
        backgroundNote: review.backgroundNote ?? null, sourceKey: "creator-vip-nieun", originalName: item.originalName,
        sourceSha256: item.sha256, sourceWidth: item.width, sourceHeight: item.height, postImplementationReview: review.postImplementationReview,
        table: { path: relative, mime: "image/webp", width: encoded.info.width, height: encoded.info.height, bytes: encoded.data.byteLength, sha256: sha256(encoded.data) },
      });
    }
    const manifest: VipAssetManifest = {
      contract: "temerosa-vip-asset-pack/0.1", version: options.version, sourceKey: "creator-vip-nieun", characterId: "nieun", generatedAt: new Date().toISOString(),
      policy: { crop: false, tiers: ["table"], thumb: false, gallery: false, vipOnly: true, emotionSlots: false, bacikalExcluded: true, originalsRedistributed: false },
      display: { maxHeight: 1536, fit: "inside", quality: 82 },
      totals: { queueEntries: options.reviews.items.length, approvedEntries: selected.length, assets: assets.length, bytes: assets.reduce((sum, item) => sum + item.table.bytes, 0) },
      assets,
    };
    assertManifest(manifest);
    if (assets.some((asset) => asset.table.bytes > 600 * 1024) || manifest.totals.bytes > 4 * 1024 * 1024) throw new Error("vip_pack_budget_exceeded");
    await writeFile(resolve(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    let previous = false;
    try { await rename(output, backup); previous = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await rename(staging, output); }
    catch (error) { if (previous) await rename(backup, output); throw error; }
    if (previous) await rm(backup, { recursive: true, force: true });
    return manifest;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function readVerified(item: VipAssetCandidate, source: string): Promise<Buffer> {
  if (/^바치칼.*\.png$/iu.test(item.originalName.normalize("NFC")) || !/^[^\\/:]+\.png$/iu.test(item.originalName)) throw new Error(`vip_source_name_forbidden:${item.originalName}`);
  const bytes = await readFile(resolve(source, item.originalName));
  if (sha256(bytes) !== item.sha256 || bytes.byteLength !== item.bytes) throw new Error(`vip_source_drift:${item.sourceKey}:${item.originalName}`);
  const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (metadata.width !== item.width || metadata.height !== item.height) throw new Error(`vip_source_dimensions_drift:${item.originalName}`);
  return bytes;
}

function parseArgs(values: string[]): Arguments {
  const sources: Record<string, string> = {}; let inventory = "", reviews = "", out = "", version = "";
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index], value = values[index + 1];
    if (key === "--") continue;
    if (!value || value.startsWith("--")) throw new Error(`vip_argument_value_missing:${key}`);
    if (key === "--inventory") inventory = value;
    else if (key === "--reviews") reviews = value;
    else if (key === "--out") out = value;
    else if (key === "--version") version = value;
    else if (key === "--source") {
      const separator = value.indexOf("=");
      if (separator < 1 || separator === value.length - 1 || sources[value.slice(0, separator)]) throw new Error("vip_source_argument_invalid");
      sources[value.slice(0, separator)] = value.slice(separator + 1);
    } else throw new Error(`vip_argument_unknown:${key}`);
    index += 1;
  }
  if (!inventory || !reviews || !out || version !== "0.1.0" || Object.keys(sources).length !== 1 || !sources["creator-vip-nieun"]) throw new Error("usage: --source creator-vip-nieun=<dir> --inventory <json> --reviews <json> --out <public-content> --version 0.1.0");
  return { sources, inventory, reviews, out, version };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2)), root = process.env.INIT_CWD ?? process.cwd();
  const inventory = JSON.parse(await readFile(resolve(root, args.inventory), "utf8")) as VipInventoryReport;
  const reviews = JSON.parse(await readFile(resolve(root, args.reviews), "utf8")) as VipReviewQueue;
  const manifest = await compileVipAssets({ ...args, sources: Object.fromEntries(Object.entries(args.sources).map(([key, path]) => [key, resolve(root, path)])), inventory, reviews, out: resolve(root, args.out) });
  process.stdout.write(`${JSON.stringify({ output: resolve(root, args.out, "temerosa-vip", args.version), ...manifest.totals }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1;
});
