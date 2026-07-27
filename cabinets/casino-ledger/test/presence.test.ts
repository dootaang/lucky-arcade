import { describe, expect, it } from "vitest";
import {
  casinoPresenceAt,
  npcAvailability,
  npcDaySessions,
  npcPresenceIntervalsForDay,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  type CasinoPresentationClock,
} from "../src/index.ts";

const contract = TEMEROSA_NPC_LEDGER_CONTRACT;

describe("casino floor presence", () => {
  it("derives the same presence from the same server-aligned second", () => {
    const second = contract.epochUtcDay * 86_400 + 40_000;
    expect(casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, fixedClock(second), contract))
      .toEqual(casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, fixedClock(second), contract));
  });

  it("marks active visits unavailable without exposing a future result early", () => {
    const profile = TEMEROSA_NPC_GAMBLING_PROFILES[0]!;
    const interval = npcPresenceIntervalsForDay(profile, 0, profile.target, contract)[0]!;
    const beforeSettlement = casinoPresenceAt([profile], fixedClock(interval.settlesAtUtcSecond - 1), contract)[0]!;
    expect(beforeSettlement.phase).toBe("playing");
    expect(npcAvailability([beforeSettlement])[profile.id]?.available).toBe(false);
    const after = casinoPresenceAt([profile], fixedClock(interval.availableAtUtcSecond), contract)[0]!;
    expect(["idle", "approaching"]).toContain(after.phase);
    if (after.phase === "approaching") expect(after.startedAtUtcSecond).toBe(interval.availableAtUtcSecond);
  });

  it("keeps at least four NPCs available at every transition for 10,000 days", () => {
    const balances = Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.target]));
    for (let day = 0; day < 10_000; day += 1) {
      const events: Array<{ second: number; delta: -1 | 1 }> = [];
      for (const profile of TEMEROSA_NPC_GAMBLING_PROFILES) {
        const opening = balances[profile.id]!;
        const intervals = npcPresenceIntervalsForDay(profile, day, opening, contract);
        for (const interval of intervals) {
          events.push({ second: interval.startedAtUtcSecond, delta: 1 }, { second: interval.availableAtUtcSecond, delta: -1 });
        }
        balances[profile.id] = opening + npcDaySessions(profile, day, opening, contract).reduce((sum, session) => sum + session.delta, 0);
      }
      events.sort((left, right) => left.second - right.second || left.delta - right.delta);
      let busy = 0;
      for (const event of events) {
        busy += event.delta;
        if (TEMEROSA_NPC_GAMBLING_PROFILES.length - busy < 4) throw new Error(`insufficient_available:${day}:${event.second}`);
      }
    }
  }, 90_000);

  it("keeps the casino floor occupied throughout the first year", () => {
    const balances = Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.target]));
    const intervals = [] as ReturnType<typeof npcPresenceIntervalsForDay>[number][];
    for (let day = 0; day <= 366; day += 1) {
      for (const profile of TEMEROSA_NPC_GAMBLING_PROFILES) {
        const opening = balances[profile.id]!;
        const values = npcPresenceIntervalsForDay(profile, day, opening, contract);
        balances[profile.id] = opening + npcDaySessions(profile, day, opening, contract).reduce((sum, session) => sum + session.delta, 0);
        intervals.push(...values);
      }
    }
    intervals.sort((left, right) => left.startedAtUtcSecond - right.startedAtUtcSecond);
    const rangeStart = (contract.epochUtcDay + 1) * 86_400;
    const rangeEnd = (contract.epochUtcDay + 366) * 86_400;
    let coveredUntil = rangeStart;
    for (const interval of intervals) {
      if (interval.availableAtUtcSecond <= rangeStart || interval.startedAtUtcSecond >= rangeEnd) continue;
      if (interval.startedAtUtcSecond > coveredUntil) throw new Error(`quiet_floor:${coveredUntil}`);
      coveredUntil = Math.max(coveredUntil, interval.availableAtUtcSecond);
      if (coveredUntil >= rangeEnd) break;
    }
    expect(coveredUntil).toBeGreaterThanOrEqual(rangeEnd);
  }, 30_000);
});

function fixedClock(second: number): CasinoPresentationClock {
  return { utcSecond: () => second, utcMinute: () => Math.floor(second / 60) };
}
