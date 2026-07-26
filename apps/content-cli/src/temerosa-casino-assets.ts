import { TEMEROSA_FORBIDDEN_ASSET_NAME } from "./temerosa-policy.ts";

export const CASINO_ASSET_USES = ["venue-hero", "table-art", "slot-symbol", "bingo", "bestia-target", "collection"] as const;
export type CasinoAssetUse = (typeof CASINO_ASSET_USES)[number];
export const CASINO_GEOMETRY_QUEUES = ["portrait", "card", "square", "landscape", "other"] as const;
export type CasinoGeometryQueue = (typeof CASINO_GEOMETRY_QUEUES)[number];
export type CasinoSemanticStatus = "unreviewed" | "approved" | "rejected";
export type CasinoSourceKey = "overture" | "root2" | "bestiaization" | "finale" | "nemo";

export const CASINO_SOURCE_CARD_IDS: Record<CasinoSourceKey, string> = {
  overture: "overture-root2",
  root2: "temerosa-root2",
  bestiaization: "temerosa-bestiaization",
  finale: "temerosa-finale",
  nemo: "nemo",
};

export const CASINO_SOURCE_KEYS_BY_CARD_ID = new Map(
  Object.entries(CASINO_SOURCE_CARD_IDS).map(([key, value]) => [value, key as CasinoSourceKey]),
);

export type CasinoAssetCandidate = {
  sourceCardId: string;
  sourceCardName: string;
  sourceEntryPath: string;
  originalName: string;
  byteHash: string;
  byteDuplicateGroup?: string;
  perceptualHash: string;
  perceptualGroup?: string;
  detectedMime: string;
  sourcePathMime?: string;
  sourcePathMimeMismatch: boolean;
  bytes: number;
  width: number;
  height: number;
  normalizedName: { value: string; evidence: string[] };
  geometryQueue: CasinoGeometryQueue;
  semanticTags: string[];
  semanticStatus: CasinoSemanticStatus;
  appearanceSet?: string;
  approvedUses: CasinoAssetUse[];
  reviewEvidence?: string;
};

export type CasinoInventoryReport = {
  contract: "temerosa-casino-asset-inventory/1.0";
  generatedAt: string;
  sources: { sourceCardId: string; sourceCardName: string; entries: number; bytes: number }[];
  duplicatePolicy: { byteHash: "sha256"; perceptualHash: "dhash-64"; perceptualThreshold: 5; perceptualGroupsAreCandidatesOnly: true };
  totals: {
    entries: number;
    bytes: number;
    unreviewed: number;
    approved: number;
    rejected: number;
    byteDuplicateEntries: number;
    byteDuplicateGroups: number;
    perceptualCandidateEntries: number;
    perceptualCandidateGroups: number;
    sourcePathMimeMismatches: number;
  };
  geometryQueues: Record<CasinoGeometryQueue, number>;
  inventory: CasinoAssetCandidate[];
};

export type CasinoReviewQueueItem = {
  id: string;
  intendedUse: "venue-hero" | "slot-symbol" | "table-art";
  sourceCardId: string;
  sourceEntryPath: string;
  requestedDisplayName: string;
  semanticStatus: CasinoSemanticStatus;
  approvedUses: CasinoAssetUse[];
  reviewEvidence?: string;
  postImplementationReview?: "pending" | "accepted" | "rejected";
  appearanceSet?: string;
  cropFocus: { x: number; y: number };
  frequency?: { tier: "base" | "low" | "medium" | "high"; weight: number; evidence: string };
  requiredChecks: string[];
};

export type CasinoReviewQueue = {
  contract: "temerosa-casino-review-queue/1.0";
  provenance: "docs/THIRD_PARTY_PROVENANCE.md#내장-콘텐츠-허가-확인";
  reviewPolicy: "pre-release-visual" | "post-implementation-visual";
  releaseState: "candidate-only" | "approved";
  items: CasinoReviewQueueItem[];
};

export type CasinoPackVariant = {
  scale: "sm" | "md" | "1x" | "2x";
  path: string;
  mime: "image/webp";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
};

export type CasinoPackAsset = {
  id: string;
  use: "venue-hero" | "slot-symbol" | "table-art";
  displayName: string;
  sourceCardId: string;
  sourceEntryPath: string;
  sourceByteHash: string;
  reviewEvidence: string;
  postImplementationReview: "pending" | "accepted";
  cropFocus: { x: number; y: number };
  frequency?: { tier: "base" | "low" | "medium" | "high"; weight: number; evidence: string };
  variants: CasinoPackVariant[];
};

