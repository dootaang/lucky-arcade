import { describe, expect, it } from "vitest";
import {
  casinoPresenceAt,
  completedDayBalances,
  npcDaySessions,
  npcLiveBalancesAt,
  npcPresenceIntervalsForDay,
  npcVisitRounds,
  recentNpcRoundSettlementsAt,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  type CasinoPresentationClock,
  type NpcRoundSettlement,
} from "../src/index.ts";

const contract = TEMEROSA_NPC_LEDGER_CONTRACT;

describe("NPC live round settlements", () => {
  it("deterministically expands visits without changing their frozen closing delta", () => {
    for (const profile of TEMEROSA_NPC_GAMBLING_PROFILES) {
      let opening = profile.target;
      for (let day = 0; day < 30; day += 1) {
        const intervals = npcPresenceIntervalsForDay(profile, day, opening, contract);
        for (const interval of intervals) {
          const first = npcVisitRounds(interval, profile);
          expect(npcVisitRounds(interval, profile)).toEqual(first);
          expect(sum(first)).toBe(interval.session.delta);
          expectLegalRounds(first);
          let balance = interval.openingBalance;
          for (const round of first) {
            balance += round.delta;
            expect(balance).toBeGreaterThanOrEqual(0);
            expect(balance).toBeLessThanOrEqual(profile.target * 20);
          }
        }
        const sessions = npcDaySessions(profile, day, opening, contract);
        opening += sessions.reduce((total, session) => total + session.delta, 0);
      }
    }
  }, 15_000);

  it("keeps the original completed-day history byte-for-byte unchanged", () => {
    const before = completedDayBalances(TEMEROSA_NPC_GAMBLING_PROFILES, 40, contract);
    for (const profile of TEMEROSA_NPC_GAMBLING_PROFILES) {
      let opening = profile.target;
      for (let day = 0; day <= 40; day += 1) {
        for (const interval of npcPresenceIntervalsForDay(profile, day, opening, contract)) npcVisitRounds(interval, profile);
        opening += npcDaySessions(profile, day, opening, contract).reduce((total, session) => total + session.delta, 0);
      }
    }
    expect(completedDayBalances(TEMEROSA_NPC_GAMBLING_PROFILES, 40, contract)).toEqual(before);
  });

  it("hands off from second-level live balance to the minute ledger without a jump", () => {
    const profile = TEMEROSA_NPC_GAMBLING_PROFILES.find((candidate) => candidate.tables.some((table) => table.tableId === "temerosa-slot"))!;
    const interval = npcPresenceIntervalsForDay(profile, 0, profile.target, contract)
      .find((candidate) => candidate.tableId !== "temerosa-old-maid")!;
    const beforeClock = fixedClock(interval.settlesAtUtcSecond - 1);
    const beforePresence = casinoPresenceAt([profile], beforeClock, contract);
    const beforeBase = { [profile.id]: interval.openingBalance };
    expect(npcLiveBalancesAt(beforeBase, [profile], beforePresence, beforeClock)[profile.id])
      .toBe(interval.openingBalance + interval.session.delta);

    const atClock = fixedClock(interval.settlesAtUtcSecond);
    const atPresence = casinoPresenceAt([profile], atClock, contract);
    const settledBase = { [profile.id]: interval.openingBalance + interval.session.delta };
    expect(npcLiveBalancesAt(settledBase, [profile], atPresence, atClock)[profile.id])
      .toBe(interval.openingBalance + interval.session.delta);
  });

  it("produces a continuously advancing global settlement stream", () => {
    const events: NpcRoundSettlement[] = [];
    for (const profile of TEMEROSA_NPC_GAMBLING_PROFILES) {
      for (const interval of npcPresenceIntervalsForDay(profile, 1, completedDayBalances([profile], 0, contract)[profile.id]!, contract)) {
        events.push(...npcVisitRounds(interval, profile).filter((round) => round.delta !== 0));
      }
    }
    events.sort((left, right) => left.utcSecond - right.utcSecond);
    const businessStart = (contract.epochUtcDay + 1) * 86_400 + 600;
    const businessEnd = (contract.epochUtcDay + 2) * 86_400 - 600;
    const duringDay = events.filter((event) => event.utcSecond >= businessStart && event.utcSecond <= businessEnd);
    expect(duringDay.length).toBeGreaterThan(300);
    const maximumGap = duringDay.slice(1).reduce((largest, event, index) => Math.max(largest, event.utcSecond - duringDay[index]!.utcSecond), 0);
    expect(maximumGap).toBeLessThanOrEqual(180);
  });

  it("returns exact-second recent settlements across UTC midnight", () => {
    const now = (contract.epochUtcDay + 2) * 86_400 + 300;
    const first = recentNpcRoundSettlementsAt(TEMEROSA_NPC_GAMBLING_PROFILES, fixedClock(now), contract, 100, 3_600);
    expect(first.length).toBeGreaterThan(0);
    expect(recentNpcRoundSettlementsAt(TEMEROSA_NPC_GAMBLING_PROFILES, fixedClock(now), contract, 100, 3_600)).toEqual(first);
    expect(first.every((round) => round.utcSecond <= now && round.utcSecond > now - 3_600)).toBe(true);
  });
});

function expectLegalRounds(rounds: readonly NpcRoundSettlement[]): void {
  for (const round of rounds) {
    expect(round.delta).toBe(round.creditAmount - round.reservedAmount);
    if (round.tableId === "temerosa-old-maid") {
      expect(round).toMatchObject({ stake: 0, reservedAmount: 0, termsVersion: "old-maid-rank-reward/0.1" });
      expect([1, 3, 5, 10]).toContain(round.creditAmount);
    } else if (round.tableId === "temerosa-match-pairs") {
      expect([0, round.stake, Math.round(round.stake * 1.5), round.stake * 2, Math.round(round.stake * 2.5)]).toContain(round.creditAmount);
    } else if (round.tableId === "indian-poker") {
      expect(round.creditAmount).toBeGreaterThanOrEqual(0);
      expect(round.creditAmount).toBeLessThanOrEqual(round.stake * 2);
    } else {
      expect(round.creditAmount % (round.stake * 6)).toBe(0);
      expect(round.creditAmount).toBeLessThanOrEqual(round.stake * 30);
    }
  }
}

function sum(rounds: readonly NpcRoundSettlement[]): number {
  return rounds.reduce((total, round) => total + round.delta, 0);
}

function fixedClock(second: number): CasinoPresentationClock {
  return { utcSecond: () => second, utcMinute: () => Math.floor(second / 60) };
}
