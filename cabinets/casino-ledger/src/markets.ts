import {
  CASINO_MARKET_QUOTE_CONTRACT,
  XorShift32,
  assertCasinoMarketQuote,
  type CasinoMarketQuote,
} from "@lucky-arcade/engine";
import { casinoKstDayAtUtcSecond, casinoUtcSecondAtKstDay } from "./casino-time.ts";
import { casinoDayPlan, completedDayBalances } from "./engine.ts";
import type { CasinoClock, CasinoTableId, NpcGamblingProfile, NpcLedgerContract, NpcMatch, NpcPresence, NpcSession } from "./contracts.ts";

export const CASINO_SPECTATOR_MARKET_CONTRACT = "casino-spectator-market/0.3" as const;
export const CASINO_SPECTATOR_PRICING_VERSION = "casino-spectator-pricing/0.3" as const;
export const CASINO_SPECTATOR_TARGET_RETURN_BPS = 9_600;

export type CasinoSpectatorMarketKind = "match-winner" | "joker-holder";
export type CasinoSpectatorMarketPhase = "upcoming" | "open" | "locked" | "settled";

export interface CasinoSpectatorMarketOutcome {
  outcomeId: string;
  npcId?: string;
  label: string;
  quote: CasinoMarketQuote;
}

export interface CasinoSpectatorMarket {
  contract: typeof CASINO_SPECTATOR_MARKET_CONTRACT;
  marketId: string;
  matchId: string;
  tableId: Extract<CasinoTableId, "temerosa-match-pairs" | "temerosa-old-maid" | "indian-poker" | "temerosa-five-card-draw">;
  kind: CasinoSpectatorMarketKind;
  participantIds: readonly string[];
  title: string;
  rulesLabel: string;
  opensAtUtcSecond: number;
  closesAtUtcSecond: number;
  startsAtUtcSecond: number;
  settlesAtUtcSecond: number;
  phase: CasinoSpectatorMarketPhase;
  outcomes: readonly CasinoSpectatorMarketOutcome[];
  winningOutcomeId?: string;
}

export interface CasinoSpectatorSchedule {
  current?: CasinoSpectatorMarket;
  upcoming: readonly CasinoSpectatorMarket[];
  recent: readonly CasinoSpectatorMarket[];
}

const SAMPLE_COUNT = 20_000;
const MARKET_OPEN_SECONDS = 180;
const MARKET_LOCK_SECONDS = 10;
const MARKET_LOOKAHEAD_SECONDS = 6 * 3_600;
const MARKET_HISTORY_SECONDS = 20 * 60;
const HOUSE_RISK_LIMIT = 5_000;
const EXHIBITION_CYCLE_SECONDS = 360;
const EXHIBITION_CLOSE_OFFSET = 180;
const EXHIBITION_START_OFFSET = 190;
const EXHIBITION_SETTLE_OFFSET = 350;
const EXHIBITION_TABLES: readonly CasinoSpectatorMarket["tableId"][] = Object.freeze([
  "temerosa-match-pairs", "temerosa-old-maid", "indian-poker", "temerosa-five-card-draw",
]);
export const CASINO_SPECTATOR_RECENT_SECONDS = 15 * 60;
export const CASINO_SPECTATOR_RECENT_LIMIT = 3;
export const CASINO_SPECTATOR_UPCOMING_LIMIT = 2;
const PRICING_CACHE = new Map<string, readonly CasinoSpectatorMarketOutcome[]>();

