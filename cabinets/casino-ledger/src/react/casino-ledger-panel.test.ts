import { describe, expect, it } from "vitest";
import { TEMEROSA_FLOW_NPC_LEDGER_CONTRACT, TEMEROSA_SERIES_RUNTIME_SOURCE } from "../temerosa-flow-contract.ts";
import { casinoEconomyHeadline, isPublicCasinoLedgerIdentity } from "./casino-ledger-panel.tsx";

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
