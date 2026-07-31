import {describe,expect,it}from"vitest";
import {TEMEROSA_FLOW_EPOCH_KST_DAY,TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,TEMEROSA_FLOW_PROFILE_EXCLUSIONS,TEMEROSA_LEGACY_NPC_SUCCESSORS,TEMEROSA_NPC_GAMBLING_PROFILES,TEMEROSA_NPC_LEDGER_CONTRACT,TEMEROSA_SERIES_CASINO_SEAT_IDS,TEMEROSA_SERIES_RUNTIME_SOURCE,auditCasinoFlowEconomy,casinoDayPlan,casinoUtcSecondAtKstDay,completedDayBalances,houseBalanceAt,recentNpcPlayEventsAt,temerosaCasinoLedgerAtUtcSecond}from"../src/index.ts";

describe("Temerosa flow ledger cutover",()=>{
  it("carries every NPC and house close exactly once",()=>{
    const legacyDay=TEMEROSA_FLOW_EPOCH_KST_DAY-TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay-1;
    const npcClose=completedDayBalances(TEMEROSA_NPC_GAMBLING_PROFILES,legacyDay,TEMEROSA_NPC_LEDGER_CONTRACT);
    const expected:Record<string,number>={};
    for(const [legacyId,balance] of Object.entries(npcClose)){
      const successor=TEMEROSA_LEGACY_NPC_SUCCESSORS[legacyId]!;
      expected[successor]=(expected[successor]??0)+balance;
    }
    const carried=Object.fromEntries(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.filter((profile)=>expected[profile.id]!==undefined).map((profile)=>[profile.id,profile.openingBalance]));
    expect(carried).toEqual(expected);
    const second=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY)-1;
    const clock={utcMinute:()=>Math.floor(second/60),utcSecond:()=>second};
    const oldHouse=houseBalanceAt(TEMEROSA_NPC_GAMBLING_PROFILES,clock,TEMEROSA_NPC_LEDGER_CONTRACT);
    const legacyNpcTotal=Object.values(npcClose).reduce((sum,balance)=>sum+balance,0);
    const flowNpcTotal=TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.reduce((sum,profile)=>sum+profile.openingBalance,0);
    expect(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.houseOpeningBalance).toBe(oldHouse.balance-(flowNpcTotal-legacyNpcTotal));
    expect(flowNpcTotal+TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.houseOpeningBalance!).toBe(legacyNpcTotal+oldHouse.balance);
  });

  it("connects only the audited series-persona intersection",()=>{
    expect(TEMEROSA_SERIES_RUNTIME_SOURCE).toMatchObject({ledgerProfiles:99,casinoSeats:80,identityRule:"series-and-source-persona"});
    expect(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES).toHaveLength(102);
    expect(TEMEROSA_SERIES_CASINO_SEAT_IDS).toHaveLength(80);
    expect(TEMEROSA_FLOW_PROFILE_EXCLUSIONS).toEqual([]);
    expect(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.some((profile)=>profile.id.includes(":bacikal"))).toBe(false);
    expect(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.some((profile)=>profile.id.includes(":wares"))).toBe(false);
  });

  it("gives each non-house NPC one daily personal casino budget",()=>{
    const openings=Object.fromEntries(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
    const plan=casinoDayPlan(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,0,openings,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT);
    expect(Object.values(plan.sessions).flat().filter((session)=>session.resultKind==="casino-top-up")).toHaveLength(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.length);
    expect(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.some((profile)=>profile.id==="wares")).toBe(false);
  });

  it("does not switch contracts at the candidate date without a release flag",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    expect(temerosaCasinoLedgerAtUtcSecond(boundary-1).contract.version).toBe("npc-ledger/1.1");
    expect(temerosaCasinoLedgerAtUtcSecond(boundary).contract.version).toBe("npc-ledger/1.1");
    expect(temerosaCasinoLedgerAtUtcSecond(boundary+365*86_400).contract.version).toBe("npc-ledger/1.1");
  });

  it("keeps the candidate locked even with a flag while a frozen audit blocker remains",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    expect(temerosaCasinoLedgerAtUtcSecond(boundary-1,{flowEconomy:true}).contract.version).toBe("npc-ledger/1.1");
    expect(temerosaCasinoLedgerAtUtcSecond(boundary,{flowEconomy:true}).contract.version).toBe("npc-ledger/1.1");
  });

  it("keeps real live-tape actions visible immediately after the cutover",()=>{
    const openings=Object.fromEntries(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
    const plan=casinoDayPlan(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,0,openings,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT);
    const first=plan.matches[0]!;
    const second=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY,first.startsAtSecondOfDay+1);
    const events=recentNpcPlayEventsAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,{utcMinute:()=>Math.floor(second/60),utcSecond:()=>second},TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,32);
    expect(events.some((event)=>event.matchId===first.matchId&&event.code==="table-enter")).toBe(true);
  });

  it("keeps the one-year internal supply within the frozen audit band",()=>{
    const report=auditCasinoFlowEconomy(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,365);
    expect(report.supplyChangeBps).toBeGreaterThanOrEqual(-1_000);
    expect(report.supplyChangeBps).toBeLessThanOrEqual(1_000);
    expect(report.houseCurtailedOperatingExpenses).toBeGreaterThan(0);
  },60_000);
});