/** Returns the current, recently settled, and next scheduled NPC-only markets. */
export function casinoSpectatorMarketsAt(
  profiles: readonly NpcGamblingProfile[],
  clock: CasinoClock,
  contract: NpcLedgerContract,
  limit = 4,
): readonly CasinoSpectatorMarket[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("casino_market_invalid_limit");
  const now = normalizedUtcSecond(clock);
  const markets: CasinoSpectatorMarket[] = [];
  const currentCycle = Math.floor(now / EXHIBITION_CYCLE_SECONDS);
  for (let cycle = currentCycle - 1; cycle <= currentCycle + 12; cycle += 1) {
    const market = scheduledExhibitionMarket(profiles, contract, cycle, now);
    if (market.settlesAtUtcSecond >= now - MARKET_HISTORY_SECONDS && market.opensAtUtcSecond <= now + MARKET_LOOKAHEAD_SECONDS) markets.push(market);
  }
  // Only exhibitions are listed here: each has a canonical cabinet replay.
  // Autonomous ledger matches remain available to the activity tape, but are
  // not sold as watchable markets because they have no card-by-card transcript.
  const unique = [...new Map(markets.map((market) => [market.marketId, market])).values()];
  const ordered = unique.sort((left, right) => phaseOrder(left.phase) - phaseOrder(right.phase)
    || left.startsAtUtcSecond - right.startsAtUtcSecond || compareText(left.marketId, right.marketId));
  const selected = ordered.slice(0, limit);
  const latestSettled = unique.filter((market) => market.phase === "settled")
    .sort((left, right) => right.settlesAtUtcSecond - left.settlesAtUtcSecond || compareText(left.marketId, right.marketId))[0];
  if (limit > 1 && latestSettled && !selected.some((market) => market.marketId === latestSettled.marketId)) selected[selected.length - 1] = latestSettled;
  return Object.freeze(selected.sort((left, right) => phaseOrder(left.phase) - phaseOrder(right.phase)
    || left.startsAtUtcSecond - right.startsAtUtcSecond || compareText(left.marketId, right.marketId)));
}

/** Separates the live programme from recent results and future fixtures. */
export function casinoSpectatorScheduleAt(
  profiles: readonly NpcGamblingProfile[],
  clock: CasinoClock,
  contract: NpcLedgerContract,
): CasinoSpectatorSchedule {
  const now = normalizedUtcSecond(clock);
  const markets = exhibitionInventoryAt(
    profiles,
    contract,
    now,
    CASINO_SPECTATOR_RECENT_SECONDS,
    CASINO_SPECTATOR_UPCOMING_LIMIT * EXHIBITION_CYCLE_SECONDS,
  );
  const current = markets.find((market) => market.phase === "open" || market.phase === "locked");
  const upcoming = markets.filter((market) => market.phase === "upcoming")
    .sort((left, right) => left.startsAtUtcSecond - right.startsAtUtcSecond || compareText(left.marketId, right.marketId))
    .slice(0, CASINO_SPECTATOR_UPCOMING_LIMIT);
  const recent = markets.filter((market) => market.phase === "settled" && market.settlesAtUtcSecond > now - CASINO_SPECTATOR_RECENT_SECONDS)
    .sort((left, right) => right.settlesAtUtcSecond - left.settlesAtUtcSecond || compareText(left.marketId, right.marketId))
    .slice(0, CASINO_SPECTATOR_RECENT_LIMIT);
  return Object.freeze({
    ...(current ? { current } : {}),
    upcoming: Object.freeze(upcoming),
    recent: Object.freeze(recent),
  });
}

/** Complete day inventory used by probability audits and exact receipt recovery. */
export function casinoSpectatorMarketsForDay(
  profiles: readonly NpcGamblingProfile[], dayIndex: number, contract: NpcLedgerContract, nowUtcSecond: number,
): readonly CasinoSpectatorMarket[] {
  if (!Number.isSafeInteger(dayIndex) || dayIndex < 0 || !Number.isSafeInteger(nowUtcSecond)) throw new Error("casino_market_invalid_day");
  const opening = dayIndex === 0
    ? Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id, profile.openingBalance])))
    : completedDayBalances(profiles, dayIndex - 1, contract);
  const plan = casinoDayPlan(profiles, dayIndex, opening, contract);
  const absoluteKstDay = contract.epochKstDay + dayIndex;
  return Object.freeze(plan.matches.flatMap((match) => {
    if (match.tableId !== "temerosa-match-pairs" && match.tableId !== "temerosa-old-maid") return [];
    const starts = casinoUtcSecondAtKstDay(absoluteKstDay, match.startsAtSecondOfDay);
    return [createMarket(match, resultForMatch(match, plan.sessions), profiles, nowUtcSecond, starts - MARKET_OPEN_SECONDS, starts, casinoUtcSecondAtKstDay(absoluteKstDay, match.settlesAtSecondOfDay))];
  }));
}

