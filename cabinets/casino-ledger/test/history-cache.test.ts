import { describe, expect, it, vi } from "vitest";
import { XorShift32 } from "@lucky-arcade/engine";
import { casinoDayPlan, completedDayBalances } from "../src/engine.ts";
import { casinoPresenceAt, npcPresenceIntervalsForDay } from "../src/presence.ts";
import { recentNpcPlayEventsAt } from "../src/live-tape.ts";
import { casinoUtcSecondAtKstDay } from "../src/casino-time.ts";
import { TEMEROSA_NPC_GAMBLING_PROFILES } from "../src/temerosa-profiles.ts";
import type { CasinoDayPlan, NpcGamblingProfile, NpcLedgerContract } from "../src/contracts.ts";

function fixture(flow = true): NpcLedgerContract {
  const profiles = TEMEROSA_NPC_GAMBLING_PROFILES.slice(0, 4).map(profile => ({
    ...structuredClone(profile), openingBalance: 1_000,
    sessionsPerDay: { min: 1, max: 1 },
    tables: [{ tableId: "temerosa-slot" as const, weight: 1 }],
  }));
  return {
    version: flow ? "npc-ledger/1.3" : "npc-ledger/1.1",
    seedVersion: flow ? "casino-flow/1.2" : "npc-ledger/0.9",
    epochKstDay: 20_667, profiles, profitHistory: [], houseOpeningBalance: 150_000,
    externalIncomeProfiles: profiles.map(profile => ({
      npcId: profile.id, sourceLabel: "test", evidenceRefs: [],
      dailyIncomeRange: [100, 100], casinoBudgetRateBps: [5_000, 5_000],
      openingExternalReserve: 0, settlementWindow: [1, 1],
    })),
    behaviors: profiles.map(profile => ({
      npcId: profile.id, riskAppetite: .5, stakeAggression: .5, lossChasing: .5,
      stopLossDiscipline: .5, takeProfitDiscipline: .5,
      visitsPerDay: { min: 1, max: 1 }, roundsPerVisit: { min: 2, max: 2 },
      skills: { "temerosa-slot": .5 }, preferredTables: profile.tables,
    })),
  };
}

function openings(profiles: readonly NpcGamblingProfile[]) {
  return Object.fromEntries(profiles.map(profile => [profile.id, profile.openingBalance]));
}

// Deliberately bypass completedDayBalances: this is the original replay rule.
function replay(profiles: readonly NpcGamblingProfile[], lastDay: number, contract: NpcLedgerContract,
  checkpoint = openings(profiles), checkpointDay = -1) {
  let balances = { ...checkpoint };
  for (let day = checkpointDay + 1; day <= lastDay; day++) {
    const plan = casinoDayPlan(profiles, day, balances, contract);
    balances = Object.fromEntries(profiles.map(profile => [profile.id,
      balances[profile.id]! + (plan.sessions[profile.id] ?? []).reduce((sum, session) => sum + session.delta, 0),
    ]));
  }
  return balances;
}

function clock(contract: NpcLedgerContract, day: number, second = 43_200) {
  const now = casinoUtcSecondAtKstDay(contract.epochKstDay + day, second);
  return { utcSecond: () => now, utcMinute: () => Math.floor(now / 60) };
}

