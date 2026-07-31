import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe,expect,it } from "vitest";
import { TEMEROSA_LEGACY_NPC_SUCCESSORS,TEMEROSA_NPC_GAMBLING_PROFILES,auditCasinoFlowEconomy,buildTemerosaFlowProfileSet,type NpcLedgerContract,type TemerosaFlowRosterRecord } from "../src/index.ts";

const rosterPath=fileURLToPath(new URL("../../../apps/content-cli/src/temerosa-series-npc-roster.generated.json",import.meta.url));

describe("casino flow economy audit",()=>{
  it("audits every real round and preserves ledger invariants",async()=>{
    const inventory=JSON.parse(await readFile(rosterPath,"utf8")) as {records:readonly TemerosaFlowRosterRecord[]};
    const set=buildTemerosaFlowProfileSet({records:inventory.records,identityPolicy:"series-persona",legacyProfiles:TEMEROSA_NPC_GAMBLING_PROFILES,legacySuccessors:TEMEROSA_LEGACY_NPC_SUCCESSORS});
    const contract:NpcLedgerContract={version:"npc-ledger/1.2",seedVersion:"casino-flow/1.0",epochKstDay:20_667,profiles:set.profiles,externalIncomeProfiles:set.externalIncomeProfiles,behaviors:set.behaviors,profitHistory:Object.freeze([])};
    const report=auditCasinoFlowEconomy(contract,7);
    expect(report.npcCount).toBe(115);
    expect(report.totalNpcCasinoTopUps).toBeGreaterThan(0);
    expect(report.totalRounds).toBeGreaterThan(0);
    expect(report.totalSettlementRows).toBeGreaterThanOrEqual(report.totalRounds);
    expect(report.finalInternalSupply).toBe(report.finalNpcSupply+report.houseBalance);
    expect(report.paidEligibleNpcCount).toBeGreaterThan(report.npcCount*.7);
    expect(report.maximumNpcShareBps).toBeLessThan(3_500);
  });
});
