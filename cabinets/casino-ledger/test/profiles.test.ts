import { describe, expect, it } from "vitest";
import { TEMEROSA_NPC_GAMBLING_PROFILES, TEMEROSA_NPC_LEDGER_CONTRACT } from "../src/index.ts";

describe("frozen Temerosa ledger profiles", () => {
  it("contains exactly 35 unique profiles and the fixed epoch", () => {
    const ids = TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => profile.id);
    expect(ids).toHaveLength(35);
    expect(new Set(ids).size).toBe(35);
    expect(TEMEROSA_NPC_LEDGER_CONTRACT.epochUtcDay).toBe(20_661);
    expect([...ids].sort()).toEqual([
      "adesha", "alger", "anna", "apollyon", "bacikal", "bche", "camille", "cicero", "cradle", "deokbae",
      "diamo", "echo", "esther", "hiro", "kano", "katrinka", "kreva", "levillotte", "lilim", "lyla",
      "machina", "morsisa", "nemo", "nieun", "nostalgia", "pale", "phaeo", "raven", "riel", "temute",
      "traver", "ttaengchil", "tumit-tu", "wares", "yul",
    ]);
  });

  it("locks the approved target story order", () => {
    const target = (id: string) => TEMEROSA_NPC_GAMBLING_PROFILES.find((profile) => profile.id === id)!.target;
    expect(["katrinka", "raven", "lyla", "alger", "kreva"].map(target)).toEqual([4_000, 3_800, 3_600, 3_450, 3_300]);
    expect(["bche", "morsisa", "tumit-tu", "lilim", "nemo"].map(target)).toEqual([200, 300, 450, 650, 800]);
  });

  it("keeps Levillotte volatile and Traver restrained", () => {
    const levillotte = TEMEROSA_NPC_GAMBLING_PROFILES.find((profile) => profile.id === "levillotte")!;
    const traver = TEMEROSA_NPC_GAMBLING_PROFILES.find((profile) => profile.id === "traver")!;
    expect(levillotte).toMatchObject({ target: 2_000, volatility: 0.27, reversion: 0.05 });
    expect(traver).toMatchObject({ target: 1_800, volatility: 0.08, reversion: 0.10 });
  });

  it("uses three balanced UTC operating shifts and only open economy tables", () => {
    const shifts = TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => profile.activeHours[0]!.startMinute);
    expect(shifts.filter((start) => start === 0)).toHaveLength(12);
    expect(shifts.filter((start) => start === 480)).toHaveLength(12);
    expect(shifts.filter((start) => start === 960)).toHaveLength(11);
    const tables = new Set(TEMEROSA_NPC_GAMBLING_PROFILES.flatMap((profile) => profile.tables.map((table) => table.tableId)));
    expect([...tables].sort()).toEqual(["indian-poker", "temerosa-match-pairs", "temerosa-old-maid", "temerosa-slot"]);
  });
});
