import { describe, expect, it } from "vitest";
import { extractNpcGroups } from "../src/index.ts";

describe("NPC filename grouping", () => {
  it("labels structural evidence without inventing character facts", () => {
    const base = { extension: "png", mime: "image/png", size: 1, container: "zip-entry" as const };
    const result = extractNpcGroups([
      { ...base, id: "1", name: "Alice_default", path: "Alice_default.png" },
      { ...base, id: "2", name: "Alice_smile", path: "Alice_smile.png" },
      { ...base, id: "3", name: "scenery", path: "scenery.png" },
    ]);
    expect(result.groups[0]).toMatchObject({ id: "Alice", spriteCount: 2 });
    expect(result.ungroupedImageCount).toBe(1);
  });
});
