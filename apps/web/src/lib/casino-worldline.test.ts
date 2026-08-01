import {
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,
  TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,
  TEMEROSA_FLOW_EPOCH_KST_DAY,
  TEMEROSA_LEGACY_NPC_SUCCESSORS,
  createCasinoTransaction,
  createCollectionPurchaseTransaction,
  reserveCasinoEscrow,
  settleCasinoEscrow,
  npcAccountId,
  casinoUtcSecondAtKstDay,
  completedDayBalances,
  houseBalanceAt,
  temerosaCasinoLedgerAtUtcSecond,
  type CasinoPresentationClock,
  type NpcExternalIncomeProfile,
  type NpcGamblingProfile,
  type NpcLedgerContract,
} from "@lucky-arcade/casino-ledger";
import { describe, expect, it } from "vitest";
import { PERSONAL_CASINO_WORLDLINE_REVISION, writeWorldlineCheckpoint, type CasinoWorldlineCheckpointSnapshot } from "./casino-ledger-cache.ts";
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

  it("tracks off-casino reserves, daily top-ups, and activity-based operations", () => {
    const base = TEMEROSA_NPC_GAMBLING_PROFILES[0]!;
    const gambler: NpcGamblingProfile = Object.freeze({
      ...base,
      id: "flow-worldline",
      name: "Flow Worldline",
      openingBalance: 0,
      target: 0,
      sessionsPerDay: Object.freeze({ min: 1, max: 1 }),
      tables: Object.freeze([{ tableId: "temerosa-slot" as const, weight: 1 }]),
    });
    const income: NpcExternalIncomeProfile = Object.freeze({
      npcId: gambler.id,
      sourceLabel: "개인 활동 정산",
      evidenceRefs: Object.freeze([]),
      dailyIncomeRange: Object.freeze([100, 100] as const),
      casinoBudgetRateBps: Object.freeze([5_000, 5_000] as const),
      openingExternalReserve: 0,
      settlementWindow: Object.freeze([600, 600] as const),
    });
    const contract: NpcLedgerContract = Object.freeze({
      version: "npc-ledger/1.2",
      seedVersion: "casino-flow/1.0",
      epochKstDay: 20_667,
      profiles: Object.freeze([gambler]),
      externalIncomeProfiles: Object.freeze([income]),
      profitHistory: Object.freeze([]),
    });
    const worldline = personalCasinoWorldlineAt([gambler], fixedClock(casinoUtcSecondAtKstDay(20_668) - 1), contract, []);
    expect(worldline.npcExternalReserves[gambler.id]).toBe(50);
    expect(worldline.npcGrossIncomeToday[gambler.id]).toBe(100);
    expect(worldline.npcCasinoTopUpsToday[gambler.id]).toBe(50);
    expect(worldline.activities.some((entry) => entry.session.resultKind === "casino-top-up")).toBe(true);
    expect(worldline.houseOperatingExpenses).toBeGreaterThan(0);
  });

  it("carries the exact local predecessor branch across the flow cutover",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.epochKstDay);
    const clock=fixedClock(boundary);
    const baseline=personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,clock,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[]);
    const transaction=createCasinoTransaction({
      transactionId:"pre-cutover:pale",idempotencyKey:"pre-cutover:pale",occurredAtCasinoSecond:boundary-1,kind:"legacy-migration",
      postings:[{accountId:"legacy:clearing",delta:-100},{accountId:"npc:pale",delta:100}],
    });
    const carried=personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,clock,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[transaction]);
    expect(carried.npcBalances["temerosa:finale:pale"]).toBe(baseline.npcBalances["temerosa:finale:pale"]!+100);
  });

  it("moves 34 legacy closes into exactly 33 successors and only folds Bacikal with Nemo",()=>{
    const legacyFinalDay=TEMEROSA_FLOW_EPOCH_KST_DAY-TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay-1;
    const legacyClose=completedDayBalances(TEMEROSA_NPC_GAMBLING_PROFILES,legacyFinalDay,TEMEROSA_NPC_LEDGER_CONTRACT);
    const expected:Record<string,number>={};
    for(const [legacyId,balance] of Object.entries(legacyClose)){
      const successor=TEMEROSA_LEGACY_NPC_SUCCESSORS[legacyId];
      expect(successor,legacyId).toBeDefined();
      expected[successor!]=(expected[successor!]??0)+balance;
    }
    expect(Object.keys(legacyClose)).toHaveLength(34);
    expect(Object.keys(expected)).toHaveLength(33);
    expect(Object.entries(TEMEROSA_LEGACY_NPC_SUCCESSORS).filter(([,successor])=>successor==="temerosa:guest:nemo").map(([legacyId])=>legacyId)).toEqual(["bacikal","nemo"]);
    const flowOpenings=Object.fromEntries(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
    for(const [successor,balance] of Object.entries(expected))expect(flowOpenings[successor],successor).toBe(balance);

    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    const legacyWorldline=personalCasinoWorldlineAt(TEMEROSA_NPC_GAMBLING_PROFILES,fixedClock(boundary-1),TEMEROSA_NPC_LEDGER_CONTRACT,[]);
    const flowWorldline=personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,fixedClock(boundary-1),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[]);
    expect(legacyWorldline.houseBalance).toBe(houseBalanceAt(TEMEROSA_NPC_GAMBLING_PROFILES,fixedClock(boundary-1),TEMEROSA_NPC_LEDGER_CONTRACT).balance);
    const legacySupply=Object.values(legacyWorldline.npcBalances).reduce((sum,balance)=>sum+balance,0)+legacyWorldline.houseBalance;
    const flowSupply=Object.values(flowWorldline.npcBalances).reduce((sum,balance)=>sum+balance,0)+flowWorldline.houseBalance;
    expect(flowSupply).toBe(legacySupply);
  });

  it("preserves pre-cutover local NPC and house branches once after reload",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    const baseline=personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,fixedClock(boundary),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[]);
    const expectedDeltas:Record<string,number>={};
    const migrations=TEMEROSA_NPC_GAMBLING_PROFILES.map((profile,index)=>{
      const amount=index+1;
      const successor=TEMEROSA_LEGACY_NPC_SUCCESSORS[profile.id]!;
      expectedDeltas[successor]=(expectedDeltas[successor]??0)+amount;
      return createCasinoTransaction({
        transactionId:`local-migration:${profile.id}`,idempotencyKey:`local-migration:${profile.id}`,
        occurredAtCasinoSecond:boundary-2,kind:"legacy-migration",
        postings:[{accountId:"legacy:clearing",delta:-amount},{accountId:npcAccountId(profile.id),delta:amount}],
      });
    });
    const collection=createCollectionPurchaseTransaction({transactionId:"local-collection",occurredAtCasinoSecond:boundary-1,amount:73,collectionId:"branch-kept"});
    const restored=[...migrations,collection,...migrations,collection];
    const first=personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,fixedClock(boundary),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,restored);
    const refreshed=personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,fixedClock(boundary),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[...restored]);
    for(const [successor,delta] of Object.entries(expectedDeltas))expect(first.npcBalances[successor],successor).toBe(baseline.npcBalances[successor]!+delta);
    expect(first.houseBalance).toBe(baseline.houseBalance+73);
    expect(refreshed).toEqual(first);
    expect(restored).toHaveLength(70);
  });

  it("settles a legacy-account wager after the cutover into its successor",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    const reservation=reserveCasinoEscrow({
      wagerId:"cross-boundary-nemo",idempotencyKey:"cross-boundary-nemo:reserve",occurredAtCasinoSecond:boundary-1,
      reservations:{"house:temerosa":10,"npc:nemo":10},matchId:"cross-boundary-nemo",tableId:"temerosa-slot",termsVersion:"test/1.0",stake:10,
    });
    const settlement=settleCasinoEscrow({reservation,idempotencyKey:"cross-boundary-nemo:settle",occurredAtCasinoSecond:boundary+1,credits:{"npc:nemo":20},resultKey:"nemo-win"});
    const baseline=personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,fixedClock(boundary+1),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[]);
    const replayed=personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,fixedClock(boundary+1),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[reservation.transaction,settlement]);
    expect(replayed.npcBalances["temerosa:guest:nemo"]).toBe(baseline.npcBalances["temerosa:guest:nemo"]!+10);
    expect(replayed.houseBalance).toBe(baseline.houseBalance-10);
  });

  it("rejects conflicting restored journal identities instead of double-applying them",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    const first=createCasinoTransaction({transactionId:"conflict:a",idempotencyKey:"conflict",occurredAtCasinoSecond:boundary-1,kind:"legacy-migration",postings:[{accountId:"legacy:clearing",delta:-1},{accountId:"npc:pale",delta:1}]});
    const second=createCasinoTransaction({transactionId:"conflict:b",idempotencyKey:"conflict",occurredAtCasinoSecond:boundary-1,kind:"legacy-migration",postings:[{accountId:"legacy:clearing",delta:-2},{accountId:"npc:pale",delta:2}]});
    expect(()=>personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,fixedClock(boundary),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[first,second])).toThrow("casino_worldline_transaction_conflict:conflict");
  });

  it("restores the same worldline after visiting the future and returning",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    const storage=new MemoryStorage();
    const before=personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,fixedClock(boundary+43_210),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[],storage);
    personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,fixedClock(boundary+30*86_400),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[],storage);
    const restored=personalCasinoWorldlineAt(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,fixedClock(boundary+43_210),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,[],storage);
    expect(restored).toEqual(before);
  },60_000);

  it("reuses a valid checkpoint and rebuilds the same seven-day visible worldline after cache deletion",()=>{
    const contract=TEMEROSA_FLOW_NPC_LEDGER_CONTRACT;
    const clock=fixedClock(casinoUtcSecondAtKstDay(contract.epochKstDay+8)+43_210);
    const storage=new MemoryStorage();
    const built=personalCasinoWorldlineAt(contract.profiles,clock,contract,[],storage);
    const cached=personalCasinoWorldlineAt(contract.profiles,clock,contract,[],storage);
    expect(withoutReplayDiagnostics(cached)).toEqual(withoutReplayDiagnostics(built));
    expect(cached.checkpointDayIndex).toBe(7);
    expect(cached.replayedDayCount).toBeLessThanOrEqual(1);
    storage.clear();
    const rebuilt=personalCasinoWorldlineAt(contract.profiles,clock,contract,[],storage);
    expect(withoutReplayDiagnostics(rebuilt)).toEqual(withoutReplayDiagnostics(built));
  },120_000);

  it("cold-starts day 366 from a day-365 checkpoint without replaying day zero",()=>{
    const contract=TEMEROSA_FLOW_NPC_LEDGER_CONTRACT;
    const storage=new MemoryStorage();
    const anchor=checkpointSnapshot(contract,359);
    writeWorldlineCheckpoint(storage,{
      ...checkpointSnapshot(contract,365),contract:contract.version,worldlineRevision:PERSONAL_CASINO_WORLDLINE_REVISION,
      journalKey:"",historyAnchor:anchor,
    },contract);
    const started=performance.now();
    const worldline=personalCasinoWorldlineAt(contract.profiles,fixedClock(casinoUtcSecondAtKstDay(contract.epochKstDay+366)+43_210),contract,[],storage);
    const elapsed=performance.now()-started;
    expect(worldline).toMatchObject({checkpointDayIndex:365,replayedDayCount:7});
    expect(worldline.activities.every((activity)=>activity.utcSecond>=casinoUtcSecondAtKstDay(contract.epochKstDay+360))).toBe(true);
    expect(elapsed).toBeLessThan(30_000);
    const warm=personalCasinoWorldlineAt(contract.profiles,fixedClock(casinoUtcSecondAtKstDay(contract.epochKstDay+366)+43_211),contract,[],storage);
    expect(warm).toMatchObject({checkpointDayIndex:365,replayedDayCount:1});
  },60_000);

  it("discards damaged, future, foreign-revision and journal checkpoints then recomputes the same state",()=>{
    const contract=TEMEROSA_FLOW_NPC_LEDGER_CONTRACT;
    const clock=fixedClock(casinoUtcSecondAtKstDay(contract.epochKstDay+8)+43_210);
    const source=new MemoryStorage();
    const baseline=personalCasinoWorldlineAt(contract.profiles,clock,contract,[],source);
    const variants:[string,(storage:MemoryStorage)=>void][]= [
      ["damaged",(storage)=>storage.rewriteAll((checkpoint)=>({...checkpoint,npcBalances:{}}))],
      ["future",(storage)=>storage.setItem("npc-ledger/1.2:worldline-checkpoint:99",JSON.stringify({...JSON.parse(storage.getItem(storage.keys().at(-1)!)!),dayIndex:99}))],
      ["revision",(storage)=>storage.rewriteAll((checkpoint)=>({...checkpoint,worldlineRevision:"personal-casino-worldline/old"}))],
      ["contract",(storage)=>storage.rewriteAll((checkpoint)=>({...checkpoint,contractKey:"foreign-contract"}))],
      ["journal",(storage)=>storage.rewriteAll((checkpoint)=>({...checkpoint,journalKey:"foreign-journal"}))],
    ];
    for(const [name,corrupt] of variants){
      const storage=source.clone();corrupt(storage);
      const rebuilt=personalCasinoWorldlineAt(contract.profiles,clock,contract,[],storage);
      expect(withoutReplayDiagnostics(rebuilt),name).toEqual(withoutReplayDiagnostics(baseline));
    }
  },120_000);

  it("activates 1.2 at the epoch and retains the explicit rollback path",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    expect(temerosaCasinoLedgerAtUtcSecond(boundary-1).contract.version).toBe("npc-ledger/1.1");
    for(const second of [boundary,boundary+3_650*86_400]){
      expect(temerosaCasinoLedgerAtUtcSecond(second).contract.version).toBe("npc-ledger/1.2");
      expect(temerosaCasinoLedgerAtUtcSecond(second,{flowEconomy:true}).contract.version).toBe("npc-ledger/1.2");
      expect(temerosaCasinoLedgerAtUtcSecond(second,{flowEconomy:false}).contract.version).toBe("npc-ledger/1.1");
    }
  });
});

