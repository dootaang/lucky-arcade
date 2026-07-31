import {describe,expect,it}from"vitest";
import {TEMEROSA_FLOW_EPOCH_KST_DAY,TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,TEMEROSA_NPC_GAMBLING_PROFILES,TEMEROSA_NPC_LEDGER_CONTRACT,auditCasinoFlowEconomy,casinoDayPlan,casinoUtcSecondAtKstDay,completedDayBalances,houseBalanceAt,temerosaCasinoLedgerAtUtcSecond}from"../src/index.ts";

describe("Temerosa flow ledger cutover",()=>{
  it("carries every NPC and house close exactly once",()=>{
    const legacyDay=TEMEROSA_FLOW_EPOCH_KST_DAY-TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay-1;
    const npcClose=completedDayBalances(TEMEROSA_NPC_GAMBLING_PROFILES,legacyDay,TEMEROSA_NPC_LEDGER_CONTRACT);
    expect(Object.fromEntries(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]))).toEqual(npcClose);
    const second=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY)-1;
    const clock={utcMinute:()=>Math.floor(second/60),utcSecond:()=>second};
    const oldHouse=houseBalanceAt(TEMEROSA_NPC_GAMBLING_PROFILES,clock,TEMEROSA_NPC_LEDGER_CONTRACT);
    expect(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.houseOpeningBalance).toBe(oldHouse.balance);
  });

  it("gives each non-house NPC one daily personal casino budget",()=>{
    const openings=Object.fromEntries(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
    const plan=casinoDayPlan(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,0,openings,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT);
    expect(Object.values(plan.sessions).flat().filter((session)=>session.resultKind==="casino-top-up")).toHaveLength(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.length);
    expect(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.some((profile)=>profile.id==="wares")).toBe(false);
  });

  it("switches contracts only at the frozen KST midnight",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    expect(temerosaCasinoLedgerAtUtcSecond(boundary-1).contract.version).toBe("npc-ledger/1.1");
    expect(temerosaCasinoLedgerAtUtcSecond(boundary).contract.version).toBe("npc-ledger/1.2");
  });

  it("keeps the one-year internal supply within the frozen audit band",()=>{
    const report=auditCasinoFlowEconomy(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,365);
    expect(report.supplyChangeBps).toBeGreaterThanOrEqual(-1_000);
    expect(report.supplyChangeBps).toBeLessThanOrEqual(1_000);
    expect(report.houseCurtailedOperatingExpenses).toBe(0);
  },10_000);
});
