import { describe, expect, it } from "vitest";
import {
  casinoDayPlan,
  casinoPresenceAt,
  recentNpcPlayEventsAt,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  type CasinoPresentationClock,
} from "../src/index.ts";

const contract = TEMEROSA_NPC_LEDGER_CONTRACT;

describe("casino live play tape", () => {
  it("derives identical second-resolution events without touching settlement", () => {
    const intervalSecond = firstTapeSecond();
    const clock = fixedClock(intervalSecond);
    const presences = casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, contract);
    const before = structuredClone(presences);
    const first = recentNpcPlayEventsAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, contract, 24);
    const second = recentNpcPlayEventsAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, contract, 24);
    expect(first).toEqual(second);
    expect(presences).toEqual(before);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((event) => event.utcSecond <= intervalSecond && event.utcSecond > intervalSecond - 90)).toBe(true);
  });

  it("adds a new visible action within fifteen seconds while a table is running", () => {
    const start = firstTapeSecond();
    const initialClock = fixedClock(start);
    const initial = recentNpcPlayEventsAt(TEMEROSA_NPC_GAMBLING_PROFILES, initialClock, contract, 100);
    let changed = false;
    for (let offset = 1; offset <= 15; offset += 1) {
      const clock = fixedClock(start + offset);
      const next = recentNpcPlayEventsAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, contract, 100);
      if (next.some((event) => !initial.some((old) => old.eventId === event.eventId))) changed = true;
    }
    expect(changed).toBe(true);
  });

  it("keeps event codes inside the table-specific vocabulary", () => {
    const second = firstTapeSecond();
    const clock = fixedClock(second);
    const events = recentNpcPlayEventsAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, contract, 100);
    for (const event of events) {
      if (event.code === "table-enter" || event.code === "wager-placed" || event.code === "prediction-wager-placed") continue;
      expect(event.code.startsWith(event.tableId === "temerosa-old-maid" ? "old-maid"
        : event.tableId === "temerosa-match-pairs" ? "pairs"
          : event.tableId === "temerosa-slot" ? "slot"
            : event.tableId === "temerosa-high-low" ? "high-low" : "poker")).toBe(true);
    }
    const openings=Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
    const matchIds=new Set(casinoDayPlan(TEMEROSA_NPC_GAMBLING_PROFILES,0,openings,contract).matches.map((match)=>match.matchId));
    expect(events.every((event)=>event.kind==="match-action"&&matchIds.has(event.matchId))).toBe(true);
  });

  it("puts both self and spectator old maid predictions on the real tape",()=>{
    const openings=Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
    const plan=casinoDayPlan(TEMEROSA_NPC_GAMBLING_PROFILES,0,openings,contract);
    const prediction=plan.predictions.find((entry)=>entry.role==="spectator")??plan.predictions[0];expect(prediction).toBeDefined();
    const second=contract.epochUtcDay*86_400+prediction!.placedAtSecondOfDay;
    const event=recentNpcPlayEventsAt(TEMEROSA_NPC_GAMBLING_PROFILES,fixedClock(second),contract,200).find((entry)=>entry.code==="prediction-wager-placed"&&entry.npcId===prediction!.bettorNpcId);
    expect(event).toMatchObject({matchId:prediction!.matchId,stake:prediction!.stake,multiplier:prediction!.multiplier,predictionMarket:prediction!.market,predictedNpcId:prediction!.predictedNpcId,predictionRole:prediction!.role});
  });
});

function firstTapeSecond(): number {
  const dayStart = contract.epochUtcDay * 86_400;
  for (let second = dayStart; second < dayStart + 86_400; second += 5) {
    const clock = fixedClock(second);
    if (recentNpcPlayEventsAt(TEMEROSA_NPC_GAMBLING_PROFILES,clock,contract,10).length>0) return second;
  }
  throw new Error("no_live_tape_event");
}

function fixedClock(second: number): CasinoPresentationClock {
  return { utcSecond: () => second, utcMinute: () => Math.floor(second / 60) };
}