export function casinoSpectatorMarketByIdAt(
  profiles: readonly NpcGamblingProfile[], clock: CasinoClock, contract: NpcLedgerContract, marketId: string,
): CasinoSpectatorMarket | undefined {
  if (!marketId) return undefined;
  const exhibition = /casino-spectator-exhibition\/0\.[123]:(\d+)$/.exec(marketId);
  if (exhibition) {
    const cycle = Number(exhibition[1]);
    return Number.isSafeInteger(cycle) ? scheduledExhibitionMarket(profiles, contract, cycle, normalizedUtcSecond(clock)) : undefined;
  }
  const match = /npc-ledger\/0\.9:(\d+):visit/.exec(marketId);
  if (!match) return undefined;
  const dayIndex = Number(match[1]);
  if (!Number.isSafeInteger(dayIndex) || dayIndex < 0) return undefined;
  const now = normalizedUtcSecond(clock);
  return casinoSpectatorMarketsForDay(profiles, dayIndex, contract, now).find((market) => market.marketId === marketId);
}

/** Scheduled exhibition participants are unavailable only after betting closes. */
export function casinoSpectatorMarketPresencesAt(markets: readonly CasinoSpectatorMarket[], nowUtcSecond: number): readonly NpcPresence[] {
  if (!Number.isSafeInteger(nowUtcSecond)) throw new Error("casino_market_invalid_clock");
  const active = markets.filter((market) => nowUtcSecond >= market.closesAtUtcSecond && nowUtcSecond < market.settlesAtUtcSecond + 18);
  const seen = new Set<string>();
  const output: NpcPresence[] = [];
  for (const market of active.sort((left, right) => left.startsAtUtcSecond - right.startsAtUtcSecond)) {
    for (const npcId of market.participantIds) {
      if (seen.has(npcId)) continue;
      seen.add(npcId);
      const phase = nowUtcSecond < market.startsAtUtcSecond ? "approaching" : nowUtcSecond < market.settlesAtUtcSecond ? "playing" : nowUtcSecond < market.settlesAtUtcSecond + 8 ? "settling" : "leaving";
      output.push(Object.freeze({
        npcId, phase, tableId: market.tableId, visitId: market.marketId, matchId: market.matchId,
        startedAtUtcSecond: market.startsAtUtcSecond, settlesAtUtcSecond: market.settlesAtUtcSecond,
        availableAtUtcSecond: market.settlesAtUtcSecond + 18, role: "playing",
      }));
    }
  }
  return Object.freeze(output);
}

export function assertCasinoSpectatorMarket(market: CasinoSpectatorMarket): void {
  if (market.contract !== CASINO_SPECTATOR_MARKET_CONTRACT || !market.marketId || !market.matchId
    || !EXHIBITION_TABLES.includes(market.tableId)
    || market.participantIds.length < 2 || new Set(market.participantIds).size !== market.participantIds.length
    || market.opensAtUtcSecond >= market.closesAtUtcSecond || market.closesAtUtcSecond >= market.startsAtUtcSecond
    || market.startsAtUtcSecond >= market.settlesAtUtcSecond || market.outcomes.length < 2
    || new Set(market.outcomes.map((outcome) => outcome.outcomeId)).size !== market.outcomes.length
    || market.outcomes.reduce((sum, outcome) => sum + outcome.quote.probabilityBps, 0) !== 10_000) throw new Error("casino_spectator_market_invalid");
  for (const outcome of market.outcomes) {
    assertCasinoMarketQuote(outcome.quote, CASINO_SPECTATOR_TARGET_RETURN_BPS);
    if (outcome.quote.marketId !== market.marketId || outcome.quote.outcomeId !== outcome.outcomeId
      || outcome.quote.pricingVersion !== CASINO_SPECTATOR_PRICING_VERSION) throw new Error("casino_spectator_market_invalid_quote");
  }
  if (market.winningOutcomeId !== undefined && !market.outcomes.some((outcome) => outcome.outcomeId === market.winningOutcomeId)) throw new Error("casino_spectator_market_invalid_result");
}

export function casinoMarketCredit(exposure: number, quote: CasinoMarketQuote): number {
  assertCasinoMarketQuote(quote, CASINO_SPECTATOR_TARGET_RETURN_BPS);
  if (!Number.isSafeInteger(exposure) || exposure <= 0 || exposure > quote.maxExposure) throw new Error("casino_market_invalid_exposure");
  const credit = Math.floor(exposure * quote.payoutBps / 10_000);
  if (!Number.isSafeInteger(credit) || credit <= exposure) throw new Error("casino_market_invalid_credit");
  return credit;
}

