import { describe,expect,it } from "vitest";
import { casinoDayPlan, casinoPresenceAt, groupNpcRoundSettlements, npcLiveBalancesAt, npcMatchSettlementTone, npcPresenceIntervalsForDay, npcVisitRounds, recentNpcRoundSettlementsAt, TEMEROSA_NPC_GAMBLING_PROFILES, TEMEROSA_NPC_LEDGER_CONTRACT, type CasinoPresentationClock } from "../src/index.ts";

const profiles=TEMEROSA_NPC_GAMBLING_PROFILES,contract=TEMEROSA_NPC_LEDGER_CONTRACT;

describe("NPC real round settlements",()=>{
  it("maps every visit to all of its actual ledger settlements",()=>{
    const openings=Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]));
    const plan=casinoDayPlan(profiles,0,openings,contract);
    for(const profile of profiles){
      for(const interval of npcPresenceIntervalsForDay(profile,0,openings[profile.id]!,contract,Number.NEGATIVE_INFINITY,plan)){
        const rounds=npcVisitRounds(interval,profile);expect(rounds.length).toBeGreaterThanOrEqual(interval.sessions.length);
        expect(rounds.reduce((sum,round)=>sum+round.delta,0)).toBe(interval.sessions.reduce((sum,session)=>sum+session.delta,0));
        if(interval.role==="playing")expect(rounds.every((round)=>round.visitId===interval.visit.visitId)).toBe(true);
      }
    }
  });

  it("does not add presentation-only balance changes",()=>{
    const profile=profiles[0]!;const base={ [profile.id]:profile.openingBalance };const clock=fixedClock(contract.epochUtcDay*86_400+40_000);
    const presences=casinoPresenceAt([profile],clock,contract);
    expect(npcLiveBalancesAt(base,[profile],presences,clock)).toEqual(base);
  });

  it("returns deterministic recent real settlements across midnight",()=>{
    const now=(contract.epochUtcDay+2)*86_400+300;const first=recentNpcRoundSettlementsAt(profiles,fixedClock(now),contract,100,3_600);
    expect(recentNpcRoundSettlementsAt(profiles,fixedClock(now),contract,100,3_600)).toEqual(first);
    expect(first.every((round)=>round.utcSecond<=now&&round.utcSecond>now-3_600)).toBe(true);
    for(const group of groupNpcRoundSettlements(first))expect(new Set(group.entries.map((entry)=>entry.matchId))).toEqual(new Set([group.matchId]));
  });

  it("does not paint a zero-sum match as an all-green win",()=>{
    const now=(contract.epochUtcDay+3)*86_400+43_200;
    const groups=groupNpcRoundSettlements(recentNpcRoundSettlementsAt(profiles,fixedClock(now),contract,2_000,86_400));
    const pvp=groups.find((group)=>group.entries.some((entry)=>entry.delta>0)&&group.entries.some((entry)=>entry.delta<0));
    const oldMaid=groups.find((group)=>group.tableId==="temerosa-old-maid"&&group.entries.length>1);
    expect(pvp).toBeDefined();
    expect(npcMatchSettlementTone(pvp!)).toBe("mixed");
    expect(oldMaid).toBeDefined();
    expect(npcMatchSettlementTone(oldMaid!)).toBe(oldMaid!.entries.some((entry)=>entry.delta<0)?"mixed":"reward");
  });
});

function fixedClock(second:number):CasinoPresentationClock{return{utcSecond:()=>second,utcMinute:()=>Math.floor(second/60)};}
