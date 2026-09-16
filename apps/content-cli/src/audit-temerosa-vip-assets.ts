import { execFile } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { sniffDisplayImageMime } from "@lucky-arcade/card-io";
import sharp from "sharp";
import {
  assertInventoryShape, assertManifest, assertReviewQueue, sha256,
  type VipAssetManifest, type VipInventoryReport, type VipReviewQueue,
} from "./temerosa-vip-assets.ts";

const execFileAsync = promisify(execFile);
type Arguments = { publicRoot: string; version: string; inventory: string; reviews?: string };

export async function auditVipAssets(packRoot: string, reviews?: VipReviewQueue): Promise<{ assets: number; bytes: number }> {
  const manifest = JSON.parse(await readFile(resolve(packRoot, "manifest.json"), "utf8")) as VipAssetManifest;
  assertManifest(manifest);
  if (reviews) {
    assertReviewQueue(reviews);
    const approved = reviews.items.filter((item) => item.reviewStatus === "approved" && item.approvedUses.includes("host-art"));
    const hashes = new Set(approved.map((item) => item.sha256));
    if (hashes.size !== manifest.assets.length || manifest.assets.some((item) => !hashes.has(item.sourceSha256)) || manifest.totals.queueEntries !== reviews.items.length) throw new Error("vip_pack_approved_set_mismatch");
    for (const asset of manifest.assets) {
      const review = approved.find((item) => item.sha256 === asset.sourceSha256)!;
      if (asset.originalName !== review.originalName || asset.sortIndex !== review.sortIndex || asset.expressionGroup !== review.expressionGroup || asset.backgroundNote !== (review.backgroundNote ?? null) || asset.postImplementationReview !== review.postImplementationReview) throw new Error(`vip_pack_review_evidence_mismatch:${asset.id}`);
    }
  }
  const expected = new Set(manifest.assets.map((item) => item.table.path));
  for (const entry of await readdir(resolve(packRoot, "assets"), { withFileTypes: true })) {
    if (!entry.isFile() || !expected.has(`assets/${entry.name}`)) throw new Error(`vip_pack_unlisted_file:${entry.name}`);
  }
  const topLevel = await readdir(packRoot, { withFileTypes: true });
  if (topLevel.some((entry) => !((entry.name === "manifest.json" && entry.isFile()) || (entry.name === "assets" && entry.isDirectory())))) throw new Error("vip_pack_unlisted_root_file");
  let actualBytes = 0;
  for (const asset of manifest.assets) {
    const path = resolve(packRoot, asset.table.path), info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`vip_pack_file_invalid:${asset.table.path}`);
    const bytes = await readFile(path);
    if (sniffDisplayImageMime(bytes) !== "image/webp" || bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") throw new Error(`vip_pack_mime_mismatch:${asset.id}`);
    if (bytes.byteLength !== asset.table.bytes || sha256(bytes) !== asset.table.sha256) throw new Error(`vip_pack_hash_or_size_mismatch:${asset.id}`);
    const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
    if (metadata.width !== asset.table.width || metadata.height !== asset.table.height) throw new Error(`vip_pack_dimensions_mismatch:${asset.id}`);
    if (bytes.byteLength > 600 * 1024) throw new Error(`vip_pack_asset_budget_exceeded:${asset.id}`);
    actualBytes += bytes.byteLength;
  }
  if (actualBytes !== manifest.totals.bytes || actualBytes > 4 * 1024 * 1024) throw new Error("vip_pack_total_bytes_or_budget_mismatch");
  return { assets: manifest.assets.length, bytes: actualBytes };
}

export async function assertNoTrackedOriginals(root: string, inventory: VipInventoryReport): Promise<number> {
  assertInventoryShape(inventory);
  const hashes = new Set(inventory.inventory.map((item) => item.sha256));
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const paths = stdout.split("\0").filter(Boolean);
  let checked = 0;
  for (const path of paths) {
    if (path.split("/").some((part) => ["바니은", "바니걸", "딜러"].includes(part.normalize("NFC"))) || /(?:^|\/)바치칼[^/]*\.png$/iu.test(path.normalize("NFC"))) throw new Error(`vip_tracked_source_path_forbidden:${path}`);
    const bytes = await readFile(resolve(root, path));
    if (hashes.has(sha256(bytes))) throw new Error(`vip_tracked_original_bytes:${path}`);
    checked += 1;
  }
  return checked;
}

function parseArgs(values: string[]): Arguments {
  let publicRoot = "", version = "", inventory = "reports/temerosa-vip-asset-inventory.json", reviews: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index], value = values[index + 1];
    if (key === "--") continue;
    if (!value || value.startsWith("--")) throw new Error(`vip_argument_value_missing:${key}`);
    if (key === "--public-root") publicRoot = value;
    else if (key === "--version") version = value;
    else if (key === "--inventory") inventory = value;
    else if (key === "--reviews") reviews = value;
    else throw new Error(`vip_argument_unknown:${key}`);
    index += 1;
  }
  if (!publicRoot || version !== "0.1.0") throw new Error("usage: --public-root <content-dir> --version 0.1.0 [--reviews <json>] [--inventory <json>]");
  return { publicRoot, version, inventory, ...(reviews ? { reviews } : {}) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2)), root = process.env.INIT_CWD ?? process.cwd();
  const inventory = JSON.parse(await readFile(resolve(root, args.inventory), "utf8")) as VipInventoryReport;
  const reviews = args.reviews ? JSON.parse(await readFile(resolve(root, args.reviews), "utf8")) as VipReviewQueue : undefined;
  assertInventoryShape(inventory);
  if (reviews) assertReviewQueue(reviews, inventory);
  const deployment = await auditVipAssets(resolve(root, args.publicRoot, "temerosa-vip", args.version), reviews);
  const trackedFilesChecked = await assertNoTrackedOriginals(root, inventory);
  process.stdout.write(`${JSON.stringify({ contract: "temerosa-vip-asset-audit/0.1", status: "pass", ...deployment, trackedFilesChecked }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ contract: "temerosa-vip-asset-audit/0.1", status: "fail", error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`); process.exitCode = 1;
});
