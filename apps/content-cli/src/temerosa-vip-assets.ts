import { createHash } from "node:crypto";
import sharp from "sharp";
import { casinoGeometryQueue, sourcePathMime } from "./temerosa-casino-assets.ts";

export const VIP_EXPRESSION_GROUPS = ["sulky", "flustered", "weary", "smug", "back", "other"] as const;
export type VipExpressionGroup = (typeof VIP_EXPRESSION_GROUPS)[number];
export type VipReviewStatus = "unreviewed" | "approved" | "rejected";
export type VipPostImplementationReview = "pending" | "kept" | "replaced" | "n/a";
export type VipPolicy = { crop: false; thumb: false; gallery: false; vipOnly: true; emotionSlots: false; bacikalExcluded: true };
export type VipReviewQueueItem = {
  sortIndex: number;
  sha256: string;
  originalName: string;
  expressionGroup: VipExpressionGroup;
  backgroundNote?: string | null;
  reviewStatus: VipReviewStatus;
  approvedUses: "host-art"[];
  reviewEvidence?: string;
  postImplementationReview: VipPostImplementationReview;
};
export type VipReviewQueue = {
  contract: "temerosa-vip-review-queue/0.1";
  sourceKey: "creator-vip-nieun";
  characterId: "nieun";
  policy: VipPolicy;
  items: VipReviewQueueItem[];
};
export type VipAssetCandidate = {
  role: "source" | "compare";
  sourceKey: string;
  originalName: string;
  sortIndex: number;
  bytes: number;
  sha256: string;
  perceptualHash: string;
  width: number;
  height: number;
  detectedMime: string;
  sourcePathMimeMismatch: boolean;
  geometry: "portrait" | "square" | "landscape" | "other";
  exactDuplicateGroup: string | null;
  perceptualGroup: string | null;
  reviewStatus: VipReviewStatus;
  approvedUses: "host-art"[];
  expressionGroup: VipExpressionGroup | null;
  backgroundNote: string | null;
  reviewEvidence?: string;
  postImplementationReview: VipPostImplementationReview;
};
export type VipInventoryReport = {
  contract: "temerosa-vip-asset-inventory/0.1";
  generatedAt: string;
  duplicatePolicy: { byteHash: "sha256"; perceptualHash: "dhash-64"; perceptualThreshold: 5; perceptualGroupsAreCandidatesOnly: true };
  totals: {
    sourceEntries: number;
    bytes: number;
    byStatus: Record<VipReviewStatus, number>;
    exactDuplicateGroups: number;
    perceptualCandidateGroups: number;
    excludedByPolicy: number;
  };
  inventory: VipAssetCandidate[];
  comparison: { sourceKey: string; originalName: string; sortIndex: number; compareSourceKey: string; compareOriginalName: string; byteIdentical: boolean; distance: number }[];
};
export type VipAsset = {
  id: string;
  characterId: "nieun";
  use: "host-art";
  sortIndex: number;
  expressionGroup: VipExpressionGroup;
  backgroundNote: string | null;
  sourceKey: "creator-vip-nieun";
  originalName: string;
  sourceSha256: string;
  sourceWidth: number;
  sourceHeight: number;
  postImplementationReview: VipPostImplementationReview;
  table: { path: string; mime: "image/webp"; width: number; height: number; bytes: number; sha256: string };
};
export type VipAssetManifest = {
  contract: "temerosa-vip-asset-pack/0.1";
  version: "0.1.0";
  sourceKey: "creator-vip-nieun";
  characterId: "nieun";
  generatedAt: string;
  policy: VipPolicy & { tiers: ["table"]; originalsRedistributed: false };
  display: { maxHeight: 1536; fit: "inside"; quality: 82 };
  totals: { queueEntries: number; approvedEntries: number; assets: number; bytes: number };
  assets: VipAsset[];
};

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function differenceHash(bytes: Uint8Array): Promise<string> {
  const pixels = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) bits += pixels[row * 9 + column]! > pixels[row * 9 + column + 1]! ? "1" : "0";
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