export type CasinoPackManifest = {
  contract: "temerosa-casino-asset-pack/1.0";
  packId: "temerosa-casino-venue" | "temerosa-casino-slots" | "temerosa-casino-floor";
  version: string;
  provenance: "docs/THIRD_PARTY_PROVENANCE.md#내장-콘텐츠-허가-확인";
  assets: CasinoPackAsset[];
  totalBytes: number;
};

type AliasRule = { pattern: RegExp; replacement: string; evidence: string };

// These rules repair spelling/separator evidence only. They never merge an
// appearance or assign a semantic identity.
export const CASINO_NAME_ALIAS_RULES: readonly AliasRule[] = [
  { pattern: /disapponted/giu, replacement: "disappointed", evidence: "alias:disapponted->disappointed" },
  { pattern: /disappinted/giu, replacement: "disappointed", evidence: "alias:disappinted->disappointed" },
  { pattern: /\bsas\b/giu, replacement: "sad", evidence: "alias:sas->sad" },
  { pattern: /\bniuen\b/giu, replacement: "nieun", evidence: "alias:niuen->nieun" },
] as const;

export function normalizeCasinoAssetName(original: string): { value: string; evidence: string[] } {
  const evidence = ["source-string-preserved:originalName"];
  let value = original.normalize("NFKC");
  if (value !== original) evidence.push("unicode-normalization:NFKC");
  for (const rule of CASINO_NAME_ALIAS_RULES) {
    const next = value.replace(rule.pattern, rule.replacement);
    if (next !== value) evidence.push(rule.evidence);
    value = next;
  }
  const separated = value.replace(/[._\s]+/gu, "-");
  if (separated !== value) evidence.push("separator:dot-underscore-space->hyphen");
  value = separated;
  const folded = value.toLocaleLowerCase("en-US");
  if (folded !== value) evidence.push("case-fold:en-US-lowercase");
  value = folded.replace(/-+/gu, "-").replace(/^-|-$/gu, "");
  return { value, evidence };
}

export function casinoGeometryQueue(width: number, height: number): CasinoGeometryQueue {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "other";
  const ratio = width / height;
  if (ratio >= 0.9 && ratio <= 1.1) return "square";
  if (ratio > 1.1) return "landscape";
  if (ratio >= 0.62 && ratio <= 0.78) return "card";
  return "portrait";
}

export function sourcePathMime(path: string): string | undefined {
  const extension = /\.([^.\/]+)$/u.exec(path)?.[1]?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  return undefined;
}

export function inventoryLocator(value: Pick<CasinoAssetCandidate, "sourceCardId" | "sourceEntryPath">): string {
  return `${value.sourceCardId}:${normalizeCasinoPath(value.sourceEntryPath)}`;
}

