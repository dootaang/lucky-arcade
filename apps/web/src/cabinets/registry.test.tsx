import { describe, expect, it } from "vitest";
import { getCabinetRegistration, getCabinetWorld, listBuiltInCabinets, selectOpeningCabinet } from "./registry.tsx";
import { PUBLIC_CABINET_IDS } from "../venues/registry.ts";

describe("public cabinet visibility", () => {
  it("derives public cabinets from the public Venue", () => {
    expect([...PUBLIC_CABINET_IDS]).toEqual(["temerosa-old-maid", "temerosa-match-pairs"]);
    expect(listBuiltInCabinets().map((entry) => entry.manifest.id)).toEqual(["temerosa-old-maid", "temerosa-match-pairs"]);
    expect(getCabinetWorld("temerosa-old-maid")).toBe("테메로세 카지노");
  });

  it("can expose retained cabinets explicitly for development regression tests", () => {
    expect(listBuiltInCabinets(true).map((entry) => entry.manifest.id)).toContain("gfl-ember");
    expect(getCabinetRegistration("temerosa-margin", true)?.manifest.id).toBe("temerosa-margin");
  });

  it("keeps hidden cabinets out of resume and lookup UI", () => {
    expect(getCabinetRegistration("temerosa-old-maid")?.manifest.title).toContain("도둑잡기");
    for (const id of ["indian-poker", "favorite-cup", "old-maid-card", "gfl-favorite-cup", "temerosa-margin", "lucky-derby-lab", "gfl-sprite-memory", "gfl-ember", "restoration-crew", "lore-circuit"]) {
      expect(getCabinetRegistration(id)).toBeUndefined();
    }
  });

  it("only auto-opens the personal-card world cup", () => {
    const report = { cabinets: [
      { cabinetId: "restoration-crew", available: true },
      { cabinetId: "lore-circuit", available: true },
      { cabinetId: "favorite-cup", available: true },
    ] };
    expect(selectOpeningCabinet(report)).toBeNull();
    expect(selectOpeningCabinet(report, true)).toBe("favorite-cup");
    expect(selectOpeningCabinet({ cabinets: report.cabinets.filter((item) => item.cabinetId !== "favorite-cup") })).toBeNull();
  });

  it("opens personal old maid when the world cup is unavailable", () => {
    expect(selectOpeningCabinet({ cabinets: [{ cabinetId: "old-maid-card", available: true }] })).toBeNull();
    expect(selectOpeningCabinet({ cabinets: [{ cabinetId: "old-maid-card", available: true }] }, true)).toBe("old-maid-card");
  });
});
