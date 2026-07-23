import { inflateSync } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { BinarySource } from "./source.ts";

export interface ZipEntry {
  path: string;
  compression: 0 | 8;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}
export interface ZipIndex { zipStart: number; totalEntries: number; entries: ZipEntry[]; centralDirectoryBytes: number; centralDirectoryHash: string; }

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_TAIL = 65_557;
const decoder = new TextDecoder();

export async function indexZip(source: BinarySource): Promise<ZipIndex> {
  const tailStart = Math.max(0, source.size - MAX_TAIL);
  const tail = await source.read(tailStart, source.size - tailStart);
  const eocd = findEocd(tail);
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const total = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (total === 0xffff || centralSize === 0xffff_ffff || centralOffset === 0xffff_ffff) throw new Error("zip64_not_supported");
  const eocdAbsolute = tailStart + eocd;
  const zipStart = eocdAbsolute - centralSize - centralOffset;
  const centralStart = zipStart + centralOffset;
  if (zipStart < 0 || centralStart < 0 || centralStart + centralSize > source.size) throw new Error("zip_central_directory_invalid");
  const central = await source.read(centralStart, centralSize);
  const entries: ZipEntry[] = [];
  for (let offset = 0, count = 0; offset < central.length && count < total; count += 1) {
    const item = new DataView(central.buffer, central.byteOffset + offset, central.length - offset);
    if (item.byteLength < 46 || item.getUint32(0, true) !== CENTRAL) throw new Error("zip_central_entry_invalid");
    const flags = item.getUint16(8, true);
    const compression = item.getUint16(10, true);
    const nameLength = item.getUint16(28, true);
    const extraLength = item.getUint16(30, true);
    const commentLength = item.getUint16(32, true);
    if ((flags & 1) !== 0) throw new Error("zip_encrypted_not_supported");
    const path = cleanPath(decoder.decode(central.subarray(offset + 46, offset + 46 + nameLength)));
    if (compression === 0 || compression === 8) entries.push({
      path,
      compression,
      compressedSize: item.getUint32(20, true),
      size: item.getUint32(24, true),
      localHeaderOffset: zipStart + item.getUint32(42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { zipStart, totalEntries: total, entries, centralDirectoryBytes: centralSize, centralDirectoryHash: bytesToHex(sha256(central)) };
}

export async function readZipEntry(source: BinarySource, entry: ZipEntry, maxBytes = 32 * 1024 * 1024): Promise<Uint8Array> {
  if (entry.size > maxBytes) throw new Error("zip_entry_too_large");
  const header = await source.read(entry.localHeaderOffset, 30);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (view.getUint32(0, true) !== LOCAL) throw new Error("zip_local_header_invalid");
  const start = entry.localHeaderOffset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
  const compressed = await source.read(start, entry.compressedSize);
  const value = entry.compression === 0 ? compressed : inflateSync(compressed);
  if (value.length !== entry.size) throw new Error("zip_entry_size_mismatch");
  return value;
}

function findEocd(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) if (view.getUint32(offset, true) === EOCD) return offset;
  throw new Error("zip_eocd_missing");
}

function cleanPath(value: string): string {
  const path = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path || path.startsWith("/") || /^[a-z]:/i.test(path) || path.split("/").includes("..")) throw new Error("zip_path_unsafe");
  return path;
}