export function normalizeCasinoPath(value: string): string {
  return value.replace(/\\/gu, "/").replace(/^\.\//u, "");
}

export function assertCasinoReviewQueue(queue: CasinoReviewQueue, inventory: CasinoInventoryReport): void {
  if (queue.contract !== "temerosa-casino-review-queue/1.0") throw new Error("casino_review_queue_contract_invalid");
  const inventoryByLocator = new Map(inventory.inventory.map((item) => [inventoryLocator(item), item]));
  const ids = new Set<string>();
  const locators = new Set<string>();
  for (const item of queue.items) {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(item.id) || ids.has(item.id)) throw new Error(`casino_review_id_invalid_or_duplicate:${item.id}`);
    ids.add(item.id);
    if (TEMEROSA_FORBIDDEN_ASSET_NAME.test(item.id) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(item.sourceEntryPath) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(item.requestedDisplayName)) throw new Error(`casino_review_forbidden:${item.id}`);
    const locator = `${item.sourceCardId}:${normalizeCasinoPath(item.sourceEntryPath)}`;
    if (locators.has(locator)) throw new Error(`casino_review_source_duplicate:${item.id}`);
    locators.add(locator);
    const candidate = inventoryByLocator.get(locator);
    if (!candidate) throw new Error(`casino_review_source_missing:${item.id}`);
    if (candidate.semanticStatus === "rejected") throw new Error(`casino_review_source_rejected:${item.id}`);
    if (item.semanticStatus === "unreviewed" && item.requestedDisplayName !== candidate.originalName) throw new Error(`casino_unreviewed_display_name_not_source_string:${item.id}`);
    if (item.intendedUse === "slot-symbol" && candidate.geometryQueue !== "square") throw new Error(`casino_slot_candidate_not_square:${item.id}`);
    if ((item.intendedUse === "venue-hero" || item.intendedUse === "table-art") && candidate.geometryQueue !== "landscape") throw new Error(`casino_background_candidate_not_landscape:${item.id}`);
    if (item.cropFocus.x < 0 || item.cropFocus.x > 1 || item.cropFocus.y < 0 || item.cropFocus.y > 1) throw new Error(`casino_review_crop_focus_invalid:${item.id}`);
    if (item.semanticStatus === "approved") {
      if (!item.reviewEvidence?.trim()) throw new Error(`casino_review_evidence_missing:${item.id}`);
      if (!item.approvedUses.includes(item.intendedUse)) throw new Error(`casino_review_use_not_approved:${item.id}`);
      if (queue.reviewPolicy === "post-implementation-visual" && !item.postImplementationReview) throw new Error(`casino_post_implementation_review_status_missing:${item.id}`);
      if (item.postImplementationReview === "rejected") throw new Error(`casino_post_implementation_review_rejected:${item.id}`);
    } else if (item.approvedUses.length > 0) {
      throw new Error(`casino_unapproved_item_has_approved_use:${item.id}`);
    }
    if (item.intendedUse === "slot-symbol") {
      if (!item.frequency || !item.frequency.evidence.trim() || item.frequency.weight <= 0) throw new Error(`casino_slot_frequency_evidence_missing:${item.id}`);
    } else if (item.frequency) {
      throw new Error(`casino_non_slot_frequency_forbidden:${item.id}`);
    }
  }
  const counts = countReviewUses(queue);
  if (counts["venue-hero"] !== 1) throw new Error(`casino_review_venue_count_invalid:${counts["venue-hero"]}`);
  if (counts["slot-symbol"] < 12 || counts["slot-symbol"] > 20) throw new Error(`casino_review_slot_count_invalid:${counts["slot-symbol"]}`);
  if (counts["table-art"] < 3 || counts["table-art"] > 5) throw new Error(`casino_review_background_count_invalid:${counts["table-art"]}`);
  if (queue.releaseState === "approved" && queue.items.some((item) => item.semanticStatus !== "approved")) throw new Error("casino_release_state_approved_with_unreviewed_items");
}

export function countReviewUses(queue: CasinoReviewQueue): Record<"venue-hero" | "slot-symbol" | "table-art", number> {
  return {
    "venue-hero": queue.items.filter((item) => item.intendedUse === "venue-hero").length,
    "slot-symbol": queue.items.filter((item) => item.intendedUse === "slot-symbol").length,
    "table-art": queue.items.filter((item) => item.intendedUse === "table-art").length,
  };
}

