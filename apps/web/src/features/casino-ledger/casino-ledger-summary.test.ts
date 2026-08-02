import { describe, expect, it } from "vitest";
import type { CasinoLedgerSourceId, NpcActivity, NpcGamblingProfile, NpcRoundSettlement, NpcStake } from "@lucky-arcade/casino-ledger";
import { summarizeCasinoLedgerActivities } from "./casino-ledger-summary.ts";

describe("casino ledger activity summary", () => {
  it("aggregates profits and wagers in one pass without mixing income or unknown identities", () => {
    const profiles = [profile("a"), profile("b")];
    const activities = [
      activity("a", 100, "temerosa-old-maid", 10, 50),
      activity("a", 110, "npc-income", 500, 0),
      activity("b", 120, "temerosa-high-low", -20, 10),
      activity("outsider", 130, "temerosa-high-low", 999, 200),
    ];
    const journalSettlements = [settlement("a", 140, 7), settlement("b", 50, 99)];

    const result = summarizeCasinoLedgerActivities({
      profiles,
      activities,
      journalSettlements,
      carriedProfits: [{ a: 3, b: -2, outsider: 100 }],
      periodStartSecond: 90,
      todayStartSecond: 115,
    });

    expect(result.profits).toEqual({ a: 20, b: -22 });
    expect(result.wageredToday).toEqual({ a: 0, b: 10 });
  });
});

function profile(id: string): NpcGamblingProfile {
  return { id, name: id, openingBalance: 100, target: 100, riskAppetite: 0.5, discipline: 0.5, lossChasing: 0.5, winPressing: 0.5, stopLossRatio: 0.5, takeProfitRatio: 0.5, maxExposureRatio: 0.5, incomeBand: "middle", payCycleDays: 7, paydayOffset: 0, skills: { oldMaid: 0.5, matchPairsMemory: 0.5, pokerRead: 0.5, pokerBluff: 0.5, highLowJudgment: 0.5 }, sessionsPerDay: { min: 1, max: 1 }, tables: [{ tableId: "temerosa-high-low", weight: 1 }], activeHours: [{ startMinute: 0, endMinute: 1_440, weight: 1 }] };
}

function activity(npcId: string, utcSecond: number, tableId: CasinoLedgerSourceId, delta: number, stake: NpcStake): NpcActivity {
  return { npcId, utcSecond, utcMinute: Math.floor(utcSecond / 60), session: { minuteOfDay: 0, secondOfDay: 0, tableId, stake, reservedAmount: stake, creditAmount: stake + delta, delta, matchId: `${npcId}:${utcSecond}`, visitId: `${npcId}:visit`, participantIds: [npcId], resultKind: "test", termsVersion: "test/0.1" } };
}

function settlement(npcId: string, utcSecond: number, delta: number): NpcRoundSettlement {
  return { roundId: `${npcId}:${utcSecond}`, matchId: `${npcId}:${utcSecond}`, visitId: `${npcId}:visit`, participantIds: [npcId], npcId, tableId: "temerosa-high-low", stake: 10, reservedAmount: 20, creditAmount: 20 + delta, delta, utcSecond, resultKind: "test", termsVersion: "test/0.1" };
}
