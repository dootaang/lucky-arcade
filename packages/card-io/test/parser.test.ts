import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { MemoryBinarySource, parseCardSource, type BinarySource } from "../src/index.ts";

describe("lazy card parser", () => {
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
});