describe("bounded historical closing checkpoints", () => {
  it.each([30, 90, 365])("preserves cold/warm results at day %i without warm history replay", day => {
    const contract = fixture();
    const profiles = contract.profiles;
    const reference = structuredClone(contract);
    const expectedPrevious = replay(profiles, day - 1, reference);
    const expected = replay(profiles, day, reference, expectedPrevious, day - 1);
    const cold = completedDayBalances(profiles, day, contract);
    expect(cold).toEqual(expected);
    const rng = vi.spyOn(XorShift32.prototype, "nextUint32");
    try {
      expect(completedDayBalances(profiles, day, contract)).toEqual(cold);
      expect(completedDayBalances(profiles, day - 1, contract)).toEqual(expectedPrevious);
      // A replay through the 16-plan LRU consumes random numbers; a close hit does not.
      expect(rng).not.toHaveBeenCalled();
      const coldPresence = casinoPresenceAt(profiles, clock(contract, day), contract);
      const coldTape = recentNpcPlayEventsAt(profiles, clock(contract, day), contract, 100);
      rng.mockClear();
      expect(casinoPresenceAt(profiles, clock(contract, day), contract)).toEqual(coldPresence);
      expect(recentNpcPlayEventsAt(profiles, clock(contract, day), contract, 100)).toEqual(coldTape);
      // Presence/tape have their own random streams, but never days of engine work.
      expect(rng.mock.calls.length).toBeLessThan(100);
    } finally { rng.mockRestore(); }
  });

  it("handles backward queries after eviction, then advances from a retained close", () => {
    const contract = fixture(false), profiles = contract.profiles;
    completedDayBalances(profiles, 90, contract);
    const expected = replay(profiles, 4, structuredClone(contract));
    const rng = vi.spyOn(XorShift32.prototype, "nextUint32");
    try {
      expect(completedDayBalances(profiles, 4, contract)).toEqual(expected);
      expect(rng.mock.calls.length).toBeGreaterThan(0); // old closes and plans were evicted
      rng.mockClear();
      completedDayBalances(profiles, 90, contract);
      expect(rng).not.toHaveBeenCalled();
    } finally { rng.mockRestore(); }
    expect(completedDayBalances(profiles, 91, contract)).toEqual(replay(profiles, 91, structuredClone(contract)));
  });

  it.each([false, true])("isolates profile values, ordering and explicit checkpoint worldlines (flow=%s)", flow => {
    const contract = fixture(flow), profiles = contract.profiles;
    const canonical = completedDayBalances(profiles, 20, contract);
    const changed = profiles.map(profile => ({ ...profile, openingBalance: 7_777, maxExposureRatio: .01 }));
    for (const input of [changed, [...changed].reverse(), profiles]) {
      expect(completedDayBalances(input, 20, contract)).toEqual(replay(input, 20, structuredClone(contract)));
    }
    const checkpoint = Object.fromEntries(profiles.map(profile => [profile.id, 2_000]));
    for (const checkpointDay of [0, 18, 5]) {
      expect(completedDayBalances(profiles, 20, contract, checkpoint, checkpointDay))
        .toEqual(replay(profiles, 20, structuredClone(contract), checkpoint, checkpointDay));
    }
    checkpoint[profiles[0]!.id] = 9_000;
    expect(completedDayBalances(profiles, 20, contract, checkpoint, 5))
      .toEqual(replay(profiles, 20, structuredClone(contract), checkpoint, 5));
    expect(completedDayBalances(profiles, 20, contract)).toEqual(canonical);
    expect(completedDayBalances(profiles, -1, contract)).toEqual(openings(profiles));
    expect(completedDayBalances(profiles, 5, contract, checkpoint, 5)).toEqual(checkpoint);
    expect(() => completedDayBalances(profiles, 20, contract, {}, 5)).toThrow("npc_ledger_invalid_checkpoint_balance");
    expect(() => completedDayBalances(profiles, 4, contract, checkpoint, 5)).toThrow("npc_ledger_invalid_checkpoint_day");
  });

  it("invalidates same-object contract/profile edits and isolates separate contracts", () => {
    const contract = fixture(), profiles = contract.profiles;
    completedDayBalances(profiles, 3, contract);
    const changes = [
      () => { contract.epochKstDay += 1; },
      () => { contract.seedVersion = "casino-flow/1.1"; },
      () => { contract.houseOpeningBalance = 80_000; },
      () => { contract.externalIncomeProfiles![0]!.dailyIncomeRange = [400, 400]; },
      () => { contract.behaviors![0]!.visitsPerDay = { min: 2, max: 2 }; },
      () => { profiles[0]!.openingBalance += 800; },
    ];
    for (const change of changes) {
      change();
      const fresh = structuredClone(contract);
      expect(completedDayBalances(profiles, 3, contract)).toEqual(replay(fresh.profiles, 3, fresh));
    }
  });

  it("bounds profile/checkpoint branches and keeps full plans at the existing 16-entry limit", () => {
    const contract = fixture(false), profiles = contract.profiles;
    const initial = openings(profiles);
    const first = casinoDayPlan(profiles, 0, initial, contract);
    for (let day = 1; day <= 16; day++) casinoDayPlan(profiles, day, initial, contract);
    const rebuilt = casinoDayPlan(profiles, 0, initial, contract);
    expect(rebuilt).not.toBe(first);
    expect(rebuilt).toEqual(first);
    const close = completedDayBalances(profiles, 20, contract, initial, 0);
    for (let branch = 1; branch <= 8; branch++) {
      completedDayBalances(profiles, 20, contract, { ...initial, [profiles[0]!.id]: 1_000 + branch }, 0);
    }
    const rng = vi.spyOn(XorShift32.prototype, "nextUint32");
    try {
      expect(completedDayBalances(profiles, 20, contract, initial, 0)).toEqual(close);
      expect(rng.mock.calls.length).toBeGreaterThan(0);
    } finally { rng.mockRestore(); }
  });

  it("shares plans across equivalent profile arrays, but not changed openings or events", () => {
    const contract = fixture(false), profiles = contract.profiles, initial = openings(profiles);
    const first = casinoDayPlan(profiles, 0, initial, contract);
    expect(casinoDayPlan(structuredClone(profiles), 0, initial, contract)).toBe(first);
    expect(casinoDayPlan(profiles, 0, { ...initial, [profiles[0]!.id]: 0 }, contract)).not.toBe(first);
    const event = [{ eventId: "credit", npcId: profiles[0]!.id, secondOfDay: 0, delta: 10 }];
    const withEvent = casinoDayPlan(profiles, 0, initial, contract, event);
    expect(withEvent).not.toBe(first);
    expect(withEvent).toEqual(casinoDayPlan(profiles, 0, initial, structuredClone(contract), event));
  });
});

