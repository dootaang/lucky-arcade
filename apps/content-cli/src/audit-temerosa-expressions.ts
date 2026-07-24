import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openAssetResolver, type AssetResolver } from "@lucky-arcade/card-io";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import sharp from "sharp";
import { TEMEROSA_FORBIDDEN_ASSET_NAME } from "./temerosa-policy.ts";

const SOURCE_IDS = ["overture", "root2", "bestiaization", "finale"] as const;
const CHARACTER_IDS = ["pale", "kano", "nieun", "alger", "wares", "nemo", "bacikal", "lyla", "riel"] as const;
type SourceId = (typeof SOURCE_IDS)[number];
type CharacterId = (typeof CHARACTER_IDS)[number];

type Arguments = { sources: Record<SourceId, string>; out: string; previews?: string };
type Candidate = {
  source: SourceId;
  assetId: string;
  name: string;
  path: string;
  characterId: CharacterId;
  expression: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  duplicateGroup: number;
  previewBytes: Uint8Array;
};

export function classifyTemerosaExpressionName(name: string): { characterId: CharacterId; expression: string } | null {
  const normalized = name.trim().normalize("NFKC");
  const characterId = CHARACTER_IDS.find((candidate) => new RegExp(`^${candidate}(?:[._\\s-]|$)`, "i").test(normalized));
  if (!characterId) return null;
  const rawExpression = normalized.replace(new RegExp(`^${characterId}(?:[._\\s-]+)?`, "i"), "");
  const expression = normalizeExpression(rawExpression || "natural");
  return { characterId, expression };
}

