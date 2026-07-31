import { describe, expect, it } from "vitest";
import { getCabinetRegistration, getCabinetWorld, listBuiltInCabinets, selectOpeningCabinet } from "./registry.tsx";
import { getVenueTableForCabinet, PUBLIC_CABINET_IDS } from "../venues/registry.ts";

describe("public cabinet visibility", () => {
  it("derives public cabinets from the public Venue", () => {
    expect([...PUBLIC_CABINET_IDS]).toEqual(["temerosa-old-maid", "temerosa-match-pairs", "temerosa-slot", "indian-poker", "temerosa-high-low", "temerosa-five-card-draw"]);
    expect(listBuiltInCabinets().map((entry) => entry.manifest.id)).toEqual(["temerosa-five-card-draw", "temerosa-high-low", "temerosa-slot", "indian-poker", "temerosa-old-maid", "temerosa-match-pairs"]);
    expect(getCabinetWorld("temerosa-old-maid")).toBe("테메로세 카지노");
  });

  it("can expose retained cabinets explicitly for development regression tests", () => {
    expect(listBuiltInCabinets(true).map((entry) => entry.manifest.id)).toContain("temerosa-pequod-expedition");
    expect(getCabinetRegistration("temerosa-margin", true)?.manifest.id).toBe("temerosa-margin");
    expect(getCabinetRegistration("temerosa-video-poker", true)?.manifest.version).toBe("video-poker/0.1");
  });

  it("lists every built-in implementation as open or admin-preview", () => {
    const builtIns = listBuiltInCabinets(true);
    expect(builtIns).toHaveLength(16);
    for (const entry of builtIns) expect(getVenueTableForCabinet(entry.manifest.id)?.status).toMatch(/^(open|admin-preview)$/);
  });

  it("keeps hidden cabinets out of resume and lookup UI", () => {
    expect(getCabinetRegistration("temerosa-old-maid")?.manifest.title).toContain("도둑잡기");
    expect(getCabinetRegistration("temerosa-slot")?.manifest.entry).toBe("wager");
    expect(getCabinetRegistration("temerosa-high-low")?.manifest.version).toBe("casino-cards/0.4");
    expect(getCabinetRegistration("indian-poker")?.manifest.description).toContain("5·7라운드");
    expect(getCabinetRegistration("temerosa-texas-holdem")).toBeUndefined();
    expect(getCabinetRegistration("temerosa-five-card-draw")?.manifest.version).toBe("temerosa-five-card-draw-wager/1.0");
    for (const id of ["favorite-cup", "old-maid-card", "temerosa-favorite-cup", "temerosa-margin", "lucky-derby-lab", "temerosa-echo-memory", "temerosa-pequod-expedition", "restoration-crew", "lore-circuit"]) {
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
