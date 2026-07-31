import { XorShift32 } from "@lucky-arcade/engine";
import type {
  CasinoNpcBehavior,
  NpcActiveWindow,
  NpcExternalIncomeProfile,
  NpcGamblingProfile,
  NpcTableWeight,
} from "./contracts.ts";
import { NPC_INCOME_AMOUNTS } from "./economy.ts";

export type TemerosaNpcIdentityPolicy = "series-persona" | "canonical-person";

export interface TemerosaFlowRosterRecord {
  id: string;
  series: "overture" | "root2" | "bestiaization" | "finale";
  sourcePersonaKey: string;
  canonicalPersonKey?: string;
  displayName: string;
  qualifiedName: string;
  role: "gambler" | "house" | "dealer";
  status: "confirmed" | "needs-confirmation";
  loreEvidence: readonly Readonly<{ key: string; contentSha256: string }>[];
}

export interface TemerosaFlowProfileSet {
  identityPolicy: TemerosaNpcIdentityPolicy;
  profiles: readonly NpcGamblingProfile[];
  externalIncomeProfiles: readonly NpcExternalIncomeProfile[];
  behaviors: readonly CasinoNpcBehavior[];
  sourceRecordIds: Readonly<Record<string, readonly string[]>>;
}

export function buildTemerosaFlowProfileSet(input: {
  records: readonly TemerosaFlowRosterRecord[];
  identityPolicy: TemerosaNpcIdentityPolicy;
  legacyProfiles?: readonly NpcGamblingProfile[];
  legacySuccessors?: Readonly<Record<string, string>>;
}): TemerosaFlowProfileSet {
  const legacyProfiles: readonly NpcGamblingProfile[] = input.legacyProfiles ?? Object.freeze([]);
  const legacySuccessors: Readonly<Record<string,string>> = input.legacySuccessors ?? Object.freeze({});
  const legacyBySuccessor = new Map(Object.entries(legacySuccessors).map(([legacyId, successor]) => [successor, legacyProfiles.find((profile) => profile.id === legacyId)]));
  const eligible = input.records.filter((record) => record.role === "gambler");
  const groups = groupRecords(eligible, input.identityPolicy);
  const profiles: NpcGamblingProfile[] = [];
  const incomes: NpcExternalIncomeProfile[] = [];
  const behaviors: CasinoNpcBehavior[] = [];
  const sourceRecordIds: Record<string,readonly string[]> = {};

  for (const [npcId, records] of groups) {
    const representative = chooseRepresentative(records, legacyBySuccessor);
    const legacy = records.map((record) => legacyBySuccessor.get(record.id)).find((profile): profile is NpcGamblingProfile => Boolean(profile));
    const profile = createGamblingProfile(npcId, representative, legacy);
    profiles.push(profile);
    incomes.push(createIncomeProfile(profile, records, legacy));
    behaviors.push(createBehavior(profile));
    sourceRecordIds[npcId] = Object.freeze(records.map((record) => record.id).toSorted(compareText));
  }

  for (const [legacyId, successor] of Object.entries(legacySuccessors)) {
    if (eligible.some((record) => record.id === successor)) continue;
    const legacy = legacyProfiles.find((profile) => profile.id === legacyId);
    if (!legacy || profiles.some((profile) => profile.id === successor)) continue;
    const guest = createGuestProfile(successor, legacy);
    profiles.push(guest);
    incomes.push(createIncomeProfile(guest, Object.freeze([]), legacy));
    behaviors.push(createBehavior(guest));
    sourceRecordIds[successor] = Object.freeze([]);
  }

  const ordered = profiles.map((profile, index) => ({ profile, income: incomes[index]!, behavior: behaviors[index]! }))
    .toSorted((left, right) => compareText(left.profile.id, right.profile.id));
  assertGeneratedProfiles(ordered);
  return Object.freeze({
    identityPolicy: input.identityPolicy,
    profiles: Object.freeze(ordered.map((entry) => entry.profile)),
    externalIncomeProfiles: Object.freeze(ordered.map((entry) => entry.income)),
    behaviors: Object.freeze(ordered.map((entry) => entry.behavior)),
    sourceRecordIds: Object.freeze(Object.fromEntries(Object.entries(sourceRecordIds).toSorted(([left],[right])=>compareText(left,right)))),
  });
}

function groupRecords(records: readonly TemerosaFlowRosterRecord[], policy: TemerosaNpcIdentityPolicy): Map<string,TemerosaFlowRosterRecord[]> {
  const groups = new Map<string,TemerosaFlowRosterRecord[]>();
  for (const record of records) {
    const npcId = policy === "series-persona" ? record.id : `temerosa:npc:${record.canonicalPersonKey ?? record.sourcePersonaKey}`;
    groups.set(npcId, [...(groups.get(npcId) ?? []), record]);
  }
  return new Map([...groups].toSorted(([left],[right])=>compareText(left,right)));
}

function chooseRepresentative(records: readonly TemerosaFlowRosterRecord[], legacyBySuccessor: ReadonlyMap<string,NpcGamblingProfile|undefined>): TemerosaFlowRosterRecord {
  return records.find((record) => legacyBySuccessor.has(record.id)) ?? records.toSorted((left,right)=>seriesPriority(right.series)-seriesPriority(left.series)||compareText(left.id,right.id))[0]!;
}

