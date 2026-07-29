import { createFreePlayRewardTransaction, reserveCasinoEscrow, settleCasinoEscrow } from "@lucky-arcade/casino-ledger";
import { describe, expect, it } from "vitest";
import { casinoJournalSettlements } from "./casino-journal.ts";

describe("personal casino journal presentation", () => {
  it("turns a two-sided escrow into equal and opposite player/NPC receipts", () => {
    const reservation = reserveCasinoEscrow({
      wagerId: "heads-up",
      idempotencyKey: "heads-up:reserve",
      occurredAtCasinoSecond: 1_000,
      reservations: { "player:local": 40, "npc:lyla": 60 },
      matchId: "heads-up",
      tableId: "temerosa-match-pairs",
      termsVersion: "test/1.0",
      stake: 10,
    });
    const settlement = settleCasinoEscrow({
      reservation,
      idempotencyKey: "heads-up:settle",
      occurredAtCasinoSecond: 1_020,
      credits: { "player:local": 100 },
      resultKey: "player-win",
    });
    const entries = casinoJournalSettlements([reservation.transaction, settlement]);
    expect(entries.map((entry) => [entry.npcId, entry.delta])).toEqual([["lyla", -60], ["player:local", 60]]);
    expect(entries.every((entry) => entry.participantIds.join("|") === "lyla|player:local")).toBe(true);
    expect(entries.reduce((sum, entry) => sum + entry.delta, 0)).toBe(0);
  });

  it("shows the player's unique free old-maid income as an external reward", () => {
    const reward = createFreePlayRewardTransaction({ transactionId: "free:1", occurredAtCasinoSecond: 2_000, amount: 30, matchId: "old-maid:1" });
    expect(casinoJournalSettlements([reward])).toMatchObject([{ npcId: "player:local", tableId: "temerosa-old-maid", delta: 30, resultKind: "free-play-reward" }]);
  });
});
