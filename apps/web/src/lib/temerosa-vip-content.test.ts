import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { loadTemerosaVipAssets, parseVipArtPack, selectVipArt, VIP_EXPRESSION_GROUPS } from "./temerosa-vip-content.ts";
const manifest = JSON.parse(readFileSync(new URL("../../public/content/temerosa-vip/0.1.0/manifest.json", import.meta.url), "utf8"));
describe("VIP art", () => {
  it("uses all 29 uncropped owned assets and cycles all variants within each group", () => {
    const pack = parseVipArtPack(manifest);
    expect(pack.assets).toHaveLength(29);
    expect(new Set(pack.assets.map((art) => art.url)).size).toBe(29);
    for (const group of VIP_EXPRESSION_GROUPS) {
      const members = pack.assets.filter((art) => art.group === group || group === "sulky" && art.group === "other");
      if (!members.length) continue;
      expect(new Set(members.map((_, index) => selectVipArt(pack, group, index).id)).size).toBe(members.length);
    }
    expect(() => parseVipArtPack({ ...manifest, policy: { ...manifest.policy, crop: true } })).toThrow();
    expect(() => parseVipArtPack({ ...manifest, assets: [manifest.assets[0], manifest.assets[0]] })).toThrow();
  });
  it("memoizes only the manifest, never initiates an image download", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => manifest });
    vi.stubGlobal("fetch", fetcher);
    try {
      const [a, b] = await Promise.all([loadTemerosaVipAssets(), loadTemerosaVipAssets()]);
      expect(a).toBe(b); expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith("/content/temerosa-vip/0.1.0/manifest.json");
    } finally { vi.unstubAllGlobals(); }
  });
  it("does not wire the VIP art loader into the floor, shared ledger or observer market", () => {
    const files = ["../routes/home.tsx", "../features/casino-ledger/casino-ledger-view.tsx", "../features/casino-ledger/casino-side-market.tsx", "../features/vip-blackjack/vip-door.tsx"];
    for (const file of files) expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toContain("temerosa-vip-content");
  });
});
