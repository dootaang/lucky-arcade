import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { spriteAtlasManifestSchema, type SpriteAtlasManifest } from "@lucky-arcade/contracts";

const VERSION = "1.0.0";
const GUTTER = 4;
const SOURCES = [
  ["spades-j", "J.webp"], ["spades-q", "퀸.webp"], ["spades-k", "킹.webp"],
  ["hearts-j", "J2.webp"], ["hearts-q", "Q.webp"], ["hearts-k", "K.webp"],
  ["diamonds-j", "J3.webp"], ["diamonds-q", "Q3.webp"], ["diamonds-k", "K2.webp"],
  ["clubs-j", "J4.webp"], ["clubs-q", "Q4.webp"], ["clubs-k", "K3.webp"],
  ["joker", "Joker.webp"],
] as const;
const SIZES = [{ size: "sm" as const, w: 112, h: 172 }, { size: "md" as const, w: 224, h: 344 }];

export async function compilePlayingCards(sourceRoot: string, outputRoot: string): Promise<SpriteAtlasManifest> {
  await mkdir(outputRoot, { recursive: true });
  const frames = SOURCES.map(([id], index) => ({ id, col: index % 4, row: Math.floor(index / 4) }));
  const sheets: SpriteAtlasManifest["sheets"] = [];
  for (const size of SIZES) {
    const width = 4 * size.w + 3 * GUTTER, height = 4 * size.h + 3 * GUTTER;
    const composites = await Promise.all(SOURCES.map(async ([, filename], index) => ({
      input: await sharp(await readFile(resolve(sourceRoot, filename))).resize(size.w, size.h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90, alphaQuality: 100 }).toBuffer(),
      left: (index % 4) * (size.w + GUTTER), top: Math.floor(index / 4) * (size.h + GUTTER),
    })));
    const relative = `court-atlas-${size.size}.webp`, target = resolve(outputRoot, relative);
    await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).webp({ quality: 90, alphaQuality: 100 }).toFile(target);
    sheets.push({ size: size.size, path: relative, mime: "image/webp", width, height, cell: { w: size.w, h: size.h }, gutter: GUTTER, bytes: (await stat(target)).size });
  }
  const manifest = spriteAtlasManifestSchema.parse({ contract: "sprite-atlas/0.1", atlasId: "playing-cards", version: VERSION, cols: 4, rows: 4, frames, sheets, warnings: ["J2.webp 원본은 195×300이므로 md 아틀라스에서 확대되어 다른 그림 카드보다 흐릴 수 있다."] });
  await writeFile(resolve(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function main(): Promise<void> {
  const source = process.argv.slice(2).find((value) => value !== "--");
  if (!source) throw new Error("usage: pnpm content:cards -- <source-directory>");
  const root = process.env.INIT_CWD ?? process.cwd();
  const manifest = await compilePlayingCards(resolve(root, source), resolve(root, `apps/web/public/content/playing-cards/${VERSION}`));
  process.stdout.write(`${JSON.stringify({ frames: manifest.frames.length, sheets: manifest.sheets.map((sheet) => ({ size: sheet.size, bytes: sheet.bytes })) }, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("playing-cards.ts")) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
