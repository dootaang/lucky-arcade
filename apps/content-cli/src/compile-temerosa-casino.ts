import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { openAssetResolver, parseCardSource, type AssetResolver } from "@lucky-arcade/card-io";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import { temerosaContentSelectionSchema } from "@lucky-arcade/contracts";
import sharp from "sharp";
import { TEMEROSA_FORBIDDEN_ASSET_NAME } from "./temerosa-policy.ts";
import { SEAT_ROLES, TEMEROSA_CASINO_CARD_ONLY, TEMEROSA_CASINO_MIN_CARD_FACES, TEMEROSA_CASINO_NPCS, type CasinoSource } from "./temerosa-casino-plan.ts";

type Args = { sources: Record<CasinoSource, string>; selection: string; report: string; previews?: string };
type InventoryItem = {
  sourceCard: CasinoSource; sourceCardName: string; sourceEntryPath: string; originalName: string; normalizedName: string;
  normalizationEvidence: string[]; detectedMime: string; width: number; height: number; bytes: number; sha256: string;
  perceptualHash: string; exactDuplicateOf?: string; perceptualDuplicateCandidates: string[];
  geometryQueue: "portrait" | "square" | "landscape" | "other"; reviewStatus: "candidate" | "approved" | "rejected";
  approvedUses: string[]; reviewEvidence: string;
};