function createMarket(
  match: NpcMatch,
  resultOutcomeId: string | undefined,
  profiles: readonly NpcGamblingProfile[],
  now: number,
  opensAtUtcSecond: number,
  startsAtUtcSecond: number,
  settlesAtUtcSecond: number,
): CasinoSpectatorMarket {
  const tableId = match.tableId as CasinoSpectatorMarket["tableId"];
  const kind: CasinoSpectatorMarketKind = tableId === "temerosa-old-maid" ? "joker-holder" : "match-winner";
  const marketId = `${CASINO_SPECTATOR_MARKET_CONTRACT}:${kind}:${match.matchId}`;
  const closesAtUtcSecond = startsAtUtcSecond - MARKET_LOCK_SECONDS;
  const phase: CasinoSpectatorMarketPhase = now < opensAtUtcSecond ? "upcoming" : now < closesAtUtcSecond ? "open" : now < settlesAtUtcSecond ? "locked" : "settled";
  const outcomes = pricedOutcomes(marketId, tableId, match.participantIds, profiles);
  const winningOutcomeId = phase === "settled" ? resultOutcomeId : undefined;
  const market: CasinoSpectatorMarket = Object.freeze({
    contract: CASINO_SPECTATOR_MARKET_CONTRACT,
    marketId, matchId: match.matchId, tableId, kind,
    participantIds: Object.freeze([...match.participantIds]),
    title: marketTitle(tableId),
    rulesLabel: marketRulesLabel(tableId, match.participantIds.length),
    opensAtUtcSecond, closesAtUtcSecond, startsAtUtcSecond, settlesAtUtcSecond, phase, outcomes,
    ...(winningOutcomeId === undefined ? {} : { winningOutcomeId }),
  });
  assertCasinoSpectatorMarket(market);
  return market;
}

function scheduledExhibitionMarket(
  profiles: readonly NpcGamblingProfile[], contract: NpcLedgerContract, cycle: number, now: number,
): CasinoSpectatorMarket {
  if (!Number.isSafeInteger(cycle) || cycle < 0) throw new Error("casino_market_invalid_cycle");
  const opens = cycle * EXHIBITION_CYCLE_SECONDS;
  const closes = opens + EXHIBITION_CLOSE_OFFSET;
  const starts = opens + EXHIBITION_START_OFFSET;
  const settles = opens + EXHIBITION_SETTLE_OFFSET;
  const tableId = EXHIBITION_TABLES[cycle % EXHIBITION_TABLES.length]!;
  const needed = tableId === "temerosa-match-pairs" || tableId === "indian-poker" ? 2 : 4;
  const dayIndex = Math.max(0, casinoKstDayAtUtcSecond(starts) - contract.epochKstDay);
  const opening = dayIndex === 0 ? Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id, profile.openingBalance]))) : completedDayBalances(profiles, dayIndex - 1, contract);
  const plan = casinoDayPlan(profiles, dayIndex, opening, contract);
  const busy = new Set(plan.visits.filter((visit) => {
    const dayStart = casinoUtcSecondAtKstDay(contract.epochKstDay + dayIndex);
    return dayStart + visit.startedAtSecondOfDay < settles && dayStart + visit.endsAtSecondOfDay > starts;
  }).flatMap((visit) => visit.participantIds));
  const rng = new XorShift32(`${CASINO_SPECTATOR_PRICING_VERSION}:event:${cycle}:participants`);
  const eligibleProfiles=profiles;
  const occurrence=Math.floor(cycle/EXHIBITION_TABLES.length);
  const ordered=shuffleBag(eligibleProfiles,tableId,occurrence,needed);
  const participantIds=[...ordered.filter((profile)=>!busy.has(profile.id)),...ordered.filter((profile)=>busy.has(profile.id))]
    .slice(0,needed).map((profile)=>profile.id).sort(compareText);
  void rng;
  if (participantIds.length !== needed) throw new Error("casino_market_insufficient_participants");
  const matchId = `casino-spectator-exhibition/0.3:${cycle}`;
  const match: NpcMatch = Object.freeze({ matchId, visitId: `${matchId}:visit`, tableId, participantIds: Object.freeze(participantIds), startsAtSecondOfDay: 0, settlesAtSecondOfDay: 1, stake: 0, multiplier: 1 });
  return createMarket(match, undefined, profiles, now, opens, starts, settles);
}

