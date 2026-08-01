import { describe, expect, it } from "vitest";
import { TEMEROSA_FLOW_NPC_LEDGER_CONTRACT, TEMEROSA_SERIES_RUNTIME_SOURCE } from "../temerosa-flow-contract.ts";
import { casinoEconomyHeadline, casinoLedgerEmotionForProfit, isPublicCasinoLedgerIdentity, splitCasinoQualifiedName } from "./casino-ledger-panel.tsx";

describe("casino qualified names",()=>{
  it("splits the final qualified-name separator",()=>{
    expect(splitCasinoQualifiedName("라일라 · Bestiaization")).toEqual({name:"라일라",series:"Bestiaization"});
  });

  it("keeps an unqualified name intact",()=>{
    expect(splitCasinoQualifiedName("나")).toEqual({name:"나"});
  });

  it("keeps earlier separators inside the name",()=>{
    expect(splitCasinoQualifiedName("보존 · 정체 · Finale")).toEqual({name:"보존 · 정체",series:"Finale"});
  });

  it.each([
    ["라일라 · Overture", "Overture"],
    ["라일라 · √2", "√2"],
    ["라일라 · Bestiaization", "Bestiaization"],
  ] as const)("keeps the canonical series visible for %s",(qualifiedName,series)=>{
    expect(splitCasinoQualifiedName(qualifiedName)).toEqual({name:"라일라",series});
  });
});

describe("casino portrait emotion",()=>{
  it.each([
    [1,"pleased"],
    [0,"neutral"],
    [-1,"tense"],
    [-99,"tense"],
    [-100,"despair"],
  ] as const)("maps period profit %s to %s",(profit,emotion)=>{
    expect(casinoLedgerEmotionForProfit(profit)).toBe(emotion);
  });
});

describe("casino ledger public identities",()=>{
  it("excludes the house and every series-specific Wares identity",()=>{
    expect(isPublicCasinoLedgerIdentity("house:temerosa")).toBe(false);
    expect(isPublicCasinoLedgerIdentity("wares")).toBe(false);
    expect(isPublicCasinoLedgerIdentity("temerosa:overture:wares")).toBe(false);
    expect(isPublicCasinoLedgerIdentity("temerosa:finale:wares")).toBe(false);
  });

  it("keeps same-person NPCs from different series distinct",()=>{
    expect(isPublicCasinoLedgerIdentity("temerosa:overture:pale")).toBe(true);
    expect(isPublicCasinoLedgerIdentity("temerosa:finale:pale")).toBe(true);
  });

  it("keeps all 102 selected 1.2 contract profiles public",()=>{
    // 99 four-series runtime identities + 3 preserved legacy identities.
    expect(TEMEROSA_SERIES_RUNTIME_SOURCE.ledgerProfiles).toBe(99);
    expect(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.profiles).toHaveLength(102);
    expect(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.profiles.every((profile)=>isPublicCasinoLedgerIdentity(profile.id))).toBe(true);
  });

  it("prioritizes actual casino supply input in the compact economy headline",()=>{
    expect(casinoEconomyHeadline(12_345)).toBe("오늘 카지노 투입 +12,345 P");
    expect(casinoEconomyHeadline(12_345)).not.toContain("본업");
  });
});
