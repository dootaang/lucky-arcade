import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openAssetResolver, type AssetResolver } from "@lucky-arcade/card-io";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import {
  temerosaContentManifestSchema,
  temerosaContentSelectionSchema,
  type TemerosaAssetRole,
  type TemerosaContentAsset,
  type TemerosaContentSelection,
  type TemerosaContentVariant,
} from "@lucky-arcade/contracts";
import sharp from "sharp";
import { assertTemerosaSelection, assertTemerosaSourceAssetSafe } from "./temerosa-policy.ts";

const DEFAULT_SELECTION = fileURLToPath(new URL("./temerosa-d1-selection.json", import.meta.url));
const MAX_INPUT_PIXELS = 40_000_000;

type SourceKey = "finale" | "bestiaization";
type CliArguments = { finale: string; bestiaization: string; selection: string; out: string };
type VariantPlan = { size: TemerosaContentVariant["size"]; maxWidth: number; maxHeight: number };

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const invocationRoot = process.env.INIT_CWD ?? process.cwd();
  const selectionPath = resolve(invocationRoot, args.selection);
  const selection = temerosaContentSelectionSchema.parse(JSON.parse(await readFile(selectionPath, "utf8")));
  assertTemerosaSelection(selection);
  const output = safeOutputPath(resolve(invocationRoot, args.out), selection);
  const staging = `${output}.building`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  const resolvers: Record<SourceKey, AssetResolver> = {
    finale: await openAssetResolver(await NodeFileSource.open(args.finale)),
    bestiaization: await openAssetResolver(await NodeFileSource.open(args.bestiaization)),
  };

  try {
    const assets: TemerosaContentAsset[] = [];
    for (const selected of selection.assets) {
      const resolver = resolvers[selected.source];
      const matches = resolver.assets.filter((asset) => normalize(asset.path ?? "") === normalize(selected.sourcePath));
      if (matches.length !== 1) throw new Error(`selected_asset_path_${matches.length === 0 ? "missing" : "ambiguous"}:${selected.id}`);
      const sourceAsset = matches[0]!;
      assertTemerosaSourceAssetSafe(sourceAsset.name, sourceAsset.path ?? "");
      const resolvedAsset = await resolver.read(sourceAsset.id);
      const variants = await createVariants(staging, selected.id, selected.chunk, selected.role, resolvedAsset.bytes);
      assets.push({
        id: selected.id,
        role: selected.role,
        chunk: selected.chunk,
        ...(selected.characterId ? { characterId: selected.characterId } : {}),
        ...(selected.expression ? { expression: selected.expression } : {}),
        variants,
      });
    }

    assets.sort((left, right) => left.id.localeCompare(right.id));
    const manifest = temerosaContentManifestSchema.parse({
      contract: "temerosa-content-manifest/0.1",
      packId: selection.packId,
      version: selection.version,
      assets,
      totalBytes: assets.flatMap((asset) => asset.variants).reduce((sum, variant) => sum + variant.bytes, 0),
      safety: {
        policy: "explicit-sfw-allowlist/0.1",
        selectedAssetCount: assets.length,
        forbiddenAssetCount: 0,
      },
    });
    await writeFile(resolve(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rm(output, { recursive: true, force: true });
    await cp(staging, output, { recursive: true, errorOnExist: true, force: false });
    await rm(staging, { recursive: true, force: true });
    process.stdout.write(`${JSON.stringify({ output, assets: assets.length, files: assets.flatMap((asset) => asset.variants).length, totalBytes: manifest.totalBytes, forbiddenAssets: 0 }, null, 2)}\n`);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  } finally {
    resolvers.finale.dispose();
    resolvers.bestiaization.dispose();
  }
}

async function createVariants(output: string, id: string, chunk: string, role: TemerosaAssetRole, bytes: Uint8Array): Promise<TemerosaContentVariant[]> {
  const variants: TemerosaContentVariant[] = [];
  const plans = variantPlans(role);
  const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index]!;
    const relative = `assets/${chunk}/${id}/${plan.size}.webp`;
    const target = resolve(output, relative);
    await mkdir(dirname(target), { recursive: true });
    const result = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: plan.maxWidth, height: plan.maxHeight, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, alphaQuality: 90, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    if (result.info.width < 1 || result.info.height < 1) throw new Error(`derived_image_dimensions_invalid:${id}:${plan.size}`);
    await writeFile(target, result.data);
    variants.push({ size: plan.size, path: relative.replace(/\\/g, "/"), mime: "image/webp", width: result.info.width, height: result.info.height, bytes: result.data.byteLength });
    if (metadata.width && metadata.height && metadata.width <= plan.maxWidth && metadata.height <= plan.maxHeight) break;
  }
  return variants;
}

function variantPlans(role: TemerosaAssetRole): readonly VariantPlan[] {
  if (role === "portrait") return [{ size: "sm", maxWidth: 192, maxHeight: 192 }, { size: "md", maxWidth: 384, maxHeight: 384 }];
  if (role === "background") return [{ size: "md", maxWidth: 960, maxHeight: 540 }, { size: "lg", maxWidth: 1600, maxHeight: 900 }];
  return [{ size: "md", maxWidth: 384, maxHeight: 384 }, { size: "lg", maxWidth: 768, maxHeight: 768 }];
}

function safeOutputPath(value: string, selection: TemerosaContentSelection): string {
  const output = resolve(value);
  if (basename(output) !== selection.version || basename(dirname(output)) !== selection.packId) throw new Error("temerosa_output_path_must_end_with_pack_and_version");
  return output;
}

function parseArgs(values: string[]): CliArguments {
  const output: CliArguments = { finale: "", bestiaization: "", selection: DEFAULT_SELECTION, out: "" };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    if (!value) continue;
    if (key === "--finale") output.finale = value;
    else if (key === "--bestiaization") output.bestiaization = value;
    else if (key === "--selection") output.selection = value;
    else if (key === "--out") output.out = value;
    else continue;
    index += 1;
  }
  if (!output.finale || !output.bestiaization || !output.out) throw new Error("usage: --finale <charx> --bestiaization <charx> [--selection <json>] --out <temerosa-margin/version>");
  return output;
}

function normalize(value: string): string { return value.replace(/\\/g, "/").replace(/^\.\//, ""); }

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