function pricedOutcomes(
  marketId: string,
  tableId: CasinoSpectatorMarket["tableId"],
  participantIds: readonly string[],
  profiles: readonly NpcGamblingProfile[],
): readonly CasinoSpectatorMarketOutcome[] {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const participants = participantIds.map((id) => byId.get(id)).filter((profile): profile is NpcGamblingProfile => Boolean(profile));
  if (participants.length !== participantIds.length) throw new Error("casino_market_unknown_participant");
  const cacheKey = `${CASINO_SPECTATOR_PRICING_VERSION}:${tableId}:${participantIds.join("+")}:${participants.map((profile) => marketSkill(profile,tableId)).join(",")}`;
  const cached = PRICING_CACHE.get(cacheKey);
  if (cached) return cached.map((outcome) => Object.freeze({ ...outcome, quote: Object.freeze({ ...outcome.quote, marketId }) }));
  const outcomeIds = tableId === "temerosa-old-maid" ? [...participantIds] : [...participantIds, "draw"];
  const counts = Object.fromEntries(outcomeIds.map((id) => [id, 1])) as Record<string, number>;
  const rng = new XorShift32(cacheKey);
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const scores = participants.map((profile) => ({
      id: profile.id,
      score: marketSkill(profile,tableId)
        + (rng.next() - .5) * (tableId === "temerosa-match-pairs" ? .9 : tableId === "temerosa-old-maid" ? .72 : 1.05),
    }));
    if (tableId !== "temerosa-old-maid") {
      const [left, right] = scores;
      const result = Math.abs(left!.score - right!.score) < .035 ? "draw" : left!.score > right!.score ? left!.id : right!.id;
      counts[result]! += 1;
    } else {
      scores.sort((left, right) => right.score - left.score || compareText(left.id, right.id));
      counts[scores.at(-1)!.id]! += 1;
    }
  }
  const probabilities = probabilityBps(outcomeIds.map((id) => counts[id]!));
  const priced = Object.freeze(outcomeIds.map((outcomeId, index) => {
    const probability = probabilities[index]!;
    const payoutBps = Math.floor(CASINO_SPECTATOR_TARGET_RETURN_BPS * 10_000 / probability);
    const maxExposure = Math.min(1_000, Math.max(10, Math.floor(HOUSE_RISK_LIMIT * 10_000 / Math.max(1, payoutBps - 10_000))));
    const npc = byId.get(outcomeId);
    const quote: CasinoMarketQuote = Object.freeze({
      contract: CASINO_MARKET_QUOTE_CONTRACT, marketId: cacheKey, outcomeId,
      probabilityBps: probability, payoutBps, maxExposure,
      pricingVersion: CASINO_SPECTATOR_PRICING_VERSION,
    });
    return Object.freeze({ outcomeId, ...(npc ? { npcId: npc.id } : {}), label: npc?.name ?? "무승부", quote });
  }));
  PRICING_CACHE.set(cacheKey, priced);
  return priced.map((outcome) => Object.freeze({ ...outcome, quote: Object.freeze({ ...outcome.quote, marketId }) }));
}

function resultForMatch(match: NpcMatch, sessions: Readonly<Record<string, readonly NpcSession[]>>): string {
  const entries = match.participantIds.flatMap((npcId) => (sessions[npcId] ?? []).filter((session) => session.matchId === match.matchId).map((session) => ({ npcId, session })));
  if (match.tableId === "temerosa-match-pairs") {
    if (entries.some(({ session }) => session.resultKind === "draw")) return "draw";
    const winner = entries.find(({ session }) => session.resultKind === "win");
    if (!winner) throw new Error("casino_market_result_missing");
    return winner.npcId;
  }
  const ranked = entries.map(({ npcId, session }) => ({ npcId, rank: Number(session.resultKind.replace("rank-", "")) }))
    .filter(({ rank }) => Number.isSafeInteger(rank));
  if (ranked.length === 0) throw new Error("casino_market_result_missing");
  ranked.sort((left, right) => right.rank - left.rank || compareText(left.npcId, right.npcId));
  return ranked[0]!.npcId;
}

