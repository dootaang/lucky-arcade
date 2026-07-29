import { describe, expect, it } from "vitest";
import { shuffledStandardDeck, type StandardCardId } from "@lucky-arcade/card-table";
import {
  chooseNpcBetAction,
  evaluatePokerHand,
  pokerDecisionStrength,
  selectPokerTell,
  type FiveCardDrawPersona,
  type NpcBetObservation,
} from "../src/index.ts";

const MIDDLE: FiveCardDrawPersona = {
  drawActivity: .62,
  riskAppetite: .52,
  signalAttention: .58,
  signalTrust: .05,
  deceptionBias: .46,
  consistency: .66,
  tellStyle: "standard",
};

function observation(hand: readonly StandardCardId[], seed: string, persona = MIDDLE): NpcBetObservation {
  return {
    seatId: "npc-1",
    hand,
    phase: "opening-bet",
    activeSeatCount: 4,
    ownContributionUnits: 1,
    currentBetUnits: 2,
    potUnits: 8,
    visibleExchangeCounts: {},
    visibleTells: {},
    betHistory: [{ seatId: "player", phase: "opening-bet", action: "raise", amountUnits: 1 }],
    persona,
    planSeed: `plan:${seed}`,
    seed: `action:${seed}`,
  };
}

describe("five-card draw NPC psychology", () => {
  it("is deterministic and only accepts public opponent information", () => {
    const hand = shuffledStandardDeck("deterministic").slice(0, 5);
    const visible = observation(hand, "same");
    expect(chooseNpcBetAction(visible)).toBe(chooseNpcBetAction(observation([...hand], "same")));
    expect("opponentHands" in visible).toBe(false);
    expect("opponentCardIds" in visible).toBe(false);
  });

  it("adapts to public prior-hand behavior without receiving prior cards",()=>{
    let changed=0;
    for(let index=0;index<1_000;index+=1){
      const hand=shuffledStandardDeck(`session-read:${index}`).slice(0,5);
      const base=observation(hand,`session-read:${index}`);
      const loose={...base,sessionRead:{handsPlayed:4,aggressionRate:.95,foldRate:.7,averageExchangeCount:2.5,revealedStrength:.18,weakAggressionRate:.85}};
      const solid={...base,sessionRead:{handsPlayed:4,aggressionRate:.2,foldRate:.05,averageExchangeCount:.6,revealedStrength:.82,weakAggressionRate:.05}};
      if(chooseNpcBetAction(loose)!==chooseNpcBetAction(solid))changed+=1;
      expect("cards" in loose.sessionRead).toBe(false);
    }
    expect(changed).toBeGreaterThan(15);
  });

  it("defends ordinary made hands without making raises worthless", () => {
    const counts = Array.from({ length: 9 }, () => ({ folds: 0, total: 0 }));
    let folds = 0;
    const samples = 10_000;
    for (let index = 0; index < samples; index += 1) {
      const hand = shuffledStandardDeck(`defend:${index}`).slice(0, 5);
      const action = chooseNpcBetAction(observation(hand, `defend:${index}`));
      const category = evaluatePokerHand(hand).categoryRank;
      counts[category]!.total += 1;
      if (action === "fold") { folds += 1; counts[category]!.folds += 1; }
    }
    expect(folds / samples).toBeGreaterThan(.45);
    expect(folds / samples).toBeLessThan(.62);
    expect(counts[1]!.folds / counts[1]!.total).toBeGreaterThan(.2);
    expect(counts[1]!.folds / counts[1]!.total).toBeLessThan(.45);
    expect(counts[2]!.folds / counts[2]!.total).toBeLessThan(.05);
    expect(counts.slice(4).reduce((sum, item) => sum + item.folds, 0)).toBe(0);
  });

  it("keeps aggressive and cautious personalities behaviorally distinct", () => {
    const aggressive: FiveCardDrawPersona = { ...MIDDLE, riskAppetite: .82, deceptionBias: .78, consistency: .42, tellStyle: "bluffer" };
    const cautious: FiveCardDrawPersona = { ...MIDDLE, riskAppetite: .28, deceptionBias: .18, consistency: .86, tellStyle: "guarded" };
    const rate = (persona: FiveCardDrawPersona) => Array.from({ length: 4_000 }, (_, index) => {
      const hand = shuffledStandardDeck(`persona:${index}`).slice(0, 5);
      return chooseNpcBetAction(observation(hand, `persona:${index}`, persona)) === "fold" ? 1 : 0;
    }).reduce<number>((sum, value) => sum + value, 0) / 4_000;
    expect(rate(cautious) - rate(aggressive)).toBeGreaterThan(.15);
  });

  it("counter-raises selectively, more often when aggressive, and never beyond the cap", () => {
    const aggressive: FiveCardDrawPersona = { ...MIDDLE, riskAppetite: .82, deceptionBias: .78, consistency: .42, tellStyle: "bluffer" };
    const cautious: FiveCardDrawPersona = { ...MIDDLE, riskAppetite: .28, deceptionBias: .18, consistency: .86, tellStyle: "guarded" };
    const counterRate = (persona: FiveCardDrawPersona) => Array.from({ length: 4_000 }, (_, index) => {
      const base = observation(shuffledStandardDeck(`counter:${index}`).slice(0, 5), `counter:${index}`, persona);
      return chooseNpcBetAction(base) === "raise" ? 1 : 0;
    }).reduce<number>((sum, value) => sum + value, 0) / 4_000;
    const ordinary = counterRate(MIDDLE);
    expect(ordinary).toBeGreaterThan(.02);
    expect(ordinary).toBeLessThan(.08);
    expect(counterRate(aggressive) - counterRate(cautious)).toBeGreaterThan(.04);

    for (let index = 0; index < 1_000; index += 1) {
      const base = observation(shuffledStandardDeck(`cap:${index}`).slice(0, 5), `cap:${index}`);
      expect(chooseNpcBetAction({ ...base, ownContributionUnits: 2, currentBetUnits: 3 })).not.toBe("raise");
    }
  });

  it("lets literal and suspicious readers move in opposite directions on ambiguous signals", () => {
    const hand = ["clubs-k", "diamonds-k", "hearts-2", "spades-7", "clubs-9"] as StandardCardId[];
    const foldRate = (signalTrust: number) => Array.from({ length: 2_000 }, (_, index) => {
      const base = observation(hand, `read:${index}`, { ...MIDDLE, signalTrust });
      return chooseNpcBetAction({ ...base, visibleExchangeCounts: { player: 0 } }) === "fold" ? 1 : 0;
    }).reduce<number>((sum, value) => sum + value, 0) / 2_000;
    expect(foldRate(.8)).toBeGreaterThan(foldRate(-.8));
  });

  it("derives visible tells without mutating hand strength", () => {
    const weak = ["clubs-2", "diamonds-5", "hearts-8", "spades-j", "clubs-k"] as StandardCardId[];
    const strong = ["clubs-9", "diamonds-9", "hearts-9", "spades-9", "clubs-a"] as StandardCardId[];
    expect(pokerDecisionStrength(strong, "closing-bet")).toBeGreaterThan(pokerDecisionStrength(weak, "closing-bet"));
    expect(selectPokerTell(strong, "closing-bet", { ...MIDDLE, tellStyle: "open" }, "tell")).toBe("confident");
    expect(selectPokerTell(strong, "closing-bet", { ...MIDDLE, tellStyle: "open" }, "tell")).toBe(selectPokerTell(strong, "closing-bet", { ...MIDDLE, tellStyle: "open" }, "tell"));
  });
});
