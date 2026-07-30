import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Asset = { id: string; sourceSha256: string; display: { path: string; bytes: number; sha256: string } };
type Manifest = { contract: string; totals: { sourceEntries: number; eligibleEntries: number; exactUniqueAssets: number; bytes: number }; assets: Asset[] };
const root = new URL("../../web/public/content/temerosa-favorite/0.1.0/", import.meta.url);
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("manifest.json", root)), "utf8")) as Manifest;

describe("Temerosa favorite asset pack", () => {
  it("contains the exact-unique eligible inventory and valid WebP derivatives", () => {
    expect(manifest.contract).toBe("temerosa-favorite-asset-pack/0.1");
    expect(manifest.totals).toMatchObject({ sourceEntries: 1_826, eligibleEntries: 1_592, exactUniqueAssets: 1_551 });
    expect(new Set(manifest.assets.map((asset) => asset.id)).size).toBe(1_551);
    expect(new Set(manifest.assets.map((asset) => asset.sourceSha256)).size).toBe(1_551);
    let total = 0;
    for (const asset of manifest.assets) {
      expect(asset.display.path.startsWith("assets/")).toBe(true);
      const bytes = readFileSync(fileURLToPath(new URL(asset.display.path, root)));
      expect(bytes.byteLength).toBe(asset.display.bytes);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.display.sha256);
      total += bytes.byteLength;
    }
    expect(total).toBe(manifest.totals.bytes);
  });
});
