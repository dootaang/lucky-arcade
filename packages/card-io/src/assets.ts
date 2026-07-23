import type { AssetReference } from "@lucky-arcade/contracts";
import { parseCardSource } from "./parser.ts";
import type { BinarySource } from "./source.ts";
import { indexZip, readZipEntry, type ZipEntry } from "./zip.ts";

export const ASSET_LIMITS = {
  maxCompressedBytes: 16 * 1024 * 1024,
  maxDecodedBytes: 32 * 1024 * 1024,
} as const;

const DISPLAY_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

export interface ResolvedAsset {
  assetId: string;
  bytes: Uint8Array;
  mime: string;
}

export interface AssetResolver {
  readonly assets: readonly AssetReference[];
  read(assetId: string, signal?: AbortSignal): Promise<ResolvedAsset>;
  dispose(): void;
}

type RawDefinition = { uri: string; embedded?: Uint8Array };

export async function openAssetResolver(source: BinarySource): Promise<AssetResolver> {
  const card = await parseCardSource(source);
  const raw = assetDefinitions(card.card, card.format);
  const rawById = new Map(card.assets.map((asset, index) => [asset.id, raw[index] ?? { uri: "" }]));
  let zipByPath: Map<string, ZipEntry> | null = null;
  if (card.format === "charx" || card.format === "jpeg") {
    const index = await indexZip(source);
    zipByPath = new Map(index.entries.map((entry) => [normalizePath(entry.path), entry]));
  }
  let disposed = false;
  return {
    assets: card.assets,
    async read(assetId, signal) {
      if (disposed) throw new Error("asset_resolver_disposed");
      abort(signal);
      const asset = card.assets.find((candidate) => candidate.id === assetId);
      if (!asset) throw new Error("asset_missing");
      if (!DISPLAY_MIME.has(asset.mime)) throw new Error("asset_mime_not_displayable");
      const definition = rawById.get(asset.id);
      let bytes: Uint8Array;
      if (asset.container === "zip-entry") {
        const entry = asset.path ? zipByPath?.get(normalizePath(asset.path)) : undefined;
        if (!entry) throw new Error("asset_zip_entry_missing");
        if (entry.compressedSize > ASSET_LIMITS.maxCompressedBytes) throw new Error("asset_compressed_too_large");
        bytes = await readZipEntry(source, entry, ASSET_LIMITS.maxDecodedBytes);
      } else if (definition?.uri.startsWith("data:")) {
        bytes = decodeDataUri(definition.uri);
      } else if (asset.container === "risum-entry" && definition?.embedded) {
        bytes = Uint8Array.from(definition.embedded);
      } else if (asset.container === "card-image" && (card.format === "png" || card.format === "jpeg")) {
        if (source.size > ASSET_LIMITS.maxDecodedBytes) throw new Error("asset_decoded_too_large");
        bytes = await source.read(0, source.size);
      } else {
        throw new Error(`asset_locator_unsupported:${asset.container}`);
      }
      abort(signal);
      if (bytes.byteLength > ASSET_LIMITS.maxDecodedBytes) throw new Error("asset_decoded_too_large");
      assertSignature(asset.mime, bytes);
      return { assetId, bytes, mime: asset.mime };
    },
    dispose() { disposed = true; rawById.clear(); zipByPath?.clear(); },
  };
}

function assetDefinitions(card: Record<string, unknown>, format: string): RawDefinition[] {
  const root = object(card);
  const data = object(root.data ?? root);
  const module = object(root.module ?? root);
  const value = format === "risum" ? module.assets : data.assets;
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!Array.isArray(item)) return { uri: String(object(item).uri ?? "") };
    const payload = item[1];
    if (payload instanceof Uint8Array) return { uri: "", embedded: payload };
    if (Array.isArray(payload) && payload.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return { uri: "", embedded: Uint8Array.from(payload as number[]) };
    if (typeof payload === "string" && payload.startsWith("data:")) return { uri: payload };
    return { uri: "" };
  });
}

function decodeDataUri(uri: string): Uint8Array {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri);
  if (!match) throw new Error("asset_data_uri_invalid");
  const payload = match[3] ?? "";
  if (payload.length > Math.ceil(ASSET_LIMITS.maxDecodedBytes * 4 / 3) + 8) throw new Error("asset_decoded_too_large");
  try {
    if (match[2]) {
      const raw = atob(payload.replace(/\s/g, ""));
      return Uint8Array.from(raw, (character) => character.charCodeAt(0));
    }
    return new TextEncoder().encode(decodeURIComponent(payload));
  } catch { throw new Error("asset_data_uri_invalid"); }
}

function assertSignature(mime: string, bytes: Uint8Array): void {
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const gif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  const avif = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  const valid = mime === "image/png" ? png : mime === "image/jpeg" ? jpeg : mime === "image/gif" ? gif : mime === "image/webp" ? webp : mime === "image/avif" ? avif : false;
  if (!valid) throw new Error("asset_mime_signature_mismatch");
}

function abort(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function normalizePath(value: string): string { try { return decodeURIComponent(value.replace(/\\/g, "/").replace(/^\.\//, "")); } catch { return value.replace(/\\/g, "/").replace(/^\.\//, ""); } }