const MAX_INPUT_PIXELS = 40_000_000;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = process.env.INIT_CWD ?? process.cwd();
  const resolvers = {} as Record<CasinoSource, AssetResolver>;
  const cardNames = {} as Record<CasinoSource, string>;
  try {
    for (const [source, path] of Object.entries(args.sources) as [CasinoSource, string][]) {
      const nodeSource = await NodeFileSource.open(path);
      cardNames[source] = (await parseCardSource(nodeSource)).name;
      resolvers[source] = await openAssetResolver(await NodeFileSource.open(path));
    }
    const planned = plannedAssets();
    const plannedByLocator = new Map(planned.map((item) => [`${item.source}:${normalizePath(item.path)}`, item]));
    const inventory: InventoryItem[] = [];
    const exactFirst = new Map<string, string>();

    for (const source of Object.keys(resolvers) as CasinoSource[]) {
      for (const asset of resolvers[source].assets) {
        if (!asset.mime.startsWith("image/") && !/\.(?:png|jpe?g|webp|gif|avif|bmp)$/i.test(asset.path ?? "")) continue;
        const path = normalizePath(asset.path ?? "");
        const locator = `${source}:${path}`;
        const plan = plannedByLocator.get(locator);
        const forbidden = TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.name) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(path);
        const resolvedAsset = await resolvers[source].read(asset.id);
        const metadata = await sharp(resolvedAsset.bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
        if (!metadata.width || !metadata.height) continue;
        const sha256 = createHash("sha256").update(resolvedAsset.bytes).digest("hex");
        const perceptualHash = await differenceHash(resolvedAsset.bytes);
        const normalized = normalizeName(asset.name);
        const first = exactFirst.get(sha256);
        if (!first) exactFirst.set(sha256, locator);
        const status = forbidden ? "rejected" : plan ? "approved" : "candidate";
        inventory.push({
          sourceCard: source, sourceCardName: cardNames[source], sourceEntryPath: path, originalName: asset.name,
          normalizedName: normalized.value, normalizationEvidence: normalized.evidence, detectedMime: resolvedAsset.mime,
          width: metadata.width, height: metadata.height, bytes: resolvedAsset.bytes.byteLength, sha256, perceptualHash,
          ...(first ? { exactDuplicateOf: first } : {}), perceptualDuplicateCandidates: [], geometryQueue: geometry(metadata.width, metadata.height),
          reviewStatus: status, approvedUses: plan ? plan.uses : [],
          reviewEvidence: forbidden ? "rejected by explicit forbidden-state policy; filename alone never grants approval" : plan?.evidence ?? "candidate only; no visual approval or runtime use",
        });
      }
    }

    const missingPlanned = [...plannedByLocator.keys()].filter((locator) => !inventory.some((item) => `${item.sourceCard}:${item.sourceEntryPath}` === locator && item.reviewStatus === "approved"));
    if (missingPlanned.length) throw new Error(`casino_planned_assets_missing:${missingPlanned.join(",")}`);
    const approved = inventory.filter((item) => item.reviewStatus === "approved");
    for (const item of inventory) {
      item.perceptualDuplicateCandidates = approved
        .filter((other) => other.sha256 !== item.sha256 && hamming(item.perceptualHash, other.perceptualHash) <= 5)
        .map((other) => `${other.sourceCard}:${other.sourceEntryPath}`);
    }
    const approvedHashes = new Set<string>();
    const exactUniqueApproved = approved.filter((item) => { if (approvedHashes.has(item.sha256)) return false; approvedHashes.add(item.sha256); return true; });
    for (const item of approved) if (item.geometryQueue !== "portrait") item.approvedUses = item.approvedUses.filter((use) => use !== "card-face");
    const approvedVerticalCardFaces = exactUniqueApproved.filter((item) => item.geometryQueue === "portrait" && item.approvedUses.includes("card-face"));
    if (approvedVerticalCardFaces.length < TEMEROSA_CASINO_MIN_CARD_FACES) throw new Error(`casino_approved_unique_faces_below_minimum:${approvedVerticalCardFaces.length}`);

    const runtimeApproved = exactUniqueApproved.filter((item) => item.approvedUses.length > 0);
    const selectionAssets = runtimeApproved.map((item) => {
      const plan = plannedByLocator.get(`${item.sourceCard}:${item.sourceEntryPath}`)!;
      return {
        id: plan.id,
        source: item.sourceCard,
        sourcePath: item.sourceEntryPath,
        role: "portrait" as const,
        chunk: "margin",
        characterId: plan.characterId,
        expression: plan.expression,
        appearanceSet: plan.appearanceSet,
      };
    });
    const selection = temerosaContentSelectionSchema.parse({ contract: "temerosa-content-selection/0.1", packId: "temerosa-margin", version: "0.8.0", assets: selectionAssets });
    const report = {
      contract: "temerosa-casino-asset-audit/0.1", generatedAt: new Date().toISOString(),
      policy: { automaticNamePassIsApproval: false, geometryAloneIsIdentity: false, runtimeRequiresApproved: true, derivatives: ["sm", "md"] },
      totals: {
        sourceAssets: inventory.length, candidates: inventory.filter((item) => item.reviewStatus === "candidate").length,
        approved: approved.length, approvedExactUnique: exactUniqueApproved.length, approvedVerticalCardFaces: approvedVerticalCardFaces.length, rejected: inventory.filter((item) => item.reviewStatus === "rejected").length,
        exactDuplicateAssets: inventory.filter((item) => item.exactDuplicateOf).length,
        perceptualDuplicateCandidateLinks: inventory.reduce((sum, item) => sum + item.perceptualDuplicateCandidates.length, 0),
        npcCandidates: TEMEROSA_CASINO_NPCS.length,
      },
      npcCandidates: TEMEROSA_CASINO_NPCS.map(({ seatPaths, extraPaths: _extraPaths, ...item }) => ({ ...item, selectable: item.id !== "bacikal", seatRoles: seatPaths })),
      inventory,
    };
    await mkdir(dirname(resolve(root, args.selection)), { recursive: true });
    await mkdir(dirname(resolve(root, args.report)), { recursive: true });
    await writeFile(resolve(root, args.selection), `${JSON.stringify(selection, null, 2)}\n`, "utf8");
    await writeFile(resolve(root, args.report), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (args.previews) await writeContactSheets(resolve(root, args.previews), exactUniqueApproved, resolvers);
    process.stdout.write(`${JSON.stringify({ selection: resolve(root, args.selection), report: resolve(root, args.report), ...report.totals }, null, 2)}\n`);
  } finally {
    for (const resolver of Object.values(resolvers)) resolver?.dispose();
  }
}

function plannedAssets(): { source: "bestiaization" | "nemo"; path: string; id: string; characterId: string; expression: string; appearanceSet: string; uses: string[]; evidence: string }[] {
  const output: ReturnType<typeof plannedAssets> = [];
  for (const npc of TEMEROSA_CASINO_NPCS) {
    for (const role of SEAT_ROLES) {
      const path = npc.seatPaths[role];
      output.push({ source: npc.source, path, id: `npc-${npc.id}-${role}`, characterId: npc.id, expression: role, appearanceSet: npc.appearanceSet,
        uses: ["card-face", "seat-portrait", `seat-${role}`], evidence: `human visual review: portrait/SFW/${role}; ${npc.loreEntry}; ${npc.importanceEvidence}` });
    }
    for (let index = 0; index < npc.extraPaths.length; index += 1) {
      const expression = index === 0 ? "blush" : "surprised";
      output.push({ source: npc.source, path: npc.extraPaths[index]!, id: `card-${npc.id}-${expression}`, characterId: npc.id, expression, appearanceSet: npc.appearanceSet,
        uses: ["card-face"], evidence: `human visual review: portrait/SFW/${expression}; ${npc.loreEntry}` });
    }
  }
  for (const character of TEMEROSA_CASINO_CARD_ONLY) {
    for (const face of character.faces) output.push({ source: "bestiaization", path: face.path, id: `card-${character.id}-${face.expression}`, characterId: character.id,
      expression: face.expression, appearanceSet: character.appearanceSet, uses: ["card-face"],
      evidence: `human visual review: portrait/SFW/${face.expression}; ${character.loreEntry}; ${character.importanceEvidence}` });
  }
  return output;
}

