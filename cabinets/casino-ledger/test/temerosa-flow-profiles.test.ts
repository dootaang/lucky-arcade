import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TEMEROSA_LEGACY_NPC_SUCCESSORS,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  buildTemerosaFlowProfileSet,
  type TemerosaFlowRosterRecord,
} from "../src/index.ts";

const rosterPath=fileURLToPath(new URL("../../../apps/content-cli/src/temerosa-series-npc-roster.generated.json",import.meta.url));

describe("Temerosa flow profile builder",()=>{
  it("supports the committed series-persona rule without minting legacy balances",async()=>{
    const records=await readRecords();
    const result=buildTemerosaFlowProfileSet({records,identityPolicy:"series-persona",legacyProfiles:TEMEROSA_NPC_GAMBLING_PROFILES,legacySuccessors:TEMEROSA_LEGACY_NPC_SUCCESSORS});
    expect(result.profiles).toHaveLength(115);
    expect(result.profiles.some((profile)=>profile.id.includes(":wares"))).toBe(false);
    expect(result.profiles.filter((profile)=>profile.openingBalance>0)).toHaveLength(34);
    expect(result.profiles.reduce((sum,profile)=>sum+profile.openingBalance,0)).toBe(TEMEROSA_NPC_GAMBLING_PROFILES.reduce((sum,profile)=>sum+profile.openingBalance,0));
  });

  it("can alternatively collapse related appearances behind one canonical wallet",async()=>{
    const records=await readRecords();
    const result=buildTemerosaFlowProfileSet({records,identityPolicy:"canonical-person",legacyProfiles:TEMEROSA_NPC_GAMBLING_PROFILES,legacySuccessors:TEMEROSA_LEGACY_NPC_SUCCESSORS});
    expect(result.profiles.length).toBeLessThan(115);
    expect(result.sourceRecordIds["temerosa:npc:pale"]).toEqual(expect.arrayContaining(["temerosa:overture:pale","temerosa:root2:pale","temerosa:finale:pale"]));
    expect(new Set(result.profiles.map((profile)=>profile.id)).size).toBe(result.profiles.length);
  });
});

async function readRecords():Promise<readonly TemerosaFlowRosterRecord[]>{const inventory=JSON.parse(await readFile(rosterPath,"utf8")) as {records:readonly TemerosaFlowRosterRecord[]};return inventory.records;}
