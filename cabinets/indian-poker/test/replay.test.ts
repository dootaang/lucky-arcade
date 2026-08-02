import { describe, expect, it } from "vitest";
import { createIndianPokerSpectatorReplay, createTemerosaIndianPokerCartridge, type IndianPokerCharacter } from "../src/index.ts";

const characters: readonly IndianPokerCharacter[] = ["left", "right", "third"].map((id, index) => ({
  id, name: id, appearanceSet: "test", tellStyle: "guarded",
  portraits: { neutral: `${id}-n`, pleased: `${id}-p`, tense: `${id}-t` }, despairPortrait: `${id}-d`,
  persona: { aggression: .3 + index * .2, bluffFrequency: .2 + index * .1, slowPlay: .2, estimationNoise: .04,
    tellReliability: .7, tiltResponse: .3 },
}));
const cartridge = createTemerosaIndianPokerCartridge(characters);

describe("Indian-poker spectator replay", () => {
  it("replays both NPC seats deterministically", () => {
    const left = createIndianPokerSpectatorReplay({ cartridge, participantIds: ["left", "right"], seed: "market", roundCount: 7 });
    const right = createIndianPokerSpectatorReplay({ cartridge, participantIds: ["left", "right"], seed: "market", roundCount: 7 });
    expect(left.finalState.status).toBe("complete");
    expect(left.resultHash).toBe(right.resultHash);
    expect(["left", "right", "draw"]).toContain(left.winningCharacterId);
  });

  it("finishes 1,000 seeded matches", () => {
    for (let seed = 0; seed < 1_000; seed += 1) expect(createIndianPokerSpectatorReplay({ cartridge, participantIds: ["left", "right"], seed: `seed-${seed}`, captureFrames: false }).finalState.status).toBe("complete");
  });
});
