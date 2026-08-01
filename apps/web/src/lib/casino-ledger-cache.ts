import {
  completedDayBalances,
  casinoDaySessions,
  casinoKstDayAtUtcMinute,
  casinoSecondOfKstDayAtUtcSecond,
  type CasinoClock,
  type NpcLedgerContract,
} from "@lucky-arcade/casino-ledger";

export interface NpcLedgerCheckpoint {
  contract: NpcLedgerContract["version"];
  /** Optional only at the write boundary; persisted checkpoints always contain it. */
  contractKey?: string;
  dayIndex: number;
  balances: Readonly<Record<string, number>>;
}

export const PERSONAL_CASINO_WORLDLINE_REVISION="personal-casino-worldline/2.0" as const;

export interface CasinoWorldlineCheckpointSnapshot {
  dayIndex:number;
  npcBalances:Readonly<Record<string,number>>;
  houseBalance:number;
  houseGamingProfit:number;
  houseOperatingExpenses:number;
  houseCurtailedOperatingExpenses:number;
  npcExternalReserves:Readonly<Record<string,number>>;
}

export interface CasinoWorldlineCheckpoint extends CasinoWorldlineCheckpointSnapshot {
  contract:NpcLedgerContract["version"];
  contractKey?:string;
  worldlineRevision:string;
  /** Exact fingerprint of normalized journal entries visible through dayIndex. */
  journalKey:string;
  /** State after dayIndex - 6, used to replay at most seven visible activity days. */
  historyAnchor:CasinoWorldlineCheckpointSnapshot;
}

export interface CachedNpcBalances {
  dayIndex: number;
  balances: Readonly<Record<string, number>>;
  checkpointDayIndex: number;
}

export interface NpcRollingProfitPeriod {
  startKstDay: number;
  coveredDays: number;
  profits: Readonly<Record<string, number>>;
}

export function npcRollingProfitPeriodAtWithCheckpoint(
  clock: CasinoClock,
  contract: NpcLedgerContract,
  currentBalances: Readonly<Record<string, number>>,
  days = 7,
  storage: StorageLike | undefined = browserStorage(),
): NpcRollingProfitPeriod {
  if (!Number.isSafeInteger(days) || days < 1) throw new Error("npc_ledger_invalid_period");
  const absoluteDay = casinoKstDayAtUtcMinute(clock.utcMinute());
  const earliestHistoryDay = contract.profitHistory[0]?.kstDay ?? contract.epochKstDay;
  if (absoluteDay < earliestHistoryDay) {
    return { startKstDay: absoluteDay, coveredDays: 0, profits: zeroProfits(contract) };
  }
  const startKstDay = Math.max(earliestHistoryDay, absoluteDay - days + 1);
  const profits: Record<string, number> = Object.fromEntries(contract.profiles.map((profile) => [profile.id, 0]));
  for (const day of contract.profitHistory) {
    if (day.kstDay < startKstDay || day.kstDay >= contract.epochKstDay) continue;
    for (const profile of contract.profiles) profits[profile.id]! += day.profits[profile.id] ?? 0;
  }

  const currentStartKstDay = Math.max(startKstDay, contract.epochKstDay);
  if (currentStartKstDay <= absoluteDay) {
    const beforePeriodDay = currentStartKstDay - contract.epochKstDay - 1;
    const checkpoint = storage && beforePeriodDay >= 0 ? readLatestCheckpoint(storage, beforePeriodDay, contract) : undefined;
    const periodOpening = beforePeriodDay >= 0
      ? completedDayBalances(contract.profiles, beforePeriodDay, contract, checkpoint?.balances, checkpoint?.dayIndex ?? -1)
      : openings(contract);
    if (storage && beforePeriodDay >= 0 && checkpoint?.dayIndex !== beforePeriodDay) {
      writeCheckpoint(storage, { contract: contract.version, dayIndex: beforePeriodDay, balances: periodOpening }, contract);
    }
    for (const profile of contract.profiles) profits[profile.id]! += currentBalances[profile.id]! - periodOpening[profile.id]!;
  }
  return Object.freeze({ startKstDay, coveredDays: absoluteDay - startKstDay + 1, profits: Object.freeze(profits) });
}

