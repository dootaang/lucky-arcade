import { describe, expect, it } from "vitest";
import { XorShift32 } from "@lucky-arcade/engine";
import { chooseNpcBetAction, type NpcBetObservation } from "@lucky-arcade/five-card-draw";
import { TEMEROSA_CASINO_BEHAVIOR_PROFILES } from "@lucky-arcade/old-maid";
import { createTemerosaFiveCardDrawOpponents } from "./temerosa-five-card-draw-opponents.ts";
import manifest from "../../../public/content/temerosa-margin/0.8.0/manifest.json";

describe("Temerosa five-card draw opponents", () => {
  it("maps the complete audited 30-seat roster to bounded, distinct poker personas", () => {
    const opponents = createTemerosaFiveCardDrawOpponents(manifest.assets);
    expect(opponents).toHaveLength(30);
    expect(new Set(opponents.map((opponent) => opponent.id))).toHaveLength(30);
    expect(opponents.some((opponent) => opponent.id === "bacikal")).toBe(false);
    for (const opponent of opponents) {
      expect(TEMEROSA_CASINO_BEHAVIOR_PROFILES[opponent.id]).toBeDefined();
      const { signalTrust, tellStyle, ...bounded } = opponent.persona;
      expect(Object.values(bounded).every((value) => value >= 0 && value <= 1)).toBe(true);
      expect(signalTrust).toBeGreaterThanOrEqual(-1);
      expect(signalTrust).toBeLessThanOrEqual(1);
      expect(["open", "guarded", "bluffer", "standard"]).toContain(tellStyle);
    }
    expect(new Set(opponents.map((opponent) => JSON.stringify(opponent.persona))).size).toBeGreaterThan(10);
  });

  it("keeps all thirty personalities inside the approved raise-defense envelope", () => {
    const opponents = createTemerosaFiveCardDrawOpponents(manifest.assets);
    const rates = opponents.map((opponent) => {
      let folds = 0;
      for (let index = 0; index < 1_000; index += 1) {
        const action = chooseNpcBetAction({
          seatId: "npc-1",
          hand: sampleHand(`roster-defense:${index}`),
          phase: "opening-bet",
          activeSeatCount: 4,
          ownContributionUnits: 1,
          currentBetUnits: 2,
          potUnits: 8,
          visibleExchangeCounts: {},
          visibleTells: {},
          betHistory: [{ seatId: "player", phase: "opening-bet", action: "raise", amountUnits: 1 }],
          persona: opponent.persona,
          planSeed: `roster-plan:${opponent.id}:${index}`,
          seed: `roster-action:${opponent.id}:${index}`,
        });
        if (action === "fold") folds += 1;
      }
      return folds / 1_000;
    });
    const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    expect(average).toBeGreaterThan(.45);
    expect(average).toBeLessThan(.62);
    expect(Math.max(...rates) - Math.min(...rates)).toBeGreaterThan(.15);
    expect(Math.max(...rates)).toBeLessThan(.75);
  });
});

const SAMPLE_DECK = (["clubs", "diamonds", "hearts", "spades"] as const)
  .flatMap((suit) => ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"].map((rank) => `${suit}-${rank}`));

function sampleHand(seed: string): NpcBetObservation["hand"] {
  const deck = [...SAMPLE_DECK];
  const rng = new XorShift32(seed);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng.next() * (index + 1));
    [deck[index], deck[target]] = [deck[target]!, deck[index]!];
  }
  return deck.slice(0, 5) as NpcBetObservation["hand"];
}
