import { describe, expect, it } from "vitest";
import type { CabinetManifest } from "../src/index.ts";

describe("cabinet manifest", () => {
  it("is declarative and JSON-safe", () => {
    const manifest: CabinetManifest = { id: "test", version: "1", title: "시험", description: "시험", requiredCapabilities: [] };
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });
});
