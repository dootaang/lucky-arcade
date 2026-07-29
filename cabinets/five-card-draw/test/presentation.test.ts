import { describe, expect, it } from "vitest";
import {
  createFiveCardDrawState,
  legalPlayerBetActions,
  reduceFiveCardDraw,
  type FiveCardDrawContext,
  type FiveCardDrawState,
  type PokerHandValue,
} from "../src/index.ts";
import { dealSequence, handHighlight, handTier, planFiveCardDrawStage } from "../src/react/presentation.ts";

const context: FiveCardDrawContext = {
  sessionId: "presentation-test",
  opponents: Array.from({ length: 3 }, (_, index) => ({
    id: `npc-${index}`,
    name: `NPC ${index}`,
    persona: { drawActivity: .7, riskAppetite: .5, signalAttention: .6, signalTrust: .4, deceptionBias: .2, consistency: .7, tellStyle: "standard" },
  })),
};

function complete(seed: string): FiveCardDrawState {
  let state = reduceFiveCardDraw(createFiveCardDrawState(context), { type: "start", seed, stake: 10 });
  for (let guard = 0; guard < 100 && state.phase !== "complete"; guard += 1) {
    if (state.currentActorId !== "player") state = reduceFiveCardDraw(state, { type: "advance" });
    else if (state.phase === "drawing") state = reduceFiveCardDraw(state, { type: "exchange", cardIds: [] });
    else {
      const legal = legalPlayerBetActions(state);
      const action = legal.includes("check") ? "check" : legal.includes("call") ? "call" : legal[0];
      if (!action) throw new Error("presentation_player_action_missing");
      state = reduceFiveCardDraw(state, { type: "bet", action });
    }
  }
  if (state.phase !== "complete") throw new Error("presentation_autoplay_guard");
  return state;
}

describe("five-card draw presentation plan", () => {
  it("deals one card at a time clockwise and stays within the 1.6 second budget", () => {
    const ready = createFiveCardDrawState(context);
    const started = reduceFiveCardDraw(ready, { type: "start", seed: "deal", stake: 10 });
    const sequence = dealSequence(started);
    expect(sequence).toHaveLength(20);
    expect(sequence.slice(0, 4).map((card) => card.seatId)).toEqual(["npc-1", "npc-2", "npc-3", "player"]);
    expect(new Set(sequence.map((card) => card.cardId))).toHaveLength(20);
    const steps = planFiveCardDrawStage(ready, started);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.event.kind).toBe("deal");
    expect(steps[0]?.duration).toBeLessThanOrEqual(1_600);
    expect(steps[0]?.commit).toBe(true);
  });

  it("moves a folded hand to the muck without exposing card faces", () => {
    const previous = reduceFiveCardDraw(createFiveCardDrawState(context), { type: "start", seed: "fold", stake: 10 });
    const next: FiveCardDrawState = {
      ...previous,
      sequence: previous.sequence + 1,
      foldedSeatIds: ["npc-1"],
      activeSeatIds: previous.activeSeatIds.filter((seat) => seat !== "npc-1"),
      lastAction: { seatId: "npc-1", action: "fold", amountUnits: 0 },
    };
    const fold = planFiveCardDrawStage(previous, next)[0]?.event;
    expect(fold?.kind).toBe("fold");
    if (fold?.kind !== "fold") throw new Error("fold_event_missing");
    expect(fold.cards).toEqual(previous.hands["npc-1"]);
  });

  it("reveals only showdown participants before the verdict and then awards the pot", () => {
    const finished = Array.from({ length: 50 }, (_, index) => complete(`showdown-${index}`)).find((state) => Object.keys(state.result?.hands ?? {}).length >= 2);
    if (!finished) throw new Error("showdown_seed_missing");
    const previous = { ...finished, phase: "closing-bet" as const, result: null, lastAction: finished.lastAction };
    const steps = planFiveCardDrawStage(previous, finished);
    const reveals = steps.filter((step) => step.event.kind === "reveal");
    expect(reveals).toHaveLength(Object.keys(finished.result?.hands ?? {}).length);
    expect(steps.at(-2)?.event.kind).toBe("verdict");
    expect(steps.at(-1)?.event.kind).toBe("award");
    for (const step of reveals) {
      if (step.event.kind !== "reveal") continue;
      expect(step.event.seatIds.every((seat) => !finished.foldedSeatIds.includes(seat))).toBe(true);
    }
  });

  it("highlights the four matching cards in a four-of-a-kind, not its kicker", () => {
    const hand = ["clubs-9", "diamonds-9", "hearts-9", "spades-9", "clubs-a"] as const;
    const value: PokerHandValue = { category: "four-of-a-kind", categoryRank: 7, kickers: [9, 14], label: "포카드" };
    expect([...handHighlight(hand, value)]).toEqual(hand.slice(0, 4));
    expect(handTier({ category: "straight-flush", categoryRank: 8, kickers: [14], label: "로열 플러시" })).toBe(7);
  });
});