export function hamming(left: string, right: string): number {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) { count += Number(value & 1n); value >>= 1n; }
  return count;
}

export function vipGeometry(width: number, height: number): VipAssetCandidate["geometry"] {
  const geometry = casinoGeometryQueue(width, height);
  return geometry === "card" ? "portrait" : geometry;
}

export function assertReviewQueue(queue: VipReviewQueue, inventory?: VipInventoryReport): void {
  assertNoEmotionSlots(queue);
  if (queue.contract !== "temerosa-vip-review-queue/0.1" || queue.sourceKey !== "creator-vip-nieun" || queue.characterId !== "nieun" || !Array.isArray(queue.items)) throw new Error("vip_review_queue_contract_invalid");
  assertPolicy(queue.policy);
  const names = new Set<string>(), indexes = new Set<number>(), hashes = new Set<string>();
  for (const item of queue.items) {
    assertSourceName(item.originalName);
    if (!isPositiveInteger(item.sortIndex) || indexes.has(item.sortIndex) || names.has(item.originalName) || !isSha256(item.sha256) || hashes.has(item.sha256)) throw new Error(`vip_review_identity_invalid_or_duplicate:${item.originalName}`);
    names.add(item.originalName); indexes.add(item.sortIndex); hashes.add(item.sha256);
    assertReviewFields(item);
    if (!VIP_EXPRESSION_GROUPS.includes(item.expressionGroup)) throw new Error(`vip_review_expression_invalid:${item.originalName}`);
    if (item.backgroundNote !== undefined && item.backgroundNote !== null && typeof item.backgroundNote !== "string") throw new Error(`vip_background_note_invalid:${item.originalName}`);
    if (inventory) {
      const candidate = inventory.inventory.find((value) => value.role === "source" && value.sourceKey === queue.sourceKey && value.originalName === item.originalName);
      if (!candidate) throw new Error(`vip_review_source_missing:${item.originalName}`);
      if (candidate.sha256 !== item.sha256 || candidate.sortIndex !== item.sortIndex) throw new Error(`vip_review_source_mismatch:${item.originalName}`);
    }
  }
}