export function npcRollingProfitsAtWithCheckpoint(
  clock: CasinoClock,
  contract: NpcLedgerContract,
  currentBalances: Readonly<Record<string, number>>,
  days = 7,
  storage: StorageLike | undefined = browserStorage(),
): Readonly<Record<string, number>> {
  return npcRollingProfitPeriodAtWithCheckpoint(clock, contract, currentBalances, days, storage).profits;
}

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const CHECKPOINT_CONTRACT_KEYS=new WeakMap<NpcLedgerContract,string>();

export function readLatestWorldlineCheckpoint(
  storage:StorageLike,
  maximumDayIndex:number,
  contract:NpcLedgerContract,
  journalKeyAtDay:(dayIndex:number)=>string,
):CasinoWorldlineCheckpoint|undefined{
  const prefix=worldlineCheckpointPrefix(contract);
  let latest:CasinoWorldlineCheckpoint|undefined;
  for(const key of worldlineKeys(storage)){
    if(!key.startsWith(prefix))continue;
    const keyDay=checkpointDayFromKey(key);
    const parsed=safeParse(storage,key);
    if(!isWorldlineCheckpoint(parsed,keyDay,maximumDayIndex,contract,journalKeyAtDay)){
      safeRemove(storage,key);
      continue;
    }
    if(!latest||parsed.dayIndex>latest.dayIndex)latest=parsed;
  }
  return latest;
}

export function writeWorldlineCheckpoint(
  storage:StorageLike,
  checkpoint:CasinoWorldlineCheckpoint,
  contract:NpcLedgerContract,
):void{
  const persisted=Object.freeze({...checkpoint,contract:contract.version,contractKey:checkpointContractKey(contract),worldlineRevision:PERSONAL_CASINO_WORLDLINE_REVISION});
  if(!isWorldlineCheckpoint(persisted,persisted.dayIndex,persisted.dayIndex,contract,()=>persisted.journalKey))return;
  try{
    const prefix=worldlineCheckpointPrefix(contract);
    storage.setItem(`${prefix}${persisted.dayIndex}`,JSON.stringify(persisted));
    const keys=worldlineKeys(storage).filter((key)=>key.startsWith(prefix))
      .map((key)=>({key,day:checkpointDayFromKey(key)})).filter((entry)=>Number.isSafeInteger(entry.day))
      .sort((left,right)=>right.day-left.day);
    for(const stale of keys.slice(9))storage.removeItem(stale.key);
  }catch{
    // A checkpoint is an optional derived cache. Storage failure cannot block play.
  }
}

export function npcBalancesAtWithCheckpoint(
  clock: CasinoClock,
  contract: NpcLedgerContract,
  storage: StorageLike | undefined = browserStorage(),
): CachedNpcBalances {
  const utcMinute = clock.utcMinute();
  if (!Number.isSafeInteger(utcMinute)) throw new Error("npc_ledger_invalid_clock");
  const absoluteDay = casinoKstDayAtUtcMinute(utcMinute);
  const rawDayIndex = absoluteDay - contract.epochKstDay;
  if (rawDayIndex < 0) {
    return { dayIndex: 0, balances: openings(contract), checkpointDayIndex: -1 };
  }

  const dayIndex = rawDayIndex;
  const completedDayIndex = dayIndex - 1;
  const checkpoint = storage ? readLatestCheckpoint(storage, completedDayIndex, contract) : undefined;
  const completed = completedDayIndex >= 0
    ? completedDayBalances(contract.profiles, completedDayIndex, contract, checkpoint?.balances, checkpoint?.dayIndex ?? -1)
    : openings(contract);
  if (storage && completedDayIndex >= 0 && checkpoint?.dayIndex !== completedDayIndex) {
    writeCheckpoint(storage, { contract: contract.version, dayIndex: completedDayIndex, balances: completed }, contract);
  }

  const exactSecond = (clock as CasinoClock & { utcSecond?: () => number }).utcSecond?.();
  const secondOfDay = casinoSecondOfKstDayAtUtcSecond(exactSecond ?? utcMinute * 60 + 59);
  const daySessions = casinoDaySessions(contract.profiles, dayIndex, completed, contract);
  const balances: Record<string, number> = {};
  for (const profile of contract.profiles) {
    const elapsed = (daySessions[profile.id] ?? [])
      .filter((session) => session.secondOfDay <= secondOfDay)
      .reduce((sum, session) => sum + session.delta, 0);
    balances[profile.id] = completed[profile.id]! + elapsed;
  }
  return { dayIndex, balances: Object.freeze(balances), checkpointDayIndex: completedDayIndex };
}

