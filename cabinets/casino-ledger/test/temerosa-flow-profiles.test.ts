import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TEMEROSA_LEGACY_NPC_SUCCESSORS,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  buildTemerosaFlowProfileSet,
  type TemerosaFlowAuthoredProfile,
  type TemerosaFlowRosterRecord,
} from "../src/index.ts";

const rosterPath=fileURLToPath(new URL("../../../apps/content-cli/src/temerosa-series-npc-roster.generated.json",import.meta.url));

describe("Temerosa flow profile builder",()=>{
  it("keeps the series-persona release rule without inventing new profiles",async()=>{
    const records=await readRecords();
    const result=buildTemerosaFlowProfileSet({records,identityPolicy:"series-persona",legacyProfiles:TEMEROSA_NPC_GAMBLING_PROFILES,legacySuccessors:TEMEROSA_LEGACY_NPC_SUCCESSORS});
    expect(result.identityPolicy).toBe("series-persona");
    expect(result.profiles).toHaveLength(33);
    expect(result.exclusions.every((entry)=>entry.reason==="missing-authored-profile")).toBe(true);
    expect(result.exclusions.length).toBeGreaterThan(0);
    expect(result.profiles.some((profile)=>profile.id.includes(":wares"))).toBe(false);
    expect(result.profiles.filter((profile)=>profile.openingBalance>0)).toHaveLength(33);
    expect(result.profiles.reduce((sum,profile)=>sum+profile.openingBalance,0)).toBe(TEMEROSA_NPC_GAMBLING_PROFILES.reduce((sum,profile)=>sum+profile.openingBalance,0));
    expect(result.profiles.some((profile)=>profile.id.includes(":bacikal"))).toBe(false);
    expect(result.profiles.find((profile)=>profile.id==="temerosa:guest:nemo")?.openingBalance).toBe(
      TEMEROSA_NPC_GAMBLING_PROFILES.filter((profile)=>profile.id==="nemo"||profile.id==="bacikal").reduce((sum,profile)=>sum+profile.openingBalance,0),
    );
  });

  it("can alternatively collapse related appearances behind one canonical wallet",async()=>{
    const records=await readRecords();
    const result=buildTemerosaFlowProfileSet({records,identityPolicy:"canonical-person",legacyProfiles:TEMEROSA_NPC_GAMBLING_PROFILES,legacySuccessors:TEMEROSA_LEGACY_NPC_SUCCESSORS});
    expect(result.profiles.length).toBeLessThanOrEqual(34);
    expect(result.sourceRecordIds["temerosa:npc:pale"]).toEqual(expect.arrayContaining(["temerosa:overture:pale","temerosa:root2:pale","temerosa:finale:pale"]));
    expect(new Set(result.profiles.map((profile)=>profile.id)).size).toBe(result.profiles.length);
  });

  it("keeps two series appearances in separate wallets when both have authored profiles",()=>{
    const finale=record("temerosa:finale:pale","finale","pale");
    const bestiaization=record("temerosa:bestiaization:pale","bestiaization","pale");
    const result=buildTemerosaFlowProfileSet({
      records:[finale,bestiaization],identityPolicy:"series-persona",
      profileOverrides:{
        [finale.id]:authoredProfile(.31),
        [bestiaization.id]:authoredProfile(.77),
      },
    });
    expect(result.profiles.map((profile)=>profile.id)).toEqual([bestiaization.id,finale.id]);
    expect(result.profiles.map((profile)=>profile.riskAppetite)).toEqual([.77,.31]);
    expect(result.exclusions).toEqual([]);
  });

  it("excludes a new NPC instead of generating a random personality",()=>{
    const candidate=record("temerosa:finale:unwritten","finale","unwritten");
    const result=buildTemerosaFlowProfileSet({records:[candidate],identityPolicy:"series-persona"});
    expect(result.profiles).toEqual([]);
    expect(result.exclusions).toEqual([{npcId:candidate.id,sourceRecordIds:[candidate.id],reason:"missing-authored-profile"}]);
  });
});

async function readRecords():Promise<readonly TemerosaFlowRosterRecord[]>{const inventory=JSON.parse(await readFile(rosterPath,"utf8")) as {records:readonly TemerosaFlowRosterRecord[]};return inventory.records;}
function record(id:string,series:TemerosaFlowRosterRecord["series"],canonicalPersonKey:string):TemerosaFlowRosterRecord{return{id,series,sourcePersonaKey:`${series}:${canonicalPersonKey}`,canonicalPersonKey,displayName:"페일",qualifiedName:`${series} 페일`,role:"gambler",status:"confirmed",loreEvidence:[]};}
function authoredProfile(riskAppetite:number):TemerosaFlowAuthoredProfile{
  const base=TEMEROSA_NPC_GAMBLING_PROFILES[0]!;
  return{
    gambling:{...base,riskAppetite},
    income:{sourceLabel:"개인 활동 정산",evidenceRefs:[],dailyIncomeRange:[100,100],casinoBudgetRateBps:[2_000,2_000],openingExternalReserve:0,settlementWindow:[600,600]},
    behavior:{riskAppetite,stakeAggression:riskAppetite,lossChasing:base.lossChasing,stopLossDiscipline:base.discipline,takeProfitDiscipline:base.discipline,visitsPerDay:{min:3,max:3},roundsPerVisit:{min:4,max:4},skills:{"temerosa-slot":.5},preferredTables:[{tableId:"temerosa-slot",weight:1}]},
  };
}
