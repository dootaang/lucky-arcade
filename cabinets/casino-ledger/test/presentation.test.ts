import { describe, expect, it } from "vitest";
import { casinoFullLeaderboard, casinoLeaderboard, casinoNpcLedgerReport, TEMEROSA_NPC_GAMBLING_PROFILES, type NpcRoundSettlement } from "../src/index.ts";

describe("casino leaderboard", () => {
  it("shows the user once and places a tied user behind every NPC", () => {
    const balances = Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.target]));
    const board = casinoLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES, balances, 4_000);
    expect(board.filter((entry) => entry.kind === "user")).toHaveLength(1);
    expect(board.find((entry) => entry.kind === "npc" && entry.id === "katrinka")!.rank).toBeLessThan(board.find((entry) => entry.kind === "user")!.rank);
  });

  it("appends the user fixed row only when outside the top five", () => {
    const balances = Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.target]));
    const board = casinoLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES, balances, 0);
    expect(board).toHaveLength(6);
    expect(board.at(-1)).toMatchObject({ kind: "user", rank: 36 });
  });

  it("returns all 35 NPCs and the user exactly once in the record room",()=>{
    const balances=Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
    const board=casinoFullLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES,balances,0);
    expect(board).toHaveLength(36);expect(new Set(board.map((entry)=>`${entry.kind}:${entry.id}`)).size).toBe(36);
    expect(board.filter((entry)=>entry.kind==="user")).toHaveLength(1);
  });

  it("ranks the player by period profit instead of displaying the wallet balance",()=>{
    const balances=Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
    const profits=Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,0]));
    const board=casinoFullLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES,balances,99_999,profits,25);
    expect(board[0]).toMatchObject({kind:"user",periodProfit:25,rank:1});
    expect(board[0]!.balance).toBe(99_999);
  });

  it("keeps table breakdown and receipt totals exactly reconciled",()=>{
    const values=[receipt("a","temerosa-slot",100),receipt("b","temerosa-slot",-50),receipt("c","temerosa-high-low",30)];
    const report=casinoNpcLedgerReport("lyla",values);
    expect(report).toMatchObject({settlements:3,gains:2,losses:1,net:80,largestGain:100,largestLoss:-50});
    expect(report.byTable.reduce((sum,item)=>sum+item.net,0)).toBe(report.net);
  });
});

function receipt(id:string,tableId:NpcRoundSettlement["tableId"],delta:number):NpcRoundSettlement{return{roundId:id,matchId:id,visitId:id,participantIds:["lyla"],npcId:"lyla",tableId,utcSecond:1_000+Number(id.charCodeAt(0)),stake:10,reservedAmount:50,creditAmount:50+delta,delta,resultKind:delta>0?"win":"loss",termsVersion:"test"};}
