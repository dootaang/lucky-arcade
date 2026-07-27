import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  completedDayBalances,
  npcBalanceAt,
  npcDaySessions,
  recentNpcActivitiesAt,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  type CasinoClock,
  type NpcSession,
} from "../src/index.ts";

const contract = TEMEROSA_NPC_LEDGER_CONTRACT;
const profile = TEMEROSA_NPC_GAMBLING_PROFILES[0]!;

describe("casino ledger core", () => {
  it("repeats the same sessions and exact closing for identical inputs", () => {
    const first = npcDaySessions(profile, 37, 3_721, contract);
    const second = npcDaySessions(profile, 37, 3_721, contract);
    expect(second).toEqual(first);
    expect(sum(first)).toBe(sum(second));
  });

  it("uses only player-scale settlements and keeps every prefix in bounds", () => {
    for (const candidate of TEMEROSA_NPC_GAMBLING_PROFILES) {
      let opening = candidate.target;
      for (let day = 0; day < 200; day += 1) {
        const sessions = npcDaySessions(candidate, day, opening, contract);
        let current = opening;
        for (const session of sessions) {
          expect(session.delta).toBe(session.creditAmount - session.reservedAmount);
          expect([0, 10, 50, 200]).toContain(session.stake);
          expect(session.reservedAmount).toBe(session.stake);
          current += session.delta;
          expect(current).toBeGreaterThanOrEqual(0);
          expect(current).toBeLessThanOrEqual(candidate.target * 20);
        }
        expect(sum(sessions)).toBe(current - opening);
        opening = current;
      }
    }
  });

  it("keeps all 35 profiles bounded for 10,000 days", () => {
    for (const candidate of TEMEROSA_NPC_GAMBLING_PROFILES) {
      let balance = candidate.target;
      for (let day = 0; day < 10_000; day += 1) {
        for (const session of npcDaySessions(candidate, day, balance, contract)) {
          balance += session.delta;
          if (balance < 0 || balance > candidate.target * 20) throw new Error(`unbounded:${candidate.id}:${day}`);
        }
      }
    }
  }, 30_000);

  it("opens a positive free old-maid recovery session below minimum wager", () => {
    for (const opening of [0, 1, 9]) {
      const first = npcDaySessions(profile, 8, opening, contract)[0]!;
      expect(first).toMatchObject({ tableId: "temerosa-old-maid", stake: 0, reservedAmount: 0 });
      expect(first.delta).toBeGreaterThan(0);
      expect([1, 3, 5, 10]).toContain(first.creditAmount);
    }
  });

  it("moves forward one day and returns to the original snapshot when the clock moves back", () => {
    const minute = (contract.epochUtcDay + 14) * 1_440 + 1_439;
    const original = npcBalanceAt(profile, fixedClock(minute), contract);
    const tomorrow = npcBalanceAt(profile, fixedClock(minute + 1_440), contract);
    const restored = npcBalanceAt(profile, fixedClock(minute), contract);
    expect(tomorrow.dayIndex).toBe(original.dayIndex + 1);
    expect(restored).toEqual(original);
  });

  it("returns target balances and no sessions before the fixed epoch", () => {
    expect(npcBalanceAt(profile, fixedClock(contract.epochUtcDay * 1_440 - 1), contract)).toEqual({
      balance: profile.target,
      today: [],
      dayIndex: 0,
    });
  });

  it("never invents a settlement outside the frozen player paytables", () => {
    for (const candidateProfile of TEMEROSA_NPC_GAMBLING_PROFILES) {
      for (const session of npcDaySessions(candidateProfile, 91, candidateProfile.target, contract)) {
        if (session.tableId === "temerosa-old-maid") {
          expect(session).toMatchObject({ stake: 0, reservedAmount: 0, termsVersion: "old-maid-rank-reward/0.1" });
          expect([1, 3, 5, 10]).toContain(session.creditAmount);
        } else if (session.tableId === "temerosa-match-pairs") {
          expect([0, session.stake, Math.round(session.stake * 1.5), session.stake * 2, Math.round(session.stake * 2.5)]).toContain(session.creditAmount);
        } else if (session.tableId === "indian-poker") {
          expect(session.creditAmount).toBeGreaterThanOrEqual(0);
          expect(session.creditAmount).toBeLessThanOrEqual(session.stake * 2);
        } else {
          expect(session.creditAmount % (session.stake * 6)).toBe(0);
          expect(session.creditAmount).toBeLessThanOrEqual(session.stake * 30);
        }
      }
    }
  });

  it("returns recent activity across UTC midnight", () => {
    const now = (contract.epochUtcDay + 2) * 1_440 + 5;
    const activities = recentNpcActivitiesAt(TEMEROSA_NPC_GAMBLING_PROFILES, fixedClock(now), contract, 200);
    expect(activities.length).toBeGreaterThan(0);
    expect(activities.every((activity) => activity.utcMinute <= now && activity.utcMinute > now - 1_440)).toBe(true);
    expect(activities.some((activity) => Math.floor(activity.utcMinute / 1_440) < Math.floor(now / 1_440))).toBe(true);
  });

  it("produces identical full and checkpoint-assisted balances", () => {
    const full = completedDayBalances(TEMEROSA_NPC_GAMBLING_PROFILES, 20, contract);
    const checkpoint = completedDayBalances(TEMEROSA_NPC_GAMBLING_PROFILES, 12, contract);
    const resumed = completedDayBalances(TEMEROSA_NPC_GAMBLING_PROFILES, 20, contract, checkpoint, 12);
    expect(resumed).toEqual(full);
  });

  it("contains no ambient side effects in pure sources", () => {
    const sources = ["engine.ts", "contracts.ts", "temerosa-profiles.ts"]
      .map((file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"))
      .join("\n");
    const forbidden = ["Date" + ".now(", "Math" + ".random(", "local" + "Storage", "session" + "Storage", "fetch(", "re" + "act"];
    for (const token of forbidden) expect(sources).not.toContain(token);
  });
});

function fixedClock(minute: number): CasinoClock {
  return { utcMinute: () => minute };
}

function sum(sessions: readonly NpcSession[]): number {
  return sessions.reduce((total, session) => total + session.delta, 0);
}
