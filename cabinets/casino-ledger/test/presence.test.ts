import { describe,expect,it } from "vitest";
import { casinoDayPlan,casinoPresenceAt,casinoUtcSecondAtKstDay,npcAvailability,npcPresenceIntervalsForDay,recentNpcPlayEventsAt,recentNpcRoundSettlementsAt,TEMEROSA_NPC_GAMBLING_PROFILES,TEMEROSA_NPC_LEDGER_CONTRACT,type CasinoPresentationClock } from "../src/index.ts";

const profiles=TEMEROSA_NPC_GAMBLING_PROFILES,contract=TEMEROSA_NPC_LEDGER_CONTRACT;

describe("casino floor presence",()=>{
  it("derives the same KST-calendar presence from the same Unix second",()=>{const second=casinoUtcSecondAtKstDay(contract.epochKstDay,40_000);expect(casinoPresenceAt(profiles,fixedClock(second),contract)).toEqual(casinoPresenceAt(profiles,fixedClock(second),contract));});

  it("starts presence, live tape and settlements on the KST epoch day",()=>{
    const during=casinoUtcSecondAtKstDay(contract.epochKstDay,160);
    const after=casinoUtcSecondAtKstDay(contract.epochKstDay,300);
    expect(casinoPresenceAt(profiles,fixedClock(during),contract).some((entry)=>entry.phase!=="idle")).toBe(true);
    expect(recentNpcPlayEventsAt(profiles,fixedClock(during),contract,100).length).toBeGreaterThan(0);
    expect(recentNpcRoundSettlementsAt(profiles,fixedClock(after),contract,100,3_600).length).toBeGreaterThan(0);
  });

  it("marks an active visit unavailable without exposing another result",()=>{
    const profile=profiles[0]!,opening=profile.openingBalance;const interval=npcPresenceIntervalsForDay(profile,0,opening,contract)[0]!;
    const before=casinoPresenceAt(profiles,fixedClock(interval.settlesAtUtcSecond-10),contract).find((presence)=>presence.npcId===profile.id)!;expect(["playing","spectating","settling"]).toContain(before.phase);expect(npcAvailability([before])[profile.id]?.available).toBe(false);
  });

  it("keeps at least four NPCs available across a one-year audit",()=>{
    let balances=Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]));
    for(let day=0;day<366;day++){
      const plan=casinoDayPlan(profiles,day,balances,contract);const events:Array<{second:number;delta:-1|1}>=[];
      for(const profile of profiles){for(const interval of npcPresenceIntervalsForDay(profile,day,balances[profile.id]!,contract,Number.NEGATIVE_INFINITY,plan))events.push({second:interval.startedAtUtcSecond,delta:1},{second:interval.availableAtUtcSecond,delta:-1});}
      events.sort((a,b)=>a.second-b.second||a.delta-b.delta);let busy=0;for(const event of events){busy+=event.delta;if(profiles.length-busy<4)throw new Error(`insufficient_available:${day}:${event.second}`);}
      balances=Object.fromEntries(profiles.map((profile)=>[profile.id,balances[profile.id]!+(plan.sessions[profile.id]??[]).reduce((sum,session)=>sum+session.delta,0)]));
    }
  },30_000);

  it("does not create NPC spectator reservations for old maid",()=>{
    const openings=Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]));
    const plan=casinoDayPlan(profiles,0,openings,contract);
    expect(plan.predictions).toEqual([]);
    expect(casinoPresenceAt(profiles,fixedClock(casinoUtcSecondAtKstDay(contract.epochKstDay,40_000)),contract).some((entry)=>entry.role==="spectating")).toBe(false);
  });
});

function fixedClock(second:number):CasinoPresentationClock{return{utcSecond:()=>second,utcMinute:()=>Math.floor(second/60)};}
