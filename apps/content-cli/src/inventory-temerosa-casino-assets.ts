import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { openAssetResolver, parseCardSource, type AssetResolver } from "@lucky-arcade/card-io";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import sharp from "sharp";
import { TEMEROSA_FORBIDDEN_ASSET_NAME } from "./temerosa-policy.ts";
import {
  CASINO_GEOMETRY_QUEUES,
  CASINO_SOURCE_CARD_IDS,
  assertCasinoReviewQueue,
  assertInventoryShape,
  casinoGeometryQueue,
  normalizeCasinoAssetName,
  normalizeCasinoPath,
  sourcePathMime,
  type CasinoAssetCandidate,
  type CasinoGeometryQueue,
  type CasinoInventoryReport,
  type CasinoSourceKey,
  type CasinoReviewQueue,
} from "./temerosa-casino-assets.ts";

const MAX_INPUT_PIXELS = 40_000_000;
const PERCEPTUAL_THRESHOLD = 5;

type Arguments = { sources: Record<CasinoSourceKey, string>; out: string; reviews?: string };

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const invocationRoot = process.env.INIT_CWD ?? process.cwd();
  const resolvers = {} as Record<CasinoSourceKey, AssetResolver>;
  const sourceNames = {} as Record<CasinoSourceKey, string>;
  const inventory: CasinoAssetCandidate[] = [];
  try {
    for (const [sourceKey, path] of Object.entries(args.sources) as [CasinoSourceKey, string][]) {
      const cardSource = await NodeFileSource.open(path);
      sourceNames[sourceKey] = (await parseCardSource(cardSource)).name;
      resolvers[sourceKey] = await openAssetResolver(await NodeFileSource.open(path));
    }

    for (const sourceKey of Object.keys(resolvers) as CasinoSourceKey[]) {
      const resolver = resolvers[sourceKey];
      for (const asset of resolver.assets) {
        if (!asset.mime.startsWith("image/") && !/\.(?:png|jpe?g|webp|gif|avif)$/iu.test(asset.path ?? "")) continue;
        const sourceEntryPath = normalizeCasinoPath(asset.path ?? "");
        const resolved = await resolver.read(asset.id);
        const metadata = await sharp(resolved.bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
        if (!metadata.width || !metadata.height) throw new Error(`casino_source_dimensions_missing:${sourceKey}:${sourceEntryPath}`);
        const detectedMime = resolved.mime;
        const pathMime = sourcePathMime(sourceEntryPath);
        const forbidden = TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.name) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(sourceEntryPath);
        inventory.push({
          sourceCardId: CASINO_SOURCE_CARD_IDS[sourceKey],
          sourceCardName: sourceNames[sourceKey],
          sourceEntryPath,
          originalName: asset.name,
          byteHash: createHash("sha256").update(resolved.bytes).digest("hex"),
          perceptualHash: await differenceHash(resolved.bytes),
          detectedMime,
          ...(pathMime ? { sourcePathMime: pathMime } : {}),
          sourcePathMimeMismatch: pathMime !== undefined && pathMime !== detectedMime,
          bytes: resolved.bytes.byteLength,
          width: metadata.width,
          height: metadata.height,
          normalizedName: normalizeCasinoAssetName(asset.name),
          geometryQueue: casinoGeometryQueue(metadata.width, metadata.height),
          semanticTags: [],
          semanticStatus: forbidden ? "rejected" : "unreviewed",
          approvedUses: [],
          ...(forbidden ? { reviewEvidence: "automatic rejection: explicit forbidden-state name policy; no semantic approval inferred" } : {}),
        });
      }
      process.stderr.write(`casino_inventory_source_complete:${sourceKey}:${inventory.filter((item) => item.sourceCardId === CASINO_SOURCE_CARD_IDS[sourceKey]).length}\n`);
    }

    assignByteDuplicateGroups(inventory);
    assignPerceptualCandidateGroups(inventory);
    inventory.sort((left, right) => left.sourceCardId.localeCompare(right.sourceCardId) || left.sourceEntryPath.localeCompare(right.sourceEntryPath));
    if (args.reviews) {
      const baseReport = buildReport(inventory, sourceNames);
      const reviews = JSON.parse(await readFile(resolve(invocationRoot, args.reviews), "utf8")) as CasinoReviewQueue;
      assertCasinoReviewQueue(reviews, baseReport);
      applyReviewDecisions(inventory, reviews);
    }
    const report = buildReport(inventory, sourceNames);
    assertInventoryShape(report);
    const output = resolve(invocationRoot, args.out);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ output, ...report.totals, geometryQueues: report.geometryQueues }, null, 2)}\n`);
  } finally {
    for (const resolver of Object.values(resolvers)) resolver?.dispose();
  }
}

function applyReviewDecisions(inventory: CasinoAssetCandidate[], reviews: CasinoReviewQueue): void {
  const byLocator = new Map(inventory.map((item) => [`${item.sourceCardId}:${normalizeCasinoPath(item.sourceEntryPath)}`, item]));
  for (const review of reviews.items) {
    const item = byLocator.get(`${review.sourceCardId}:${normalizeCasinoPath(review.sourceEntryPath)}`)!;
    item.semanticStatus = review.semanticStatus;
    item.approvedUses = [...review.approvedUses];
    if (review.appearanceSet) item.appearanceSet = review.appearanceSet;
    else delete item.appearanceSet;
    if (review.reviewEvidence) item.reviewEvidence = review.reviewEvidence;
    else if (review.semanticStatus !== "rejected") delete item.reviewEvidence;
  }
}

function buildReport(inventory: CasinoAssetCandidate[], sourceNames: Record<CasinoSourceKey, string>): CasinoInventoryReport {
  const byteGroups = new Set(inventory.map((item) => item.byteDuplicateGroup).filter((value): value is string => Boolean(value)));
  const perceptualGroups = new Set(inventory.map((item) => item.perceptualGroup).filter((value): value is string => Boolean(value)));
  const geometryQueues = Object.fromEntries(CASINO_GEOMETRY_QUEUES.map((queue) => [queue, inventory.filter((item) => item.geometryQueue === queue).length])) as Record<CasinoGeometryQueue, number>;
  return {
    contract: "temerosa-casino-asset-inventory/1.0",
    generatedAt: new Date().toISOString(),
    sources: (Object.keys(CASINO_SOURCE_CARD_IDS) as CasinoSourceKey[]).map((sourceKey) => {
      const entries = inventory.filter((item) => item.sourceCardId === CASINO_SOURCE_CARD_IDS[sourceKey]);
      return { sourceCardId: CASINO_SOURCE_CARD_IDS[sourceKey], sourceCardName: sourceNames[sourceKey], entries: entries.length, bytes: entries.reduce((sum, item) => sum + item.bytes, 0) };
    }),
    duplicatePolicy: { byteHash: "sha256", perceptualHash: "dhash-64", perceptualThreshold: PERCEPTUAL_THRESHOLD, perceptualGroupsAreCandidatesOnly: true },
    totals: {
      entries: inventory.length,
      bytes: inventory.reduce((sum, item) => sum + item.bytes, 0),
      unreviewed: inventory.filter((item) => item.semanticStatus === "unreviewed").length,
      approved: inventory.filter((item) => item.semanticStatus === "approved").length,
      rejected: inventory.filter((item) => item.semanticStatus === "rejected").length,
      byteDuplicateEntries: inventory.filter((item) => item.byteDuplicateGroup).length,
      byteDuplicateGroups: byteGroups.size,
      perceptualCandidateEntries: inventory.filter((item) => item.perceptualGroup).length,
      perceptualCandidateGroups: perceptualGroups.size,
      sourcePathMimeMismatches: inventory.filter((item) => item.sourcePathMimeMismatch).length,
    },
    geometryQueues,
    inventory,
  };
}

function assignByteDuplicateGroups(inventory: CasinoAssetCandidate[]): void {
  const byHash = groupIndexes(inventory, (item) => item.byteHash);
  let number = 0;
  for (const indexes of byHash.values()) {
    if (indexes.length < 2) continue;
    number += 1;
    const group = `sha256-${String(number).padStart(4, "0")}`;
    for (const index of indexes) inventory[index]!.byteDuplicateGroup = group;
  }
}

function assignPerceptualCandidateGroups(inventory: CasinoAssetCandidate[]): void {
  const parents = inventory.map((_, index) => index);
  const find = (value: number): number => {
    let root = value;
    while (parents[root] !== root) root = parents[root]!;
    while (parents[value] !== value) {
      const next = parents[value]!;
      parents[value] = root;
      value = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left), rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  for (let left = 0; left < inventory.length; left += 1) {
    for (let right = left + 1; right < inventory.length; right += 1) {
      if (inventory[left]!.byteHash === inventory[right]!.byteHash) continue;
      if (hamming(inventory[left]!.perceptualHash, inventory[right]!.perceptualHash) <= PERCEPTUAL_THRESHOLD) union(left, right);
    }
  }
  const components = groupIndexes(inventory, (_, index) => String(find(index)));
  let number = 0;
  for (const indexes of components.values()) {
    if (indexes.length < 2) continue;
    number += 1;
    const group = `dhash-${String(number).padStart(4, "0")}`;
    for (const index of indexes) inventory[index]!.perceptualGroup = group;
  }
}

function groupIndexes<T>(values: readonly T[], key: (value: T, index: number) => string): Map<string, number[]> {
  const output = new Map<string, number[]>();
  values.forEach((value, index) => {
    const groupKey = key(value, index);
    const indexes = output.get(groupKey) ?? [];
    indexes.push(index);
    output.set(groupKey, indexes);
  });
  return output;
}

async function differenceHash(bytes: Uint8Array): Promise<string> {
  const pixels = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) bits += pixels[row * 9 + column]! > pixels[row * 9 + column + 1]! ? "1" : "0";
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

function hamming(left: string, right: string): number {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) { count += Number(value & 1n); value >>= 1n; }
  return count;
}

function parseArgs(values: string[]): Arguments {
  const sources = {} as Record<CasinoSourceKey, string>;
  let out = "", reviews: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index], value = values[index + 1];
    if (!key || !value) continue;
    if (key === "--out") out = value;
    else if (key === "--reviews") reviews = value;
    else if (key.startsWith("--") && Object.prototype.hasOwnProperty.call(CASINO_SOURCE_CARD_IDS, key.slice(2))) sources[key.slice(2) as CasinoSourceKey] = value;
    else continue;
    index += 1;
  }
  const missing = (Object.keys(CASINO_SOURCE_CARD_IDS) as CasinoSourceKey[]).filter((key) => !sources[key]);
  if (!out || missing.length > 0) throw new Error(`usage: five source arguments --out <inventory.json>; missing:${missing.join(",")}`);
  return { sources, out, ...(reviews ? { reviews } : {}) };
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
