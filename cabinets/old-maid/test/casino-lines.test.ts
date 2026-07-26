/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TEMEROSA_CASINO_TELL_STYLES,
  createTemerosaCasinoOldMaidCartridge,
  temerosaCasinoOldMaidLines,
  temerosaOldMaidCartridge,
  temerosaOutcomeOldMaidLines,
  validateOldMaidLines,
  type OldMaidLineEvent,
} from "../src/index.ts";

const EVENTS: readonly OldMaidLineEvent[] = [
  "emptied", "idle-draw", "joker-drawn", "joker-left",
  "pair-discard", "pair-made", "taken-from", "watching",
];
const OUTCOME_EVENTS: readonly OldMaidLineEvent[] = ["defeat", "finish-1st", "finish-2nd", "finish-3rd", "table-open"];

describe("Temerosa casino NPC dialogue", () => {
  it("contains the complete 26 by 8 reviewed dialogue matrix", () => {
    expect(temerosaCasinoOldMaidLines).toHaveLength(208);
    expect(new Set(temerosaCasinoOldMaidLines.map((line) => line.id)).size).toBe(208);
    for (const characterId of Object.keys(TEMEROSA_CASINO_TELL_STYLES)) {
      expect(temerosaCasinoOldMaidLines
        .filter((line) => line.characterId === characterId)
        .map((line) => line.event)
        .sort()).toEqual(EVENTS);
    }
  });

  it("matches the CHARX-reviewed dialogue book character for character", () => {
    expect(new Map(temerosaCasinoOldMaidLines.map((line) => [line.id, line.text])))
      .toEqual(dialogueBookLines());
  });

  it("assigns every approved tell style with the expected distribution", () => {
    expect(Object.keys(TEMEROSA_CASINO_TELL_STYLES)).toHaveLength(26);
    const counts = Object.values(TEMEROSA_CASINO_TELL_STYLES)
      .reduce<Record<string, number>>((all, style) => ({ ...all, [style]: (all[style] ?? 0) + 1 }), {});
    expect(counts).toEqual({ guarded: 10, open: 10, bluffer: 4, standard: 2 });
  });

  it("wires only characters present in the audited content manifest", () => {
    const allAssets = Object.keys(TEMEROSA_CASINO_TELL_STYLES).flatMap((characterId) =>
      ["neutral", "pleased", "tense", "despair"].map((expression) => ({
        id: `npc-${characterId}-${expression}`,
        characterId,
        expression,
        appearanceSet: `${characterId}/bestiaization/current`,
      })),
    );
    const complete = createTemerosaCasinoOldMaidCartridge(allAssets);
    expect(complete.lines).toHaveLength(455);
    expect(temerosaOutcomeOldMaidLines).toHaveLength(175);
    expect(new Map(temerosaOutcomeOldMaidLines.map((line) => [line.id, line.text]))).toEqual(ceremonyBookLines());
    expect(complete.characters).toHaveLength(35);
    for (const character of complete.characters) {
      expect(character.behavior, character.id).toBeDefined();
      expect(temerosaOutcomeOldMaidLines.filter((line) => line.characterId === character.id).map((line) => line.event).sort()).toEqual(OUTCOME_EVENTS);
    }
    expect(() => validateOldMaidLines(complete)).not.toThrow();
    for (const [characterId, tellStyle] of Object.entries(TEMEROSA_CASINO_TELL_STYLES)) {
      expect(complete.characters.find((character) => character.id === characterId)?.tellStyle).toBe(tellStyle);
      expect(complete.lines?.filter((line) => line.characterId === characterId)).toHaveLength(13);
    }

    const partial = createTemerosaCasinoOldMaidCartridge(allAssets.filter((asset) => asset.characterId === "echo"));
    expect(partial.lines?.filter((line) => line.characterId === "echo")).toHaveLength(13);
    expect(partial.lines?.some((line) => line.characterId === "adesha")).toBe(false);
    expect(() => validateOldMaidLines(partial)).not.toThrow();
    expect(temerosaOldMaidCartridge.lines).toHaveLength(72);
  });
});

