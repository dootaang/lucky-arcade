import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { temerosaContentSelectionSchema } from "@lucky-arcade/contracts";
import { NEMO_APPROVED_PATHS, SEAT_ROLES, TEMEROSA_CASINO_CARD_ONLY, TEMEROSA_CASINO_MIN_CARD_FACES, TEMEROSA_CASINO_NPCS } from "../src/temerosa-casino-plan.ts";

describe("Temerosa casino staged asset plan", () => {
  it("selects thirty canonical NPC candidates without Bacikal", () => {
    expect(TEMEROSA_CASINO_NPCS).toHaveLength(30);
    expect(new Set(TEMEROSA_CASINO_NPCS.map((npc) => npc.id)).size).toBe(30);
    expect(TEMEROSA_CASINO_NPCS.some((npc) => npc.id === "bacikal")).toBe(false);
    expect(TEMEROSA_CASINO_NPCS.every((npc) => npc.loreEntry && npc.importanceEvidence)).toBe(true);
  });

  it("has all reviewed seat roles for every NPC", () => {
    for (const npc of TEMEROSA_CASINO_NPCS) expect(Object.keys(npc.seatPaths).sort()).toEqual([...SEAT_ROLES].sort());
  });

  it("restricts Nemo to the four magical-girl assets", () => {
    const nemo = TEMEROSA_CASINO_NPCS.find((npc) => npc.id === "nemo")!;
    expect(nemo.appearanceSet).toBe("nemo/magical-girl/current");
    expect(nemo.source).toBe("nemo");
    expect(NEMO_APPROVED_PATHS).toEqual(new Set(["assets/other/image/73.png", "assets/other/image/71.png", "assets/other/image/64.png", "assets/other/image/144.png"]));
  });

  it("plans enough explicitly reviewed card faces before byte deduplication", () => {
    const planned = TEMEROSA_CASINO_NPCS.reduce((sum, npc) => sum + SEAT_ROLES.length + npc.extraPaths.length, 0) + TEMEROSA_CASINO_CARD_ONLY.reduce((sum, character) => sum + character.faces.length, 0);
    expect(planned).toBeGreaterThanOrEqual(TEMEROSA_CASINO_MIN_CARD_FACES);
  });

  it("keeps the generated runtime selection explicit and constrained", async () => {
    const path = fileURLToPath(new URL("../src/temerosa-casino-selection.json", import.meta.url));
    const selection = temerosaContentSelectionSchema.parse(JSON.parse(await readFile(path, "utf8")));
    expect(selection.version).toBe("0.8.0");
    expect(selection.assets.length).toBeGreaterThanOrEqual(TEMEROSA_CASINO_MIN_CARD_FACES);
    expect(new Set(selection.assets.map((asset) => `${asset.source}:${asset.sourcePath}`)).size).toBe(selection.assets.length);
    expect(selection.assets.some((asset) => asset.characterId === "bacikal")).toBe(false);
  });
});
