import { describe,expect,it } from "vitest";
import { casinoDaySessions, casinoPresenceAt, npcLiveBalancesAt, npcPresenceIntervalsForDay, npcVisitRounds, recentNpcRoundSettlementsAt, TEMEROSA_NPC_GAMBLING_PROFILES, TEMEROSA_NPC_LEDGER_CONTRACT, type CasinoPresentationClock } from "../src/index.ts";

const profiles=TEMEROSA_NPC_GAMBLING_PROFILES,contract=TEMEROSA_NPC_LEDGER_CONTRACT;

describe("NPC real round settlements",()=>{
  it("maps every visit to its one actual ledger settlement",()=>{
    const openings=Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]));
    const sessions=casinoDaySessions(profiles,0,openings,contract);
    for(const profile of profiles){
      for(const interval of npcPresenceIntervalsForDay(profile,0,openings[profile.id]!,contract,Number.NEGATIVE_INFINITY,sessions[profile.id])){
        const rounds=npcVisitRounds(interval,profile);expect(rounds).toHaveLength(1);expect(rounds[0]!.delta).toBe(interval.session.delta);expect(rounds[0]!.roundId).toContain(interval.session.matchId);
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
  });
});

function fixedClock(second:number):CasinoPresentationClock{return{utcSecond:()=>second,utcMinute:()=>Math.floor(second/60)};}
