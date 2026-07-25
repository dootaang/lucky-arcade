/// <reference types="node" />
import { resultHash } from "@lucky-arcade/engine";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  availablePairs,
  createOldMaidState,
  oldMaidSpeechEvents,
  oldMaidSpeechSnapshot,
  reduceOldMaid,
  selectOldMaidSpeech,
  temerosaOldMaidCartridge,
  temerosaOldMaidLines,
  validateOldMaidLines,
  type OldMaidAction,
  type OldMaidCartridge,
  type OldMaidLineEvent,
  type OldMaidSpeech,
  type OldMaidState,
} from "../src/index.ts";

interface Transition { previous: OldMaidState; next: OldMaidState; }

describe("old maid seat dialogue", () => {
  it("does not change any of 10,000 deterministic game results", () => {
    const { lines: _lines, ...silent } = temerosaOldMaidCartridge;
    for (let seed = 0; seed < 10_000; seed += 1) {
      const value = `dialogue-invariance-${seed}`;
      expect(resultHash(autoplay(temerosaOldMaidCartridge, value).state), value).toBe(resultHash(autoplay(silent, value).state));
    }
  }, 30_000);

  it("returns the same selection for identical public transition inputs", () => {
    const { transition, speech } = findSpokenTransition();
    for (let repeat = 0; repeat < 100; repeat += 1) {
      expect(selectSpeech(temerosaOldMaidCartridge, transition)).toEqual(speech);
    }
  });

  it("returns at most one CPU speech per transition across 1,000 games", () => {
    const events = new Set<OldMaidLineEvent>();
    for (let seed = 0; seed < 1_000; seed += 1) autoplay(temerosaOldMaidCartridge, `dialogue-budget-${seed}`, (transition) => {
      for (const event of speechEvents(temerosaOldMaidCartridge, transition)) events.add(event.event);
      const speech = selectSpeech(temerosaOldMaidCartridge, transition);
      expect(speech === null || /^cpu-[123]$/.test(speech.seatId)).toBe(true);
    });
    expect([...events].sort()).toEqual(["emptied", "idle-draw", "joker-drawn", "joker-left", "pair-discard", "pair-made", "taken-from", "watching"]);
  });

  it("stays silent before play, in the final two-seat phase, and after completion", () => {
    const ready = createOldMaidState(temerosaOldMaidCartridge, "dialogue-silence", "test-session");
    const dealing = reduceOldMaid(temerosaOldMaidCartridge, ready, { type: "start" });
    expect(speechEvents(temerosaOldMaidCartridge, { previous: ready, next: ready })).toEqual([]);
    expect(speechEvents(temerosaOldMaidCartridge, { previous: ready, next: dealing })).toEqual([]);

    const run = autoplay(temerosaOldMaidCartridge, "dialogue-silence-complete");
    const last = run.transitions.at(-1) as Transition;
    expect(last.next.status).toBe("complete");
    expect(speechEvents(temerosaOldMaidCartridge, last)).toEqual([]);

    const twoSeats = { ...last.previous, status: "playing" as const, hands: { ...last.previous.hands, player: [], "cpu-3": [] } };
    expect(Object.values(twoSeats.hands).filter((hand) => hand.length > 0).length).toBeLessThanOrEqual(2);
    expect(speechEvents(temerosaOldMaidCartridge, { previous: last.previous, next: twoSeats })).toEqual([]);
  });

  it("never selects the player seat", () => {
    for (let seed = 0; seed < 1_000; seed += 1) autoplay(temerosaOldMaidCartridge, `dialogue-player-${seed}`, (transition) => {
      expect(selectSpeech(temerosaOldMaidCartridge, transition)?.seatId).not.toBe("player");
    });
  });

  it("contains one complete, valid 9 by 8 Temerosa line matrix", () => {
    expect(() => validateOldMaidLines(temerosaOldMaidCartridge)).not.toThrow();
    expect(temerosaOldMaidLines).toHaveLength(72);
    expect(new Set(temerosaOldMaidLines.map((line) => line.id)).size).toBe(72);
    for (const character of temerosaOldMaidCartridge.characters) {
      expect(temerosaOldMaidLines.filter((line) => line.characterId === character.id).map((line) => line.event).sort()).toEqual([
        "emptied", "idle-draw", "joker-drawn", "joker-left", "pair-discard", "pair-made", "taken-from", "watching",
      ]);
    }
    expect(temerosaOldMaidLines.find((line) => line.id === "nemo-joker-drawn")?.text).toEqual(["…한 번만. 딱 한 번만 되돌리면 되는데.", "…안 해."]);
    expect(new Map(temerosaOldMaidLines.map((line) => [line.id, line.text]))).toEqual(dialogueBookLines());
    const first = temerosaOldMaidLines[0] as (typeof temerosaOldMaidLines)[number];
    expect(() => validateOldMaidLines({ ...temerosaOldMaidCartridge, lines: [first, first] })).toThrow(/old_maid_line_duplicate/);
    expect(() => validateOldMaidLines({ ...temerosaOldMaidCartridge, lines: [{ ...first, id: "missing-character", characterId: "missing" }] })).toThrow(/old_maid_line_character_missing/);
    expect(() => validateOldMaidLines({ ...temerosaOldMaidCartridge, lines: [{ ...first, id: "empty-text", text: [] }] })).toThrow(/old_maid_line_text_empty/);
  });

  it("avoids a recent line when the same character and event has another line", () => {
    const { transition } = findSpokenTransition();
    const baseline = selectSpeech(temerosaOldMaidCartridge, transition) as OldMaidSpeech;
    const alternate = { ...baseline.line, id: `${baseline.line.id}-alternate`, text: ["대체 줄"] };
    const cartridge = { ...temerosaOldMaidCartridge, lines: [...temerosaOldMaidLines, alternate] };
    const first = selectSpeech(cartridge, transition) as OldMaidSpeech;
    const second = selectSpeech(cartridge, transition, [first.line.id]);
    expect(second?.line.id).not.toBe(first.line.id);
    expect([baseline.line.id, alternate.id]).toContain(second?.line.id);
  });

  it("does not fall back to another character when the chosen pool is empty", () => {
    const { transition, speech } = findSpokenTransition();
    const cartridge = { ...temerosaOldMaidCartridge, lines: temerosaOldMaidLines.filter((line) => line.characterId !== speech.line.characterId || line.event !== speech.line.event) };
    expect(selectSpeech(cartridge, transition)).toBeNull();
  });
});

