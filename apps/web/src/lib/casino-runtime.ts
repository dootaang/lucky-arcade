import {
  TEMEROSA_HOUSE_ACCOUNT_ID, casinoKstDayAtUtcSecond, casinoUtcSecondAtKstDay,
  casinoPresenceAt, casinoSpectatorScheduleAt, casinoSpectatorMarketPresencesAt,
  casinoSpectatorMarketsAt, npcLiveBalancesAt, npcSessionSettlements,
  recentNpcPlayEventsAt, temerosaCasinoLedgerAtUtcSecond,
  type CasinoTransaction,
} from "@lucky-arcade/casino-ledger";
import { personalCasinoWorldlineAt } from "./casino-worldline.ts";
import type { StorageLike } from "./casino-ledger-cache.ts";
import { casinoJournalSettlements } from "./casino-journal.ts";
import { latestCasinoSettlementsAt } from "./casino-feed.ts";
import { summarizeCasinoLedgerActivities } from "../features/casino-ledger/casino-ledger-summary.ts";

export interface CasinoRuntimeInput {
  second: number;
  journal: readonly CasinoTransaction[];
}

/** One instance lives in the economic worker. No timers or ambient clock here. */
export function createCasinoRuntime(storage: StorageLike) {
  let previousSummary: { key: string; value: ReturnType<typeof summarize> } | undefined;
  function worldline(input: CasinoRuntimeInput) {
    const ledger = temerosaCasinoLedgerAtUtcSecond(input.second);
    return personalCasinoWorldlineAt(ledger.profiles, clockAt(input.second), ledger.contract, input.journal, storage);
  }
  function summarize(input: CasinoRuntimeInput) {
    const { profiles, contract } = temerosaCasinoLedgerAtUtcSecond(input.second);
    const currentDay = casinoKstDayAtUtcSecond(input.second);
    const firstDay = Math.max(contract.profitHistory[0]?.kstDay ?? contract.epochKstDay, currentDay - 6);
    const value = worldline(input);
    const journalSettlements = casinoJournalSettlements(input.journal);
    const summary = summarizeCasinoLedgerActivities({
      profiles, activities: value.activities, journalSettlements,
      carriedProfits: contract.profitHistory.filter((entry) => entry.kstDay >= firstDay).map((entry) => entry.profits),
      periodStartSecond: casinoUtcSecondAtKstDay(firstDay), todayStartSecond: casinoUtcSecondAtKstDay(currentDay),
    });
    const npcEconomyDetails = Object.fromEntries(profiles.flatMap((profile) => value.npcExternalReserves[profile.id] === undefined ? [] : [[profile.id, {
      externalReserve: value.npcExternalReserves[profile.id]!,
      grossIncomeToday: value.npcGrossIncomeToday[profile.id] ?? 0,
      casinoTopUpToday: value.npcCasinoTopUpsToday[profile.id] ?? 0,
      wageredToday: summary.wageredToday[profile.id] ?? 0,
    }]]));
    return {
      npcBalances: value.npcBalances, houseBalance: value.houseBalance,
      npcTopUpsToday: Object.values(value.npcCasinoTopUpsToday).reduce((sum, amount) => sum + amount, 0),
      houseGamingProfitToday: value.houseGamingProfitToday, houseOperatingExpensesToday: value.houseOperatingExpensesToday,
      npcEconomyDetails, settlements: latestCasinoSettlementsAt(value.activities, journalSettlements, input.second),
      profitPeriod: { coveredDays: Math.max(1, Math.min(7, currentDay - firstDay + 1)), profits: summary.profits },
    };
  }
  return {
    floor(input: CasinoRuntimeInput) {
      // Journal content, not object identity: a local transaction invalidates
      // the personal branch even when it arrives inside the same ten seconds.
      const second = Math.floor(input.second / 10) * 10;
      const key = `${second}:${JSON.stringify(input.journal)}`;
      if (previousSummary?.key !== key) previousSummary = { key, value: summarize({ ...input, second }) };
      const summary = previousSummary.value;
      const { profiles, contract } = temerosaCasinoLedgerAtUtcSecond(input.second);
      const clock = clockAt(input.second);
      const schedule = casinoSpectatorScheduleAt(profiles, clock, contract);
      const presences = mergePresences(casinoPresenceAt(profiles, clock, contract),
        casinoSpectatorMarketPresencesAt([...schedule.live, ...schedule.upcoming, ...schedule.recent], input.second));
      return { ...summary, second: input.second, presences, schedule,
        liveBalances: npcLiveBalancesAt(summary.npcBalances, profiles, presences, clock),
        playEvents: recentNpcPlayEventsAt(profiles, clock, contract, 512) };
    },
    presence(second: number) {
      const { profiles, contract } = temerosaCasinoLedgerAtUtcSecond(second);
      const clock = clockAt(second);
      return mergePresences(casinoPresenceAt(profiles, clock, contract),
        casinoSpectatorMarketPresencesAt(casinoSpectatorMarketsAt(profiles, clock, contract, 4), second));
    },
    balances(input: CasinoRuntimeInput) {
      const value = worldline(input);
      return { npcBalances: value.npcBalances, houseBalance: value.houseBalance };
    },
    history(input: CasinoRuntimeInput & { npcId: string; days: number }) {
      const lower = input.days === 0 ? 0 : input.second - input.days * 86_400;
      const local = casinoJournalSettlements(input.journal).filter((entry) => entry.npcId === input.npcId && entry.utcSecond >= lower);
      if (input.npcId === "player:local" || input.npcId === TEMEROSA_HOUSE_ACCOUNT_ID) return local;
      const autonomous = worldline(input).activities.filter((entry) => entry.npcId === input.npcId && entry.utcSecond >= lower)
        .flatMap((entry) => npcSessionSettlements(entry.npcId, entry.utcSecond, entry.session));
      return [...autonomous, ...local].sort((a, b) => b.utcSecond - a.utcSecond || a.roundId.localeCompare(b.roundId));
    },
  };
}

function clockAt(second: number) { return { utcSecond: () => second, utcMinute: () => Math.floor(second / 60) }; }
function mergePresences(base: ReturnType<typeof casinoPresenceAt>, market: ReturnType<typeof casinoPresenceAt>) {
  const ids = new Set(market.map((entry) => entry.npcId));
  return [...base.filter((entry) => !ids.has(entry.npcId)), ...market];
}
export type CasinoRuntime = ReturnType<typeof createCasinoRuntime>;
export type CasinoFloorSnapshot = ReturnType<CasinoRuntime["floor"]>;
export type CasinoRuntimeMethod = keyof CasinoRuntime;
export type CasinoRuntimeRequest = { [K in CasinoRuntimeMethod]: { id: number; method: K; input: Parameters<CasinoRuntime[K]>[0] } }[CasinoRuntimeMethod];
