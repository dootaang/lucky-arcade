import { describe, expect, it } from "vitest";
import { casinoUtcSecondAtKstDay, completedDayBalances, TEMEROSA_FLOW_NPC_LEDGER_CONTRACT, TEMEROSA_NPC_LEDGER_CONTRACT, type CasinoClock, type NpcLedgerContract } from "@lucky-arcade/casino-ledger";
import { PERSONAL_CASINO_WORLDLINE_REVISION, npcBalancesAtWithCheckpoint, npcRollingProfitPeriodAtWithCheckpoint, readLatestCheckpoint, readLatestWorldlineCheckpoint, writeCheckpoint, writeWorldlineCheckpoint, type CasinoWorldlineCheckpoint, type CasinoWorldlineCheckpointSnapshot } from "./casino-ledger-cache.ts";

describe("casino ledger checkpoint adapter", () => {
  it("matches a full calculation after saving and reusing a checkpoint", () => {
    const storage = new MemoryStorage();
    const clock = fixedClock(Math.floor(casinoUtcSecondAtKstDay(TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay + 8,700*60)/60));
    const first = npcBalancesAtWithCheckpoint(clock, TEMEROSA_NPC_LEDGER_CONTRACT, storage);
    const second = npcBalancesAtWithCheckpoint(clock, TEMEROSA_NPC_LEDGER_CONTRACT, storage);
    const withoutCache = npcBalancesAtWithCheckpoint(clock, TEMEROSA_NPC_LEDGER_CONTRACT, new MemoryStorage());
    expect(second.balances).toEqual(first.balances);
    expect(second.balances).toEqual(withoutCache.balances);
  });

  it("rejects corrupt, future and foreign-contract checkpoints", () => {
    const storage = new MemoryStorage();
    storage.setItem("npc-ledger/0.3:checkpoint:99", JSON.stringify({ contract: "npc-ledger/0.3", dayIndex: 99, balances: {} }));
    storage.setItem("npc-ledger/0.3:checkpoint:2", JSON.stringify({ contract: "npc-ledger/9.9", dayIndex: 2, balances: {} }));
    writeCheckpoint(storage,{contract:TEMEROSA_NPC_LEDGER_CONTRACT.version,dayIndex:99,balances:completedDayBalances(TEMEROSA_NPC_LEDGER_CONTRACT.profiles,99,TEMEROSA_NPC_LEDGER_CONTRACT)},TEMEROSA_NPC_LEDGER_CONTRACT);
    storage.setItem("npc-ledger/1.1:checkpoint:2", JSON.stringify({ contract: "npc-ledger/1.1", contractKey:"npc-ledger/1.1|foreign-seed|0",dayIndex: 2, balances: openings(TEMEROSA_NPC_LEDGER_CONTRACT) }));
    storage.setItem("npc-ledger/1.2:checkpoint:1", JSON.stringify({ contract: "npc-ledger/1.2", dayIndex: 1, balances: {} }));
    expect(readLatestCheckpoint(storage, 5, TEMEROSA_NPC_LEDGER_CONTRACT)).toBeUndefined();
    expect(storage.length).toBe(0);
  });

  it("keeps the rolling-window checkpoints needed for seven-day profit", () => {
    const contract = TEMEROSA_NPC_LEDGER_CONTRACT;
    const storage = new MemoryStorage();
    for (const dayIndex of [1, 2, 3]) {
      writeCheckpoint(storage, { contract: contract.version, dayIndex, balances: completedDayBalances(contract.profiles, dayIndex, contract) }, contract);
    }
    expect(storage.keys().sort()).toEqual(["npc-ledger/1.1:checkpoint:1", "npc-ledger/1.1:checkpoint:2", "npc-ledger/1.1:checkpoint:3"]);
    expect(JSON.parse(storage.getItem("npc-ledger/1.1:checkpoint:3")!)).toMatchObject({contract:"npc-ledger/1.1",dayIndex:3,contractKey:expect.stringContaining("npc-ledger/1.1|npc-ledger/0.9|")});
  });

  it("recomputes the same balances from an old checkpoint or an empty cache",()=>{
    const contract=TEMEROSA_NPC_LEDGER_CONTRACT;
    const targetDay=12;
    const clock=fixedClock(Math.floor(casinoUtcSecondAtKstDay(contract.epochKstDay+targetDay,43_210)/60));
    const oldStorage=new MemoryStorage();
    writeCheckpoint(oldStorage,{contract:contract.version,dayIndex:2,balances:completedDayBalances(contract.profiles,2,contract)},contract);
    const fromOld=npcBalancesAtWithCheckpoint(clock,contract,oldStorage);
    const fromEmpty=npcBalancesAtWithCheckpoint(clock,contract,new MemoryStorage());
    const refreshed=npcBalancesAtWithCheckpoint(clock,contract,oldStorage);
    expect(fromOld.balances).toEqual(fromEmpty.balances);
    expect(refreshed).toEqual(fromOld);
  });

  it("survives cache deletion without changing the selected KST worldline",()=>{
    const contract=TEMEROSA_NPC_LEDGER_CONTRACT;
    const clock=fixedClock(Math.floor(casinoUtcSecondAtKstDay(contract.epochKstDay+9,86_399)/60));
    const storage=new MemoryStorage();
    const cached=npcBalancesAtWithCheckpoint(clock,contract,storage);
    storage.clear();
    const rebuilt=npcBalancesAtWithCheckpoint(clock,contract,storage);
    expect(rebuilt.balances).toEqual(cached.balances);
  });

  it("reports the honest covered period and includes the frozen pre-rebase close", () => {
    const contract = TEMEROSA_NPC_LEDGER_CONTRACT;
    const clock = fixedClock(Math.floor(casinoUtcSecondAtKstDay(contract.epochKstDay)/60));
    const current = npcBalancesAtWithCheckpoint(clock, contract, new MemoryStorage());
    const period = npcRollingProfitPeriodAtWithCheckpoint(clock, contract, current.balances, 7, new MemoryStorage());
    expect(period).toMatchObject({ startKstDay: contract.epochKstDay - 1, coveredDays: 2 });
    expect(period.profits.lyla).toBe(-3_865);
    expect(period.profits.pale).toBe(5_890);
  });

  it("persists a day-365 personal worldline state with its seven-day replay anchor",()=>{
    const contract=TEMEROSA_FLOW_NPC_LEDGER_CONTRACT;
    const storage=new MemoryStorage();
    const checkpoint=worldlineCheckpoint(contract,365,"journal:365");
    writeWorldlineCheckpoint(storage,checkpoint,contract);
    const restored=readLatestWorldlineCheckpoint(storage,365,contract,()=>"journal:365");
    expect(restored).toMatchObject(checkpoint);
    expect(restored?.contractKey).toEqual(expect.any(String));
    expect(restored).toMatchObject({dayIndex:365,worldlineRevision:PERSONAL_CASINO_WORLDLINE_REVISION,houseBalance:150_000,historyAnchor:{dayIndex:359}});
    expect(storage.keys()).toEqual(["npc-ledger/1.2:worldline-checkpoint:365"]);
  });

  it("rejects damaged, future, stale-revision, journal and economic-policy worldline checkpoints",()=>{
    const contract=TEMEROSA_FLOW_NPC_LEDGER_CONTRACT;
    const variants:[string,(checkpoint:CasinoWorldlineCheckpoint)=>unknown,NpcLedgerContract,(dayIndex:number)=>string,number][]= [
      ["damaged",(checkpoint)=>({...checkpoint,npcBalances:{}}),contract,()=>"journal:365",365],
      ["future",(checkpoint)=>checkpoint,contract,()=>"journal:365",364],
      ["revision",(checkpoint)=>({...checkpoint,worldlineRevision:"personal-casino-worldline/old"}),contract,()=>"journal:365",365],
      ["journal",(checkpoint)=>checkpoint,contract,()=>"journal:changed",365],
      ["policy",(checkpoint)=>checkpoint,Object.freeze({...contract,houseOperatingPolicy:Object.freeze({...contract.houseOperatingPolicy!,perHundredRoundsCost:contract.houseOperatingPolicy!.perHundredRoundsCost+1})}),()=>"journal:365",365],
    ];
    for(const [name,mutate,selected,journalKey,maximumDay] of variants){
      const storage=new MemoryStorage();
      storage.setItem("npc-ledger/1.2:worldline-checkpoint:365",JSON.stringify(mutate(worldlineCheckpoint(contract,365,"journal:365"))));
      expect(readLatestWorldlineCheckpoint(storage,maximumDay,selected,journalKey),name).toBeUndefined();
      expect(storage.length,name).toBe(0);
    }
  });
});

