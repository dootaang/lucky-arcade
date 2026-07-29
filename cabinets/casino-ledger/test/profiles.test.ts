import { describe, expect, it } from "vitest";
import { TEMEROSA_NPC_GAMBLING_PROFILES, TEMEROSA_NPC_LEDGER_CONTRACT } from "../src/index.ts";

describe("frozen Temerosa ledger profiles", () => {
  it("contains exactly 35 unique profiles and the fixed epoch", () => {
    const ids = TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => profile.id);
    expect(ids).toHaveLength(35);
    expect(new Set(ids).size).toBe(35);
    expect(TEMEROSA_NPC_LEDGER_CONTRACT.version).toBe("npc-ledger/0.8");
    expect(TEMEROSA_NPC_LEDGER_CONTRACT.epochUtcDay).toBe(20_663);
    expect([...ids].sort()).toEqual([
      "adesha", "alger", "anna", "apollyon", "bacikal", "bche", "camille", "cicero", "cradle", "deokbae",
      "diamo", "echo", "esther", "hiro", "kano", "katrinka", "kreva", "levillotte", "lilim", "lyla",
      "machina", "morsisa", "nemo", "nieun", "nostalgia", "pale", "phaeo", "raven", "riel", "temute",
      "traver", "ttaengchil", "tumit-tu", "wares", "yul",
    ]);
  });

  it("rebases opening balances while preserving the authored bankroll order as metadata", () => {
    const target = (id: string) => TEMEROSA_NPC_GAMBLING_PROFILES.find((profile) => profile.id === id)!.target;
    expect(["katrinka", "raven", "lyla", "alger", "kreva"].map(target)).toEqual([4_000, 3_800, 3_600, 3_450, 3_300]);
    expect(["bche", "morsisa", "tumit-tu", "lilim", "nemo"].map(target)).toEqual([200, 300, 450, 650, 800]);
    expect(TEMEROSA_NPC_GAMBLING_PROFILES.find((profile)=>profile.id==="pale")!.openingBalance).toBe(17_600);
  });

  it("freezes a complete, ordered analytics bridge without feeding it into balances", () => {
    const contract = TEMEROSA_NPC_LEDGER_CONTRACT;
    const ids = contract.profiles.map((profile) => profile.id).sort();
    expect(contract.profitHistory.length).toBeLessThanOrEqual(6);
    expect(contract.profitHistory.map((entry) => entry.utcDay)).toEqual([contract.epochUtcDay - 1]);
    for (const entry of contract.profitHistory) {
      expect(Object.keys(entry.profits).sort()).toEqual(ids);
      expect(Object.values(entry.profits).every(Number.isSafeInteger)).toBe(true);
    }
  });

  it("keeps Levillotte volatile and Traver restrained", () => {
    const levillotte = TEMEROSA_NPC_GAMBLING_PROFILES.find((profile) => profile.id === "levillotte")!;
    const traver = TEMEROSA_NPC_GAMBLING_PROFILES.find((profile) => profile.id === "traver")!;
    expect(levillotte).toMatchObject({ target: 2_000, riskAppetite: 0.86, discipline: 0.34 });
    expect(traver).toMatchObject({ target: 1_800, riskAppetite: 0.28, discipline: 0.62 });
    expect(levillotte.maxExposureRatio).toBeGreaterThan(traver.maxExposureRatio);
  });

  it("uses three balanced UTC operating shifts and only open economy tables", () => {
    const shifts = TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => profile.activeHours[0]!.startMinute);
    expect(shifts.filter((start) => start === 0)).toHaveLength(12);
    expect(shifts.filter((start) => start === 480)).toHaveLength(12);
    expect(shifts.filter((start) => start === 960)).toHaveLength(11);
    const tables = new Set(TEMEROSA_NPC_GAMBLING_PROFILES.flatMap((profile) => profile.tables.map((table) => table.tableId)));
    expect([...tables].sort()).toEqual(["indian-poker", "temerosa-high-low", "temerosa-match-pairs", "temerosa-old-maid", "temerosa-slot"]);
  });
});
