import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { TEMEROSA_SERIES, type TemerosaSeriesKey } from "./temerosa-series-npcs.ts";
import type { Emotion, PortraitVariant, SeriesNpcPortraitEntry, SeriesNpcPortraitPackManifest } from "./compile-temerosa-series-assets.ts";

const EMOTIONS = ["neutral", "pleased", "tense", "despair"] as const satisfies readonly Emotion[];
const ROWS_PER_SHEET = 8;
const LABEL_WIDTH = 300;
const CELL_WIDTH = 210;
const ROW_HEIGHT = 245;
const HEADER_HEIGHT = 54;
const SHEET_WIDTH = LABEL_WIDTH + CELL_WIDTH * EMOTIONS.length;

export async function renderTemerosaSeriesReviewSheets(packRoot: string, outputRoot: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(resolve(packRoot, "manifest.json"), "utf8")) as SeriesNpcPortraitPackManifest;
  if (manifest.contract !== "temerosa-series-npc-portrait-pack/0.2") throw new Error("series_review_manifest_invalid");
  await mkdir(outputRoot, { recursive: true });
  const outputs: string[] = [];
  for (const series of TEMEROSA_SERIES) {
    const entries = manifest.npcs.filter((npc) => npc.series === series);
    for (let offset = 0; offset < entries.length; offset += ROWS_PER_SHEET) {
      const page = Math.floor(offset / ROWS_PER_SHEET) + 1;
      const output = resolve(outputRoot, `${series}-${String(page).padStart(2, "0")}.png`);
      await renderSheet(packRoot, series, page, entries.slice(offset, offset + ROWS_PER_SHEET), output);
      outputs.push(output);
    }
  }
  return outputs;
}

async function renderSheet(packRoot: string, series: TemerosaSeriesKey, page: number, entries: readonly SeriesNpcPortraitEntry[], output: string): Promise<void> {
  const height = HEADER_HEIGHT + entries.length * ROW_HEIGHT;
  const composites: OverlayOptions[] = [{
    input: Buffer.from(svg(SHEET_WIDTH, HEADER_HEIGHT, `<rect width="100%" height="100%" fill="#111827"/><text x="20" y="34" fill="#f9fafb" font-size="22" font-family="Arial, sans-serif" font-weight="700">${xml(series)} · page ${page}</text>`)),
    left: 0,
    top: 0,
  }];
  for (let row = 0; row < entries.length; row += 1) {
    const entry = entries[row]!;
    const top = HEADER_HEIGHT + row * ROW_HEIGHT;
    const reviewReasons = entry.visualReview.status === "owner-review-needed" ? entry.visualReview.reasons.join(", ") : "";
    composites.push({
      input: Buffer.from(svg(LABEL_WIDTH, ROW_HEIGHT, `<rect width="100%" height="100%" fill="${row % 2 === 0 ? "#172033" : "#131b2b"}"/><text x="14" y="34" fill="#f9fafb" font-size="15" font-family="Arial, sans-serif">${xml(entry.npcId)}</text><text x="14" y="59" fill="${entry.status === "available" ? "#86efac" : "#fca5a5"}" font-size="14" font-family="Arial, sans-serif">${entry.status}</text><text x="14" y="82" fill="${entry.visualReview.status === "approved" ? "#86efac" : "#fbbf24"}" font-size="12" font-family="Arial, sans-serif">${xml(entry.visualReview.status)}</text><text x="14" y="103" fill="#9ca3af" font-size="10" font-family="Arial, sans-serif">${xml(reviewReasons.slice(0, 42))}</text>`)),
      left: 0,
      top,
    });
    for (let column = 0; column < EMOTIONS.length; column += 1) {
      const emotion = EMOTIONS[column]!;
      const left = LABEL_WIDTH + column * CELL_WIDTH;
      const variant = entry.status === "available" ? entry.md[emotion] : undefined;
      composites.push({ input: Buffer.from(cellLabel(emotion, variant, row)), left, top });
      if (variant) {
        const image = await sharp(resolve(packRoot, variant.path)).resize({ width: 184, height: 190, fit: "contain" }).png().toBuffer();
        composites.push({ input: image, left: left + 13, top: top + 29 });
      }
    }
  }
  await sharp({ create: { width: SHEET_WIDTH, height, channels: 4, background: "#0b1020" } }).composite(composites).png().toFile(output);
}

function cellLabel(emotion: Emotion, variant: PortraitVariant | undefined, row: number): string {
  const fill = row % 2 === 0 ? "#172033" : "#131b2b";
  const source = variant ? `${variant.source.name}${variant.fallbackFrom ? ` · fallback:${variant.fallbackFrom}` : ""}` : "unavailable";
  return svg(CELL_WIDTH, ROW_HEIGHT, `<rect width="100%" height="100%" fill="${fill}"/><rect x="8" y="26" width="194" height="198" rx="5" fill="#030712" stroke="#374151"/><text x="10" y="19" fill="#93c5fd" font-size="13" font-family="Arial, sans-serif">${emotion}</text><text x="10" y="239" fill="${variant?.fallbackFrom ? "#fbbf24" : "#9ca3af"}" font-size="10" font-family="Arial, sans-serif">${xml(source.slice(0, 34))}</text>`);
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;
}

function xml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]!);
}

function parseArgs(values: readonly string[]): { packRoot: string; outputRoot: string } {
  let packRoot = "", outputRoot = "";
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index], value = values[index + 1];
    if (!key || !value) continue;
    if (key === "--pack") packRoot = value;
    else if (key === "--out") outputRoot = value;
    else continue;
    index += 1;
  }
  if (!packRoot || !outputRoot) throw new Error("usage: --pack <portrait-pack> --out <review-directory>");
  return { packRoot: resolve(packRoot), outputRoot: resolve(outputRoot) };
}

if (process.argv[1]?.endsWith("render-temerosa-series-review-sheets.ts")) {
  const args = parseArgs(process.argv.slice(2));
  void renderTemerosaSeriesReviewSheets(args.packRoot, args.outputRoot)
    .then((outputs) => process.stdout.write(`${JSON.stringify({ outputs }, null, 2)}\n`))
    .catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
