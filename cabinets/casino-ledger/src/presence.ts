import { casinoDayPlan, completedDayBalances } from "./engine.ts";
import type {
  CasinoDayPlan,
  CasinoPresentationClock,
  NpcAvailability,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcPresence,
  NpcPresenceInterval,
} from "./contracts.ts";

const SECONDS_PER_DAY = 86_400;
const APPROACH_SECONDS = 12;
const SETTLE_SECONDS = 6;
const LEAVE_SECONDS = 8;

export function npcPresenceIntervalsForDay(
  profile: NpcGamblingProfile,
  dayIndex: number,
  openingBalance: number,
  contract: NpcLedgerContract,
  _previousAvailableAtUtcSecond = Number.NEGATIVE_INFINITY,
  suppliedPlan?: CasinoDayPlan,
): readonly NpcPresenceInterval[] {
  const absoluteDay = contract.epochUtcDay + dayIndex;
  const plan = suppliedPlan ?? casinoDayPlan(
    contract.profiles,
    dayIndex,
    Object.fromEntries(contract.profiles.map((entry) => [entry.id, entry.id === profile.id ? openingBalance : entry.openingBalance])),
    contract,
  );
  const allSessions = plan.sessions[profile.id] ?? [];
  const playing = plan.visits.filter((visit) => visit.participantIds.includes(profile.id)).map((visit) => {
    const sessions = allSessions.filter((session) => session.visitId === visit.visitId);
    const priorDelta = allSessions.filter((session) => session.secondOfDay < visit.startedAtSecondOfDay).reduce((sum,session)=>sum+session.delta,0);
    return Object.freeze({
      npcId: profile.id,
      tableId: visit.tableId,
      visit,
      sessions: Object.freeze(sessions),
      ...(sessions[0] ? { session: sessions[0] } : {}),
      openingBalance: openingBalance + priorDelta,
      startedAtUtcSecond: absoluteDay*SECONDS_PER_DAY + visit.startedAtSecondOfDay,
      settlesAtUtcSecond: absoluteDay*SECONDS_PER_DAY + visit.endsAtSecondOfDay,
      availableAtUtcSecond: absoluteDay*SECONDS_PER_DAY + visit.endsAtSecondOfDay + SETTLE_SECONDS + LEAVE_SECONDS,
      role: "playing" as const,
    });
  });
  const spectating = plan.predictions.filter((prediction) => prediction.role === "spectator" && prediction.bettorNpcId === profile.id).map((prediction) => {
    const startedAtSecondOfDay = Math.max(0,prediction.placedAtSecondOfDay-APPROACH_SECONDS);
    const visit = Object.freeze({
      visitId:`${prediction.predictionId}:presence`,tableId:"temerosa-old-maid" as const,
      participantIds:Object.freeze([profile.id]),startedAtSecondOfDay,endsAtSecondOfDay:prediction.settlesAtSecondOfDay,
    });
    const sessions = allSessions.filter((session) => session.matchId === prediction.matchId && session.prediction?.predictionId === prediction.predictionId);
    const priorDelta = allSessions.filter((session) => session.secondOfDay < startedAtSecondOfDay).reduce((sum,session)=>sum+session.delta,0);
    return Object.freeze({
      npcId:profile.id,tableId:"temerosa-old-maid" as const,visit,sessions:Object.freeze(sessions),
      ...(sessions[0]?{session:sessions[0]}:{}),openingBalance:openingBalance+priorDelta,
      startedAtUtcSecond:absoluteDay*SECONDS_PER_DAY+startedAtSecondOfDay,
      settlesAtUtcSecond:absoluteDay*SECONDS_PER_DAY+prediction.settlesAtSecondOfDay,
      availableAtUtcSecond:absoluteDay*SECONDS_PER_DAY+prediction.settlesAtSecondOfDay+SETTLE_SECONDS+LEAVE_SECONDS,
      role:"spectating" as const,
    });
  });
  return Object.freeze([...playing,...spectating].toSorted((left,right)=>left.startedAtUtcSecond-right.startedAtUtcSecond||compareText(left.visit.visitId,right.visit.visitId)));
}

