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
import { recentNpcActivitiesAt } from "./engine.ts";

const ROUND_CONTRACT = "npc-live-rounds/0.4";

export type NpcMatchSettlementTone = "gain" | "loss" | "flat" | "mixed" | "reward";

export function npcVisitRounds(interval: NpcPresenceInterval, _profile: NpcGamblingProfile): readonly NpcRoundSettlement[] {
  const absoluteDay = Math.floor(interval.startedAtUtcSecond/86_400);
  return Object.freeze(interval.sessions.map((session)=>settlement(interval.npcId,absoluteDay*86_400+session.secondOfDay,session)));
}

export function recentNpcRoundSettlementsAt(
  profiles: readonly NpcGamblingProfile[], clock: CasinoPresentationClock, contract: NpcLedgerContract,
  limit: number, lookbackSeconds = 3_600,
): readonly NpcRoundSettlement[] {
  if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(lookbackSeconds) || lookbackSeconds <= 0) throw new Error("npc_rounds_invalid_limit");
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("npc_rounds_invalid_clock");
  return Object.freeze(recentNpcActivitiesAt(profiles,clock,contract,Math.max(limit*8,256))
    .map(({npcId,utcSecond,session})=>settlement(npcId,utcSecond,session))
    .filter((entry)=>entry.utcSecond>now-lookbackSeconds&&entry.utcSecond<=now)
    .sort((a,b)=>b.utcSecond-a.utcSecond||compareText(a.matchId,b.matchId)||compareText(a.npcId,b.npcId))
    .slice(0,limit));
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

/** A match is not painted as a win merely because its highest-paid participant sorts first. */
export function npcMatchSettlementTone(settlement: NpcMatchSettlement): NpcMatchSettlementTone {
  if (settlement.tableId === "temerosa-old-maid") return "reward";
  const hasGain = settlement.entries.some((entry) => entry.delta > 0);
  const hasLoss = settlement.entries.some((entry) => entry.delta < 0);
  if (hasGain && hasLoss) return "mixed";
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

function settlement(npcId:string,utcSecond:number,session:NpcSession):NpcRoundSettlement {
  return Object.freeze({
    roundId:`${ROUND_CONTRACT}:${session.matchId}:${npcId}`,
    matchId:session.matchId,visitId:session.visitId,participantIds:session.participantIds,
    npcId,tableId:session.tableId,utcSecond,stake:session.stake,
    reservedAmount:session.reservedAmount,creditAmount:session.creditAmount,delta:session.delta,
    resultKind:session.resultKind,termsVersion:session.termsVersion,
  });
}
function compareText(a:string,b:string):number{return a<b?-1:a>b?1:0;}