function fixedClock(minute: number): CasinoClock { return { utcMinute: () => minute }; }

class MemoryStorage {
  readonly #values = new Map<string, string>();
  get length(): number { return this.#values.size; }
  key(index: number): string | null { return [...this.#values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.#values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.#values.set(key, value); }
  removeItem(key: string): void { this.#values.delete(key); }
  keys(): string[] { return [...this.#values.keys()]; }
  clear():void{this.#values.clear();}
}

function openings(contract:typeof TEMEROSA_NPC_LEDGER_CONTRACT):Readonly<Record<string,number>>{return Object.fromEntries(contract.profiles.map((profile)=>[profile.id,profile.openingBalance]));}

function worldlineSnapshot(contract:NpcLedgerContract,dayIndex:number):CasinoWorldlineCheckpointSnapshot{return Object.freeze({
  dayIndex,npcBalances:Object.freeze(Object.fromEntries(contract.profiles.map((profile)=>[profile.id,profile.openingBalance]))),
  houseBalance:150_000,houseGamingProfit:12_000,houseOperatingExpenses:8_000,houseCurtailedOperatingExpenses:0,
  npcExternalReserves:Object.freeze(Object.fromEntries((contract.externalIncomeProfiles??[]).map((profile)=>[profile.npcId,profile.openingExternalReserve]))),
});}
function worldlineCheckpoint(contract:NpcLedgerContract,dayIndex:number,journalKey:string):CasinoWorldlineCheckpoint{return Object.freeze({
  ...worldlineSnapshot(contract,dayIndex),contract:contract.version,worldlineRevision:PERSONAL_CASINO_WORLDLINE_REVISION,journalKey,
  historyAnchor:worldlineSnapshot(contract,Math.max(-1,dayIndex-6)),
});}
