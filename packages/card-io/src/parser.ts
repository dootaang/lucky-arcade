import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { parsedCardSchema, type AssetReference, type CardFormat, type ParsedCard } from "@lucky-arcade/contracts";
import { fingerprintSource, readAll, type BinarySource } from "./source.ts";
import { indexZip, readZipEntry, type ZipEntry } from "./zip.ts";

const decoder = new TextDecoder();
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_DOCUMENT = 32 * 1024 * 1024;
const IMAGE = /\.(?:png|jpe?g|webp|gif|avif|bmp|svg)$/i;

export async function parseCardSource(source: BinarySource): Promise<ParsedCard> {
  if (source.size === 0) throw new Error("card_empty");
  const head = await source.read(0, Math.min(16, source.size));
  const format = detectFormat(head);
  const parsed = format === "charx" || format === "jpeg"
    ? await parseZipCard(source, format)
    : format === "png"
    ? await parsePng(source, await fingerprintSource(source))
      : format === "risum"
        ? await parseRisumSource(source, await fingerprintSource(source))
        : await parseJsonSource(source, await fingerprintSource(source));
  return parsedCardSchema.parse(parsed);
}

export function detectFormat(head: Uint8Array): CardFormat {
  if (PNG_SIGNATURE.every((value, index) => head[index] === value)) return "png";
  if (head[0] === 0x50 && head[1] === 0x4b) return "charx";
  if (head[0] === 0x6f) return "risum";
  if (head[0] === 0xff && head[1] === 0xd8) return "jpeg";
  return "json";
}

async function parseJsonSource(source: BinarySource, fingerprint: string): Promise<ParsedCard> {
  const card = parseJson(await readAll(source, MAX_DOCUMENT), "card_json_invalid");
  return makeResult(source, fingerprint, "json", card, assetsFromCard(card, fingerprint), extensionLorebooks(card), []);
}

async function parseZipCard(source: BinarySource, format: "charx" | "jpeg"): Promise<ParsedCard> {
  const index = await indexZip(source);
  const fingerprint = bytesToHex(sha256(new TextEncoder().encode(`${source.size}:${index.centralDirectoryHash}`)));
  const cardEntry = index.entries.find((entry) => /(?:^|\/)card\.json$/i.test(entry.path));
  if (!cardEntry) throw new Error("charx_card_missing");
  const card = parseJson(await readZipEntry(source, cardEntry, MAX_DOCUMENT), "charx_card_invalid");
  const byPath = new Map(index.entries.map((entry) => [normalizePath(entry.path), entry]));
  const assets = assetsFromCard(card, fingerprint, byPath);
  const moduleLorebooks = [...extensionLorebooks(card)];
  const warnings: string[] = [];
  for (const entry of index.entries.filter((candidate) => /\.risum$/i.test(candidate.path))) {
    try {
      const root = decodeRisum(await readZipEntry(source, entry, MAX_DOCUMENT));
      moduleLorebooks.push(...lorebooksFromModule(root));
    } catch { warnings.push(`module_metadata_unreadable:${entry.path}`); }
  }
  return makeResult(source, fingerprint, format, card, assets, moduleLorebooks, warnings);
}

async function parsePng(source: BinarySource, fingerprint: string): Promise<ParsedCard> {
  let offset = 8;
  let modernCard: Record<string, unknown> | null = null, legacyCard: Record<string, unknown> | null = null;
  const warnings: string[] = [];
  while (offset + 12 <= source.size) {
    const header = await source.read(offset, 8);
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const length = view.getUint32(0);
    const type = decoder.decode(header.subarray(4, 8));
    if (offset + 12 + length > source.size) throw new Error("png_chunk_truncated");
    if (type === "tEXt" && length <= MAX_DOCUMENT) {
      const data = await source.read(offset + 8, length);
      const zero = data.indexOf(0);
      if (zero >= 0) {
        const key = decoder.decode(data.subarray(0, zero));
        if (key === "ccv3" || key === "chara") {
          try {
            const value = parseJson(decodeBase64(decoder.decode(data.subarray(zero + 1))), "png_card_payload_invalid");
            if (key === "ccv3") modernCard = value; else legacyCard = value;
          }
          catch (error) { if (key === "ccv3") throw error; warnings.push("legacy_png_payload_invalid"); }
        }
      }
    }
    offset += 12 + length;
    if (type === "IEND") break;
  }
  const card = modernCard ?? legacyCard;
  if (!card) throw new Error("png_card_missing");
  return makeResult(source, fingerprint, "png", card, assetsFromCard(card, fingerprint), extensionLorebooks(card), warnings);
}

async function parseRisumSource(source: BinarySource, fingerprint: string): Promise<ParsedCard> {
  const root = decodeRisum(await readAll(source, MAX_DOCUMENT));
  const module = object(root.module ?? root);
  const assets = assetsFromDefinitions(module.assets, fingerprint, "risum-entry");
  return makeResult(source, fingerprint, "risum", root, assets, lorebooksFromModule(root), []);
}