export function assertInventoryShape(report: VipInventoryReport): void {
  assertNoEmotionSlots(report);
  if (report.contract !== "temerosa-vip-asset-inventory/0.1" || !Array.isArray(report.inventory) || !Array.isArray(report.comparison)) throw new Error("vip_inventory_contract_invalid");
  if (report.duplicatePolicy?.byteHash !== "sha256" || report.duplicatePolicy.perceptualHash !== "dhash-64" || report.duplicatePolicy.perceptualThreshold !== 5 || report.duplicatePolicy.perceptualGroupsAreCandidatesOnly !== true) throw new Error("vip_inventory_duplicate_policy_invalid");
  const locators = new Set<string>(), indexes = new Set<string>();
  for (const item of report.inventory) {
    assertSourceName(item.originalName);
    const locator = `${item.role}:${item.sourceKey}:${item.originalName}`, index = `${item.role}:${item.sourceKey}:${item.sortIndex}`;
    if (!item.sourceKey || !["source", "compare"].includes(item.role) || locators.has(locator) || indexes.has(index) || !isPositiveInteger(item.sortIndex)) throw new Error(`vip_inventory_identity_invalid:${locator}`);
    locators.add(locator); indexes.add(index);
    if (!isSha256(item.sha256) || !/^[a-f0-9]{16}$/u.test(item.perceptualHash)) throw new Error(`vip_inventory_hash_invalid:${locator}`);
    if (!isPositiveInteger(item.width) || !isPositiveInteger(item.height) || !isPositiveInteger(item.bytes)) throw new Error(`vip_inventory_dimensions_invalid:${locator}`);
    if (!/^image\/(?:png|jpeg|webp|gif|avif)$/u.test(item.detectedMime) || item.sourcePathMimeMismatch !== (sourcePathMime(item.originalName) !== item.detectedMime)) throw new Error(`vip_inventory_mime_invalid:${locator}`);
    if (item.geometry !== vipGeometry(item.width, item.height)) throw new Error(`vip_inventory_geometry_invalid:${locator}`);
    assertReviewFields(item);
    if (item.expressionGroup !== null && !VIP_EXPRESSION_GROUPS.includes(item.expressionGroup)) throw new Error(`vip_inventory_expression_invalid:${locator}`);
    if (item.role === "compare" && (item.reviewStatus !== "unreviewed" || item.approvedUses.length > 0)) throw new Error(`vip_compare_approval_forbidden:${locator}`);
  }
  const sources = report.inventory.filter((item) => item.role === "source");
  if (report.totals.sourceEntries !== sources.length || report.totals.bytes !== sources.reduce((sum, item) => sum + item.bytes, 0)) throw new Error("vip_inventory_totals_mismatch");
  for (const status of ["unreviewed", "approved", "rejected"] as const) if (report.totals.byStatus[status] !== sources.filter((item) => item.reviewStatus === status).length) throw new Error("vip_inventory_status_totals_mismatch");
  if (!Number.isInteger(report.totals.excludedByPolicy) || report.totals.excludedByPolicy < 0) throw new Error("vip_inventory_excluded_total_invalid");
  for (const field of ["exactDuplicateGroup", "perceptualGroup"] as const) {
    const groups = new Map<string, VipAssetCandidate[]>();
    for (const item of report.inventory) {
      if (item[field] === null) continue;
      if (typeof item[field] !== "string" || !item[field]) throw new Error("vip_inventory_duplicate_group_invalid");
      const group = groups.get(item[field]) ?? []; group.push(item); groups.set(item[field], group);
    }
    for (const group of groups.values()) {
      if (group.length < 2 || (field === "exactDuplicateGroup" ? new Set(group.map((item) => item.sha256)).size !== 1 : new Set(group.map((item) => item.sha256)).size < 2)) throw new Error("vip_inventory_duplicate_group_invalid");
    }
    if (groups.size !== report.totals[field === "exactDuplicateGroup" ? "exactDuplicateGroups" : "perceptualCandidateGroups"]) throw new Error("vip_inventory_duplicate_totals_mismatch");
  }
  const pairs = new Set<string>();
  for (const pair of report.comparison) {
    const source = sources.find((item) => item.sourceKey === pair.sourceKey && item.originalName === pair.originalName);
    const compare = report.inventory.find((item) => item.role === "compare" && item.sourceKey === pair.compareSourceKey && item.originalName === pair.compareOriginalName);
    const locator = JSON.stringify([pair.sourceKey, pair.originalName, pair.compareSourceKey, pair.compareOriginalName]);
    if (!source || !compare || pairs.has(locator) || source.sortIndex !== pair.sortIndex || pair.byteIdentical !== (source.sha256 === compare.sha256) || pair.distance !== hamming(source.perceptualHash, compare.perceptualHash) || (!pair.byteIdentical && pair.distance > 5)) throw new Error("vip_inventory_comparison_invalid");
    pairs.add(locator);
  }
}

