import { describe, expect, it } from "vitest";
import { getCabinetRegistration, listBuiltInCabinets, selectOpeningCabinet } from "./registry.tsx";

describe("public cabinet visibility", () => {
  it("only lists old maid and the built-in world cup in the public lobby", () => {
    expect(listBuiltInCabinets().map((entry) => entry.manifest.id)).toEqual(["temerosa-old-maid", "gfl-favorite-cup"]);
  });

  it("can expose retained cabinets explicitly for development regression tests", () => {
    expect(listBuiltInCabinets(true).map((entry) => entry.manifest.id)).toContain("gfl-ember");
    expect(getCabinetRegistration("temerosa-margin", true)?.manifest.id).toBe("temerosa-margin");
  });

  it("keeps hidden cabinets out of resume and lookup UI", () => {
    expect(getCabinetRegistration("temerosa-old-maid")?.manifest.title).toContain("도둑잡기");
    expect(getCabinetRegistration("favorite-cup")?.manifest.title).toBe("최애 월드컵");
    for (const id of ["temerosa-margin", "lucky-derby-lab", "gfl-sprite-memory", "gfl-ember", "restoration-crew", "lore-circuit"]) {
      expect(getCabinetRegistration(id)).toBeUndefined();
    }
  });

  it("only auto-opens the personal-card world cup", () => {
    const report = { cabinets: [
      { cabinetId: "restoration-crew", available: true },
      { cabinetId: "lore-circuit", available: true },
      { cabinetId: "favorite-cup", available: true },
    ] };
    expect(selectOpeningCabinet(report)).toBe("favorite-cup");
    expect(selectOpeningCabinet({ cabinets: report.cabinets.filter((item) => item.cabinetId !== "favorite-cup") })).toBeNull();
  });
});