export function readLatestCheckpoint(
  storage: StorageLike,
  maximumDayIndex: number,
  contract: NpcLedgerContract,
): NpcLedgerCheckpoint | undefined {
  const prefix=checkpointPrefix(contract);
  let latest: NpcLedgerCheckpoint | undefined;
  for (const key of ledgerKeys(storage)) {
    const keyDay = checkpointDayFromKey(key);
    const parsed = safeParse(storage, key);
    if (!key.startsWith(prefix) || !isCheckpoint(parsed, keyDay, maximumDayIndex, contract)) {
      safeRemove(storage, key);
      continue;
    }
    if (!latest || parsed.dayIndex > latest.dayIndex) latest = parsed;
  }
  return latest;
}

export function writeCheckpoint(storage: StorageLike, checkpoint: NpcLedgerCheckpoint, contract: NpcLedgerContract): void {
  const persisted=Object.freeze({...checkpoint,contract:contract.version,contractKey:checkpointContractKey(contract)});
  if (!isCheckpoint(persisted, persisted.dayIndex, persisted.dayIndex, contract)) return;
  try {
    const prefix=checkpointPrefix(contract);
    storage.setItem(`${prefix}${persisted.dayIndex}`, JSON.stringify(persisted));
    const keys = ledgerKeys(storage).filter((key)=>key.startsWith(prefix))
      .map((key) => ({ key, day: Number(key.slice(prefix.length)) }))
      .filter((entry) => Number.isSafeInteger(entry.day))
      .sort((left, right) => right.day - left.day);
    for (const stale of keys.slice(9)) storage.removeItem(stale.key);
  } catch {
    // A checkpoint is optional. Quota and privacy failures must not block the floor.
  }
}

function isCheckpoint(value: unknown, keyDay: number, maximumDayIndex: number, contract: NpcLedgerContract): value is NpcLedgerCheckpoint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NpcLedgerCheckpoint>;
  if (candidate.contract !== contract.version || candidate.contractKey !== checkpointContractKey(contract) || !Number.isSafeInteger(candidate.dayIndex) || candidate.dayIndex !== keyDay || candidate.dayIndex! < 0 || candidate.dayIndex! > maximumDayIndex) return false;
  if (!candidate.balances || typeof candidate.balances !== "object") return false;
  const ids = Object.keys(candidate.balances).sort();
  const expected = contract.profiles.map((profile) => profile.id).sort();
  if (ids.length !== expected.length || ids.some((id, index) => id !== expected[index])) return false;
  return contract.profiles.every((profile) => {
    const balance = candidate.balances![profile.id];
    return Number.isSafeInteger(balance) && balance! >= 0 && balance! <= 1_000_000_000;
  });
}

function isWorldlineCheckpoint(
  value:unknown,
  keyDay:number,
  maximumDayIndex:number,
  contract:NpcLedgerContract,
  journalKeyAtDay:(dayIndex:number)=>string,
):value is CasinoWorldlineCheckpoint{
  if(!value||typeof value!=="object")return false;
  const candidate=value as Partial<CasinoWorldlineCheckpoint>;
  if(candidate.contract!==contract.version||candidate.contractKey!==checkpointContractKey(contract)||candidate.worldlineRevision!==PERSONAL_CASINO_WORLDLINE_REVISION)return false;
  if(!Number.isSafeInteger(candidate.dayIndex)||candidate.dayIndex!==keyDay||candidate.dayIndex!<0||candidate.dayIndex!>maximumDayIndex)return false;
  if(typeof candidate.journalKey!=="string"||candidate.journalKey!==journalKeyAtDay(candidate.dayIndex!))return false;
  const anchor=candidate.historyAnchor;
  if(!isWorldlineSnapshot(candidate,contract))return false;
  if(!anchor||!isWorldlineSnapshot(anchor,contract)||anchor.dayIndex!==Math.max(-1,candidate.dayIndex!-6))return false;
  return true;
}

