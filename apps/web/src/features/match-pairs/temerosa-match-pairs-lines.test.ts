/// <reference types="node" />

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MATCH_PAIRS_LINE_EVENTS,
  validateMatchPairsLines,
  type MatchPairsLine,
  type MatchPairsLineEvent,
} from "@lucky-arcade/match-pairs";
import { describe, expect, it } from "vitest";
import { TEMEROSA_MATCH_PAIRS_LINES } from "./temerosa-match-pairs-lines.ts";
import { TEMEROSA_MATCH_PAIRS_PERSONAS } from "./temerosa-match-pairs-personas.ts";

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../docs/TEMEROSA-MATCH-PAIRS-DIALOGUE.md");

describe("Temerosa match-pairs dialogue derivation", () => {
  const canonical = parseDialogueBook();
  const personaIds = Object.keys(TEMEROSA_MATCH_PAIRS_PERSONAS);

  it("matches the owner-approved dialogue book character for character", () => {
    expect(TEMEROSA_MATCH_PAIRS_LINES).toEqual(canonical);
  });

  it("contains one unique 30 by 12 matrix", () => {
    expect(canonical).toHaveLength(360);
    expect(new Set(canonical.map((line) => line.characterId)).size).toBe(30);
    expect(new Set(canonical.map((line) => line.id)).size).toBe(360);
    expect(new Set(canonical.map((line) => `${line.characterId}:${line.event}`)).size).toBe(360);
  });

  it("covers exactly the frozen persona roster and validates as runtime data", () => {
    expect([...new Set(canonical.map((line) => line.characterId))].sort()).toEqual([...personaIds].sort());
    expect(() => validateMatchPairsLines(TEMEROSA_MATCH_PAIRS_LINES, personaIds)).not.toThrow();
  });
});

function parseDialogueBook(): MatchPairsLine[] {
  const lines: MatchPairsLine[] = [];
  const ids = new Set<string>();
  let characterId: string | null = null;

  for (const sourceLine of readFileSync(SOURCE, "utf8").split(/\r?\n/)) {
    const heading = /^### .+? \(`([^`]+)`\)$/.exec(sourceLine);
    if (heading) characterId = heading[1] ?? null;
    const row = /^\| ([a-z-]+) \| (.+) \|$/.exec(sourceLine);
    if (!characterId || !row || !MATCH_PAIRS_LINE_EVENTS.includes(row[1] as MatchPairsLineEvent)) continue;
    const event = row[1] as MatchPairsLineEvent;
    const id = `${characterId}-${event}`;
    if (ids.has(id)) throw new Error(`match_pairs_dialogue_duplicate:${id}`);
    ids.add(id);
    lines.push({ id, characterId, event, text: row[2]!.split("<br>").map((beat) => beat.trim()) });
  }

  return lines;
}
