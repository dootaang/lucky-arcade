import { describe,expect,it } from "vitest";
import { TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,TEMEROSA_FLOW_RELEASE_AUDIT,auditCasinoFlowEconomy } from "../src/index.ts";

describe("casino flow economy audit",()=>{
  it("audits the gated series-persona candidate as a zero-sum ledger",()=>{
    const report=auditCasinoFlowEconomy(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,7);
    expect(report.npcCount).toBe(102);
    expect(report.totalNpcCasinoTopUps).toBeGreaterThan(0);
    expect(report.totalRounds).toBeGreaterThan(0);
    expect(report.totalSettlementRows).toBeGreaterThanOrEqual(report.totalRounds);
    expect(report.totalRoundSettlementRows).toBe(report.totalRounds);
    expect(report.duplicateRoundIdCount).toBe(0);
    expect(report.unbalancedRoundCount).toBe(0);
    expect(report.postingImbalance).toBe(0);
    expect(report.finalInternalSupply).toBe(report.finalNpcSupply+report.houseBalance);
    expect(report.minimumHouseBalance).toBeGreaterThanOrEqual(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.houseOperatingPolicy!.protectedReserve);
    expect(report.paidEligibleNpcCount).toBeGreaterThan(report.npcCount*.5);
    expect(report.reenteredAfterIncomeNpcCount).toBeGreaterThan(0);
    expect(report.maximumNpcShareBps).toBeLessThan(3_500);
    expect(report.topFiveChangedSeats).toBeGreaterThan(0);
    const supplyWithinReleaseBand=report.supplyChangeBps>=-300&&report.supplyChangeBps<=500;
    expect(supplyWithinReleaseBand).toBe(false);
    expect(TEMEROSA_FLOW_RELEASE_AUDIT.blockers).toContain("seven-day-supply-drift");
    expect(report.averageSettlementGapSeconds).toBeGreaterThanOrEqual(10);
    expect(report.averageSettlementGapSeconds).toBeLessThanOrEqual(25);
    expect(report).toMatchObject(TEMEROSA_FLOW_RELEASE_AUDIT.sevenDays);
  },30_000);
});
