import {describe,expect,it}from"vitest";
import {TEMEROSA_CIGENIA_NPC_ID,TEMEROSA_FLOW_13_EPOCH_KST_DAY,TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES,TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT,TEMEROSA_FLOW_EPOCH_KST_DAY,TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,TEMEROSA_FLOW_PROFILE_EXCLUSIONS,TEMEROSA_FLOW_RELEASE_AUDIT,TEMEROSA_LEGACY_NPC_SUCCESSORS,TEMEROSA_NPC_GAMBLING_PROFILES,TEMEROSA_NPC_LEDGER_CONTRACT,TEMEROSA_SERIES_CASINO_SEAT_IDS,TEMEROSA_SERIES_RUNTIME_SOURCE,auditCasinoFlowEconomy,casinoDayPlan,casinoPresenceAt,casinoSpectatorScheduleAt,casinoUtcSecondAtKstDay,completedDayBalances,houseBalanceAt,recentNpcPlayEventsAt,temerosaCasinoLedgerAtUtcSecond}from"../src/index.ts";

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
    expect(TEMEROSA_SERIES_RUNTIME_SOURCE).toMatchObject({ledgerProfiles:99,casinoSeats:81,identityRule:"series-and-source-persona"});
    expect(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES).toHaveLength(102);
    expect(TEMEROSA_SERIES_CASINO_SEAT_IDS).toHaveLength(81);
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

  it("switches the default worldline at the live KST epoch",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    expect(temerosaCasinoLedgerAtUtcSecond(boundary-1).contract.version).toBe("npc-ledger/1.1");
    expect(temerosaCasinoLedgerAtUtcSecond(boundary).contract.version).toBe("npc-ledger/1.2");
    expect(temerosaCasinoLedgerAtUtcSecond(casinoUtcSecondAtKstDay(TEMEROSA_FLOW_13_EPOCH_KST_DAY)-1).contract.version).toBe("npc-ledger/1.2");
    expect(temerosaCasinoLedgerAtUtcSecond(casinoUtcSecondAtKstDay(TEMEROSA_FLOW_13_EPOCH_KST_DAY)).contract.version).toBe("npc-ledger/1.3");
  });

  it("keeps an explicit rollback switch while activating the approved worldline",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    expect(TEMEROSA_FLOW_RELEASE_AUDIT.blockers).toEqual([]);
    expect(TEMEROSA_FLOW_RELEASE_AUDIT.warnings).toContain("ten-year-audit-pending");
    expect(temerosaCasinoLedgerAtUtcSecond(boundary-1,{flowEconomy:true}).contract.version).toBe("npc-ledger/1.1");
    expect(temerosaCasinoLedgerAtUtcSecond(boundary,{flowEconomy:true}).contract.version).toBe("npc-ledger/1.2");
    expect(temerosaCasinoLedgerAtUtcSecond(boundary,{flowEconomy:false}).contract.version).toBe("npc-ledger/1.1");
  });

  it("keeps real live-tape actions visible immediately after the cutover",()=>{
    const openings=Object.fromEntries(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
    const plan=casinoDayPlan(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,0,openings,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT);
    const first=plan.matches[0]!;
    const second=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY,first.startsAtSecondOfDay+1);
    const events=recentNpcPlayEventsAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,{utcMinute:()=>Math.floor(second/60),utcSecond:()=>second},TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,32);
    expect(events.some((event)=>event.matchId===first.matchId&&event.code==="table-enter")).toBe(true);
  });

  it("records the audited one-year drift as live operating warnings",()=>{
    const report=TEMEROSA_FLOW_RELEASE_AUDIT.oneYear;
    expect(report.supplyChangeBps).toBeLessThan(-300);
    expect(report.averageSettlementGapSeconds).toBeGreaterThanOrEqual(10);
    expect(report.averageSettlementGapSeconds).toBeLessThanOrEqual(25);
    expect(report.houseCurtailedOperatingExpenses).toBe(0);
    expect(TEMEROSA_FLOW_RELEASE_AUDIT.warnings).toContain("one-year-supply-drift");
    expect(TEMEROSA_FLOW_RELEASE_AUDIT.warnings).not.toContain("one-year-activity-gap");
    expect(report.minimumHouseBalance).toBeGreaterThanOrEqual(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.houseOperatingPolicy!.protectedReserve);
  });

  it("publishes Korean character names with official series labels",()=>{
    const names=new Map(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.name]));
    expect(names.get("temerosa:bestiaization:camille")).toBe("카미유 · Bestiaization");
    expect(names.get("temerosa:finale:pale")).toBe("페일 · Finale");
    expect(names.get("temerosa:overture:licanica")).toBe("라카니카 · Overture");
    expect([...names.entries()].filter(([id])=>id.startsWith("temerosa:")&&!id.startsWith("temerosa:guest:")).every(([,name])=>!/[A-Za-z]+\s*\([^)]*[가-힣]/u.test(name))).toBe(true);
  });

  it("keeps newly integrated series NPCs active outside the old evening-only period",()=>{
    const legacy=new Set<string>(Object.values(TEMEROSA_LEGACY_NPC_SUCCESSORS));
    const openings=Object.fromEntries(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
    const plan=casinoDayPlan(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,0,openings,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT);
    const daytimeNewIds=new Set(plan.visits.filter((visit)=>visit.startedAtSecondOfDay<18*3_600).flatMap((visit)=>visit.participantIds).filter((id)=>!legacy.has(id)));
    expect(daytimeNewIds.size).toBeGreaterThan(0);
    expect(new Set(plan.visits.flatMap((visit)=>visit.participantIds).filter((id)=>!legacy.has(id))).size).toBeGreaterThan(60);
  });

  it("keeps series accounts while scheduling native spectator replays for the full roster",()=>{
    const second=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY,12*3_600);
    const schedule=casinoSpectatorScheduleAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,{utcMinute:()=>Math.floor(second/60)},TEMEROSA_FLOW_NPC_LEDGER_CONTRACT);
    const markets=[...(schedule.current?[schedule.current]:[]),...schedule.upcoming,...schedule.recent];
    expect(markets.length).toBeGreaterThan(0);
    for(const market of markets){
      expect(market.participantIds.every((id)=>TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.some((profile)=>profile.id===id))).toBe(true);
    }
  });

  it("opens 1.3 with Cigenia and keeps every gambler eligible throughout the KST day",()=>{
    expect(TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT).toMatchObject({version:"npc-ledger/1.3",seedVersion:"casino-flow/1.2",epochKstDay:20_667});
    expect(TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES).toHaveLength(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.length+1);
    expect(TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES.find((profile)=>profile.id===TEMEROSA_CIGENIA_NPC_ID)?.name).toBe("키게니아 · Finale");
    for(const profile of TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES){
      const minutes=new Set(profile.activeHours.flatMap((period)=>Array.from({length:period.endMinute-period.startMinute},(_,offset)=>period.startMinute+offset)));
      expect(minutes.size,profile.id).toBe(1_440);
    }
  });

  it("carries the frozen 1.2 close into 1.3 before granting Cigenia a wallet",()=>{
    const close=completedDayBalances(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,0,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT);
    for(const profile of TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES){
      if(profile.id===TEMEROSA_CIGENIA_NPC_ID)continue;
      expect(profile.openingBalance,profile.id).toBe(close[profile.id]);
    }
    const lastSecond=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_13_EPOCH_KST_DAY)-1;
    const houseClose=houseBalanceAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,{utcMinute:()=>Math.floor(lastSecond/60)},TEMEROSA_FLOW_NPC_LEDGER_CONTRACT).balance;
    const cigenia=TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES.find((profile)=>profile.id===TEMEROSA_CIGENIA_NPC_ID)!;
    expect(TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT.houseOpeningBalance!+cigenia.openingBalance).toBe(houseClose);
  });

  it("keeps the floor populated all day without fabricating settlement rows",()=>{
    let minimum=Number.POSITIVE_INFINITY;
    let sawPlaying=false,sawSpectating=false;
    for(let minute=0;minute<1_440;minute+=15){
      const second=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_13_EPOCH_KST_DAY,minute*60);
      const active=casinoPresenceAt(TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES,{utcMinute:()=>Math.floor(second/60),utcSecond:()=>second},TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT).filter((presence)=>presence.phase!=="idle");
      minimum=Math.min(minimum,active.length);
      sawPlaying ||= active.some((presence)=>presence.role==="playing"&&presence.session!==undefined);
      sawSpectating ||= active.some((presence)=>presence.role==="spectating"&&presence.session===undefined&&presence.matchId===undefined);
    }
    expect(minimum).toBeGreaterThanOrEqual(12);
    expect(sawPlaying).toBe(true);
    expect(sawSpectating).toBe(true);
  },15_000);

  it("keeps the seven-day 1.3 economy inside the approved circulation band",()=>{
    const report=auditCasinoFlowEconomy(TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT,7);
    expect(report.supplyChangeBps).toBeGreaterThanOrEqual(-300);
    expect(report.supplyChangeBps).toBeLessThanOrEqual(500);
    expect(report.averageSettlementGapSeconds).toBeGreaterThanOrEqual(10);
    expect(report.averageSettlementGapSeconds).toBeLessThanOrEqual(25);
    expect(report.postingImbalance).toBe(0);
    expect(report.minimumHouseBalance).toBeGreaterThanOrEqual(TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT.houseOperatingPolicy!.protectedReserve);
  },15_000);
});