function dialogueBookLines(): Map<string, readonly string[]> {
  const characterIds = new Map([
    ["에코", "echo"], ["아데샤", "adesha"], ["땡칠이", "ttaengchil"], ["카미유", "camille"],
    ["레이븐", "raven"], ["김덕배", "deokbae"], ["모르시사", "morsisa"], ["율", "yul"],
    ["안나 나자레아", "anna"], ["아폴리온 아이테", "apollyon"], ["브체", "bche"], ["키케로", "cicero"],
    ["크레이들", "cradle"], ["디아모", "diamo"], ["에스더", "esther"], ["히로 카네다", "hiro"],
    ["카트린카", "katrinka"], ["크레바", "kreva"], ["레빌로트", "levillotte"], ["릴림", "lilim"],
    ["마키나", "machina"], ["노스탤지아", "nostalgia"], ["폐어", "phaeo"], ["테뮤테", "temute"],
    ["트레버", "traver"], ["튜밋튜", "tumit-tu"],
  ]);
  const output = new Map<string, readonly string[]>();
  let characterId: string | null = null;
  for (const sourceLine of readFileSync(new URL("../../../docs/TEMEROSA-CASINO-NPC-DIALOGUE.md", import.meta.url), "utf8").split(/\r?\n/)) {
    const heading = /^### ([^—]+)(?: —.*)?$/.exec(sourceLine);
    if (heading) characterId = characterIds.get(heading[1]?.trim() ?? "") ?? null;
    const row = /^\| `([^`]+)` \| (.+) \|$/.exec(sourceLine);
    if (characterId && row) output.set(`${characterId}-${row[1]}`, [row[2] ?? ""]);
  }
  return output;
}

function ceremonyBookLines(): Map<string, readonly string[]> {
  const characterIds = new Map([
    ["페일", "pale"], ["카노", "kano"], ["네모", "nemo"], ["바치칼", "bacikal"], ["알제", "alger"], ["박니은", "nieun"], ["라일라", "lyla"], ["리엘", "riel"], ["워어즈", "wares"],
    ["아데샤", "adesha"], ["안나 나자레아", "anna"], ["아폴리온 아이테", "apollyon"], ["브체", "bche"], ["카미유", "camille"], ["키케로", "cicero"], ["크레이들", "cradle"],
    ["김덕배", "deokbae"], ["디아모", "diamo"], ["에코", "echo"], ["에스더", "esther"], ["히로 카네다", "hiro"], ["카트린카", "katrinka"], ["크레바", "kreva"], ["레빌로트", "levillotte"],
    ["릴림", "lilim"], ["마키나", "machina"], ["모르시사", "morsisa"], ["노스탤지아", "nostalgia"], ["폐어", "phaeo"], ["레이븐", "raven"], ["테뮤테", "temute"], ["트레버", "traver"],
    ["땡칠이", "ttaengchil"], ["튜밋튜", "tumit-tu"], ["율", "yul"],
  ]);
  const output = new Map<string, readonly string[]>();
  let characterId: string | null = null;
  for (const sourceLine of readFileSync(new URL("../../../docs/TEMEROSA-OLD-MAID-CEREMONY-DIALOGUE.md", import.meta.url), "utf8").split(/\r?\n/)) {
    const heading = /^## (.+?) —/.exec(sourceLine);
    if (heading) characterId = characterIds.get(heading[1] ?? "") ?? null;
    const row = /^\| `(table-open|finish-1st|finish-2nd|finish-3rd|defeat)` \| (.+) \|$/.exec(sourceLine);
    if (characterId && row) output.set(`${characterId}-${row[1]}`, (row[2] ?? "").split("<br>"));
  }
  return output;
}
