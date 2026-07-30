import {
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  createCasinoTransaction,
  createCollectionPurchaseTransaction,
  casinoUtcSecondAtKstDay,
  type CasinoPresentationClock,
} from "@lucky-arcade/casino-ledger";
import { describe, expect, it } from "vitest";
import { personalCasinoWorldlineAt } from "./casino-worldline.ts";

describe("personal casino world line", () => {
  it("replays local NPC and house postings on top of the deterministic day", () => {
    const second = casinoUtcSecondAtKstDay(TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay + 1) - 1;
    const clock = fixedClock(second);
    const baseline = personalCasinoWorldlineAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, []);
    const npcTransfer = createCasinoTransaction({
      transactionId: "test:npc-transfer",
      idempotencyKey: "test:npc-transfer",
      occurredAtCasinoSecond: second,
      kind: "legacy-migration",
      postings: [{ accountId: "legacy:clearing", delta: -100 }, { accountId: "npc:lyla", delta: 100 }],
    });
    const collection = createCollectionPurchaseTransaction({ transactionId: "test:collection", occurredAtCasinoSecond: second, amount: 12, collectionId: "test" });
    const replayed = personalCasinoWorldlineAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, [npcTransfer, collection]);
    expect(replayed.npcBalances.lyla).toBe(baseline.npcBalances.lyla! + 100);
    expect(replayed.houseBalance).toBe(baseline.houseBalance + 12);
  });
});

function fixedClock(second:number):CasinoPresentationClock{return{utcSecond:()=>second,utcMinute:()=>Math.floor(second/60)};}
