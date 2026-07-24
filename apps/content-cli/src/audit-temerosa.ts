import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { sniffDisplayImageMime } from "@lucky-arcade/card-io";
import { temerosaContentManifestSchema } from "@lucky-arcade/contracts";
import { TEMEROSA_FORBIDDEN_ASSET_NAME } from "./temerosa-policy.ts";

async function main(): Promise<void> {
  const input = process.argv.slice(2).find((value) => value !== "--");
  if (!input) throw new Error("usage: pnpm content:temerosa:audit -- <manifest.json>");
  const invocationRoot = process.env.INIT_CWD ?? process.cwd();
  const manifestPath = resolve(invocationRoot, input);
  const root = dirname(manifestPath);
  const manifest = temerosaContentManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const ids = new Set<string>();
  const paths = new Set<string>();
  let totalBytes = 0;
  let fileCount = 0;

  for (const asset of manifest.assets) {
    if (ids.has(asset.id)) throw new Error(`manifest_asset_id_duplicate:${asset.id}`);
    ids.add(asset.id);
    if (TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.id) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.characterId ?? "") || TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.expression ?? "")) throw new Error(`manifest_forbidden_asset:${asset.id}`);
    for (const variant of asset.variants) {
      if (paths.has(variant.path)) throw new Error(`manifest_asset_path_duplicate:${variant.path}`);
      paths.add(variant.path);
      const path = resolve(root, variant.path);
      if (!path.startsWith(`${root}${sep}`)) throw new Error(`manifest_asset_path_escape:${variant.path}`);
      const info = await stat(path);
      const bytes = await readFile(path);
      if (info.size !== variant.bytes) throw new Error(`manifest_asset_size_mismatch:${variant.path}`);
      if (sniffDisplayImageMime(bytes) !== "image/webp") throw new Error(`manifest_asset_mime_mismatch:${variant.path}`);
      if (TEMEROSA_FORBIDDEN_ASSET_NAME.test(variant.path)) throw new Error(`manifest_forbidden_asset:${variant.path}`);
      totalBytes += info.size;
      fileCount += 1;
    }
  }

  if (manifest.safety.selectedAssetCount !== manifest.assets.length) throw new Error("manifest_selected_asset_count_mismatch");
  if (manifest.totalBytes !== totalBytes) throw new Error("manifest_total_bytes_mismatch");
  process.stdout.write(`${JSON.stringify({ packId: manifest.packId, version: manifest.version, assets: manifest.assets.length, files: fileCount, totalBytes, forbiddenAssets: 0, status: "pass" }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
