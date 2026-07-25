import { describe, expect, it } from "vitest";
import { oldMaidOfferTiming } from "../src/react/offer-timing.ts";

describe("old maid offer pacing", () => {
  it("keeps NPC-to-NPC and fast spectator play shorter than the normal rhythm", () => {
    const normal = oldMaidOfferTiming({ moved: true, npcToNpc: false, spectatorSpeed: "normal", reducedMotion: false });
    const npc = oldMaidOfferTiming({ moved: true, npcToNpc: true, spectatorSpeed: "normal", reducedMotion: false });
    const fast = oldMaidOfferTiming({ moved: true, npcToNpc: true, spectatorSpeed: "fast", reducedMotion: false });
    expect(npc.settleDelay).toBeLessThan(normal.settleDelay);
    expect(fast.settleDelay).toBeLessThan(npc.settleDelay);
  });

  it("uses a brief fixed path when reduced motion is requested", () => {
    expect(oldMaidOfferTiming({ moved: true, npcToNpc: false, spectatorSpeed: "normal", reducedMotion: true })).toEqual({
      prepareDelay: 40,
      moveDuration: 90,
      settleDelay: 160,
      drawDelay: 120,
    });
  });
});
