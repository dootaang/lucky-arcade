import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sniffDisplayImageMime } from "@lucky-arcade/card-io";
import sharp from "sharp";
import { sourcePathMime } from "./temerosa-casino-assets.ts";
import {
  assertInventoryShape, assertReviewQueue, differenceHash, hamming, sha256, vipGeometry,
  type VipAssetCandidate, type VipInventoryReport, type VipReviewQueue,
} from "./temerosa-vip-assets.ts";

const MAX_INPUT_PIXELS = 40_000_000;
const PERCEPTUAL_THRESHOLD = 5;
type InventoryOptions = { sources: Record<string, string>; compares?: Record<string, string>; reviews?: VipReviewQueue };
type Arguments = { sources: Record<string, string>; compares: Record<string, string>; reviews?: string; out: string };

export async function inventoryVipAssets(options: InventoryOptions): Promise<VipInventoryReport> {
  if (Object.keys(options.sources).length === 0) throw new Error("vip_inventory_sources_missing");
  const inventory: VipAssetCandidate[] = [];
  let excludedByPolicy = 0;
  for (const [role, folders] of [["source", options.sources], ["compare", options.compares ?? {}]] as const) {
    for (const [sourceKey, folder] of Object.entries(folders)) {
      if (!sourceKey) throw new Error("vip_inventory_source_key_missing");
      const names: string[] = [];
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.png$/iu.test(entry.name)) continue;
        // Enforce exclusion before reading any bytes, metadata, or hashes.
        if (/^바치칼.*\.png$/iu.test(entry.name.normalize("NFC"))) { excludedByPolicy += 1; continue; }
        names.push(entry.name);
      }
      names.sort((left, right) => left.localeCompare(right));
      for (const [index, originalName] of names.entries()) {
        const bytes = await readFile(resolve(folder, originalName));
        const detectedMime = sniffDisplayImageMime(bytes);
        if (!detectedMime) throw new Error(`vip_source_mime_invalid:${sourceKey}:${originalName}`);
        const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
        if (!metadata.width || !metadata.height) throw new Error(`vip_source_dimensions_missing:${sourceKey}:${originalName}`);
        inventory.push({
          role, sourceKey, originalName, sortIndex: index + 1, bytes: bytes.byteLength,
          sha256: sha256(bytes), perceptualHash: await differenceHash(bytes), width: metadata.width, height: metadata.height,
          detectedMime, sourcePathMimeMismatch: sourcePathMime(originalName) !== detectedMime, geometry: vipGeometry(metadata.width, metadata.height),
          exactDuplicateGroup: null, perceptualGroup: null, reviewStatus: "unreviewed", approvedUses: [], expressionGroup: null,
          backgroundNote: null, postImplementationReview: "n/a",
        });
      }
    }
  }
  assignByteDuplicateGroups(inventory);
  assignPerceptualCandidateGroups(inventory);
  if (options.reviews) {
    assertReviewQueue(options.reviews, buildReport(inventory, excludedByPolicy));
    applyReviewDecisions(inventory, options.reviews);
  }
  const report = buildReport(inventory, excludedByPolicy);
  assertInventoryShape(report);
  return report;
}

function applyReviewDecisions(inventory: VipAssetCandidate[], reviews: VipReviewQueue): void {
  for (const review of reviews.items) {
    const item = inventory.find((candidate) => candidate.role === "source" && candidate.sourceKey === reviews.sourceKey && candidate.originalName === review.originalName)!;
    item.reviewStatus = review.reviewStatus;
    item.approvedUses = [...review.approvedUses];
    item.expressionGroup = review.expressionGroup;
    item.backgroundNote = review.backgroundNote ?? null;
    item.postImplementationReview = review.postImplementationReview;
    if (review.reviewEvidence) item.reviewEvidence = review.reviewEvidence;
  }
}