export function assertManifest(manifest: VipAssetManifest): void {
  assertNoEmotionSlots(manifest);
  if (manifest.contract !== "temerosa-vip-asset-pack/0.1" || manifest.version !== "0.1.0" || manifest.sourceKey !== "creator-vip-nieun" || manifest.characterId !== "nieun" || !Array.isArray(manifest.assets)) throw new Error("vip_pack_contract_invalid");
  assertPolicy(manifest.policy);
  if (manifest.policy.originalsRedistributed !== false || !Array.isArray(manifest.policy.tiers) || manifest.policy.tiers.length !== 1 || manifest.policy.tiers[0] !== "table") throw new Error("vip_pack_policy_invalid");
  if (manifest.display?.maxHeight !== 1536 || manifest.display.fit !== "inside" || manifest.display.quality !== 82) throw new Error("vip_pack_display_invalid");
  const ids = new Set<string>(), hashes = new Set<string>(), indexes = new Set<number>();
  for (const asset of manifest.assets) {
    assertSourceName(asset.originalName);
    if (!isSha256(asset.sourceSha256) || asset.id !== `nieun-vip-${asset.sourceSha256.slice(0, 24)}` || ids.has(asset.id) || hashes.has(asset.sourceSha256) || indexes.has(asset.sortIndex) || !isPositiveInteger(asset.sortIndex)) throw new Error(`vip_pack_identity_invalid:${asset.id}`);
    ids.add(asset.id); hashes.add(asset.sourceSha256); indexes.add(asset.sortIndex);
    if (asset.characterId !== "nieun" || asset.sourceKey !== "creator-vip-nieun" || asset.use !== "host-art" || !VIP_EXPRESSION_GROUPS.includes(asset.expressionGroup)) throw new Error(`vip_pack_asset_contract_invalid:${asset.id}`);
    if (!["pending", "kept", "replaced", "n/a"].includes(asset.postImplementationReview) || (asset.backgroundNote !== null && typeof asset.backgroundNote !== "string")) throw new Error(`vip_pack_review_invalid:${asset.id}`);
    const table = asset.table;
    if (!table || table.path !== `assets/${asset.id}.webp` || table.mime !== "image/webp" || !isSha256(table.sha256)) throw new Error(`vip_pack_table_invalid:${asset.id}`);
    if (!isPositiveInteger(asset.sourceWidth) || !isPositiveInteger(asset.sourceHeight) || !isPositiveInteger(table.width) || !isPositiveInteger(table.height) || table.height > 1536 || !isPositiveInteger(table.bytes)) throw new Error(`vip_pack_dimensions_invalid:${asset.id}`);
  }
  if (manifest.totals.assets !== manifest.assets.length || manifest.totals.approvedEntries !== manifest.assets.length || !Number.isInteger(manifest.totals.queueEntries) || manifest.totals.queueEntries < manifest.totals.approvedEntries || manifest.totals.bytes !== manifest.assets.reduce((sum, asset) => sum + asset.table.bytes, 0)) throw new Error("vip_pack_totals_mismatch");
}

function assertPolicy(policy: VipPolicy): void {
  if (!policy || policy.crop !== false || policy.thumb !== false || policy.gallery !== false || policy.vipOnly !== true || policy.emotionSlots !== false || policy.bacikalExcluded !== true) throw new Error("vip_policy_invalid");
}

function assertSourceName(name: string): void {
  if (typeof name !== "string" || !/^[^\\/:]+\.png$/iu.test(name) || /^바치칼.*\.png$/iu.test(name.normalize("NFC"))) throw new Error(`vip_source_name_forbidden:${name}`);
}

function assertReviewFields(item: Pick<VipReviewQueueItem, "reviewStatus" | "approvedUses" | "postImplementationReview" | "reviewEvidence">): void {
  if (!["unreviewed", "approved", "rejected"].includes(item.reviewStatus) || !Array.isArray(item.approvedUses) || item.approvedUses.some((use) => use !== "host-art") || item.approvedUses.length > 1 || !["pending", "kept", "replaced", "n/a"].includes(item.postImplementationReview)) throw new Error("vip_review_fields_invalid");
  if (item.reviewStatus === "approved") {
    if (item.approvedUses.length !== 1 || !item.reviewEvidence?.trim()) throw new Error("vip_approval_evidence_missing");
  } else if (item.approvedUses.length > 0) throw new Error("vip_unapproved_use_forbidden");
}

function assertNoEmotionSlots(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["neutral", "pleased", "tense", "despair"].includes(key)) throw new Error(`vip_emotion_slot_forbidden:${key}`);
    assertNoEmotionSlots(child);
  }
}

function isSha256(value: string): boolean { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function isPositiveInteger(value: number): boolean { return Number.isInteger(value) && value > 0; }
