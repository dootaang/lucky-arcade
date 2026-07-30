import { describe,expect,it } from "vitest";
import { casinoDaySessions, casinoUtcSecondAtKstDay, houseBalanceAt, houseGamingDelta, TEMEROSA_HOUSE_OPENING_CAPITAL, TEMEROSA_NPC_GAMBLING_PROFILES, TEMEROSA_NPC_LEDGER_CONTRACT, withHouseCounterparties, type CasinoPresentationClock, type NpcRoundSettlement } from "../src/index.ts";

const profiles=TEMEROSA_NPC_GAMBLING_PROFILES,contract=TEMEROSA_NPC_LEDGER_CONTRACT;

describe("finite Temerosa house",()=>{
  it("takes the exact counterentry for every house game",()=>{
    const openings=Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]));
    const sessions=casinoDaySessions(profiles,0,openings,contract);
    const npcDelta=Object.values(sessions).flat().filter((session)=>session.tableId==="temerosa-slot"||session.tableId==="temerosa-high-low").reduce((sum,session)=>sum+session.delta,0);
    expect(houseGamingDelta(sessions)).toBe(-npcDelta);
  });

  it("opens with finite capital and remains solvent in the first year",()=>{
    const final=houseBalanceAt(profiles,fixedClock(casinoUtcSecondAtKstDay(contract.epochKstDay+365)-1),contract);
    expect(final.balance).toBeGreaterThan(0);
    expect(final.gamingProfit).toBeGreaterThan(0);
    expect(final.operatingExpenses).toBeGreaterThan(0);
    expect(final.balance).toBeGreaterThanOrEqual(TEMEROSA_HOUSE_OPENING_CAPITAL);
  },30_000);

  it("adds visible equal-and-opposite house receipts",()=>{
    const npc=receipt(-100);const all=withHouseCounterparties([npc]);
    expect(all).toHaveLength(2);
    expect(all.reduce((sum,entry)=>sum+entry.delta,0)).toBe(0);
    expect(all.find((entry)=>entry.npcId==="house:temerosa")?.delta).toBe(100);
  });
});

function fixedClock(second:number):CasinoPresentationClock{return{utcMinute:()=>Math.floor(second/60),utcSecond:()=>second};}
function receipt(delta:number):NpcRoundSettlement{return{roundId:"round",matchId:"match",visitId:"visit",participantIds:["pale"],npcId:"pale",tableId:"temerosa-slot",utcSecond:1_000,stake:10,reservedAmount:100,creditAmount:100+delta,delta,resultKind:"lines-0",termsVersion:"test"};}
