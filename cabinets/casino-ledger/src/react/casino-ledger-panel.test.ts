import { describe, expect, it } from "vitest";
import { isPublicCasinoLedgerIdentity } from "./casino-ledger-panel.tsx";

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
});
