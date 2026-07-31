import {
  CASINO_MARKET_QUOTE_CONTRACT,
  XorShift32,
  assertCasinoMarketQuote,
  type CasinoMarketQuote,
} from "@lucky-arcade/engine";
import { casinoKstDayAtUtcSecond, casinoUtcSecondAtKstDay } from "./casino-time.ts";
import { casinoDayPlan, completedDayBalances } from "./engine.ts";
import type { CasinoClock, CasinoTableId, NpcGamblingProfile, NpcLedgerContract, NpcMatch, NpcPresence, NpcSession } from "./contracts.ts";

export const CASINO_SPECTATOR_MARKET_CONTRACT = "casino-spectator-market/0.1" as const;
export const CASINO_SPECTATOR_PRICING_VERSION = "casino-spectator-pricing/0.1" as const;
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
  tableId: Extract<CasinoTableId, "temerosa-match-pairs" | "temerosa-old-maid">;
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

const SAMPLE_COUNT = 20_000;
const MARKET_OPEN_SECONDS = 180;
const MARKET_LOCK_SECONDS = 10;
const MARKET_LOOKAHEAD_SECONDS = 6 * 3_600;
const MARKET_HISTORY_SECONDS = 20 * 60;
const HOUSE_RISK_LIMIT = 5_000;
const EXHIBITION_CYCLE_SECONDS = 300;
const EXHIBITION_CLOSE_OFFSET = 180;
const EXHIBITION_START_OFFSET = 190;
const EXHIBITION_SETTLE_OFFSET = 280;
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
  const absoluteDay = casinoKstDayAtUtcSecond(now);
  const firstDayIndex = Math.max(0, absoluteDay - contract.epochKstDay - 1);
  const lastDayIndex = Math.max(0, absoluteDay - contract.epochKstDay + 1);
  const markets: CasinoSpectatorMarket[] = [];
  const currentCycle = Math.floor(now / EXHIBITION_CYCLE_SECONDS);
  for (let cycle = currentCycle - 1; cycle <= currentCycle + 12; cycle += 1) {
    const market = scheduledExhibitionMarket(profiles, contract, cycle, now);
    if (market.settlesAtUtcSecond >= now - MARKET_HISTORY_SECONDS && market.opensAtUtcSecond <= now + MARKET_LOOKAHEAD_SECONDS) markets.push(market);
  }
  for (let dayIndex = firstDayIndex; dayIndex <= lastDayIndex; dayIndex += 1) {
    markets.push(...casinoSpectatorMarketsForDay(profiles, dayIndex, contract, now)
      .filter((market) => market.settlesAtUtcSecond >= now - MARKET_HISTORY_SECONDS && market.opensAtUtcSecond <= now + MARKET_LOOKAHEAD_SECONDS));
  }
  return Object.freeze([...new Map(markets.map((market) => [market.marketId, market])).values()]
    .sort((left, right) => phaseOrder(left.phase) - phaseOrder(right.phase)
      || left.startsAtUtcSecond - right.startsAtUtcSecond || compareText(left.marketId, right.marketId))
    .slice(0, limit));
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
  const exhibition = /casino-spectator-exhibition\/0\.1:(\d+)$/.exec(marketId);
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
    || !["temerosa-match-pairs", "temerosa-old-maid"].includes(market.tableId)
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
  resultOutcomeId: string,
  profiles: readonly NpcGamblingProfile[],
  now: number,
  opensAtUtcSecond: number,
  startsAtUtcSecond: number,
  settlesAtUtcSecond: number,
): CasinoSpectatorMarket {
  const tableId = match.tableId as CasinoSpectatorMarket["tableId"];
  const kind: CasinoSpectatorMarketKind = tableId === "temerosa-match-pairs" ? "match-winner" : "joker-holder";
  const marketId = `${CASINO_SPECTATOR_MARKET_CONTRACT}:${kind}:${match.matchId}`;
  const closesAtUtcSecond = startsAtUtcSecond - MARKET_LOCK_SECONDS;
  const phase: CasinoSpectatorMarketPhase = now < opensAtUtcSecond ? "upcoming" : now < closesAtUtcSecond ? "open" : now < settlesAtUtcSecond ? "locked" : "settled";
  const outcomes = pricedOutcomes(marketId, tableId, match.participantIds, profiles);
  const winningOutcomeId = phase === "settled" ? resultOutcomeId : undefined;
  const market: CasinoSpectatorMarket = Object.freeze({
    contract: CASINO_SPECTATOR_MARKET_CONTRACT,
    marketId, matchId: match.matchId, tableId, kind,
    participantIds: Object.freeze([...match.participantIds]),
    title: tableId === "temerosa-match-pairs" ? "짝맞추기 승자" : "도둑잡기 마지막 조커",
    rulesLabel: tableId === "temerosa-match-pairs" ? "NPC 1대1 · 보통 · 12쌍" : `NPC ${match.participantIds.length}인 · 마지막 조커`,
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
  const tableId: CasinoSpectatorMarket["tableId"] = cycle % 2 === 0 ? "temerosa-match-pairs" : "temerosa-old-maid";
  const needed = tableId === "temerosa-match-pairs" ? 2 : 4;
  const dayIndex = Math.max(0, casinoKstDayAtUtcSecond(starts) - contract.epochKstDay);
  const opening = dayIndex === 0 ? Object.freeze(Object.fromEntries(profiles.map((profile) => [profile.id, profile.openingBalance]))) : completedDayBalances(profiles, dayIndex - 1, contract);
  const plan = casinoDayPlan(profiles, dayIndex, opening, contract);
  const busy = new Set(plan.visits.filter((visit) => {
    const dayStart = casinoUtcSecondAtKstDay(contract.epochKstDay + dayIndex);
    return dayStart + visit.startedAtSecondOfDay < settles && dayStart + visit.endsAtSecondOfDay > starts;
  }).flatMap((visit) => visit.participantIds));
  const rng = new XorShift32(`${CASINO_SPECTATOR_PRICING_VERSION}:event:${cycle}:participants`);
  const eligibleProfiles = tableId === "temerosa-old-maid" ? profiles.filter((profile) => profile.id !== "bacikal") : profiles;
  const candidates = eligibleProfiles.filter((profile) => !busy.has(profile.id)).map((profile) => ({ profile, order: rng.next() }))
    .sort((left, right) => left.order - right.order || compareText(left.profile.id, right.profile.id));
  const fallback = eligibleProfiles.filter((profile) => !candidates.some((candidate) => candidate.profile.id === profile.id)).map((profile) => ({ profile, order: rng.next() }))
    .sort((left, right) => left.order - right.order || compareText(left.profile.id, right.profile.id));
  const participantIds = [...candidates, ...fallback].slice(0, needed).map((candidate) => candidate.profile.id).sort(compareText);
  if (participantIds.length !== needed) throw new Error("casino_market_insufficient_participants");
  const matchId = `casino-spectator-exhibition/0.1:${cycle}`;
  const match: NpcMatch = Object.freeze({ matchId, visitId: `${matchId}:visit`, tableId, participantIds: Object.freeze(participantIds), startsAtSecondOfDay: 0, settlesAtSecondOfDay: 1, stake: 0, multiplier: 1 });
  return createMarket(match, simulatedResult(tableId, participantIds, profiles, `${matchId}:result`), profiles, now, opens, starts, settles);
}

function simulatedResult(tableId: CasinoSpectatorMarket["tableId"], participantIds: readonly string[], profiles: readonly NpcGamblingProfile[], seed: string): string {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const rng = new XorShift32(seed);
  const scores = participantIds.map((id) => {
    const profile = byId.get(id);
    if (!profile) throw new Error("casino_market_unknown_participant");
    return { id, score: (tableId === "temerosa-match-pairs" ? profile.skills.matchPairsMemory : profile.skills.oldMaid) + (rng.next() - .5) * (tableId === "temerosa-match-pairs" ? .9 : .72) };
  });
  if (tableId === "temerosa-match-pairs") {
    const [left, right] = scores;
    return Math.abs(left!.score - right!.score) < .035 ? "draw" : left!.score > right!.score ? left!.id : right!.id;
  }
  scores.sort((left, right) => right.score - left.score || compareText(left.id, right.id));
  return scores.at(-1)!.id;
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
  const cacheKey = `${CASINO_SPECTATOR_PRICING_VERSION}:${tableId}:${participantIds.join("+")}:${participants.map((profile) => tableId === "temerosa-match-pairs" ? profile.skills.matchPairsMemory : profile.skills.oldMaid).join(",")}`;
  const cached = PRICING_CACHE.get(cacheKey);
  if (cached) return cached.map((outcome) => Object.freeze({ ...outcome, quote: Object.freeze({ ...outcome.quote, marketId }) }));
  const outcomeIds = tableId === "temerosa-match-pairs" ? [...participantIds, "draw"] : [...participantIds];
  const counts = Object.fromEntries(outcomeIds.map((id) => [id, 1])) as Record<string, number>;
  const rng = new XorShift32(cacheKey);
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const scores = participants.map((profile) => ({
      id: profile.id,
      score: (tableId === "temerosa-match-pairs" ? profile.skills.matchPairsMemory : profile.skills.oldMaid)
        + (rng.next() - .5) * (tableId === "temerosa-match-pairs" ? .9 : .72),
    }));
    if (tableId === "temerosa-match-pairs") {
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

function phaseOrder(phase: CasinoSpectatorMarketPhase): number {
  return phase === "open" ? 0 : phase === "locked" ? 1 : phase === "upcoming" ? 2 : 3;
}
function normalizedUtcSecond(clock: CasinoClock): number {
  const seconds = (clock as CasinoClock & { utcSecond?: () => number }).utcSecond?.() ?? clock.utcMinute() * 60 + 59;
  if (!Number.isSafeInteger(seconds)) throw new Error("casino_market_invalid_clock");
  return seconds;
}
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
