import { resultHash } from "@lucky-arcade/engine";
import { describe, expect, it } from "vitest";
import { createTemerosaRun, reduceTemerosaRun, replayTemerosaRun, selectDialogueLine, selectTemerosaView, temerosaStoryContent, validateStoryContent, type DialogueLine, type TemerosaAction } from "../src/index.ts";

function reachCompanionSelection() {
  let state = createTemerosaRun(temerosaStoryContent, "pilot", "test-session");
  const actions: TemerosaAction[] = [
    { type: "choose", choiceId: "first-observe" }, { type: "advance" },
    { type: "advance" }, { type: "advance" },
    { type: "choose", choiceId: "ask-situation" }, { type: "advance" }, { type: "advance" },
    { type: "advance" }, { type: "advance" },
    { type: "advance" }, { type: "advance" }, { type: "advance" }, { type: "advance" },
    { type: "choose", choiceId: "evidence-record" }, { type: "advance" },
    { type: "advance" }, { type: "advance" }, { type: "advance" },
    { type: "choose", choiceId: "register-sign" }, { type: "advance" }, { type: "advance" },
    { type: "advance" }, { type: "advance" }, { type: "advance" },
  ];
  state = replayTemerosaRun(temerosaStoryContent, state, actions);
  return { state, actions };
}

describe("Temerosa story core", () => {
  it("validates the authored graph and appearance-set anchors", () => {
    expect(() => validateStoryContent(temerosaStoryContent)).not.toThrow();
  });

  it("records the first action as a real preserved and lost resource", () => {
    const initial = createTemerosaRun(temerosaStoryContent, "pilot", "test-session");
    const next = reduceTemerosaRun(temerosaStoryContent, initial, { type: "choose", choiceId: "first-observe" });
    expect(next.memory.playerApproach).toBe("observe");
    expect(next.memory.preservedResourceId).toBe("at272-transmission-record");
    expect(next.memory.lostResourceId).toBe("reserve-power-cell");
  });

  it("requires exactly two companions and creates their pacts", () => {
    let { state } = reachCompanionSelection();
    expect(selectTemerosaView(temerosaStoryContent, state).kind).toBe("companions");
    state = reduceTemerosaRun(temerosaStoryContent, state, { type: "toggle_companion", companionId: "pale" });
    expect(() => reduceTemerosaRun(temerosaStoryContent, state, { type: "confirm_companions" })).toThrow("temerosa_two_companions_required");
    state = reduceTemerosaRun(temerosaStoryContent, state, { type: "toggle_companion", companionId: "kano" });
    state = reduceTemerosaRun(temerosaStoryContent, state, { type: "confirm_companions" });
    expect(state.memory.companionPacts.map((pact) => pact.companionId)).toEqual(["pale", "kano"]);
    expect(state.nodeId).toBe("pale-boundary");
  });

  it("replays the same input log into the same result hash", () => {
    const { state, actions } = reachCompanionSelection();
    const replayed = replayTemerosaRun(temerosaStoryContent, createTemerosaRun(temerosaStoryContent, "pilot", "test-session"), actions);
    expect(resultHash(replayed)).toBe(resultHash(state));
  });

  it("uses priority and recent-line suppression in the dialogue director", () => {
    const initial = createTemerosaRun(temerosaStoryContent, "pilot", "test-session");
    const makeLine = (id: string, priority: 0 | 1 | 2 | 3): DialogueLine => ({ id, speakerId: "alger", speakerName: "알제", text: id, assetId: "review-alger-surprised", appearanceSet: "alger/finale/current", frame: "stage", priority, cooldown: 10, condition: {}, observationFact: null, dramaticCue: null });
    const candidates = [makeLine("low", 1), makeLine("high-a", 3), makeLine("high-b", 3)];
    const first = selectDialogueLine(candidates, "scene", initial.memory, "seed");
    expect(first?.priority).toBe(3);
    const memory = { ...initial.memory, lineIds: [first!.id] };
    expect(selectDialogueLine(candidates, "scene", memory, "seed")?.id).not.toBe(first?.id);
  });
});