export function assertInventoryShape(report: CasinoInventoryReport): void {
  if (report.contract !== "temerosa-casino-asset-inventory/1.0") throw new Error("casino_inventory_contract_invalid");
  const locators = new Set<string>();
  for (const item of report.inventory) {
    const locator = inventoryLocator(item);
    if (locators.has(locator)) throw new Error(`casino_inventory_locator_duplicate:${locator}`);
    locators.add(locator);
    if (!item.sourceCardId || !item.sourceEntryPath || !item.originalName) throw new Error(`casino_inventory_source_evidence_missing:${locator}`);
    if (item.sourceEntryPath.startsWith("/") || item.sourceEntryPath.split("/").includes("..")) throw new Error(`casino_inventory_source_path_forbidden:${locator}`);
    if (!/^[a-f0-9]{64}$/u.test(item.byteHash)) throw new Error(`casino_inventory_sha256_invalid:${locator}`);
    if (!/^image\/(?:png|jpeg|webp|gif|avif)$/u.test(item.detectedMime)) throw new Error(`casino_inventory_mime_invalid:${locator}`);
    if (!Number.isInteger(item.width) || item.width < 1 || !Number.isInteger(item.height) || item.height < 1 || !Number.isInteger(item.bytes) || item.bytes < 1) throw new Error(`casino_inventory_dimensions_invalid:${locator}`);
    if (!item.normalizedName.value || !item.normalizedName.evidence.includes("source-string-preserved:originalName")) throw new Error(`casino_inventory_name_evidence_missing:${locator}`);
    if (item.sourcePathMimeMismatch !== (item.sourcePathMime !== undefined && item.sourcePathMime !== item.detectedMime)) throw new Error(`casino_inventory_mime_evidence_mismatch:${locator}`);
    if (item.semanticStatus !== "approved" && item.approvedUses.length > 0) throw new Error(`casino_inventory_unapproved_use:${locator}`);
    if (item.semanticStatus === "approved" && (!item.reviewEvidence?.trim() || item.approvedUses.length === 0)) throw new Error(`casino_inventory_approval_evidence_missing:${locator}`);
  }
  if (report.totals.entries !== report.inventory.length) throw new Error("casino_inventory_total_count_mismatch");
  const byteTotal = report.inventory.reduce((sum, item) => sum + item.bytes, 0);
  if (report.totals.bytes !== byteTotal) throw new Error("casino_inventory_total_bytes_mismatch");
  const byteGroups = groupBy(report.inventory.filter((item) => item.byteDuplicateGroup), (item) => item.byteDuplicateGroup!);
  for (const group of byteGroups) {
    if (group.length < 2) throw new Error(`casino_byte_duplicate_group_singleton:${group[0]!.byteDuplicateGroup}`);
    if (new Set(group.map((item) => item.byteHash)).size !== 1) throw new Error(`casino_byte_duplicate_group_hash_mismatch:${group[0]!.byteDuplicateGroup}`);
  }
  const perceptualGroups = groupBy(report.inventory.filter((item) => item.perceptualGroup), (item) => item.perceptualGroup!);
  for (const group of perceptualGroups) {
    if (group.length < 2 || new Set(group.map((item) => item.byteHash)).size < 2) throw new Error(`casino_perceptual_candidate_group_invalid:${group[0]!.perceptualGroup}`);
  }
  const expectedStatuses = {
    unreviewed: report.inventory.filter((item) => item.semanticStatus === "unreviewed").length,
    approved: report.inventory.filter((item) => item.semanticStatus === "approved").length,
    rejected: report.inventory.filter((item) => item.semanticStatus === "rejected").length,
  };
  if (report.totals.unreviewed !== expectedStatuses.unreviewed || report.totals.approved !== expectedStatuses.approved || report.totals.rejected !== expectedStatuses.rejected) throw new Error("casino_inventory_status_totals_mismatch");
  if (report.totals.byteDuplicateEntries !== byteGroups.reduce((sum, group) => sum + group.length, 0) || report.totals.byteDuplicateGroups !== byteGroups.length) throw new Error("casino_inventory_byte_duplicate_totals_mismatch");
  if (report.totals.perceptualCandidateEntries !== perceptualGroups.reduce((sum, group) => sum + group.length, 0) || report.totals.perceptualCandidateGroups !== perceptualGroups.length) throw new Error("casino_inventory_perceptual_totals_mismatch");
  if (report.totals.sourcePathMimeMismatches !== report.inventory.filter((item) => item.sourcePathMimeMismatch).length) throw new Error("casino_inventory_mime_mismatch_total_invalid");
  for (const queue of CASINO_GEOMETRY_QUEUES) if (report.geometryQueues[queue] !== report.inventory.filter((item) => item.geometryQueue === queue).length) throw new Error(`casino_inventory_geometry_total_mismatch:${queue}`);
  const sourceEntries = report.sources.reduce((sum, source) => sum + source.entries, 0);
  const sourceBytes = report.sources.reduce((sum, source) => sum + source.bytes, 0);
  if (sourceEntries !== report.totals.entries || sourceBytes !== report.totals.bytes) throw new Error("casino_inventory_source_totals_mismatch");
}

export function assertCasinoPackBudget(manifest: CasinoPackManifest): void {
  const ids = new Set(manifest.assets.map((asset) => asset.id));
  if (ids.size !== manifest.assets.length) throw new Error(`casino_pack_id_duplicate:${manifest.packId}`);
  if (manifest.packId === "temerosa-casino-venue" && (manifest.assets.length !== 1 || manifest.totalBytes > 200_000)) throw new Error(`casino_venue_budget_or_count_failed:${manifest.assets.length}:${manifest.totalBytes}`);
  if (manifest.packId === "temerosa-casino-slots" && (manifest.assets.length < 12 || manifest.assets.length > 20 || manifest.totalBytes > 1_500_000)) throw new Error(`casino_slots_budget_or_count_failed:${manifest.assets.length}:${manifest.totalBytes}`);
  if (manifest.packId === "temerosa-casino-floor" && (manifest.assets.length < 3 || manifest.assets.length > 5 || manifest.totalBytes > 500_000)) throw new Error(`casino_floor_budget_or_count_failed:${manifest.assets.length}:${manifest.totalBytes}`);
}

function groupBy<T>(values: readonly T[], key: (value: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = groups.get(groupKey) ?? [];
    group.push(value);
    groups.set(groupKey, group);
  }
  return [...groups.values()];
}
