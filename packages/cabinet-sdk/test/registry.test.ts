import { describe, expect, it } from "vitest";
import { createCabinetRegistry, type CabinetCatalogEntry } from "../src/index.ts";

const entry = (id: string, available: boolean): CabinetCatalogEntry<number> => ({
  manifest: { id, version: "0.1", title: id, description: id, requiredCapabilities: [] },
  assess: () => ({ cabinetId: id, available, confidence: available ? 1 : 0, reasons: [] }),
});

describe("cabinet registry", () => {
  it("selects the first playable cabinet in declared order", () => {
    const registry = createCabinetRegistry([entry("closed", false), entry("open", true)]);
    expect(registry.firstAvailable(0)?.manifest.id).toBe("open");
  });

  it("rejects duplicate cabinet ids", () => {
    expect(() => createCabinetRegistry([entry("same", true), entry("same", false)])).toThrow("cabinet_registry_duplicate:same");
  });
});