function createGamblingProfile(npcId:string, record:TemerosaFlowRosterRecord, legacy?:NpcGamblingProfile):NpcGamblingProfile {
  if (legacy) return Object.freeze({ ...legacy, id:npcId, name:record.qualifiedName });
  const rng=new XorShift32(`temerosa-flow-profile/1.0:${npcId}`);
  const risk=decimal(rng,.24,.68),discipline=decimal(rng,.36,.88);
  const tables=createTableWeights(rng);
  return Object.freeze({
    id:npcId,name:record.qualifiedName,openingBalance:0,target:0,
    riskAppetite:risk,discipline,
    lossChasing:decimal(rng,.18,.72),winPressing:decimal(rng,.20,.76),
    stopLossRatio:decimal(rng,.36,.68),takeProfitRatio:decimal(rng,.38,.76),maxExposureRatio:decimal(rng,.16,.36),
    incomeBand:"middle",payCycleDays:7,paydayOffset:rng.nextUint32()%7,
    skills:Object.freeze({oldMaid:decimal(rng,.32,.82),matchPairsMemory:decimal(rng,.32,.82),pokerRead:decimal(rng,.32,.82),pokerBluff:decimal(rng,.32,.82),highLowJudgment:decimal(rng,.32,.82)}),
    sessionsPerDay:Object.freeze({min:3,max:7}),tables,activeHours:createActiveHours(rng),
  });
}

function createGuestProfile(npcId:string,legacy:NpcGamblingProfile):NpcGamblingProfile{return Object.freeze({...legacy,id:npcId});}

function createIncomeProfile(profile:NpcGamblingProfile,records:readonly TemerosaFlowRosterRecord[],legacy?:NpcGamblingProfile):NpcExternalIncomeProfile {
  const expected=legacy?Math.max(1,Math.round(NPC_INCOME_AMOUNTS[legacy.incomeBand]/legacy.payCycleDays)):70+(new XorShift32(`temerosa-flow-income/1.0:${profile.id}`).nextUint32()%61);
  const dailyIncomeRange=Object.freeze([expected*4,expected*6] as const);
  const evidenceRefs=Object.freeze(records.flatMap((record)=>record.loreEvidence.map((evidence)=>`${record.series}:${evidence.key}:${evidence.contentSha256}`)).toSorted(compareText));
  return Object.freeze({
    npcId:profile.id,sourceLabel:"개인 활동 정산",evidenceRefs,dailyIncomeRange,
    casinoBudgetRateBps:Object.freeze([1_600,2_400] as const),openingExternalReserve:0,
    settlementWindow:Object.freeze([6*60,23*60+30] as const),
  });
}

function createBehavior(profile:NpcGamblingProfile):CasinoNpcBehavior{return Object.freeze({
  npcId:profile.id,riskAppetite:profile.riskAppetite,stakeAggression:profile.riskAppetite,lossChasing:profile.lossChasing,
  stopLossDiscipline:profile.discipline,takeProfitDiscipline:profile.discipline,
  visitsPerDay:Object.freeze({min:3,max:7}),roundsPerVisit:Object.freeze({min:4,max:12}),
  skills:Object.freeze(Object.fromEntries(profile.tables.map((table)=>[table.tableId,skillForTable(profile,table.tableId)]))),preferredTables:profile.tables,
});}

function createTableWeights(rng:XorShift32):readonly NpcTableWeight[]{
  const tables=["temerosa-old-maid","temerosa-match-pairs","temerosa-slot","indian-poker","temerosa-high-low","temerosa-five-card-draw"] as const;
  return Object.freeze(tables.map((tableId)=>Object.freeze({tableId,weight:(tableId==="temerosa-slot"||tableId==="temerosa-high-low"?1:tableId==="temerosa-old-maid"?3:8)+rng.nextUint32()%3})));
}
function createActiveHours(rng:XorShift32):readonly NpcActiveWindow[]{const start=(rng.nextUint32()%3)*480;return Object.freeze([{startMinute:start,endMinute:start+480,weight:1}]);}
function skillForTable(profile:NpcGamblingProfile,tableId:NpcTableWeight["tableId"]):number{if(tableId==="temerosa-old-maid")return profile.skills.oldMaid;if(tableId==="temerosa-match-pairs")return profile.skills.matchPairsMemory;if(tableId==="temerosa-high-low")return profile.skills.highLowJudgment;return (profile.skills.pokerRead+profile.skills.pokerBluff)/2;}
function decimal(rng:XorShift32,min:number,max:number):number{return Number((min+rng.next()*(max-min)).toFixed(2));}
function seriesPriority(series:TemerosaFlowRosterRecord["series"]):number{return series==="finale"?4:series==="bestiaization"?3:series==="root2"?2:1;}
function assertGeneratedProfiles(entries:readonly {profile:NpcGamblingProfile;income:NpcExternalIncomeProfile;behavior:CasinoNpcBehavior}[]):void{const ids=new Set<string>();for(const entry of entries){if(ids.has(entry.profile.id)||entry.profile.id!==entry.income.npcId||entry.profile.id!==entry.behavior.npcId)throw new Error(`temerosa_flow_profile_invalid:${entry.profile.id}`);ids.add(entry.profile.id);}}
function compareText(left:string,right:string):number{return left<right?-1:left>right?1:0;}
