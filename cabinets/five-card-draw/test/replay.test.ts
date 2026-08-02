import { describe, expect, it } from "vitest";
import { createFiveCardDrawSpectatorReplay, type FiveCardDrawOpponent } from "../src/index.ts";

const players: readonly FiveCardDrawOpponent[] = Array.from({ length: 4 }, (_, index) => ({
  id: `npc-${index}`, name: `NPC ${index}`, persona: { drawActivity: .4 + index * .1, riskAppetite: .35 + index * .12,
    signalAttention: .5, signalTrust: 0, deceptionBias: .25 + index * .1, consistency: .7, tellStyle: index === 3 ? "bluffer" : "guarded" },
}));

describe("five-card draw spectator replay", () => {
  it("runs a deterministic four-NPC three-hand series", () => {
    const first = createFiveCardDrawSpectatorReplay({ participants: players, seed: "market" });
    const second = createFiveCardDrawSpectatorReplay({ participants: players, seed: "market" });
    expect(first.series.summaries).toHaveLength(3);
    expect(first.resultHash).toBe(second.resultHash);
    expect([...players.map((item) => item.id), "draw"]).toContain(first.winningCharacterId);
  });

  it("finishes 250 seeded series", () => {
    for (let seed = 0; seed < 250; seed += 1) expect(createFiveCardDrawSpectatorReplay({ participants: players, seed: `seed-${seed}`, captureFrames: false }).series.status).toBe("complete");
  });
});