describe("bounded presence intervals", () => {
  it("keys intervals by plan, absolute day, NPC and opening balance", () => {
    const contract = fixture(false), profiles = contract.profiles, profile = profiles[0]!;
    const plan = casinoDayPlan(profiles, 0, openings(profiles), contract);
    const intervals = (day = 0, balance = 1_000, supplied: CasinoDayPlan = plan) =>
      npcPresenceIntervalsForDay(profile, day, balance, contract, -Infinity, supplied);
    const first = intervals();
    expect(first.length).toBeGreaterThan(0);
    expect(intervals()).toBe(first);
    expect(intervals(0, 2_000)[0]!.openingBalance).toBe(first[0]!.openingBalance + 1_000);
    expect(intervals(1)[0]!.startedAtUtcSecond).toBe(first[0]!.startedAtUtcSecond + 86_400);
    const clone = structuredClone(plan);
    expect(intervals(0, 1_000, clone)).toEqual(first);
    expect(intervals(0, 1_000, clone)).not.toBe(first);
    intervals(0, 1_000, structuredClone(plan));
    expect(intervals()).not.toBe(first); // only two plans survive
  });

  it("matches fresh-contract presence/tape across midnight, backward dates and profile edits", () => {
    const contract = fixture();
    for (const [day, second] of [[20, 86_390], [21, 5], [4, 43_200], [21, 5]] as const) {
      const fresh = structuredClone(contract), time = clock(contract, day, second);
      const profiles = contract.profiles.map(profile => ({ ...profile, maxExposureRatio: .01 }));
      expect(casinoPresenceAt(profiles, time, contract)).toEqual(casinoPresenceAt(profiles, time, fresh));
      expect(recentNpcPlayEventsAt(profiles, time, contract, 100, 600))
        .toEqual(recentNpcPlayEventsAt(profiles, time, fresh, 100, 600));
    }
  });
});