function makeResult(source: BinarySource, fingerprint: string, format: CardFormat, card: Record<string, unknown>, assets: AssetReference[], moduleLorebooks: unknown[][], warnings: string[]): ParsedCard {
  const data = object(card.data ?? card);
  return {
    contract: "parsed-card/0.1",
    format,
    sourceName: source.name,
    sourceSize: source.size,
    fingerprint,
    name: String(data.name ?? card.name ?? source.name),
    spec: String(card.spec ?? (format === "risum" ? "risu-module" : "")),
    specVersion: String(card.spec_version ?? card.type ?? ""),
    card,
    assets,
    moduleLorebooks,
    warnings,
  };
}

function assetsFromCard(card: Record<string, unknown>, fingerprint: string, zipEntries?: Map<string, ZipEntry>): AssetReference[] {
  const data = object(card.data ?? card);
  return assetsFromDefinitions(data.assets, fingerprint, "inline", zipEntries);
}

function assetsFromDefinitions(value: unknown, fingerprint: string, fallbackContainer: AssetReference["container"], zipEntries?: Map<string, ZipEntry>): AssetReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    const item = Array.isArray(raw) ? { name: raw[0], ext: raw[2], uri: "" } : object(raw);
    const name = String(item.name ?? `asset-${index}`);
    const uri = String(item.uri ?? "");
    const path = normalizePath(uri.replace(/^[a-z][\w+.-]*:\/\//i, ""));
    const extension = String(item.ext ?? extensionOf(path || name));
    const entry = zipEntries?.get(path);
    const inlineMatch = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(uri);
    const container: AssetReference["container"] = entry ? "zip-entry" : /^ccdefault:/i.test(uri) ? "card-image" : fallbackContainer;
    const size = entry?.size ?? (inlineMatch ? Math.floor((inlineMatch[2]?.length ?? 0) * 0.75) : 0);
    return [{ id: `${fingerprint.slice(0, 16)}:${index}:${stableId(name)}`, name, ...(path && !inlineMatch ? { path } : {}), extension, mime: mime(extension), size, container }];
  });
}

function extensionLorebooks(card: Record<string, unknown>): unknown[][] {
  const data = object(card.data ?? card);
  const risu = object(object(data.extensions).risuai);
  return lorebooksFromModule(risu);
}

function lorebooksFromModule(root: Record<string, unknown>): unknown[][] {
  const module = object(root.module ?? root);
  const books: unknown[][] = [];
  if (Array.isArray(module.lorebook)) books.push(module.lorebook);
  if (Array.isArray(module.lorebooks)) {
    for (const value of module.lorebooks) {
      if (Array.isArray(value)) books.push(value);
      else {
        const entries = object(value).entries;
        if (Array.isArray(entries)) books.push(entries);
      }
    }
  }
  return books;
}

function parseJson(bytes: Uint8Array, code: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(decoder.decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
    return value as Record<string, unknown>;
  } catch { throw new Error(code); }
}

function decodeBase64(value: string): Uint8Array {
  const raw = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

const decodeMap = Uint8Array.from([44,247,132,139,201,101,251,182,159,174,179,3,45,1,105,116,31,228,163,236,238,92,52,33,147,74,15,106,226,98,2,158,34,156,253,60,252,113,199,198,173,89,103,5,112,109,138,68,18,250,36,134,95,175,209,122,71,206,254,80,99,221,81,6,111,24,224,82,168,9,157,86,115,76,184,83,108,195,160,14,25,207,62,13,126,7,50,104,70,234,72,249,153,46,171,164,73,32,94,85,53,56,12,188,211,177,88,22,121,40,10,26,225,242,205,196,57,219,162,186,96,114,118,125,149,239,127,200,192,222,55,148,191,181,20,129,146,37,69,172,231,245,102,167,43,54,90,193,19,227,75,58,232,141,131,27,124,39,176,154,66,235,135,170,220,84,142,120,38,210,87,41,212,183,248,47,143,137,117,240,65,119,194,30,255,216,21,17,229,4,151,23,243,49,208,155,0,215,202,180,79,42,59,217,178,107,218,93,161,63,48,97,189,145,61,78,230,223,190,77,130,140,29,35,16,152,100,244,133,51,123,144,67,187,169,136,241,214,165,28,246,204,110,185,91,11,150,237,213,233,197,203,8,166,128,64]);
function decodeRisum(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.length < 7 || bytes[0] !== 0x6f) throw new Error("risum_magic_invalid");
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(2, true);
  if (6 + length > bytes.length) throw new Error("risum_metadata_truncated");
  const decoded = bytes.subarray(6, 6 + length).map((value) => decodeMap[value] ?? 0);
  return parseJson(decoded, "risum_metadata_invalid");
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function normalizePath(value: string): string { try { return decodeURIComponent(value.replace(/\\/g, "/").replace(/^\.\//, "")); } catch { return value.replace(/\\/g, "/").replace(/^\.\//, ""); } }
function extensionOf(value: string): string { return value.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? ""; }
function mime(extension: string): string { return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp", svg: "image/svg+xml", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav" } as Record<string, string>)[extension.toLowerCase()] ?? "application/octet-stream"; }
function stableId(value: string): string { return bytesToHex(sha256(new TextEncoder().encode(value))).slice(0, 12); }

export function isImageAsset(asset: AssetReference): boolean { return asset.mime.startsWith("image/") || IMAGE.test(asset.path ?? asset.name); }
