import type {
  CasinoPresentationClock,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcMatchSettlement,
  NpcPresence,
  NpcPresenceInterval,
  NpcRoundSettlement,
  NpcSession,
} from "./contracts.ts";
import { npcActivitiesForAt, recentNpcActivitiesAt } from "./engine.ts";

const ROUND_CONTRACT = "npc-live-rounds/0.5";

export type NpcMatchSettlementTone = "gain" | "loss" | "flat" | "mixed" | "reward";

export function npcVisitRounds(interval: NpcPresenceInterval, _profile: NpcGamblingProfile): readonly NpcRoundSettlement[] {
  const absoluteDay = Math.floor(interval.startedAtUtcSecond/86_400);
  return Object.freeze(interval.sessions.flatMap((session)=>settlements(interval.npcId,absoluteDay*86_400+session.secondOfDay,session)));
}

export function recentNpcRoundSettlementsAt(
  profiles: readonly NpcGamblingProfile[], clock: CasinoPresentationClock, contract: NpcLedgerContract,
  limit: number, lookbackSeconds = 3_600,
): readonly NpcRoundSettlement[] {
  if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(lookbackSeconds) || lookbackSeconds <= 0) throw new Error("npc_rounds_invalid_limit");
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("npc_rounds_invalid_clock");
  return Object.freeze(recentNpcActivitiesAt(profiles,clock,contract,Math.max(limit*8,256))
    .flatMap(({npcId,utcSecond,session})=>settlements(npcId,utcSecond,session))
    .filter((entry)=>entry.utcSecond>now-lookbackSeconds&&entry.utcSecond<=now)
    .sort((a,b)=>b.utcSecond-a.utcSecond||compareText(a.matchId,b.matchId)||compareText(a.npcId,b.npcId))
    .slice(0,limit));
}

export function npcRoundSettlementsForAt(
  profiles: readonly NpcGamblingProfile[], clock: CasinoPresentationClock, contract: NpcLedgerContract, npcId: string, days = 0,
): readonly NpcRoundSettlement[] {
  return Object.freeze(npcActivitiesForAt(profiles,clock,contract,npcId,days)
    .flatMap(({utcSecond,session})=>settlements(npcId,utcSecond,session))
    .toSorted((left,right)=>right.utcSecond-left.utcSecond||compareText(left.roundId,right.roundId)));
}

/** Groups zero-sum counterentries into the one match the player actually saw. */
export function groupNpcRoundSettlements(entries: readonly NpcRoundSettlement[]): readonly NpcMatchSettlement[] {
  const grouped = new Map<string,NpcRoundSettlement[]>();
  for (const entry of entries) grouped.set(entry.matchId,[...(grouped.get(entry.matchId)??[]),entry]);
  return Object.freeze([...grouped.entries()].map(([matchId,values])=>Object.freeze({
    matchId,
    visitId:values[0]!.visitId,
    tableId:values[0]!.tableId,
    utcSecond:Math.max(...values.map((entry)=>entry.utcSecond)),
    participantIds:values[0]!.participantIds,
    entries:Object.freeze(values.toSorted((a,b)=>b.delta-a.delta||compareText(a.npcId,b.npcId))),
  })).toSorted((a,b)=>b.utcSecond-a.utcSecond||compareText(a.matchId,b.matchId)));
}

/** Keeps one tape row per NPC while preserving multi-component receipts. */
export function npcMatchSettlementEntriesByNpc(settlement: NpcMatchSettlement): readonly (readonly NpcRoundSettlement[])[] {
  const grouped = new Map<string, NpcRoundSettlement[]>();
  for (const entry of settlement.entries) grouped.set(entry.npcId, [...(grouped.get(entry.npcId) ?? []), entry]);
  return Object.freeze([...grouped.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, entries]) => Object.freeze(entries.toSorted((left, right) => compareText(left.roundId, right.roundId)))));
}

/** A match is not painted as a win merely because its highest-paid participant sorts first. */
export function npcMatchSettlementTone(settlement: NpcMatchSettlement): NpcMatchSettlementTone {
  const hasGain = settlement.entries.some((entry) => entry.delta > 0);
  const hasLoss = settlement.entries.some((entry) => entry.delta < 0);
  if (hasGain && hasLoss) return "mixed";
  if (settlement.tableId === "temerosa-old-maid" && hasGain) return "reward";
  if (hasGain) return "gain";
  if (hasLoss) return "loss";
  return "flat";
}

export function npcLiveBalancesAt(
  baseBalances: Readonly<Record<string,number>>, _profiles: readonly NpcGamblingProfile[],
  _presences: readonly NpcPresence[], clock: CasinoPresentationClock,
): Readonly<Record<string,number>> {
  if (!Number.isSafeInteger(clock.utcSecond())) throw new Error("npc_rounds_invalid_clock");
  return Object.freeze({ ...baseBalances });
}

function settlements(npcId:string,utcSecond:number,session:NpcSession):readonly NpcRoundSettlement[]{
  if(session.rankReward&&session.prediction)return Object.freeze([
    settlement(npcId,utcSecond,session,"rank"),
    settlement(npcId,utcSecond,session,"prediction"),
  ]);
  return Object.freeze([settlement(npcId,utcSecond,session,session.prediction?"prediction":"combined")]);
}
function settlement(npcId:string,utcSecond:number,session:NpcSession,component:"rank"|"prediction"|"combined"):NpcRoundSettlement {
  const rankOnly=component==="rank";
  const predictionOnly=component==="prediction";
  const prediction=predictionOnly?session.prediction:undefined;
  const delta=rankOnly?session.rankReward!.amount:predictionOnly?prediction!.delta:session.delta;
  return Object.freeze({
    roundId:`${ROUND_CONTRACT}:${session.matchId}:${npcId}:${component}`,
    matchId:session.matchId,visitId:session.visitId,participantIds:session.participantIds,
    npcId,tableId:session.tableId,utcSecond,stake:predictionOnly?prediction!.stake:rankOnly?0:session.stake,
    reservedAmount:predictionOnly?prediction!.reservedAmount:rankOnly?0:session.reservedAmount,
    creditAmount:predictionOnly?prediction!.creditAmount:rankOnly?session.rankReward!.amount:session.creditAmount,delta,
    resultKind:predictionOnly?(prediction!.won?"prediction-win":"prediction-loss"):rankOnly?`rank-${session.rankReward!.rank}`:session.resultKind,
    termsVersion:session.termsVersion,
    ...(rankOnly||component==="combined"&&session.rankReward?{rankReward:session.rankReward}:{}),
    ...(prediction?{prediction}:{}),
  });
}
function compareText(a:string,b:string):number{return a<b?-1:a>b?1:0;}
