import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOUSE_OPERATING_COST_POLICY,
  TEMEROSA_HOUSE_ACCOUNT_ID,
  applyCasinoTransactions,
  createHouseOperatingExpensePlan,
  houseMaximumExposure,
  houseGrossGamingRevenueFromSessions,
  internalMoneySupply,
} from "../src/index.ts";

describe("activity-based house operations", () => {
  it("assesses fixed, active-table, round, and revenue costs", () => {
    const plan = createHouseOperatingExpensePlan({
      absoluteKstDay: 20_667,
      houseBalance: 150_000,
      reservedLiability: 5_000,
      activeTableSeconds: 18_000,
      settledRoundCount: 350,
      grossGamingRevenue: 2_000,
    });
    expect(plan).toMatchObject({
      fixedCost: 60,
      activeTableCost: 40,
      roundCost: 210,
      revenueCost: 900,
      assessedAmount: 1_210,
      paidAmount: 1_210,
      curtailedAmount: 0,
    });
  });

  it("curtails operations before consuming protected reserve or liabilities", () => {
    const plan = createHouseOperatingExpensePlan({
      absoluteKstDay: 20_667,
      houseBalance: 51_000,
      reservedLiability: 750,
      activeTableSeconds: 36_000,
      settledRoundCount: 1_000,
      grossGamingRevenue: 10_000,
    });
    expect(plan.paidAmount).toBe(250);
    expect(plan.curtailedAmount).toBe(plan.assessedAmount - 250);
    expect(houseMaximumExposure({ houseBalance: 51_000, reservedLiability: 750 })).toBe(250);
  });

  it("burns only the paid amount from internal casino supply", () => {
    const plan = createHouseOperatingExpensePlan({
      absoluteKstDay: 20_667,
      houseBalance: 150_000,
      reservedLiability: 0,
      activeTableSeconds: 3_600,
      settledRoundCount: 100,
      grossGamingRevenue: 500,
    });
    const balances = applyCasinoTransactions({ [TEMEROSA_HOUSE_ACCOUNT_ID]: 150_000 }, [plan.transaction!]);
    expect(internalMoneySupply(balances)).toBe(150_000 - plan.paidAmount);
    expect(balances[TEMEROSA_HOUSE_ACCOUNT_ID]).toBeGreaterThanOrEqual(DEFAULT_HOUSE_OPERATING_COST_POLICY.protectedReserve);
  });

  it("counts net positive house revenue once per atomic PVP match",()=>{
    expect(houseGrossGamingRevenueFromSessions([
      {matchId:"pvp:1",tableId:"indian-poker",delta:93},
      {matchId:"pvp:1",tableId:"indian-poker",delta:-100},
      {matchId:"old-maid:1",tableId:"temerosa-old-maid",delta:30},
      {matchId:"old-maid:1",tableId:"temerosa-old-maid",delta:-30},
      {matchId:"income:1",tableId:"npc-income",delta:500},
    ])).toBe(7);
  });
});
