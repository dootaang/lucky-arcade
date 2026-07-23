import { createReadStream, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { assertRange, type BinarySource } from "./source.ts";

export class NodeFileSource implements BinarySource {
  readonly name: string;
  private constructor(readonly path: string, readonly size: number) { this.name = basename(path); }

  static async open(path: string): Promise<NodeFileSource> {
    const info = await fs.stat(path);
    if (!info.isFile()) throw new Error("card_source_not_file");
    return new NodeFileSource(path, info.size);
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    assertRange(this.size, offset, length);
    const handle = await fs.open(this.path, "r");
    try {
      const buffer = new Uint8Array(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead !== length) throw new Error("card_source_short_read");
      return buffer;
    } finally { await handle.close(); }
  }

  async fingerprint(): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(this.path)) hash.update(chunk as Buffer);
    return hash.digest("hex");
  }
}
