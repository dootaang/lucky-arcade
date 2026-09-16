import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { auditVipAssets } from "../src/audit-temerosa-vip-assets.ts";
import { compileVipAssets } from "../src/compile-temerosa-vip-assets.ts";
import { inventoryVipAssets } from "../src/inventory-temerosa-vip-assets.ts";
import {
  assertInventoryShape, assertManifest, assertReviewQueue, hamming,
  type VipAssetManifest, type VipInventoryReport, type VipReviewQueue,
} from "../src/temerosa-vip-assets.ts";

const temporary: string[] = [];
const sourceKey = "creator-vip-nieun";
const root = new URL("../../web/public/content/temerosa-vip/0.1.0/", import.meta.url);
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("manifest.json", root)), "utf8")) as VipAssetManifest;
const reviews = JSON.parse(readFileSync(new URL("../src/temerosa-vip-review-queue.json", import.meta.url), "utf8")) as VipReviewQueue;

async function fixture(): Promise<{ directory: string; source: string; compare: string }> {
  const directory = await mkdtemp(resolve(tmpdir(), "temerosa-vip-test-"));
  temporary.push(directory);
  const source = resolve(directory, "source"), compare = resolve(directory, "compare");
  await mkdir(source); await mkdir(compare);
  return { directory, source, compare };
}

async function png(width: number, height: number, color = "#bd618b"): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

function reviewQueue(inventory: VipInventoryReport): VipReviewQueue {
  return {
    contract: "temerosa-vip-review-queue/0.1", sourceKey, characterId: "nieun",
    policy: { crop: false, thumb: false, gallery: false, vipOnly: true, emotionSlots: false, bacikalExcluded: true },
    items: inventory.inventory.filter((item) => item.role === "source").map((item) => ({
      sortIndex: item.sortIndex, sha256: item.sha256, originalName: item.originalName,
      expressionGroup: "sulky", backgroundNote: null, reviewStatus: item.sortIndex === 1 ? "approved" : "unreviewed",
      approvedUses: item.sortIndex === 1 ? ["host-art"] : [], reviewEvidence: item.sortIndex === 1 ? "generated fixture approval" : "awaiting review",
      postImplementationReview: item.sortIndex === 1 ? "pending" : "n/a",
    })),
  };
}

afterEach(async () => {
  for (const path of temporary.splice(0)) {
    const target = resolve(path), parent = resolve(tmpdir());
    if (!target.startsWith(`${parent}${sep}`) || !target.slice(parent.length + 1).startsWith("temerosa-vip-test-")) throw new Error("vip_test_cleanup_path_escape");
    await rm(target, { recursive: true, force: true });
  }
});

