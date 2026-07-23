import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { BlobBinarySource, MemoryBinarySource, openAssetResolver, parseCardSource, type BinarySource } from "../src/index.ts";

const tinyPng = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (value) => value.charCodeAt(0));

describe("lazy card parser", () => {
  it("reads browser blobs through bounded slices", async () => {
    const source = new BlobBinarySource("slice.bin", new Blob([new Uint8Array([1, 2, 3, 4])]));
    expect([...await source.read(1, 2)]).toEqual([2, 3]);
    await expect(source.read(3, 2)).rejects.toThrow("binary_source_range_invalid");
  });
  it("parses JSON without retaining source bytes", async () => {
    const bytes = strToU8(JSON.stringify({ spec: "chara_card_v3", data: { name: "시험", assets: [] } }));
    const parsed = await parseCardSource(new MemoryBinarySource("test.json", bytes));
    expect(parsed.name).toBe("시험");
    expect(parsed).not.toHaveProperty("sourceBytes");
  });

  it("indexes charx assets without reading or inflating image bodies", async () => {
    const card = { spec: "chara_card_v3", data: { name: "ZIP", assets: [{ name: "hero", uri: "assets/hero.png", ext: "png" }] } };
    const bytes = zipSync({ "card.json": strToU8(JSON.stringify(card)), "assets/hero.png": new Uint8Array(2 * 1024 * 1024) }, { level: 0 });
    const memory = new MemoryBinarySource("test.charx", bytes);
    let bytesRead = 0;
    const source: BinarySource = { name: memory.name, size: memory.size, async read(offset, length) { bytesRead += length; return memory.read(offset, length); } };
    const parsed = await parseCardSource(source);
    expect(parsed.assets[0]).toMatchObject({ name: "hero", size: 2 * 1024 * 1024, container: "zip-entry" });
    expect(bytesRead).toBeLessThan(200 * 1024);
  });

  it("resolves one ZIP asset without copying unrelated image bodies", async () => {
    const card = { spec: "chara_card_v3", data: { name: "ZIP", assets: [{ name: "Alice_default", uri: "assets/alice.png", ext: "png" }, { name: "unused", uri: "assets/unused.png", ext: "png" }] } };
    const bytes = zipSync({ "card.json": strToU8(JSON.stringify(card)), "assets/alice.png": tinyPng, "assets/unused.png": new Uint8Array(4 * 1024 * 1024) }, { level: 0 });
    const memory = new MemoryBinarySource("test.charx", bytes);
    let bytesRead = 0;
    const source: BinarySource = { name: memory.name, size: memory.size, async read(offset, length) { bytesRead += length; return memory.read(offset, length); } };
    const resolver = await openAssetResolver(source);
    const alice = resolver.assets.find((asset) => asset.name === "Alice_default");
    expect(alice).toBeDefined();
    expect((await resolver.read(alice!.id)).bytes).toEqual(tinyPng);
    expect(bytesRead).toBeLessThan(300 * 1024);
  });

  it("resolves a selected inline image without returning it in parsed metadata", async () => {
    const encoded = btoa(String.fromCharCode(...tinyPng));
    const bytes = strToU8(JSON.stringify({ spec: "chara_card_v3", data: { name: "Inline", assets: [{ name: "Alice_default", uri: `data:image/png;base64,${encoded}`, ext: "png" }] } }));
    const resolver = await openAssetResolver(new MemoryBinarySource("inline.json", bytes));
    expect((await resolver.read(resolver.assets[0]!.id)).bytes).toEqual(tinyPng);
  });
});
