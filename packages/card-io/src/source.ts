import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export interface BinarySource {
  readonly name: string;
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  fingerprint?(): Promise<string>;
}

export class MemoryBinarySource implements BinarySource {
  readonly size: number;
  constructor(readonly name: string, readonly bytes: Uint8Array) { this.size = bytes.length; }
  async read(offset: number, length: number): Promise<Uint8Array> {
    assertRange(this.size, offset, length);
    return this.bytes.slice(offset, offset + length);
  }
  async fingerprint(): Promise<string> { return bytesToHex(sha256(this.bytes)); }
}

export function assertRange(size: number, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > size) {
    throw new Error("binary_source_range_invalid");
  }
}

export async function readAll(source: BinarySource, maxBytes: number): Promise<Uint8Array> {
  if (source.size > maxBytes) throw new Error("binary_source_too_large");
  return source.read(0, source.size);
}

export async function fingerprintSource(source: BinarySource, chunkSize = 4 * 1024 * 1024): Promise<string> {
  if (source.fingerprint) return source.fingerprint();
  const hash = sha256.create();
  for (let offset = 0; offset < source.size; offset += chunkSize) {
    hash.update(await source.read(offset, Math.min(chunkSize, source.size - offset)));
  }
  return bytesToHex(hash.digest());
}