function isWorldlineSnapshot(value:Partial<CasinoWorldlineCheckpointSnapshot>,contract:NpcLedgerContract):value is CasinoWorldlineCheckpointSnapshot{
  if(!Number.isSafeInteger(value.dayIndex)||value.dayIndex! < -1)return false;
  if(!isBalanceRecord(value.npcBalances,contract.profiles.map((profile)=>profile.id),false))return false;
  if(!isBalanceRecord(value.npcExternalReserves,(contract.externalIncomeProfiles??[]).map((profile)=>profile.npcId),false))return false;
  for(const amount of [value.houseBalance,value.houseGamingProfit,value.houseOperatingExpenses,value.houseCurtailedOperatingExpenses]){
    if(!Number.isSafeInteger(amount)||Math.abs(amount!)>1_000_000_000)return false;
  }
  return value.houseBalance!>=0&&value.houseOperatingExpenses!>=0&&value.houseCurtailedOperatingExpenses!>=0;
}

function isBalanceRecord(value:unknown,expectedIds:readonly string[],allowNegative:boolean):value is Readonly<Record<string,number>>{
  if(!value||typeof value!=="object")return false;
  const record=value as Readonly<Record<string,unknown>>;
  const ids=Object.keys(record).sort(),expected=[...expectedIds].sort();
  if(ids.length!==expected.length||ids.some((id,index)=>id!==expected[index]))return false;
  return expected.every((id)=>Number.isSafeInteger(record[id])&&Math.abs(record[id] as number)<=1_000_000_000&&(allowNegative||(record[id] as number)>=0));
}

function openings(contract: NpcLedgerContract): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(contract.profiles.map((profile) => [profile.id, profile.openingBalance])));
}

function zeroProfits(contract: NpcLedgerContract): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(contract.profiles.map((profile) => [profile.id, 0])));
}

function ledgerKeys(storage: StorageLike): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("npc-ledger/") && key.includes(":checkpoint:")) keys.push(key);
    }
  } catch { /* optional cache unavailable */ }
  return keys;
}

function worldlineKeys(storage:StorageLike):string[]{
  const keys:string[]=[];
  try{
    for(let index=0;index<storage.length;index+=1){
      const key=storage.key(index);
      if(key?.startsWith("npc-ledger/")&&key.includes(":worldline-checkpoint:"))keys.push(key);
    }
  }catch{/* optional cache unavailable */}
  return keys;
}

function checkpointPrefix(contract:NpcLedgerContract):string{return `${contract.version}:checkpoint:`;}
function worldlineCheckpointPrefix(contract:NpcLedgerContract):string{return `${contract.version}:worldline-checkpoint:`;}
function checkpointDayFromKey(key:string):number{
  const marker=key.includes(":worldline-checkpoint:")?":worldline-checkpoint:":":checkpoint:";
  return Number(key.slice(key.lastIndexOf(marker)+marker.length));
}
function checkpointContractKey(contract:NpcLedgerContract):string{
  const cached=CHECKPOINT_CONTRACT_KEYS.get(contract);if(cached)return cached;
  const source=JSON.stringify(contractCheckpointIdentity(contract));
  const key=`${contract.version}|${contract.seedVersion}|${contract.epochKstDay}|${stableFingerprint(source)}`;
  CHECKPOINT_CONTRACT_KEYS.set(contract,key);return key;
}

function contractCheckpointIdentity(contract:NpcLedgerContract):unknown{return{
  version:contract.version,seedVersion:contract.seedVersion,epochKstDay:contract.epochKstDay,houseOpeningBalance:contract.houseOpeningBalance??null,
  profiles:contract.profiles,externalIncomeProfiles:contract.externalIncomeProfiles??[],behaviors:contract.behaviors??[],
  houseOperatingPolicy:contract.houseOperatingPolicy??null,profitHistory:contract.profitHistory,
  predecessor:contract.predecessor?{profiles:contract.predecessor.profiles,contract:contractCheckpointIdentity(contract.predecessor.contract)}:null,
};}

function stableFingerprint(source:string):string{
  let left=0x811c9dc5,right=0x9e3779b9;
  for(let index=0;index<source.length;index+=1){const code=source.charCodeAt(index);left=Math.imul(left^code,0x01000193);right=Math.imul(right+code+index,0x85ebca6b);}
  return `${source.length.toString(36)}-${(left>>>0).toString(36)}-${(right>>>0).toString(36)}`;
}

function safeParse(storage: StorageLike, key: string): unknown {
  try {
    const value = storage.getItem(key);
    return value === null ? undefined : JSON.parse(value);
  } catch { return undefined; }
}

function safeRemove(storage: StorageLike, key: string): void {
  try { storage.removeItem(key); } catch { /* optional cache unavailable */ }
}

export function browserCasinoStorage(): StorageLike | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

function browserStorage():StorageLike|undefined{return browserCasinoStorage();}