describe("Temerosa VIP inventory and review policy", () => {
  it("sorts PNGs, hashes bytes, groups duplicates, compares sources and excludes policy names before reading", async () => {
    const { source, compare } = await fixture(), bytes = await png(80, 160);
    await writeFile(resolve(source, "b.png"), bytes);
    await writeFile(resolve(source, "a.PNG"), bytes);
    await writeFile(resolve(source, "c.png"), await png(80, 160, "#336699"));
    await writeFile(resolve(source, "ignored.zip"), "not an archive");
    await mkdir(resolve(source, "nested"));
    await writeFile(resolve(source, "nested", "ignored.png"), "not an image");
    await writeFile(resolve(compare, "박니은1.png"), bytes);
    await writeFile(resolve(compare, "바치칼1.png"), "must never be decoded or hashed");
    await writeFile(resolve(source, "바치칼2.PNG"), "also excluded from sources");
    const inventory = await inventoryVipAssets({ sources: { [sourceKey]: source }, compares: { "legacy-bunny": compare } });
    expect(() => assertInventoryShape(inventory)).not.toThrow();
    expect(inventory.totals).toMatchObject({ sourceEntries: 3, bytes: bytes.length * 2 + (await readFile(resolve(source, "c.png"))).length, excludedByPolicy: 2, byStatus: { approved: 0, unreviewed: 3, rejected: 0 } });
    const entries = inventory.inventory.filter((item) => item.role === "source");
    expect(entries.map((item) => [item.originalName, item.sortIndex])).toEqual([["a.PNG", 1], ["b.png", 2], ["c.png", 3]]);
    expect(entries[0]!.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(entries[0]!.exactDuplicateGroup).toBeTruthy();
    expect(entries[0]!.exactDuplicateGroup).toBe(entries[1]!.exactDuplicateGroup);
    expect(entries[0]!.perceptualGroup).toBeTruthy();
    expect(entries[0]!.perceptualGroup).toBe(entries[2]!.perceptualGroup);
    expect(hamming(entries[0]!.perceptualHash, entries[2]!.perceptualHash)).toBe(0);
    expect(inventory.comparison.filter((pair) => pair.byteIdentical)).toHaveLength(2);
    expect(inventory.comparison[0]).toMatchObject({ compareOriginalName: "박니은1.png", distance: 0 });
    expect(inventory.inventory.some((item) => item.originalName.startsWith("바치칼"))).toBe(false);
  });

  it("sniffs MIME from bytes and applies reviews while leaving other hashes unreviewed", async () => {
    const { source } = await fixture();
    await writeFile(resolve(source, "a.png"), await png(80, 160));
    await writeFile(resolve(source, "b.png"), await sharp({ create: { width: 64, height: 64, channels: 3, background: "red" } }).jpeg().toBuffer());
    const inventory = await inventoryVipAssets({ sources: { [sourceKey]: source } }), queue = reviewQueue(inventory);
    queue.items = queue.items.slice(0, 1);
    const reviewed = await inventoryVipAssets({ sources: { [sourceKey]: source }, reviews: queue });
    expect(reviewed.inventory[0]).toMatchObject({ reviewStatus: "approved", approvedUses: ["host-art"], expressionGroup: "sulky", postImplementationReview: "pending" });
    expect(reviewed.inventory[1]).toMatchObject({ reviewStatus: "unreviewed", detectedMime: "image/jpeg", sourcePathMimeMismatch: true, geometry: "square" });
    const bad = structuredClone(queue); bad.items[0]!.sha256 = "0".repeat(64);
    await expect(inventoryVipAssets({ sources: { [sourceKey]: source }, reviews: bad })).rejects.toThrow();
    expect(() => assertReviewQueue({ ...queue, policy: { ...queue.policy, crop: true } } as unknown as VipReviewQueue)).toThrow();
    const unapprovedUse = structuredClone(queue); unapprovedUse.items[0]!.reviewStatus = "unreviewed";
    expect(() => assertReviewQueue(unapprovedUse)).toThrow();
  });
});

describe("Temerosa VIP compiler", () => {
  it("preserves the whole image ratio, enforces the height limit, excludes unapproved entries and audits bytes", async () => {
    const { source, directory } = await fixture();
    await writeFile(resolve(source, "a.png"), await png(1304, 2312));
    await writeFile(resolve(source, "b.png"), await png(1512, 2016));
    const inventory = await inventoryVipAssets({ sources: { [sourceKey]: source } }), queue = reviewQueue(inventory);
    const compiled = await compileVipAssets({ sources: { [sourceKey]: source }, inventory, reviews: queue, out: directory, version: "0.1.0" });
    expect(compiled.totals).toMatchObject({ queueEntries: 2, approvedEntries: 1, assets: 1 });
    expect(compiled.assets[0]).toMatchObject({ sourceWidth: 1304, sourceHeight: 2312, use: "host-art", table: { width: 866, height: 1536 } });
    expect(() => assertManifest(compiled)).not.toThrow();
    const packRoot = resolve(directory, "temerosa-vip/0.1.0");
    await expect(auditVipAssets(packRoot, queue)).resolves.toEqual({ assets: 1, bytes: compiled.totals.bytes });
    // A second successful build must replace the existing pack and leave no staging/backup.
    await compileVipAssets({ sources: { [sourceKey]: source }, inventory, reviews: queue, out: directory, version: "0.1.0" });
    expect(existsSync(`${packRoot}.building`)).toBe(false); expect(existsSync(`${packRoot}.previous`)).toBe(false);
    await writeFile(resolve(packRoot, "assets/unlisted.webp"), "unexpected");
    await expect(auditVipAssets(packRoot)).rejects.toThrow("vip_pack_unlisted_file");
    await rm(resolve(packRoot, "assets/unlisted.webp"));
    const approvedMismatch = structuredClone(queue); approvedMismatch.items[0]!.reviewStatus = "unreviewed"; approvedMismatch.items[0]!.approvedUses = [];
    await expect(auditVipAssets(packRoot, approvedMismatch)).rejects.toThrow("vip_pack_approved_set_mismatch");
    const path = resolve(packRoot, compiled.assets[0]!.table.path), corrupt = await readFile(path); corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1;
    await writeFile(path, corrupt);
    await expect(auditVipAssets(packRoot)).rejects.toThrow("vip_pack_hash_or_size_mismatch");
  });

  it("does not enlarge small images and rejects queue or source drift before changing output", async () => {
    const { source, directory } = await fixture();
    await writeFile(resolve(source, "a.png"), await png(60, 80));
    await writeFile(resolve(source, "b.png"), await png(64, 80));
    const inventory = await inventoryVipAssets({ sources: { [sourceKey]: source } }), queue = reviewQueue(inventory);
    const options = { sources: { [sourceKey]: source }, inventory, reviews: queue, out: directory, version: "0.1.0" };
    const compiled = await compileVipAssets(options);
    expect(compiled.assets[0]!.table).toMatchObject({ width: 60, height: 80 });
    const output = resolve(directory, "temerosa-vip/0.1.0/manifest.json"), previous = await readFile(output);
    const badQueue = structuredClone(queue); badQueue.items[1]!.sha256 = "0".repeat(64);
    await expect(compileVipAssets({ ...options, reviews: badQueue })).rejects.toThrow();
    await writeFile(resolve(source, "a.png"), await png(60, 80, "blue"));
    await expect(compileVipAssets(options)).rejects.toThrow("vip_source_drift");
    expect(await readFile(output)).toEqual(previous);
  });
});

describe("Temerosa VIP deployed asset pack", () => {
  it("contains all 29 owner-approved derivatives and valid WebP bytes without requiring originals", async () => {
    expect(() => assertManifest(manifest)).not.toThrow();
    expect(() => assertReviewQueue(reviews)).not.toThrow();
    expect(reviews.items).toHaveLength(29);
    expect(manifest.totals).toMatchObject({ queueEntries: 29, approvedEntries: 29, assets: 29 });
    expect(manifest.assets.map((asset) => asset.sortIndex)).toEqual(Array.from({ length: 29 }, (_, index) => index + 1));
    expect(reviews.items.filter((item) => item.reviewStatus === "unreviewed")).toHaveLength(0);
    await expect(auditVipAssets(fileURLToPath(root), reviews)).resolves.toEqual({ assets: 29, bytes: manifest.totals.bytes });
    let total = 0;
    for (const asset of manifest.assets) {
      const bytes = readFileSync(fileURLToPath(new URL(asset.table.path, root)));
      expect(bytes.byteLength).toBe(asset.table.bytes);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.table.sha256);
      expect(asset.table.height).toBeLessThanOrEqual(1536);
      expect(Math.abs(asset.table.width - asset.sourceWidth * asset.table.height / asset.sourceHeight)).toBeLessThanOrEqual(1);
      expect(asset.table.bytes).toBeLessThanOrEqual(600 * 1024); total += bytes.byteLength;
    }
    expect(total).toBe(manifest.totals.bytes); expect(total).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  it("rejects altered contracts, policies, unsafe paths, duplicate identities, totals and emotion slots", () => {
    const mutations: ((value: VipAssetManifest) => void)[] = [
      (value) => { Object.assign(value, { version: "0.2.0" }); },
      (value) => { Object.assign(value.policy, { crop: true }); },
      (value) => { value.assets[0]!.table.path = "assets/../../outside.webp"; },
      (value) => { value.assets[1]!.id = value.assets[0]!.id; },
      (value) => { value.assets[1]!.sourceSha256 = value.assets[0]!.sourceSha256; },
      (value) => { value.totals.bytes += 1; },
      (value) => { value.totals.assets += 1; },
      (value) => { value.assets[0]!.table.height = 1537; },
      (value) => { Object.assign(value.assets[0]!, { neutral: true }); },
      (value) => { Object.assign(value.assets[0]!, { expressionGroup: "invalid" }); },
      (value) => { Object.assign(value.assets[0]!, { use: "gallery" }); },
    ];
    for (const mutate of mutations) { const changed = structuredClone(manifest); mutate(changed); expect(() => assertManifest(changed)).toThrow(); }
  });
});
