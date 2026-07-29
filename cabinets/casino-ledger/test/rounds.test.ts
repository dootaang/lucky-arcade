import { describe,expect,it } from "vitest";
import { casinoDayPlan, casinoPresenceAt, groupNpcRoundSettlements, npcLiveBalancesAt, npcMatchSettlementEntriesByNpc, npcMatchSettlementTone, npcPresenceIntervalsForDay, npcVisitRounds, recentNpcRoundSettlementsAt, TEMEROSA_NPC_GAMBLING_PROFILES, TEMEROSA_NPC_LEDGER_CONTRACT, type CasinoPresentationClock, type NpcRoundSettlement } from "../src/index.ts";

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
    const pvp=groupNpcRoundSettlements([receipt("win","lyla",50,"temerosa-match-pairs"),receipt("loss","pale",-50,"temerosa-match-pairs")])[0]!;
    const oldMaid=groupNpcRoundSettlements([receipt("rank-1","lyla",30),receipt("rank-4","pale",-30)])[0]!;
    expect(npcMatchSettlementTone(pvp)).toBe("mixed");
    expect(npcMatchSettlementTone(oldMaid)).toBe("mixed");
  });

  it("splits a match into one tape group per NPC and keeps one NPC's receipt components together",()=>{
    const lylaRank=receipt("rank","lyla",10),lylaPrediction=receipt("prediction","lyla",50),pale=receipt("loss","pale",-60);
    const grouped=npcMatchSettlementEntriesByNpc({matchId:"match",visitId:"visit",tableId:"temerosa-old-maid",utcSecond:1_000,participantIds:["lyla","pale"],entries:[lylaRank,pale,lylaPrediction]});
    expect(grouped).toHaveLength(2);
    expect(grouped.map((entries)=>[entries[0]!.npcId,entries.reduce((sum,entry)=>sum+entry.delta,0)])).toEqual([["lyla",60],["pale",-60]]);
  });
});

function fixedClock(second:number):CasinoPresentationClock{return{utcSecond:()=>second,utcMinute:()=>Math.floor(second/60)};}
function receipt(roundId:string,npcId:string,delta:number,tableId:NpcRoundSettlement["tableId"]="temerosa-old-maid"):NpcRoundSettlement{return{roundId,matchId:"match",visitId:"visit",participantIds:["lyla","pale"],npcId,tableId,utcSecond:1_000,stake:10,reservedAmount:50,creditAmount:50+delta,delta,resultKind:roundId,termsVersion:"test"};}
