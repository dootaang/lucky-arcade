import type { TemerosaContentSelection } from "@lucky-arcade/contracts";

export const TEMEROSA_FORBIDDEN_ASSET_NAME = /(?:^|[_.\-/\s])(adult|masturbation|naked|nude|sex)(?:$|[_.\-/\s])/i;

export function assertTemerosaSelection(selection: TemerosaContentSelection): void {
  const ids = new Set<string>();
  const sourcePaths = new Set<string>();
  for (const asset of selection.assets) {
    if (ids.has(asset.id)) throw new Error(`selected_asset_id_duplicate:${asset.id}`);
    ids.add(asset.id);
    const locator = `${asset.source}:${normalize(asset.sourcePath)}`;
    if (sourcePaths.has(locator)) throw new Error(`selected_asset_source_duplicate:${asset.id}`);
    sourcePaths.add(locator);
    const values = [asset.id, asset.sourcePath, asset.characterId ?? "", asset.expression ?? ""];
    if (values.some((value) => TEMEROSA_FORBIDDEN_ASSET_NAME.test(value))) throw new Error(`selected_asset_forbidden:${asset.id}`);
    if (asset.role === "portrait" && (!asset.characterId || !asset.expression)) throw new Error(`portrait_identity_missing:${asset.id}`);
  }
}

export function assertTemerosaSourceAssetSafe(name: string, path: string): void {
  if (TEMEROSA_FORBIDDEN_ASSET_NAME.test(name) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(path)) throw new Error("selected_asset_forbidden");
}

function normalize(value: string): string { return value.replace(/\\/g, "/").replace(/^\.\//, ""); }
