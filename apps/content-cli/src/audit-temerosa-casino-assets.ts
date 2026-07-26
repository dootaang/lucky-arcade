import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { sniffDisplayImageMime } from "@lucky-arcade/card-io";
import sharp from "sharp";
import { TEMEROSA_FORBIDDEN_ASSET_NAME } from "./temerosa-policy.ts";
import {
  assertCasinoReviewQueue,
  assertCasinoPackBudget,
  assertInventoryShape,
  countReviewUses,
  inventoryLocator,
  normalizeCasinoPath,
  type CasinoInventoryReport,
  type CasinoPackManifest,
  type CasinoReviewQueue,
} from "./temerosa-casino-assets.ts";

const MAX_DERIVED_PIXELS = 1_000_000;
const REQUIRED_PACKS = new Set(["temerosa-casino-venue", "temerosa-casino-slots", "temerosa-casino-floor"]);

const execFileAsync = promisify(execFile);

type Arguments = { inventory: string; reviews: string; packs: string[]; publicRoot?: string };

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = process.env.INIT_CWD ?? process.cwd();
  const inventory = JSON.parse(await readFile(resolve(root, args.inventory), "utf8")) as CasinoInventoryReport;
  const reviews = JSON.parse(await readFile(resolve(root, args.reviews), "utf8")) as CasinoReviewQueue;
  assertInventoryShape(inventory);
  assertCasinoReviewQueue(reviews, inventory);
  await assertNoTrackedSourceArchives(root);

  const discoveredPacks = args.publicRoot ? await discoverCasinoPackManifests(resolve(root, args.publicRoot)) : [];
  const packArguments = [...new Set([...args.packs, ...discoveredPacks])];

  const inventoryByLocator = new Map(inventory.inventory.map((item) => [inventoryLocator(item), item]));
  const reviewById = new Map(reviews.items.map((item) => [item.id, item]));
  const packSummaries: { packId: string; assets: number; files: number; bytes: number }[] = [];
  let deployedAssets = 0, deployedFiles = 0, deployedBytes = 0;
  const seenPacks = new Set<string>();

  if (packArguments.length > 0 && reviews.items.some((item) => item.semanticStatus !== "approved")) throw new Error("casino_public_pack_contains_or_depends_on_unreviewed_items");
  for (const argument of packArguments) {
    const manifestPath = resolve(root, argument);
    const manifestRoot = dirname(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CasinoPackManifest;
    if (manifest.contract !== "temerosa-casino-asset-pack/1.0") throw new Error(`casino_pack_contract_invalid:${argument}`);
    if (!REQUIRED_PACKS.has(manifest.packId) || seenPacks.has(manifest.packId)) throw new Error(`casino_pack_id_invalid_or_duplicate:${manifest.packId}`);
    seenPacks.add(manifest.packId);
    if (!/^\d+\.\d+\.\d+$/u.test(manifest.version)) throw new Error(`casino_pack_version_invalid:${manifest.packId}`);
    assertCasinoPackBudget(manifest);
    let actualBytes = 0, actualFiles = 0;
    const paths = new Set<string>();
    for (const asset of manifest.assets) {
      const review = reviewById.get(asset.id);
      if (!review || review.semanticStatus !== "approved") throw new Error(`casino_pack_asset_not_approved:${asset.id}`);
      if (!review.approvedUses.includes(asset.use) || review.intendedUse !== asset.use) throw new Error(`casino_pack_asset_use_not_approved:${asset.id}`);
      const inventoryItem = inventoryByLocator.get(`${asset.sourceCardId}:${normalizeCasinoPath(asset.sourceEntryPath)}`);
      if (!inventoryItem || inventoryItem.semanticStatus !== "approved" || !inventoryItem.approvedUses.includes(asset.use)) throw new Error(`casino_pack_inventory_use_not_approved:${asset.id}`);
      if (asset.sourceByteHash !== inventoryItem.byteHash || asset.reviewEvidence !== review.reviewEvidence || asset.reviewEvidence !== inventoryItem.reviewEvidence) throw new Error(`casino_pack_source_evidence_mismatch:${asset.id}`);
      if (TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.id) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.displayName) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.sourceEntryPath)) throw new Error(`casino_pack_forbidden_asset:${asset.id}`);
      if (asset.use === "slot-symbol" && (!asset.frequency || !asset.frequency.evidence.trim())) throw new Error(`casino_pack_slot_frequency_evidence_missing:${asset.id}`);
      for (const variant of asset.variants) {
        if (variant.mime !== "image/webp" || !variant.path.endsWith(".webp")) throw new Error(`casino_pack_variant_mime_or_extension_invalid:${variant.path}`);
        if (paths.has(variant.path)) throw new Error(`casino_pack_variant_path_duplicate:${variant.path}`);
        paths.add(variant.path);
        const path = resolve(manifestRoot, variant.path);
        if (!path.startsWith(`${manifestRoot}${sep}`)) throw new Error(`casino_pack_path_escape:${variant.path}`);
        if (TEMEROSA_FORBIDDEN_ASSET_NAME.test(variant.path)) throw new Error(`casino_pack_forbidden_path:${variant.path}`);
        const info = await stat(path);
        const bytes = await readFile(path);
        const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_DERIVED_PIXELS }).metadata();
        if (info.size !== variant.bytes || createHash("sha256").update(bytes).digest("hex") !== variant.sha256) throw new Error(`casino_pack_variant_hash_or_size_mismatch:${variant.path}`);
        if (sniffDisplayImageMime(bytes) !== variant.mime) throw new Error(`casino_pack_variant_actual_mime_mismatch:${variant.path}`);
        if (metadata.width !== variant.width || metadata.height !== variant.height || variant.width * variant.height > MAX_DERIVED_PIXELS) throw new Error(`casino_pack_variant_pixel_limit_or_geometry_mismatch:${variant.path}`);
        actualBytes += info.size;
        actualFiles += 1;
      }
    }
    if (actualBytes !== manifest.totalBytes) throw new Error(`casino_pack_total_bytes_mismatch:${manifest.packId}`);
    deployedAssets += manifest.assets.length;
    deployedFiles += actualFiles;
    deployedBytes += actualBytes;
    packSummaries.push({ packId: manifest.packId, assets: manifest.assets.length, files: actualFiles, bytes: actualBytes });
  }
  if (packArguments.length > 0 && (seenPacks.size !== REQUIRED_PACKS.size || [...REQUIRED_PACKS].some((pack) => !seenPacks.has(pack)))) throw new Error("casino_release_pack_set_incomplete");

  const approved = reviews.items.filter((item) => item.semanticStatus === "approved").length;
  const candidateUses = countReviewUses(reviews);
  const reviewQueueSourceBytes = reviews.items.reduce((sum, item) => sum + inventoryByLocator.get(`${item.sourceCardId}:${normalizeCasinoPath(item.sourceEntryPath)}`)!.bytes, 0);
  const approvedSourceBytes = reviews.items.filter((item) => item.semanticStatus === "approved").reduce((sum, item) => sum + inventoryByLocator.get(`${item.sourceCardId}:${normalizeCasinoPath(item.sourceEntryPath)}`)!.bytes, 0);
  const unreviewedSourceBytes = reviews.items.filter((item) => item.semanticStatus === "unreviewed").reduce((sum, item) => sum + inventoryByLocator.get(`${item.sourceCardId}:${normalizeCasinoPath(item.sourceEntryPath)}`)!.bytes, 0);
  process.stdout.write(`${JSON.stringify({
    status: "pass",
    mode: packArguments.length === 0 ? "candidate-only" : "release",
    releaseReady: reviews.releaseState === "approved" && approved === reviews.items.length,
    inventory: {
      entries: inventory.totals.entries,
      bytes: inventory.totals.bytes,
      unreviewed: inventory.totals.unreviewed,
      unreviewedBytes: inventory.inventory.filter((item) => item.semanticStatus === "unreviewed").reduce((sum, item) => sum + item.bytes, 0),
      approved: inventory.totals.approved,
      approvedBytes: inventory.inventory.filter((item) => item.semanticStatus === "approved").reduce((sum, item) => sum + item.bytes, 0),
      rejected: inventory.totals.rejected,
      rejectedBytes: inventory.inventory.filter((item) => item.semanticStatus === "rejected").reduce((sum, item) => sum + item.bytes, 0),
      byteDuplicateGroups: inventory.totals.byteDuplicateGroups,
      perceptualCandidateGroups: inventory.totals.perceptualCandidateGroups,
      sourcePathMimeMismatches: inventory.totals.sourcePathMimeMismatches,
    },
    reviewQueue: { candidates: reviews.items.length, sourceBytes: reviewQueueSourceBytes, approved, approvedSourceBytes, unreviewed: reviews.items.filter((item) => item.semanticStatus === "unreviewed").length, unreviewedSourceBytes, rejected: reviews.items.filter((item) => item.semanticStatus === "rejected").length, byUse: candidateUses },
    deployment: { packs: packSummaries.length, assets: deployedAssets, files: deployedFiles, bytes: deployedBytes, details: packSummaries },
  }, null, 2)}\n`);
}

