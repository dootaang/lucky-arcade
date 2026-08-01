import {createHash}from"node:crypto";
import {describe,expect,it}from"vitest";
import {TEMEROSA_NPC_GAMBLING_PROFILES,TEMEROSA_NPC_LEDGER_CONTRACT,casinoDayPlan}from"../src/index.ts";

describe("frozen npc-ledger/1.1 worldline",()=>{
  it("matches the published multi-day plan hash",()=>{
    const profiles=TEMEROSA_NPC_GAMBLING_PROFILES;
    let balances=Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]));
    const samples:unknown[]=[];
    for(let day=0;day<=30;day+=1){
      const plan=casinoDayPlan(profiles,day,balances,TEMEROSA_NPC_LEDGER_CONTRACT);
      if(day===0||day===1||day===7||day===30)samples.push({day,plan});
      balances=Object.fromEntries(profiles.map((profile)=>[profile.id,balances[profile.id]!+(plan.sessions[profile.id]??[]).reduce((sum,session)=>sum+session.delta,0)]));
    }
    expect(createHash("sha256").update(JSON.stringify(samples)).digest("hex")).toBe("247bbb60f4f14e02763a34a30680ba46a4253bb95888a980442b937c728e474c");
  });
});