export function isTemerosaExpressionNameForbidden(name: string, path = ""): boolean {
  return TEMEROSA_FORBIDDEN_ASSET_NAME.test(name) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(path);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const reportPath = resolve(process.env.INIT_CWD ?? process.cwd(), args.out);
  const previewRoot = args.previews ? resolve(process.env.INIT_CWD ?? process.cwd(), args.previews) : undefined;
  const candidates: Candidate[] = [];
  const sourceSummary: Record<string, { file: string; assets: number; targetNamed: number; excludedByName: number; safeCandidates: number }> = {};
  const duplicateGroups = new Map<string, number>();
  const resolvers: AssetResolver[] = [];

  try {
    for (const sourceId of SOURCE_IDS) {
      const path = args.sources[sourceId];
      const resolver = await openAssetResolver(await NodeFileSource.open(path));
      resolvers.push(resolver);
      let targetNamed = 0;
      let excludedByName = 0;
      let safeCandidates = 0;
      for (const asset of resolver.assets) {
        const identity = classifyTemerosaExpressionName(asset.name);
        if (!identity) continue;
        targetNamed += 1;
        if (isTemerosaExpressionNameForbidden(asset.name, asset.path ?? "")) {
          excludedByName += 1;
          continue;
        }
        const resolved = await resolver.read(asset.id);
        const metadata = await sharp(resolved.bytes, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
        if (!metadata.width || !metadata.height) continue;
        const hash = createHash("sha256").update(resolved.bytes).digest("hex");
        let duplicateGroup = duplicateGroups.get(hash);
        if (duplicateGroup === undefined) {
          duplicateGroup = duplicateGroups.size + 1;
          duplicateGroups.set(hash, duplicateGroup);
        }
        candidates.push({
          source: sourceId,
          assetId: asset.id,
          name: asset.name,
          path: asset.path ?? "",
          characterId: identity.characterId,
          expression: identity.expression,
          width: metadata.width,
          height: metadata.height,
          bytes: resolved.bytes.byteLength,
          mime: resolved.mime,
          duplicateGroup,
          previewBytes: resolved.bytes,
        });
        safeCandidates += 1;
      }
      sourceSummary[sourceId] = { file: basename(path), assets: resolver.assets.length, targetNamed, excludedByName, safeCandidates };
    }

    candidates.sort((left, right) => left.characterId.localeCompare(right.characterId) || left.expression.localeCompare(right.expression) || left.source.localeCompare(right.source) || left.path.localeCompare(right.path));
    const characters = Object.fromEntries(CHARACTER_IDS.map((characterId) => {
      const items = candidates.filter((candidate) => candidate.characterId === characterId);
      return [characterId, {
        candidates: items.length,
        exactUnique: new Set(items.map((item) => item.duplicateGroup)).size,
        expressionLabels: [...new Set(items.map((item) => item.expression))].sort(),
        assets: items.map(({ previewBytes: _previewBytes, ...item }) => item),
      }];
    }));
    const report = {
      contract: "temerosa-expression-inventory/0.1",
      generatedAt: new Date().toISOString(),
      notice: "Filename-safe candidates only. Human visual review is required before allowlisting or assigning emotion semantics.",
      sources: sourceSummary,
      totals: {
        assets: Object.values(sourceSummary).reduce((sum, item) => sum + item.assets, 0),
        targetNamed: Object.values(sourceSummary).reduce((sum, item) => sum + item.targetNamed, 0),
        excludedByName: Object.values(sourceSummary).reduce((sum, item) => sum + item.excludedByName, 0),
        safeCandidates: candidates.length,
        exactUnique: new Set(candidates.map((candidate) => candidate.duplicateGroup)).size,
      },
      characters,
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (previewRoot) await writeContactSheets(previewRoot, candidates);
    process.stdout.write(`${JSON.stringify({ report: reportPath, previews: previewRoot, ...report.totals }, null, 2)}\n`);
  } finally {
    for (const resolver of resolvers) resolver.dispose();
  }
}

async function writeContactSheets(root: string, candidates: readonly Candidate[]): Promise<void> {
  await mkdir(root, { recursive: true });
  const pageSize = 24;
  for (const characterId of CHARACTER_IDS) {
    const items = candidates.filter((candidate) => candidate.characterId === characterId);
    for (let offset = 0; offset < items.length; offset += pageSize) {
      const page = items.slice(offset, offset + pageSize);
      const tiles = await Promise.all(page.map((candidate) => makeTile(candidate)));
      const width = 4 * 200;
      const height = 6 * 250;
      const canvas = sharp({ create: { width, height, channels: 4, background: "#111827" } });
      const composite = tiles.map((input, index) => ({ input, left: (index % 4) * 200, top: Math.floor(index / 4) * 250 }));
      const pageNumber = String(Math.floor(offset / pageSize) + 1).padStart(2, "0");
      await canvas.composite(composite).webp({ quality: 88, effort: 4 }).toFile(resolve(root, `${characterId}-${pageNumber}.webp`));
    }
  }
}

async function makeTile(candidate: Candidate): Promise<Buffer> {
  const portrait = await sharp(candidate.previewBytes, { failOn: "error", limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 184, height: 190, fit: "contain", background: { r: 30, g: 41, b: 59, alpha: 1 } })
    .webp({ quality: 84 })
    .toBuffer();
  const label = `${candidate.expression}\n${candidate.source} · ${candidate.width}×${candidate.height}`;
  const svg = Buffer.from(`<svg width="184" height="48" xmlns="http://www.w3.org/2000/svg"><rect width="184" height="48" fill="#0f172a"/><text x="6" y="17" fill="#f8fafc" font-size="12" font-family="sans-serif">${escapeXml(label.split("\n")[0] ?? "")}</text><text x="6" y="35" fill="#94a3b8" font-size="10" font-family="sans-serif">${escapeXml(label.split("\n")[1] ?? "")}</text></svg>`);
  return sharp({ create: { width: 200, height: 250, channels: 4, background: "#111827" } })
    .composite([{ input: portrait, left: 8, top: 6 }, { input: svg, left: 8, top: 198 }])
    .webp({ quality: 88 })
    .toBuffer();
}

function parseArguments(values: readonly string[]): Arguments {
  const sources = {} as Record<SourceId, string>;
  let out = "";
  let previews: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    if (!key || !value) continue;
    if (key === "--out") out = value;
    else if (key === "--previews") previews = value;
    else if (key.startsWith("--")) {
      const sourceId = key.slice(2) as SourceId;
      if (SOURCE_IDS.includes(sourceId)) sources[sourceId] = value;
      else continue;
    } else continue;
    index += 1;
  }
  const missing = SOURCE_IDS.filter((sourceId) => !sources[sourceId]);
  if (!out || missing.length > 0) throw new Error(`usage: ${SOURCE_IDS.map((sourceId) => `--${sourceId} <charx>`).join(" ")} --out <json> [--previews <dir>]`);
  return { sources, out, ...(previews ? { previews } : {}) };
}

function normalizeExpression(value: string): string {
  return value.trim().toLowerCase().replace(/blsuh/g, "blush").replace(/disapponted/g, "disappointed").replace(/[._\s]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "natural";
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