async function assertNoTrackedSourceArchives(root: string): Promise<void> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const forbidden = stdout.split("\0").filter((path) => path && (/\.(?:charx|risum|risup)$/iu.test(path) || path.split("/").some((part) => part.startsWith(".tmp-"))));
  if (forbidden.length > 0) throw new Error(`casino_tracked_source_or_temporary_forbidden:${forbidden.join(",")}`);
}

async function discoverCasinoPackManifests(publicRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(publicRoot, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name === "manifest.json" && entry.parentPath.split(/[\\/]/u).some((part) => part.startsWith("temerosa-casino-")))
      .map((entry) => resolve(entry.parentPath, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function parseArgs(values: string[]): Arguments {
  let inventory = "", reviews = "", publicRoot: string | undefined;
  const packs: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index], value = values[index + 1];
    if (!key || !value) continue;
    if (key === "--inventory") inventory = value;
    else if (key === "--reviews") reviews = value;
    else if (key === "--pack") packs.push(value);
    else if (key === "--public-root") publicRoot = value;
    else continue;
    index += 1;
  }
  if (!inventory || !reviews) throw new Error("usage: --inventory <json> --reviews <json> [--pack <manifest.json>]...");
  return { inventory, reviews, packs, ...(publicRoot ? { publicRoot } : {}) };
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
