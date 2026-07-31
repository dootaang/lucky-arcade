import { describe,expect,it } from "vitest";
import { TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,auditCasinoFlowEconomy } from "../src/index.ts";

describe("casino flow economy audit",()=>{
  it("audits the existing 34 profiles without connecting the generated series roster",()=>{
    const report=auditCasinoFlowEconomy(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,7);
    expect(report.npcCount).toBe(34);
    expect(report.totalNpcCasinoTopUps).toBeGreaterThan(0);
    expect(report.totalRounds).toBeGreaterThan(0);
    expect(report.totalSettlementRows).toBeGreaterThanOrEqual(report.totalRounds);
    expect(report.totalRoundSettlementRows).toBe(report.totalRounds);
    expect(report.duplicateRoundIdCount).toBe(0);
    expect(report.unbalancedRoundCount).toBe(0);
    expect(report.postingImbalance).toBe(0);
    expect(report.finalInternalSupply).toBe(report.finalNpcSupply+report.houseBalance);
    expect(report.paidEligibleNpcCount).toBeGreaterThan(report.npcCount*.5);
    expect(report.maximumNpcShareBps).toBeLessThan(3_500);
  });
});
