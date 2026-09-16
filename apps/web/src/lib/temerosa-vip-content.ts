export const VIP_EXPRESSION_GROUPS = ["sulky", "flustered", "weary", "smug", "back", "other"] as const;
export type VipExpressionGroup = typeof VIP_EXPRESSION_GROUPS[number];
export interface VipArt { readonly id: string; readonly url: string; readonly width: number; readonly height: number; readonly group: VipExpressionGroup; }
export interface VipArtPack { readonly version: "0.1.0"; readonly assets: readonly VipArt[]; }
let pending: Promise<VipArtPack> | null = null;

/** Manifest only: resolving 29 URLs must never download/decode 29 images. VIP entry only. */
export function loadTemerosaVipAssets(): Promise<VipArtPack> {
  pending ??= fetch("/content/temerosa-vip/0.1.0/manifest.json").then(async (response) => {
    if (!response.ok) throw new Error("vip_assets_unavailable");
    return parseVipArtPack(await response.json());
  }).catch((error: unknown) => { pending = null; throw error; });
  return pending;
}

export function parseVipArtPack(value: unknown): VipArtPack {
  const raw = value as { contract?: string; version?: string; policy?: { crop?: boolean; vipOnly?: boolean }; assets?: Array<{ id: string; characterId: string; use: string; expressionGroup: VipExpressionGroup; table: { path: string; width: number; height: number } }> };
  if (raw?.contract !== "temerosa-vip-asset-pack/0.1" || raw.version !== "0.1.0" || raw.policy?.crop !== false || raw.policy.vipOnly !== true || !Array.isArray(raw.assets) || !raw.assets.length) throw new Error("vip_assets_invalid");
  const ids = new Set<string>();
  const assets = raw.assets.map((asset): VipArt => {
    if (!asset || !/^nieun-vip-[a-f0-9]{24}$/.test(asset.id) || ids.has(asset.id) || asset.characterId !== "nieun" || asset.use !== "host-art" || !VIP_EXPRESSION_GROUPS.includes(asset.expressionGroup) || asset.table?.path !== `assets/${asset.id}.webp` || !Number.isInteger(asset.table.width) || asset.table.width <= 0 || !Number.isInteger(asset.table.height) || asset.table.height <= 0 || asset.table.height > 1536) throw new Error("vip_art_invalid");
    ids.add(asset.id);
    return Object.freeze({ id: asset.id, url: `/content/temerosa-vip/0.1.0/${asset.table.path}`, width: asset.table.width, height: asset.table.height, group: asset.expressionGroup });
  });
  return Object.freeze({ version: "0.1.0", assets: Object.freeze(assets) });
}

/** Rotates every member of a group before reuse; 'other' is an unlabelled ready-room cut, not a fabricated emotion. */
export function selectVipArt(pack: VipArtPack, group: VipExpressionGroup, visit: number, previousId?: string): VipArt {
  const matching = pack.assets.filter((art) => art.group === group || group === "sulky" && art.group === "other");
  const pool = matching.length ? matching : pack.assets.filter((art) => art.group === "sulky");
  const selected = pool[Math.abs(visit) % pool.length] ?? pack.assets[0]!;
  return selected.id === previousId && pool.length > 1 ? pool[(Math.abs(visit) + 1) % pool.length]! : selected;
}