async function differenceHash(bytes: Uint8Array): Promise<string> {
  const pixels = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let row = 0; row < 8; row += 1) for (let column = 0; column < 8; column += 1) bits += pixels[row * 9 + column]! > pixels[row * 9 + column + 1]! ? "1" : "0";
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

function hamming(left: string, right: string): number { let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`), count = 0; while (value) { count += Number(value & 1n); value >>= 1n; } return count; }
function geometry(width: number, height: number): InventoryItem["geometryQueue"] { const ratio = width / height; return ratio <= 0.9 ? "portrait" : ratio < 1.1 ? "square" : ratio > 1.1 ? "landscape" : "other"; }
function normalizePath(value: string): string { return value.replace(/\\/g, "/").replace(/^\.\//, ""); }
function normalizeName(value: string): { value: string; evidence: string[] } {
  const evidence: string[] = [];
  let normalized = value.normalize("NFKC"); if (normalized !== value) evidence.push("unicode-nfkc");
  const typo = normalized.replace(/disapponted/gi, "disappointed").replace(/\bsas\b/gi, "sad"); if (typo !== normalized) evidence.push("known-typo"); normalized = typo;
  const separators = normalized.replace(/[._\s]+/g, "-"); if (separators !== normalized) evidence.push("separator"); normalized = separators;
  const lower = normalized.toLowerCase(); if (lower !== normalized) evidence.push("case-fold");
  return { value: lower.replace(/-+/g, "-").replace(/^-|-$/g, ""), evidence };
}

async function writeContactSheets(root: string, items: readonly InventoryItem[], resolvers: Record<CasinoSource, AssetResolver>): Promise<void> {
  await mkdir(root, { recursive: true });
  for (let offset = 0; offset < items.length; offset += 30) {
    const page = items.slice(offset, offset + 30); const tiles: Buffer[] = [];
    for (const item of page) {
      const resolver = resolvers[item.sourceCard]; const asset = resolver.assets.find((candidate) => normalizePath(candidate.path ?? "") === item.sourceEntryPath)!;
      const bytes = (await resolver.read(asset.id)).bytes;
      const portrait = await sharp(bytes).rotate().resize({ width: 150, height: 190, fit: "contain", background: "#1e293b" }).webp({ quality: 82 }).toBuffer();
      const label = Buffer.from(`<svg width="150" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="150" height="34" fill="#0f172a"/><text x="4" y="14" fill="white" font-size="10" font-family="sans-serif">${escapeXml(item.normalizedName)}</text><text x="4" y="28" fill="#94a3b8" font-size="9" font-family="sans-serif">${escapeXml(item.sourceCard)}</text></svg>`);
      tiles.push(await sharp({ create: { width: 160, height: 234, channels: 4, background: "#111827" } }).composite([{ input: portrait, left: 5, top: 5 }, { input: label, left: 5, top: 195 }]).webp().toBuffer());
    }
    await sharp({ create: { width: 800, height: 1404, channels: 4, background: "#111827" } }).composite(tiles.map((input, index) => ({ input, left: (index % 5) * 160, top: Math.floor(index / 5) * 234 }))).webp({ quality: 86 }).toFile(resolve(root, `approved-${String(offset / 30 + 1).padStart(2, "0")}.webp`));
  }
}
function escapeXml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function parseArgs(values: string[]): Args {
  const sources = {} as Record<CasinoSource, string>; let selection = "", report = "", previews: string | undefined;
  for (let i = 0; i < values.length; i += 1) { const key = values[i], value = values[i + 1]; if (!key || !value) continue;
    if (key === "--selection") selection = value; else if (key === "--report") report = value; else if (key === "--previews") previews = value;
    else if (key.startsWith("--") && ["overture", "root2", "bestiaization", "finale", "nemo"].includes(key.slice(2))) sources[key.slice(2) as CasinoSource] = value; else continue; i += 1; }
  const missing = (["overture", "root2", "bestiaization", "finale", "nemo"] as CasinoSource[]).filter((source) => !sources[source]);
  if (!selection || !report || missing.length) throw new Error("usage: five source arguments --selection <json> --report <json> [--previews <dir>]");
  return { sources, selection, report, ...(previews ? { previews } : {}) };
}

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
