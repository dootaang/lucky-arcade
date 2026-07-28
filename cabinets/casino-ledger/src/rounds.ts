import type { CasinoPresentationClock, NpcGamblingProfile, NpcLedgerContract, NpcPresence, NpcPresenceInterval, NpcRoundSettlement } from "./contracts.ts";
import { recentNpcActivitiesAt } from "./engine.ts";

const ROUND_CONTRACT = "npc-live-rounds/0.3";

/** In v0.4 a visit settlement is already a real game result; no neutral fake rounds are inserted. */
export function npcVisitRounds(interval: NpcPresenceInterval, _profile: NpcGamblingProfile): readonly NpcRoundSettlement[] {
  const session = interval.session;
  return Object.freeze([Object.freeze({
    roundId: `${ROUND_CONTRACT}:${session.matchId}:${interval.npcId}`,
    npcId: interval.npcId,
    tableId: session.tableId,
    utcSecond: interval.settlesAtUtcSecond,
    stake: session.stake,
    reservedAmount: session.reservedAmount,
    creditAmount: session.creditAmount,
    delta: session.delta,
    resultKind: session.resultKind,
    termsVersion: session.termsVersion,
  })]);
}

export function recentNpcRoundSettlementsAt(
  profiles: readonly NpcGamblingProfile[], clock: CasinoPresentationClock, contract: NpcLedgerContract,
  limit: number, lookbackSeconds = 3_600,
): readonly NpcRoundSettlement[] {
  if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(lookbackSeconds) || lookbackSeconds <= 0) throw new Error("npc_rounds_invalid_limit");
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("npc_rounds_invalid_clock");
  const activities = recentNpcActivitiesAt(profiles, clock, contract, Math.max(limit * 16, 256));
  return Object.freeze(activities
    .map(({ npcId, utcMinute, session }) => Object.freeze({
      roundId: `${ROUND_CONTRACT}:${session.matchId}:${npcId}`,
      npcId,
      tableId: session.tableId,
      utcSecond: utcMinute * 60,
      stake: session.stake,
      reservedAmount: session.reservedAmount,
      creditAmount: session.creditAmount,
      delta: session.delta,
      resultKind: session.resultKind,
      termsVersion: session.termsVersion,
    }))
    .filter((entry) => entry.utcSecond > now - lookbackSeconds && entry.utcSecond <= now)
    .sort((a,b) => b.utcSecond-a.utcSecond || compareText(a.npcId,b.npcId) || compareText(a.roundId,b.roundId))
    .slice(0,limit));
}

/** Minute-resolution v0.4 balances already include every settled real round. */
export function npcLiveBalancesAt(
  baseBalances: Readonly<Record<string,number>>, _profiles: readonly NpcGamblingProfile[],
  _presences: readonly NpcPresence[], clock: CasinoPresentationClock,
): Readonly<Record<string,number>> {
  if (!Number.isSafeInteger(clock.utcSecond())) throw new Error("npc_rounds_invalid_clock");
  return Object.freeze({ ...baseBalances });
}

function compareText(a:string,b:string):number{return a<b?-1:a>b?1:0;}
