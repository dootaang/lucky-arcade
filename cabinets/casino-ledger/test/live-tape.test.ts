import { describe, expect, it } from "vitest";
import {
  casinoPresenceAt,
  recentNpcPlayEventsAt,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  type CasinoPresentationClock,
} from "../src/index.ts";

const contract = TEMEROSA_NPC_LEDGER_CONTRACT;

describe("casino live play tape", () => {
  it("derives identical second-resolution events without touching settlement", () => {
    const intervalSecond = firstPlayingSecond();
    const clock = fixedClock(intervalSecond);
    const presences = casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, contract);
    const before = structuredClone(presences);
    const first = recentNpcPlayEventsAt(presences, clock, 24);
    const second = recentNpcPlayEventsAt(presences, clock, 24);
    expect(first).toEqual(second);
    expect(presences).toEqual(before);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((event) => event.utcSecond <= intervalSecond && event.utcSecond > intervalSecond - 90)).toBe(true);
  });

  it("adds a new visible action within three seconds while a table is running", () => {
    const start = firstPlayingSecond();
    const initialClock = fixedClock(start);
    const presences = casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, initialClock, contract);
    const initial = recentNpcPlayEventsAt(presences, initialClock, 100);
    let changed = false;
    for (let offset = 1; offset <= 3; offset += 1) {
      const clock = fixedClock(start + offset);
      const nextPresences = casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, contract);
      const next = recentNpcPlayEventsAt(nextPresences, clock, 100);
      if (next.some((event) => !initial.some((old) => old.eventId === event.eventId))) changed = true;
    }
    expect(changed).toBe(true);
  });

  it("keeps event codes inside the table-specific vocabulary", () => {
    const second = firstPlayingSecond();
    const clock = fixedClock(second);
    const events = recentNpcPlayEventsAt(casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, contract), clock, 100);
    for (const event of events) {
      if (event.code === "table-enter" || event.code === "wager-placed") continue;
      expect(event.code.startsWith(event.tableId === "temerosa-old-maid" ? "old-maid"
        : event.tableId === "temerosa-match-pairs" ? "pairs"
          : event.tableId === "temerosa-slot" ? "slot" : "poker")).toBe(true);
    }
  });
});

function firstPlayingSecond(): number {
  const dayStart = contract.epochUtcDay * 86_400;
  for (let second = dayStart; second < dayStart + 86_400; second += 10) {
    const clock = fixedClock(second);
    if (casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, contract).some((presence) => presence.phase === "playing")) return second;
  }
  throw new Error("no_playing_presence");
}

function fixedClock(second: number): CasinoPresentationClock {
  return { utcSecond: () => second, utcMinute: () => Math.floor(second / 60) };
}