function buildReport(inventory: VipAssetCandidate[], excludedByPolicy: number): VipInventoryReport {
  const sources = inventory.filter((item) => item.role === "source"), compares = inventory.filter((item) => item.role === "compare");
  const comparison: VipInventoryReport["comparison"] = [];
  for (const source of sources) {
    for (const compare of compares) {
      const byteIdentical = source.sha256 === compare.sha256, distance = hamming(source.perceptualHash, compare.perceptualHash);
      if (!byteIdentical && distance > PERCEPTUAL_THRESHOLD) continue;
      comparison.push({ sourceKey: source.sourceKey, originalName: source.originalName, sortIndex: source.sortIndex, compareSourceKey: compare.sourceKey, compareOriginalName: compare.originalName, byteIdentical, distance });
    }
  }
  return {
    contract: "temerosa-vip-asset-inventory/0.1", generatedAt: new Date().toISOString(),
    duplicatePolicy: { byteHash: "sha256", perceptualHash: "dhash-64", perceptualThreshold: PERCEPTUAL_THRESHOLD, perceptualGroupsAreCandidatesOnly: true },
    totals: {
      sourceEntries: sources.length, bytes: sources.reduce((sum, item) => sum + item.bytes, 0),
      byStatus: { unreviewed: sources.filter((item) => item.reviewStatus === "unreviewed").length, approved: sources.filter((item) => item.reviewStatus === "approved").length, rejected: sources.filter((item) => item.reviewStatus === "rejected").length },
      exactDuplicateGroups: new Set(inventory.map((item) => item.exactDuplicateGroup).filter(Boolean)).size,
      perceptualCandidateGroups: new Set(inventory.map((item) => item.perceptualGroup).filter(Boolean)).size,
      excludedByPolicy,
    },
    inventory, comparison,
  };
}

function assignByteDuplicateGroups(inventory: VipAssetCandidate[]): void {
  let number = 0;
  for (const indexes of groupIndexes(inventory, (item) => item.sha256).values()) {
    if (indexes.length < 2) continue;
    number += 1;
    for (const index of indexes) inventory[index]!.exactDuplicateGroup = `sha256-${String(number).padStart(4, "0")}`;
  }
}

function assignPerceptualCandidateGroups(inventory: VipAssetCandidate[]): void {
  const parents = inventory.map((_, index) => index);
  const find = (value: number): number => {
    let root = value;
    while (parents[root] !== root) root = parents[root]!;
    while (parents[value] !== value) { const next = parents[value]!; parents[value] = root; value = next; }
    return root;
  };
  for (let left = 0; left < inventory.length; left += 1) {
    for (let right = left + 1; right < inventory.length; right += 1) {
      if (inventory[left]!.sha256 === inventory[right]!.sha256) continue;
      if (hamming(inventory[left]!.perceptualHash, inventory[right]!.perceptualHash) <= PERCEPTUAL_THRESHOLD) {
        const leftRoot = find(left), rightRoot = find(right);
        if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
      }
    }
  }
  let number = 0;
  for (const indexes of groupIndexes(inventory, (_, index) => String(find(index))).values()) {
    if (indexes.length < 2) continue;
    number += 1;
    for (const index of indexes) inventory[index]!.perceptualGroup = `dhash-${String(number).padStart(4, "0")}`;
  }
}

function groupIndexes<T>(values: readonly T[], key: (value: T, index: number) => string): Map<string, number[]> {
  const output = new Map<string, number[]>();
  values.forEach((value, index) => { const groupKey = key(value, index), indexes = output.get(groupKey) ?? []; indexes.push(index); output.set(groupKey, indexes); });
  return output;
}

function parseArgs(values: string[]): Arguments {
  const sources: Record<string, string> = {}, compares: Record<string, string> = {};
  let out = "", reviews: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index], value = values[index + 1];
    if (key === "--") continue;
    if (!value || value.startsWith("--")) throw new Error(`vip_argument_value_missing:${key}`);
    if (key === "--out") out = value;
    else if (key === "--reviews") reviews = value;
    else if (key === "--source" || key === "--compare") {
      const separator = value.indexOf("="), target = key === "--source" ? sources : compares;
      if (separator < 1 || separator === value.length - 1 || Object.prototype.hasOwnProperty.call(target, value.slice(0, separator))) throw new Error("vip_source_argument_invalid");
      Object.defineProperty(target, value.slice(0, separator), { value: value.slice(separator + 1), enumerable: true, configurable: true, writable: true });
    } else throw new Error(`vip_argument_unknown:${key}`);
    index += 1;
  }
  if (!out || Object.keys(sources).length === 0) throw new Error("usage: --source key=<directory> [--compare key=<directory>] [--reviews <json>] --out <inventory.json>");
  return { sources, compares, out, ...(reviews ? { reviews } : {}) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2)), root = process.env.INIT_CWD ?? process.cwd();
  const reviews = args.reviews ? JSON.parse(await readFile(resolve(root, args.reviews), "utf8")) as VipReviewQueue : undefined;
  const report = await inventoryVipAssets({
    sources: Object.fromEntries(Object.entries(args.sources).map(([key, folder]) => [key, resolve(root, folder)])),
    compares: Object.fromEntries(Object.entries(args.compares).map(([key, folder]) => [key, resolve(root, folder)])),
    ...(reviews ? { reviews } : {}),
  });
  const output = resolve(root, args.out);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ output, ...report.totals }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1;
});