function findSpokenTransition(): { transition: Transition; speech: OldMaidSpeech } {
  for (let seed = 0; seed < 100; seed += 1) {
    let found: { transition: Transition; speech: OldMaidSpeech } | null = null;
    autoplay(temerosaOldMaidCartridge, `dialogue-spoken-${seed}`, (transition) => {
      const speech = selectSpeech(temerosaOldMaidCartridge, transition);
      if (!found && speech) found = { transition, speech };
    });
    if (found) return found;
  }
  throw new Error("dialogue_spoken_transition_missing");
}

function speechEvents(cartridge: OldMaidCartridge, transition: Transition) {
  return oldMaidSpeechEvents(cartridge, oldMaidSpeechSnapshot(transition.previous), oldMaidSpeechSnapshot(transition.next));
}

function selectSpeech(cartridge: OldMaidCartridge, transition: Transition, recentLineIds: readonly string[] = []) {
  return selectOldMaidSpeech(cartridge, oldMaidSpeechSnapshot(transition.previous), oldMaidSpeechSnapshot(transition.next), recentLineIds);
}

function dialogueBookLines(): Map<string, readonly string[]> {
  const characterIds = new Map([["페일", "pale"], ["카노", "kano"], ["네모", "nemo"], ["바치칼", "bacikal"], ["알제", "alger"], ["박니은", "nieun"], ["라일라", "lyla"], ["리엘", "riel"], ["워어즈", "wares"]]);
  const output = new Map<string, readonly string[]>();
  let characterId: string | null = null;
  for (const sourceLine of readFileSync(new URL("../../../docs/TEMEROSA-OLD-MAID-DIALOGUE.md", import.meta.url), "utf8").split(/\r?\n/)) {
    const heading = /^### ([^—]+) —/.exec(sourceLine);
    if (heading) characterId = characterIds.get(heading[1]?.trim() ?? "") ?? null;
    const row = /^\| `([^`]+)` \| (.+) \|$/.exec(sourceLine);
    if (characterId && row) output.set(`${characterId}-${row[1]}`, (row[2] ?? "").split("<br>"));
  }
  return output;
}

function autoplay(cartridge: OldMaidCartridge, seed: string, visit?: (transition: Transition) => void): { state: OldMaidState; transitions: Transition[] } {
  let state = createOldMaidState(cartridge, seed, "test-session");
  const transitions: Transition[] = [];
  const dispatch = (action: OldMaidAction) => {
    const previous = state;
    state = reduceOldMaid(cartridge, state, action);
    const transition = { previous, next: state };
    transitions.push(transition);
    visit?.(transition);
  };
  dispatch({ type: "start" });
  dispatch({ type: "finish_deal" });
  for (let step = 0; state.status !== "complete" && step < 2_000; step += 1) {
    dispatch(state.status === "revealing" ? { type: "collect_draw" }
      : state.status === "discarding" ? { type: "discard_pair", cardIds: availablePairs(cartridge, state)[0] as [string, string] }
      : state.status === "offering" && state.offer?.phase === "arranging" && state.offer.targetId === "player" ? { type: "finish_offer" }
      : state.status === "offering" && state.offer?.phase === "arranging" ? { type: "prepare_cpu_offer" }
      : state.status === "offering" ? { type: "finish_offer" }
      : state.currentPlayerId === "player" ? { type: "draw", index: 0 } : { type: "cpu_draw" });
  }
  expect(state.status).toBe("complete");
  return { state, transitions };
}