export function casinoPresenceAt(
  profiles: readonly NpcGamblingProfile[],
  clock: CasinoPresentationClock,
  contract: NpcLedgerContract,
): readonly NpcPresence[] {
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("npc_presence_invalid_clock");
  const absoluteDay = Math.floor(now / SECONDS_PER_DAY);
  const dayIndex = absoluteDay - contract.epochUtcDay;
  if (dayIndex < 0) return Object.freeze(profiles.map((profile) => Object.freeze({ npcId: profile.id, phase: "idle" as const })));
  const openings = dayIndex === 0
    ? Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id,profile.openingBalance])))
    : completedDayBalances(profiles,dayIndex-1,contract);
  const today = casinoDayPlan(profiles,dayIndex,openings,contract);
  const nextOpenings = Object.freeze(Object.fromEntries(profiles.map((profile)=>[profile.id,openings[profile.id]!+(today.sessions[profile.id]??[]).reduce((sum,session)=>sum+session.delta,0)])));
  const tomorrow = casinoDayPlan(profiles,dayIndex+1,nextOpenings,contract);
  return Object.freeze(profiles.map((profile) => {
    const intervals = [
      ...npcPresenceIntervalsForDay(profile,dayIndex,openings[profile.id]!,contract,Number.NEGATIVE_INFINITY,today),
      ...npcPresenceIntervalsForDay(profile,dayIndex+1,nextOpenings[profile.id]!,contract,Number.NEGATIVE_INFINITY,tomorrow),
    ];
    const active = intervals.find((interval)=>now>=interval.startedAtUtcSecond&&now<interval.availableAtUtcSecond);
    if (!active) {
      const next=intervals.find((interval)=>interval.startedAtUtcSecond>now);
      return Object.freeze({npcId:profile.id,phase:"idle" as const,...(next?{startedAtUtcSecond:next.startedAtUtcSecond}:{})});
    }
    const intervalDayStart=Math.floor(active.startedAtUtcSecond/SECONDS_PER_DAY)*SECONDS_PER_DAY;
    const currentSession = active.sessions.filter((session)=>intervalDayStart+session.secondOfDay<=now).at(-1)
      ?? active.sessions.find((session)=>intervalDayStart+session.secondOfDay>now)
      ?? active.session;
    const lastSettledAt = active.sessions.filter((session)=>intervalDayStart+session.secondOfDay<=now).at(-1)?.secondOfDay;
    const phase = now < active.startedAtUtcSecond+APPROACH_SECONDS ? "approaching"
      : now >= active.settlesAtUtcSecond ? (now<active.settlesAtUtcSecond+SETTLE_SECONDS?"settling":"leaving")
        : lastSettledAt !== undefined && now-(intervalDayStart+lastSettledAt)<SETTLE_SECONDS ? "settling"
          : active.role === "spectating" ? "spectating" : "playing";
    return Object.freeze({
      npcId:profile.id,phase,tableId:active.tableId,
      ...(currentSession?{session:currentSession,matchId:currentSession.matchId}:{}),
      visitId:active.visit.visitId,openingBalance:active.openingBalance,
      startedAtUtcSecond:active.startedAtUtcSecond,settlesAtUtcSecond:active.settlesAtUtcSecond,
      availableAtUtcSecond:active.availableAtUtcSecond,
      role:active.role,
    });
  }));
}

function compareText(left:string,right:string):number{return left<right?-1:left>right?1:0;}

export function npcAvailability(presences: readonly NpcPresence[]): Readonly<Record<string, NpcAvailability>> {
  return Object.freeze(Object.fromEntries(presences.map((presence) => [presence.npcId, Object.freeze({
    npcId: presence.npcId,
    available: presence.phase === "idle",
    phase: presence.phase,
    ...(presence.tableId ? { tableId: presence.tableId } : {}),
    ...(presence.availableAtUtcSecond === undefined ? {} : { availableAtUtcSecond: presence.availableAtUtcSecond }),
  })])));
}

export function nextCasinoPresenceTransition(presences: readonly NpcPresence[], nowUtcSecond: number): number | undefined {
  const candidates = presences.flatMap((presence) => presence.phase === "idle" ? [presence.startedAtUtcSecond ?? Number.POSITIVE_INFINITY] : [
    presence.startedAtUtcSecond === undefined ? Number.POSITIVE_INFINITY : presence.startedAtUtcSecond + APPROACH_SECONDS,
    presence.settlesAtUtcSecond ?? Number.POSITIVE_INFINITY,
    presence.settlesAtUtcSecond === undefined ? Number.POSITIVE_INFINITY : presence.settlesAtUtcSecond + SETTLE_SECONDS,
    presence.availableAtUtcSecond ?? Number.POSITIVE_INFINITY,
  ]).filter((value) => value > nowUtcSecond && Number.isFinite(value));
  return candidates.length === 0 ? undefined : Math.min(...candidates);
}
