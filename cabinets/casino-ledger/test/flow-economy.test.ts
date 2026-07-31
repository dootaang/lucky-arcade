import { describe, expect, it } from "vitest";
import {
  applyCasinoTransactions,
  casinoKstDayAtUtcSecond,
  internalMoneySupply,
  npcAccountId,
  npcExternalReserveAccountId,
  npcFlowEconomyDay,
  npcFlowEconomyTransactions,
  type NpcExternalIncomeProfile,
} from "../src/index.ts";

const profile: NpcExternalIncomeProfile = Object.freeze({
  npcId: "pale",
  sourceLabel: "개인 활동 정산",
  evidenceRefs: Object.freeze([]),
  dailyIncomeRange: Object.freeze([80, 160] as const),
  casinoBudgetRateBps: Object.freeze([1_500, 3_000] as const),
  openingExternalReserve: 250,
  settlementWindow: Object.freeze([8 * 60, 20 * 60] as const),
});

describe("NPC flow economy 1.0", () => {
  it("is deterministic and settles exactly once in its KST range", () => {
    const first = npcFlowEconomyDay(profile, 20_667);
    const second = npcFlowEconomyDay(profile, 20_667);
    expect(first).toEqual(second);
    expect(first.settlementMinute).toBeGreaterThanOrEqual(8 * 60);
    expect(first.settlementMinute).toBeLessThanOrEqual(20 * 60);
    expect(casinoKstDayAtUtcSecond(first.incomeTransaction.occurredAtCasinoSecond)).toBe(20_667);
    expect(first.casinoTopUp).toBe(Math.floor(first.grossIncome * first.casinoBudgetRateBps / 10_000));
  });

  it("moves value through the external reserve and only the top-up enters casino supply", () => {
    const day = npcFlowEconomyDay(profile, 20_667);
    const opening = {
      [npcExternalReserveAccountId(profile.npcId)]: profile.openingExternalReserve,
      [npcAccountId(profile.npcId)]: 1_000,
    };
    const transactions = [day.incomeTransaction, ...(day.topUpTransaction ? [day.topUpTransaction] : [])];
    const balances = applyCasinoTransactions(opening, transactions);
    expect(balances[npcExternalReserveAccountId(profile.npcId)]).toBe(profile.openingExternalReserve + day.grossIncome - day.casinoTopUp);
    expect(balances[npcAccountId(profile.npcId)]).toBe(1_000 + day.casinoTopUp);
    expect(internalMoneySupply(balances)).toBe(1_000 + day.casinoTopUp);
  });

  it("orders income before top-up and rejects duplicate profiles", () => {
    const transactions = npcFlowEconomyTransactions([profile], 20_667);
    expect(transactions.map((entry) => entry.kind)).toEqual(["npc-external-income", "npc-casino-top-up"]);
    expect(() => npcFlowEconomyTransactions([profile, profile], 20_667)).toThrow("npc_flow_duplicate_profile:pale");
  });

  it("never creates a Wares livelihood account", () => {
    expect(() => npcFlowEconomyDay({ ...profile, npcId: "wares" }, 20_667)).toThrow("npc_flow_invalid_identity");
    expect(() => npcFlowEconomyDay({ ...profile, npcId: "temerosa:finale:wares" }, 20_667)).toThrow("npc_flow_invalid_identity");
  });
});