function fixedClock(second:number):CasinoPresentationClock{return{utcSecond:()=>second,utcMinute:()=>Math.floor(second/60)};}

class MemoryStorage{
  readonly #values=new Map<string,string>();
  get length():number{return this.#values.size;}
  key(index:number):string|null{return [...this.#values.keys()][index]??null;}
  getItem(key:string):string|null{return this.#values.get(key)??null;}
  setItem(key:string,value:string):void{this.#values.set(key,value);}
  removeItem(key:string):void{this.#values.delete(key);}
  clear():void{this.#values.clear();}
  keys():string[]{return [...this.#values.keys()];}
  clone():MemoryStorage{const clone=new MemoryStorage();for(const [key,value] of this.#values)clone.setItem(key,value);return clone;}
  rewriteAll(rewrite:(checkpoint:Record<string,unknown>)=>unknown):void{for(const [key,value] of this.#values)this.#values.set(key,JSON.stringify(rewrite(JSON.parse(value) as Record<string,unknown>)));}
}

function checkpointSnapshot(contract:NpcLedgerContract,dayIndex:number):CasinoWorldlineCheckpointSnapshot{return Object.freeze({
  dayIndex,npcBalances:Object.freeze(Object.fromEntries(contract.profiles.map((profile)=>[profile.id,Math.max(500,profile.openingBalance)]))),
  houseBalance:1_000_000,houseGamingProfit:25_000,houseOperatingExpenses:10_000,houseCurtailedOperatingExpenses:0,
  npcExternalReserves:Object.freeze(Object.fromEntries((contract.externalIncomeProfiles??[]).map((profile)=>[profile.npcId,profile.openingExternalReserve+100_000]))),
});}
function withoutReplayDiagnostics(worldline:ReturnType<typeof personalCasinoWorldlineAt>):Omit<ReturnType<typeof personalCasinoWorldlineAt>,"checkpointDayIndex"|"replayedDayCount">{
  const {checkpointDayIndex:_,replayedDayCount:__,...state}=worldline;return state;
}
