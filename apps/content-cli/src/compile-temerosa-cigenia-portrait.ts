import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const NPC_ID = "temerosa:finale:cigenia";
const VERSION = "0.3.0";
const SOURCE_IMAGE = "C:/freetalk/테메로세/키게니아.png";
const SOURCE_CARD = "C:/freetalk/테메로세/Cigenia.charx";
const OUTPUT = fileURLToPath(new URL(`../../web/public/content/temerosa-series-npcs/${VERSION}`, import.meta.url));
const EMOTIONS = ["neutral", "pleased", "tense", "despair"] as const;

async function main(): Promise<void> {
  const [image, card, imageStat] = await Promise.all([readFile(SOURCE_IMAGE), readFile(SOURCE_CARD), stat(SOURCE_IMAGE)]);
  const metadata = await sharp(image, { limitInputPixels: 40_000_000 }).metadata();
  if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error("cigenia_source_invalid");
  const imageSha256 = sha256(image);
  const cardSha256 = sha256(card);
  if (cardSha256 !== "dd9b96da9cc26da2aedfa2038cecedbe30111ee71d0e1bb0756750a2c2d98ed9") throw new Error("cigenia_card_changed");

  await rm(OUTPUT, { recursive: true, force: true });
  const variants = await Promise.all([
    derive(image, "sm", 200, 82),
    derive(image, "md", 600, 86),
    derive(image, "lg", 1_200, 88),
  ]);
  const [sm, md, lg] = variants;
  const source = {
    kind: "owner-supplied-direct-art",
    imagePath: "external:C:/freetalk/테메로세/키게니아.png",
    imageSha256,
    cardPath: "external:C:/freetalk/테메로세/Cigenia.charx",
    cardSha256,
    mime: "image/png",
    width: metadata.width,
    height: metadata.height,
    bytes: image.length,
    modifiedAt: imageStat.mtime.toISOString(),
  };
  const manifest = {
    contract: "temerosa-series-npc-portrait-pack/0.3",
    packId: "temerosa-series-npcs",
    version: VERSION,
    generatedAt: new Date().toISOString(),
    identityRule: "series-and-source-persona",
    policy: {
      originalsRedistributed: false,
      actualMimeSniffed: true,
      crossSeriesFallback: false,
      withoutEnlargement: true,
      directArtRequiresOwnerProvenance: true,
    },
    sources: [source],
    totals: { npcs: 1, available: 1, unavailable: 0, imageFiles: 3, imageBytes: variants.reduce((sum, item) => sum + item.bytes, 0) },
    npcs: [{
      npcId: NPC_ID,
      series: "finale",
      status: "available",
      sm: portraitVariant(sm, "neutral", source),
      md: Object.fromEntries(EMOTIONS.map((emotion) => [emotion, portraitVariant(md, emotion, source, emotion === "neutral" ? undefined : "neutral")])),
      lg: portraitVariant(lg, "neutral", source),
      visualReview: { status: "owner-supplied" },
    }],
  };
  await writeJson(resolve(OUTPUT, "manifest.json"), manifest);
  await writeJson(resolve(OUTPUT, "audit.json"), {
    contract: "temerosa-series-npc-portrait-audit/0.3",
    packId: "temerosa-series-npcs",
    version: VERSION,
    status: "passed",
    sourceImageSha256: imageSha256,
    sourceCardSha256: cardSha256,
    enlargedVariants: [],
    crossSeriesFallbacks: [],
    originalFilesIncluded: [],
    generatedFiles: variants.map(({ path, width, height, bytes, sha256 }) => ({ path, width, height, bytes, sha256 })),
  });
}

async function derive(input: Uint8Array, scale: "sm" | "md" | "lg", height: number, quality: number) {
  const path = `assets/${scale}/cigenia.webp`;
  const output = await sharp(input, { limitInputPixels: 40_000_000 })
    .resize({ height, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toBuffer({ resolveWithObject: true });
  const target = resolve(OUTPUT, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, output.data);
  return { scale, path, width: output.info.width, height: output.info.height, bytes: output.data.length, sha256: sha256(output.data) };
}

function portraitVariant(variant: Awaited<ReturnType<typeof derive>>, emotion: typeof EMOTIONS[number], source: object, fallbackFrom?: string) {
  return { ...variant, emotion, mime: "image/webp", source, ...(fallbackFrom ? { fallbackFrom } : {}) };
}

function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
