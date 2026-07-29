import type { CasinoLedgerSourceId, NpcGamblingProfile, NpcRoundSettlement } from "./contracts.ts";
import { casinoKstDayAtUtcSecond } from "./casino-time.ts";

export interface CasinoLeaderboardEntry {
  id: string;
  kind: "npc" | "user";
  name: string;
  balance: number;
  periodProfit?: number;
  rank: number;
}

export function casinoLeaderboard(
  profiles: readonly NpcGamblingProfile[],
  npcBalances: Readonly<Record<string, number>>,
  userBalance: number,
  npcPeriodProfits?: Readonly<Record<string, number>>,
  userPeriodProfit = 0,
): readonly CasinoLeaderboardEntry[] {
  const ranked = casinoFullLeaderboard(profiles,npcBalances,userBalance,npcPeriodProfits,userPeriodProfit);
  const top = ranked.slice(0, 5);
  const user = ranked.find((entry) => entry.kind === "user")!;
  return Object.freeze(top.some((entry) => entry.kind === "user") ? top : [...top, user]);
}

export function casinoFullLeaderboard(
  profiles: readonly NpcGamblingProfile[],
  npcBalances: Readonly<Record<string, number>>,
  userBalance: number,
  npcPeriodProfits?: Readonly<Record<string, number>>,
  userPeriodProfit = 0,
): readonly CasinoLeaderboardEntry[] {
  const sorted = [
    ...profiles.map((profile) => ({ id: profile.id, kind: "npc" as const, name: profile.name, balance: npcBalances[profile.id] ?? profile.openingBalance, ...(npcPeriodProfits ? { periodProfit: npcPeriodProfits[profile.id] ?? 0 } : {}) })),
    { id: "user", kind: "user" as const, name: "나", balance: userBalance, ...(npcPeriodProfits ? { periodProfit: userPeriodProfit } : {}) },
  ].sort((left, right) => (npcPeriodProfits
    ? (right.periodProfit ?? 0) - (left.periodProfit ?? 0)
    : right.balance - left.balance)
    || (left.kind === right.kind ? compareText(left.id, right.id) : left.kind === "npc" ? -1 : 1));
  return Object.freeze(sorted.map((entry, index) => Object.freeze({ ...entry, rank: index + 1 })));
}

export interface CasinoNpcTableSummary {
  tableId: CasinoLedgerSourceId;
  settlements: number;
  gains: number;
  losses: number;
  flat: number;
  exposure: number;
  credit: number;
  net: number;
}

export interface CasinoNpcLedgerReport {
  npcId: string;
  settlements: number;
  gains: number;
  losses: number;
  flat: number;
  exposure: number;
  credit: number;
  net: number;
  largestGain: number;
  largestLoss: number;
  byTable: readonly CasinoNpcTableSummary[];
  dailyNet: readonly Readonly<{ kstDay: number; net: number }>[];
  opponents: readonly Readonly<{ npcId: string; matches: number; net: number }>[];
}

export function casinoNpcLedgerReport(npcId: string, entries: readonly NpcRoundSettlement[]): CasinoNpcLedgerReport {
  const selected=entries.filter((entry)=>entry.npcId===npcId);
  const tables=new Map<CasinoLedgerSourceId,NpcRoundSettlement[]>();
  const days=new Map<number,number>();
  const opponents=new Map<string,{matches:Set<string>;net:number}>();
  for(const entry of selected){
    tables.set(entry.tableId,[...(tables.get(entry.tableId)??[]),entry]);
    const day=casinoKstDayAtUtcSecond(entry.utcSecond);days.set(day,(days.get(day)??0)+entry.delta);
    for(const opponentId of entry.participantIds)if(opponentId!==npcId){
      const current=opponents.get(opponentId)??{matches:new Set<string>(),net:0};
      current.matches.add(entry.matchId);current.net+=entry.delta;opponents.set(opponentId,current);
    }
  }
  const summary=(values:readonly NpcRoundSettlement[])=>({
    settlements:values.length,
    gains:values.filter((entry)=>entry.delta>0).length,
    losses:values.filter((entry)=>entry.delta<0).length,
    flat:values.filter((entry)=>entry.delta===0).length,
    exposure:values.reduce((sum,entry)=>sum+entry.reservedAmount,0),
    credit:values.reduce((sum,entry)=>sum+entry.creditAmount,0),
    net:values.reduce((sum,entry)=>sum+entry.delta,0),
  });
  const total=summary(selected);
  return Object.freeze({
    npcId,...total,
    largestGain:Math.max(0,...selected.map((entry)=>entry.delta)),
    largestLoss:Math.min(0,...selected.map((entry)=>entry.delta)),
    byTable:Object.freeze([...tables.entries()].map(([tableId,values])=>Object.freeze({tableId,...summary(values)})).toSorted((left,right)=>Math.abs(right.net)-Math.abs(left.net)||compareText(left.tableId,right.tableId))),
    dailyNet:Object.freeze([...days.entries()].map(([kstDay,net])=>Object.freeze({kstDay,net})).toSorted((left,right)=>left.kstDay-right.kstDay)),
    opponents:Object.freeze([...opponents.entries()].map(([id,value])=>Object.freeze({npcId:id,matches:value.matches.size,net:value.net})).toSorted((left,right)=>right.matches-left.matches||compareText(left.npcId,right.npcId))),
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
