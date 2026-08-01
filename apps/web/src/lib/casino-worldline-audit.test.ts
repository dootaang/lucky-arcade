import {
  TEMEROSA_FLOW_EPOCH_KST_DAY,
  TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,
  TEMEROSA_FLOW_RELEASE_AUDIT,
  TEMEROSA_FLOW_RELEASE_READY,
  auditCasinoFlowEconomy,
  casinoUtcSecondAtKstDay,
  temerosaCasinoLedgerAtUtcSecond,
} from "@lucky-arcade/casino-ledger";
import { describe, expect, it } from "vitest";

describe("npc-ledger/1.2 canonical transition audit",()=>{
  it("reuses the bounded core audit while the 3,650-day result remains pending",()=>{
    const longAudit=process.env.CASINO_LONG_AUDIT==="1";
    const days=longAudit?3_650:30;
    const report=auditCasinoFlowEconomy(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,days);
    const protectedReserve=TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.houseOperatingPolicy!.protectedReserve;
    expect(report).toMatchObject({
      days,npcCount:102,duplicateRoundIdCount:0,unbalancedRoundCount:0,postingImbalance:0,
    });
    expect(report.finalNpcSupply).toBeGreaterThanOrEqual(0);
    expect(report.minimumHouseBalance).toBeGreaterThanOrEqual(protectedReserve);
    if(longAudit){
      expect(TEMEROSA_FLOW_RELEASE_AUDIT.tenYears).toEqual({status:"pending"});
    }
    expect(TEMEROSA_FLOW_RELEASE_READY).toBe(false);
    expect(TEMEROSA_FLOW_RELEASE_AUDIT).toMatchObject({
      status:"blocked",
      blockers:["seven-day-supply-drift","one-year-supply-drift","one-year-activity-gap","ten-year-audit-pending"],
    });

    const farFuture=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY+3_650);
    expect(temerosaCasinoLedgerAtUtcSecond(farFuture).contract.version).toBe("npc-ledger/1.1");
    expect(temerosaCasinoLedgerAtUtcSecond(farFuture,{flowEconomy:true}).contract.version).toBe("npc-ledger/1.1");
  },process.env.CASINO_LONG_AUDIT==="1"?900_000:60_000);
});