function probabilityBps(counts: readonly number[]): readonly number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const exact = counts.map((count) => count * 10_000 / total);
  const output = exact.map(Math.floor);
  let remainder = 10_000 - output.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) output[order[cursor % order.length]!.index]! += 1;
  return Object.freeze(output);
}

function exhibitionInventoryAt(
  profiles: readonly NpcGamblingProfile[],
  contract: NpcLedgerContract,
  now: number,
  historySeconds: number,
  lookaheadSeconds: number,
): CasinoSpectatorMarket[] {
  const currentCycle = Math.floor(now / EXHIBITION_CYCLE_SECONDS);
  const historyCycles = Math.ceil(historySeconds / EXHIBITION_CYCLE_SECONDS);
  const lookaheadCycles = Math.ceil(lookaheadSeconds / EXHIBITION_CYCLE_SECONDS);
  const markets: CasinoSpectatorMarket[] = [];
  for (let cycle = Math.max(0, currentCycle - historyCycles); cycle <= currentCycle + lookaheadCycles; cycle += 1) {
    const market = scheduledExhibitionMarket(profiles, contract, cycle, now);
    if (market.settlesAtUtcSecond >= now - historySeconds && market.opensAtUtcSecond <= now + lookaheadSeconds) markets.push(market);
  }
  return markets;
}

function phaseOrder(phase: CasinoSpectatorMarketPhase): number {
  return phase === "open" ? 0 : phase === "locked" ? 1 : phase === "upcoming" ? 2 : 3;
}
function normalizedUtcSecond(clock: CasinoClock): number {
  const seconds = (clock as CasinoClock & { utcSecond?: () => number }).utcSecond?.() ?? clock.utcMinute() * 60 + 59;
  if (!Number.isSafeInteger(seconds)) throw new Error("casino_market_invalid_clock");
  return seconds;
}
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

function marketSkill(profile:NpcGamblingProfile,tableId:CasinoSpectatorMarket["tableId"]):number{
  if(tableId==="temerosa-match-pairs")return profile.skills.matchPairsMemory;
  if(tableId==="temerosa-old-maid")return profile.skills.oldMaid;
  return (profile.skills.pokerRead+profile.skills.pokerBluff)/2;
}

function marketTitle(tableId:CasinoSpectatorMarket["tableId"]):string{
  if(tableId==="temerosa-match-pairs")return "짝맞추기 승자";
  if(tableId==="temerosa-old-maid")return "도둑잡기 마지막 조커";
  if(tableId==="indian-poker")return "인디언 포커 7라운드 승자";
  return "파이브 카드 드로 3연전 승자";
}

function marketRulesLabel(tableId:CasinoSpectatorMarket["tableId"],count:number):string{
  if(tableId==="temerosa-match-pairs")return "NPC 1대1 · 보통 · 12쌍";
  if(tableId==="temerosa-old-maid")return `NPC ${count}인 · 마지막 조커`;
  if(tableId==="indian-poker")return "NPC 1대1 · 7라운드";
  return "NPC 4인 · 3연전 · 공동 1위 포함";
}

/** A rotating deterministic bag makes every eligible identity appear before the next bag repeats. */
function shuffleBag(profiles:readonly NpcGamblingProfile[],tableId:CasinoSpectatorMarket["tableId"],occurrence:number,needed:number):readonly NpcGamblingProfile[]{
  if(profiles.length===0)return [];
  const cursor=occurrence*needed,bagIndex=Math.floor(cursor/profiles.length),offset=cursor%profiles.length;
  const rank=(round:number)=>profiles.map((profile)=>({profile,order:new XorShift32(`${CASINO_SPECTATOR_PRICING_VERSION}:bag:${tableId}:${round}:${profile.id}`).next()}))
    .sort((left,right)=>left.order-right.order||compareText(left.profile.id,right.profile.id)).map((entry)=>entry.profile);
  const current=rank(bagIndex),next=rank(bagIndex+1);
  return Object.freeze([...current.slice(offset),...next.slice(0,offset)]);
}
