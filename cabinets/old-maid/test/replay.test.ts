import { describe, expect, it } from "vitest";
import { createOldMaidSpectatorReplay, temerosaOldMaidCartridge } from "../src/index.ts";

const participants = ["nemo", "pale", "kano", "alger"] as const;

describe("old-maid spectator replay", () => {
  it("uses one reducer transcript for both viewing and the final result", () => {
    const left = replay("market-seed");
    const right = replay("market-seed");
    expect(left.finalState.status).toBe("complete");
    expect(left.frames.map((frame) => frame.action)).toEqual(right.frames.map((frame) => frame.action));
    expect(left.resultHash).toBe(right.resultHash);
    expect(participants).toContain(left.oddCardHolderCharacterId);
  });

  it("completes a deterministic seed sample", () => {
    for (let seed = 0; seed < 250; seed += 1) expect(replay(`sample-${seed}`).finalState.status).toBe("complete");
  });
});

function replay(seed: string) {
  return createOldMaidSpectatorReplay({ cartridge: temerosaOldMaidCartridge, seed, sessionId: `market:${seed}`, participantIds: participants });
}
