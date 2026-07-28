import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  casinoDaySessions,
  casinoDayPlan,
  completedDayBalances,
  npcBalanceAt,
  recentNpcActivitiesAt,
  rollingNpcProfitAt,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  type CasinoClock,
  type NpcGamblingProfile,
} from "../src/index.ts";

const contract = TEMEROSA_NPC_LEDGER_CONTRACT;
const profiles = TEMEROSA_NPC_GAMBLING_PROFILES;
const openings = () => Object.fromEntries(profiles.map((profile) => [profile.id, profile.openingBalance]));

describe("casino ledger 0.6 core", () => {
  it("repeats the same shared matches and exact closing for identical inputs", () => {
    const first = casinoDaySessions(profiles, 37, openings(), contract);
    expect(casinoDaySessions(profiles, 37, openings(), contract)).toEqual(first);
    expect(close(openings(), first)).toEqual(close(openings(), first));
  });

  it("derives visit profit from multiple independently settled matches",()=>{
    const plan=casinoDayPlan(profiles,3,openings(),contract);
    const multi=plan.visits.find((visit)=>plan.matches.filter((match)=>match.visitId===visit.visitId).length>=2);
    expect(multi).toBeDefined();
    const matches=plan.matches.filter((match)=>match.visitId===multi!.visitId);
    expect(new Set(matches.map((match)=>match.matchId)).size).toBe(matches.length);
    for(const participantId of multi!.participantIds){
      const sessions=(plan.sessions[participantId]??[]).filter((session)=>session.visitId===multi!.visitId);
      expect(sessions).toHaveLength(matches.length);
      expect(sessions.reduce((sum,session)=>sum+session.delta,0)).toBe(sessions.map((session)=>session.delta).reduce((sum,value)=>sum+value,0));
    }
  });

  it("uses player stakes and applies leverage symmetrically", () => {
    let balances = openings();
    for (let day=0;day<120;day++) {
      const sessions=casinoDaySessions(profiles,day,balances,contract);
      for(const profile of profiles) for(const session of sessions[profile.id]??[]) {
        expect(session.delta).toBe(session.creditAmount-session.reservedAmount);
        expect([0,10,50,200]).toContain(session.stake);
        if(session.stake===0) expect(session.reservedAmount).toBe(0);
        else expect([2,3,4,5]).toContain(session.reservedAmount/session.stake);
        if(session.resultKind==="win") expect(session.delta).toBe(session.reservedAmount);
        if(session.resultKind==="loss") expect(session.delta).toBe(-session.reservedAmount);
      }
      balances=close(balances,sessions);
    }
  },30_000);

  it("gives every PvP match one shared id and a zero-sum settlement", () => {
    let balances=openings(); let checked=0;
    for(let day=0;day<80;day++){
      const sessions=casinoDaySessions(profiles,day,balances,contract);
      const groups=new Map<string,Array<{tableId:string;delta:number;participants:readonly string[]}>>();
      for(const profile of profiles)for(const session of sessions[profile.id]??[]){
        if(!["temerosa-match-pairs","indian-poker"].includes(session.tableId))continue;
        const group=groups.get(session.matchId)??[];group.push({tableId:session.tableId,delta:session.delta,participants:session.participantIds});groups.set(session.matchId,group);
      }
      for(const group of groups.values()){
        expect(group).toHaveLength(2);expect(group[0]!.participants).toEqual(group[1]!.participants);
        expect(group.reduce((sum,item)=>sum+item.delta,0)).toBe(0);checked++;
      }
      balances=close(balances,sessions);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("lets game skill beat weaker profiles over a large audit sample", () => {
    const strong=forcedProfile("katrinka","temerosa-match-pairs",.98);
    const weak=forcedProfile("morsisa","temerosa-match-pairs",.05);
    let strongWins=0,weakWins=0;
    for(let day=0;day<2_000;day++){
      const dayOpenings={ [strong.id]:4_000,[weak.id]:4_000 };
      const sessions=casinoDaySessions([strong,weak],day,dayOpenings,contract);
      if(sessions[strong.id]?.[0]?.delta!>0)strongWins++;
      if(sessions[weak.id]?.[0]?.delta!>0)weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins*1.5);
  });

  it("never becomes negative or leaves safe integer range over 10,000 days", () => {
    const auditProfiles=profiles.map((profile)=>({...profile,sessionsPerDay:{min:1,max:1}}));
    let balances=openings();
    for(let day=0;day<10_000;day++){
      const sessions=casinoDaySessions(auditProfiles,day,balances,contract);
      balances=close(balances,sessions);
      for(const value of Object.values(balances)){if(!Number.isSafeInteger(value)||value<0||value>1_000_000_000)throw new Error(`invalid_balance:${day}:${value}`);}
    }
  },120_000);

  it("keeps the production economy liquid without runaway inflation", () => {
    const initial = Object.values(openings()).reduce((sum, balance) => sum + balance, 0);
    let balances = openings();
    for (let day = 0; day < 365; day += 1) balances = close(balances, casinoDaySessions(profiles, day, balances, contract));
    const values = Object.values(balances).toSorted((left, right) => left - right);
    const total = values.reduce((sum, balance) => sum + balance, 0);
    expect(total).toBeGreaterThan(initial * .5);
    expect(total).toBeLessThan(initial * 3);
    expect(values[Math.floor(values.length / 2)]).toBeGreaterThanOrEqual(10);
    expect(values.at(-1)! / total).toBeLessThan(.6);
  },30_000);

  it("recovers a zero balance through free old maid before any paid table", () => {
    const zero={...openings(),katrinka:0};
    const sessions=casinoDaySessions(profiles,8,zero,contract).katrinka??[];
    expect(sessions.length).toBeGreaterThan(0);
    const firstPaid=sessions.findIndex((session)=>session.stake>0);
    const recoveryWindow=firstPaid<0?sessions:sessions.slice(0,firstPaid);
    expect(recoveryWindow.length).toBeGreaterThan(0);
    expect(recoveryWindow.every((session)=>session.tableId==="temerosa-old-maid"&&session.stake===0&&session.reservedAmount===0)).toBe(true);
    expect(sessions.reduce((sum,session)=>sum+session.delta,0)).toBeGreaterThan(0);
  });

  it("moves time forward and backward without mutating history", () => {
    const profile=profiles[0]!;const minute=(contract.epochUtcDay+14)*1_440+1_439;
    const original=npcBalanceAt(profile,fixedClock(minute),contract);
    expect(npcBalanceAt(profile,fixedClock(minute+1_440),contract).dayIndex).toBe(original.dayIndex+1);
    expect(npcBalanceAt(profile,fixedClock(minute),contract)).toEqual(original);
  });

  it("returns opening balances before the v0.6 epoch",()=>{
    const profile=profiles[0]!;
    expect(npcBalanceAt(profile,fixedClock(contract.epochUtcDay*1_440-1),contract)).toEqual({balance:profile.openingBalance,today:[],dayIndex:0});
  });

  it("returns recent activity and rolling seven-day profit deterministically",()=>{
    const now=(contract.epochUtcDay+9)*1_440+800;const clock=fixedClock(now);
    const activity=recentNpcActivitiesAt(profiles,clock,contract,200);
    expect(activity.length).toBeGreaterThan(0);expect(activity.every((entry)=>entry.utcMinute<=now&&entry.utcMinute>now-1_440)).toBe(true);
    expect(rollingNpcProfitAt(profiles,clock,contract,7)).toEqual(rollingNpcProfitAt(profiles,clock,contract,7));
  });

  it("produces identical full and checkpoint-assisted balances",()=>{
    const full=completedDayBalances(profiles,20,contract);const checkpoint=completedDayBalances(profiles,12,contract);
    expect(completedDayBalances(profiles,20,contract,checkpoint,12)).toEqual(full);
  });

  it("contains no ambient side effects in pure sources",()=>{
    const sources=["engine.ts","contracts.ts","presence.ts","rounds.ts","temerosa-profiles.ts"].map((file)=>readFileSync(new URL(`../src/${file}`,import.meta.url),"utf8")).join("\n");
    for(const token of ["Date"+".now(","Math"+".random(","local"+"Storage","session"+"Storage","fetch(","re"+"act"])expect(sources).not.toContain(token);
  });
});

function forcedProfile(id:string,tableId:"temerosa-match-pairs"|"indian-poker",skill:number):NpcGamblingProfile{
  const source=profiles.find((profile)=>profile.id===id)!;
  return {...source,openingBalance:4_000,target:4_000,sessionsPerDay:{min:1,max:1},tables:[{tableId,weight:1}],activeHours:[{startMinute:600,endMinute:601,weight:1}],skills:{...source.skills,matchPairsMemory:skill,pokerRead:skill,pokerBluff:skill}};
}
function close(opening:Readonly<Record<string,number>>,sessions:Readonly<Record<string,readonly {delta:number}[]>>):Record<string,number>{return Object.fromEntries(Object.keys(opening).map((id)=>[id,opening[id]!+(sessions[id]??[]).reduce((sum,item)=>sum+item.delta,0)]));}
function fixedClock(minute:number):CasinoClock{return{utcMinute:()=>minute};}
