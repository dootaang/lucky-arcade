import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { openAssetResolver, type AssetResolver } from "@lucky-arcade/card-io";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import sharp, { type Sharp } from "sharp";
import {
  CASINO_SOURCE_CARD_IDS,
  CASINO_SOURCE_KEYS_BY_CARD_ID,
  assertCasinoPackBudget,
  assertCasinoReviewQueue,
  assertInventoryShape,
  inventoryLocator,
  normalizeCasinoPath,
  type CasinoAssetCandidate,
  type CasinoInventoryReport,
  type CasinoPackAsset,
  type CasinoPackManifest,
  type CasinoPackVariant,
  type CasinoReviewQueue,
  type CasinoReviewQueueItem,
  type CasinoSourceKey,
} from "./temerosa-casino-assets.ts";

const MAX_INPUT_PIXELS = 40_000_000;
const PACK_BY_USE = {
  "venue-hero": "temerosa-casino-venue",
  "slot-symbol": "temerosa-casino-slots",
  "table-art": "temerosa-casino-floor",
} as const;

type Arguments = { sources: Partial<Record<CasinoSourceKey, string>>; inventory: string; reviews: string; out: string; version: string };
type VariantPlan = { scale: CasinoPackVariant["scale"]; width: number; height: number; quality: number };

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = process.env.INIT_CWD ?? process.cwd();
  const inventory = JSON.parse(await readFile(resolve(root, args.inventory), "utf8")) as CasinoInventoryReport;
  const reviews = JSON.parse(await readFile(resolve(root, args.reviews), "utf8")) as CasinoReviewQueue;
  assertInventoryShape(inventory);
  assertCasinoReviewQueue(reviews, inventory);
  if (reviews.releaseState !== "approved" || reviews.items.some((item) => item.semanticStatus !== "approved")) throw new Error("casino_release_blocked_unreviewed_items");

  const inventoryByLocator = new Map(inventory.inventory.map((item) => [inventoryLocator(item), item]));
  for (const review of reviews.items) {
    const candidate = inventoryByLocator.get(`${review.sourceCardId}:${normalizeCasinoPath(review.sourceEntryPath)}`)!;
    if (candidate.semanticStatus !== "approved") throw new Error(`casino_inventory_item_not_approved:${review.id}`);
    if (!candidate.approvedUses.includes(review.intendedUse)) throw new Error(`casino_inventory_use_not_approved:${review.id}`);
    if (candidate.reviewEvidence !== review.reviewEvidence) throw new Error(`casino_review_evidence_drift:${review.id}`);
  }

  const sourceKeys = [...new Set(reviews.items.map((item) => CASINO_SOURCE_KEYS_BY_CARD_ID.get(item.sourceCardId)))];
  if (sourceKeys.some((key) => !key)) throw new Error("casino_review_source_card_unknown");
  const resolvers = {} as Partial<Record<CasinoSourceKey, AssetResolver>>;
  try {
    for (const sourceKey of sourceKeys as CasinoSourceKey[]) {
      const sourcePath = args.sources[sourceKey];
      if (!sourcePath) throw new Error(`casino_source_argument_missing:${sourceKey}`);
      resolvers[sourceKey] = await openAssetResolver(await NodeFileSource.open(sourcePath));
    }
    const manifests: CasinoPackManifest[] = [];
    for (const packId of Object.values(PACK_BY_USE)) {
      const items = reviews.items.filter((item) => PACK_BY_USE[item.intendedUse] === packId);
      const output = resolve(root, args.out, packId, args.version);
      const staging = `${output}.building`;
      await rm(staging, { recursive: true, force: true });
      await mkdir(staging, { recursive: true });
      try {
        const assets: CasinoPackAsset[] = [];
        for (const item of items) {
          const candidate = inventoryByLocator.get(`${item.sourceCardId}:${normalizeCasinoPath(item.sourceEntryPath)}`)!;
          const bytes = await readVerifiedSource(item, candidate, resolvers);
          const variants = await createVariants(staging, item, bytes);
          assets.push({
            id: item.id,
            use: item.intendedUse,
            displayName: item.requestedDisplayName,
            sourceCardId: item.sourceCardId,
            sourceEntryPath: item.sourceEntryPath,
            sourceByteHash: candidate.byteHash,
            reviewEvidence: item.reviewEvidence!,
            postImplementationReview: item.postImplementationReview === "accepted" ? "accepted" : "pending",
            cropFocus: item.cropFocus,
            ...(item.frequency ? { frequency: item.frequency } : {}),
            variants,
          });
        }
        const manifest: CasinoPackManifest = {
          contract: "temerosa-casino-asset-pack/1.0",
          packId,
          version: args.version,
          provenance: "docs/THIRD_PARTY_PROVENANCE.md#내장-콘텐츠-허가-확인",
          assets,
          totalBytes: assets.flatMap((asset) => asset.variants).reduce((sum, variant) => sum + variant.bytes, 0),
        };
        assertCasinoPackBudget(manifest);
        await writeFile(resolve(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        await rm(output, { recursive: true, force: true });
        await mkdir(dirname(output), { recursive: true });
        await cp(staging, output, { recursive: true, errorOnExist: true, force: false });
        await rm(staging, { recursive: true, force: true });
        manifests.push(manifest);
      } catch (error) {
        await rm(staging, { recursive: true, force: true });
        throw error;
      }
    }
    process.stdout.write(`${JSON.stringify({ status: "compiled", packs: manifests.map((manifest) => ({ packId: manifest.packId, assets: manifest.assets.length, files: manifest.assets.flatMap((asset) => asset.variants).length, bytes: manifest.totalBytes })) }, null, 2)}\n`);
  } finally {
    for (const resolver of Object.values(resolvers)) resolver?.dispose();
  }
}

async function readVerifiedSource(item: CasinoReviewQueueItem, candidate: CasinoAssetCandidate, resolvers: Partial<Record<CasinoSourceKey, AssetResolver>>): Promise<Uint8Array> {
  const sourceKey = CASINO_SOURCE_KEYS_BY_CARD_ID.get(item.sourceCardId);
  const resolver = sourceKey ? resolvers[sourceKey] : undefined;
  if (!resolver) throw new Error(`casino_source_not_open:${item.id}`);
  const matches = resolver.assets.filter((asset) => normalizeCasinoPath(asset.path ?? "") === normalizeCasinoPath(item.sourceEntryPath));
  if (matches.length !== 1) throw new Error(`casino_source_path_${matches.length === 0 ? "missing" : "ambiguous"}:${item.id}`);
  const resolved = await resolver.read(matches[0]!.id);
  const hash = createHash("sha256").update(resolved.bytes).digest("hex");
  if (hash !== candidate.byteHash || resolved.mime !== candidate.detectedMime || resolved.bytes.byteLength !== candidate.bytes) throw new Error(`casino_source_evidence_drift:${item.id}`);
  const metadata = await sharp(resolved.bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (metadata.width !== candidate.width || metadata.height !== candidate.height) throw new Error(`casino_source_geometry_drift:${item.id}`);
  return resolved.bytes;
}

async function createVariants(root: string, item: CasinoReviewQueueItem, source: Uint8Array): Promise<CasinoPackVariant[]> {
  const variants: CasinoPackVariant[] = [];
  for (const plan of variantPlans(item.intendedUse)) {
    const relative = `assets/${item.id}/${plan.scale}.webp`;
    const target = resolve(root, relative);
    await mkdir(dirname(target), { recursive: true });
    const pipeline = await focusedCrop(source, plan.width / plan.height, item.cropFocus);
    const result = await pipeline.resize(plan.width, plan.height, { fit: "fill" }).webp({ quality: plan.quality, alphaQuality: 90, effort: 5, smartSubsample: true }).toBuffer({ resolveWithObject: true });
    await writeFile(target, result.data);
    variants.push({ scale: plan.scale, path: relative, mime: "image/webp", width: result.info.width, height: result.info.height, bytes: result.data.byteLength, sha256: createHash("sha256").update(result.data).digest("hex") });
  }
  return variants;
}

async function focusedCrop(source: Uint8Array, targetRatio: number, focus: { x: number; y: number }): Promise<Sharp> {
  const rotated = sharp(source, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const metadata = await rotated.metadata();
  const width = metadata.width!, height = metadata.height!, ratio = width / height;
  if (Math.abs(ratio - targetRatio) < 0.001) return rotated;
  if (ratio > targetRatio) {
    const cropWidth = Math.max(1, Math.round(height * targetRatio));
    const left = Math.max(0, Math.min(width - cropWidth, Math.round(focus.x * width - cropWidth / 2)));
    return rotated.extract({ left, top: 0, width: cropWidth, height });
  }
  const cropHeight = Math.max(1, Math.round(width / targetRatio));
  const top = Math.max(0, Math.min(height - cropHeight, Math.round(focus.y * height - cropHeight / 2)));
  return rotated.extract({ left: 0, top, width, height: cropHeight });
}

function variantPlans(use: CasinoReviewQueueItem["intendedUse"]): readonly VariantPlan[] {
  if (use === "venue-hero") return [{ scale: "sm", width: 640, height: 360, quality: 72 }, { scale: "md", width: 1280, height: 720, quality: 74 }];
  if (use === "slot-symbol") return [{ scale: "1x", width: 128, height: 128, quality: 80 }, { scale: "2x", width: 256, height: 256, quality: 82 }];
  return [{ scale: "md", width: 960, height: 540, quality: 68 }];
}

function parseArgs(values: string[]): Arguments {
  const sources: Partial<Record<CasinoSourceKey, string>> = {};
  let inventory = "", reviews = "", out = "", version = "";
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index], value = values[index + 1];
    if (!key || !value) continue;
    if (key === "--inventory") inventory = value;
    else if (key === "--reviews") reviews = value;
    else if (key === "--out") out = value;
    else if (key === "--version") version = value;
    else if (key.startsWith("--") && Object.prototype.hasOwnProperty.call(CASINO_SOURCE_CARD_IDS, key.slice(2))) sources[key.slice(2) as CasinoSourceKey] = value;
    else continue;
    index += 1;
  }
  if (!inventory || !reviews || !out || !/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("usage: --inventory <json> --reviews <json> --out <root> --version <semver> [source arguments]");
  return { sources, inventory, reviews, out, version };
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
