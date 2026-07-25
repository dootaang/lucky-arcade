import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import sharp from "sharp";
import { sniffDisplayImageMime } from "@lucky-arcade/card-io";
import { spriteAtlasManifestSchema } from "@lucky-arcade/contracts";

export async function auditPlayingCards(manifestPath: string): Promise<void> {
  const root = dirname(manifestPath);
  const manifest = spriteAtlasManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (manifest.frames.length !== 13) throw new Error("atlas_frame_count_mismatch");
  const ids = new Set<string>(), positions = new Set<string>();
  for (const frame of manifest.frames) {
    if (ids.has(frame.id)) throw new Error(`atlas_frame_id_duplicate:${frame.id}`);
    if (positions.has(`${frame.col}:${frame.row}`)) throw new Error(`atlas_frame_position_duplicate:${frame.col}:${frame.row}`);
    if (frame.col >= manifest.cols || frame.row >= manifest.rows) throw new Error(`atlas_frame_grid_overflow:${frame.id}`);
    ids.add(frame.id); positions.add(`${frame.col}:${frame.row}`);
  }
  for (const sheet of manifest.sheets) {
    const path = resolve(root, sheet.path);
    if (!path.startsWith(`${root}${sep}`)) throw new Error(`atlas_path_escape:${sheet.path}`);
    const bytes = await readFile(path), info = await stat(path), metadata = await sharp(bytes).metadata();
    if (info.size !== sheet.bytes) throw new Error(`atlas_size_mismatch:${sheet.path}`);
    if (sniffDisplayImageMime(bytes) !== "image/webp") throw new Error(`atlas_mime_mismatch:${sheet.path}`);
    if (metadata.width !== sheet.width || metadata.height !== sheet.height) throw new Error(`atlas_dimensions_mismatch:${sheet.path}`);
    for (const frame of manifest.frames) {
      if (frame.col * (sheet.cell.w + sheet.gutter) + sheet.cell.w > sheet.width || frame.row * (sheet.cell.h + sheet.gutter) + sheet.cell.h > sheet.height) throw new Error(`atlas_frame_overflow:${sheet.size}:${frame.id}`);
    }
  }
}

async function main(): Promise<void> {
  const input = process.argv.slice(2).find((value) => value !== "--");
  if (!input) throw new Error("usage: pnpm content:cards:audit -- <manifest.json>");
  const root = process.env.INIT_CWD ?? process.cwd();
  await auditPlayingCards(resolve(root, input));
  process.stdout.write(`${JSON.stringify({ status: "pass" }, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("audit-playing-cards.ts")) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
