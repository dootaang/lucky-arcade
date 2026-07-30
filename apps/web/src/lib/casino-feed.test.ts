import {
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  casinoPresenceAt,
  casinoUtcSecondAtKstDay,
  type CasinoPresentationClock,
} from "@lucky-arcade/casino-ledger";
import { describe, expect, it } from "vitest";
import { latestCasinoSettlementsAt, nextCasinoArrivalAt } from "./casino-feed.ts";
import { personalCasinoWorldlineAt } from "./casino-worldline.ts";

const profiles = TEMEROSA_NPC_GAMBLING_PROFILES;
const contract = TEMEROSA_NPC_LEDGER_CONTRACT;

describe("casino activity feed", () => {
  it("retains the latest real settlement during a multi-hour schedule gap", () => {
    const now = casinoUtcSecondAtKstDay(contract.epochKstDay, 12 * 3_600 + 30 * 60);
    const clock = fixedClock(now);
    const worldline = personalCasinoWorldlineAt(profiles, clock, contract, []);
    const settlements = latestCasinoSettlementsAt(worldline.activities, [], now);
    expect(settlements.length).toBeGreaterThan(0);
    expect(settlements[0]!.utcSecond).toBeLessThan(now - 3_600);
    expect(settlements.some((entry) => entry.tableId === "temerosa-slot" || entry.tableId === "temerosa-high-low")).toBe(true);
    expect(settlements.some((entry) => entry.npcId === "house:temerosa")).toBe(false);
  });

  it("reports the next deterministic arrival while the floor is empty", () => {
    const now = casinoUtcSecondAtKstDay(contract.epochKstDay, 12 * 3_600 + 30 * 60);
    const presences = casinoPresenceAt(profiles, fixedClock(now), contract);
    expect(presences.every((presence) => presence.phase === "idle")).toBe(true);
    const next = nextCasinoArrivalAt(presences, now);
    expect(next).toBe(casinoUtcSecondAtKstDay(contract.epochKstDay, 13 * 3_600 + 31 * 60 + 58));
  });
});

function fixedClock(second: number): CasinoPresentationClock {
  return { utcSecond: () => second, utcMinute: () => Math.floor(second / 60) };
}
