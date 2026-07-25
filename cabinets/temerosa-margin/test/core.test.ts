import { resultHash } from "@lucky-arcade/engine";
import { describe, expect, it } from "vitest";
import {
  createTemerosaRun,
  reduceTemerosaRun,
  replayTemerosaRun,
  selectDialogueLine,
  selectTemerosaView,
  temerosaStoryContent,
  validateStoryContent,
  type CompanionId,
  type DialogueLine,
  type PlayerApproach,
  type TemerosaAction,
  type TemerosaRunState,
} from "../src/index.ts";

interface Journey { state: TemerosaRunState; actions: TemerosaAction[] }

function dispatch(journey: Journey, action: TemerosaAction): void {
  journey.state = reduceTemerosaRun(temerosaStoryContent, journey.state, action);
  journey.actions.push(action);
}

function advanceNode(journey: Journey): void {
  const nodeId = journey.state.nodeId;
  while (journey.state.nodeId === nodeId) dispatch(journey, { type: "advance" });
}

function choose(journey: Journey, choiceId: string): void {
  dispatch(journey, { type: "choose", choiceId });
}

function playToEvidence(approach: PlayerApproach = "observe"): Journey {
  const journey: Journey = { state: createTemerosaRun(temerosaStoryContent, "pilot", "test-session"), actions: [] };
  choose(journey, `first-${approach}`);
  advanceNode(journey);
  choose(journey, "ask-situation");
  advanceNode(journey);
  advanceNode(journey);
  expect(journey.state.nodeId).toBe("alger-evidence");
  return journey;
}

function playToCompanions(approach: PlayerApproach = "observe"): Journey {
  const journey = playToEvidence(approach);
  choose(journey, approach === "observe" ? "evidence-record" : `evidence-${approach === "reach" ? "signal" : approach === "reckon" ? "count" : "channel"}`);
  advanceNode(journey);
  choose(journey, "register-sign");
  advanceNode(journey);
  advanceNode(journey);
  expect(journey.state.nodeId).toBe("companion-selection");
  return journey;
}

function completeJourney(companions: [CompanionId, CompanionId], askForPactDetail = false): Journey {
  const journey = playToCompanions();
  for (const companionId of companions) dispatch(journey, { type: "toggle_companion", companionId });
  dispatch(journey, { type: "confirm_companions" });
  if (companions.includes("nemo")) {
    choose(journey, "name-nemo");
    advanceNode(journey);
  }
  if (companions.includes("pale")) {
    choose(journey, "pale-clue");
    advanceNode(journey);
  }
  advanceNode(journey);
  if (askForPactDetail) {
    choose(journey, "pacts-ask");
    advanceNode(journey);
    expect(journey.state.memory.companionPacts.every((pact) => !pact.accepted)).toBe(true);
    choose(journey, "pacts-accept-after-detail");
  } else choose(journey, "pacts-accept");
  advanceNode(journey);
  advanceNode(journey);
  expect(selectTemerosaView(temerosaStoryContent, journey.state).kind).toBe("complete");
  return journey;
}

describe("Temerosa story core", () => {
  it("validates the authored graph and appearance-set anchors", () => {
    expect(() => validateStoryContent(temerosaStoryContent)).not.toThrow();
  });

  it("records the first action as a visible preserved and lost resource", () => {
    const initial = createTemerosaRun(temerosaStoryContent, "pilot", "test-session");
    const next = reduceTemerosaRun(temerosaStoryContent, initial, { type: "choose", choiceId: "first-observe" });
    expect(next.memory.playerApproach).toBe("observe");
    expect(next.memory.preservedResourceId).toBe("at272-transmission-record");
    expect(next.memory.lostResourceId).toBe("reserve-power-cell");
  });

  it.each([
    ["reach", ["evidence-signal", "evidence-question"]],
    ["observe", ["evidence-record", "evidence-question"]],
    ["reckon", ["evidence-count", "evidence-question"]],
    ["ask", ["evidence-channel", "evidence-question"]],
  ] as const)("only exposes evidence preserved by the %s approach", (approach, expected) => {
    const journey = playToEvidence(approach);
    const view = selectTemerosaView(temerosaStoryContent, journey.state);
    expect(view.kind).toBe("choice");
    if (view.kind !== "choice") return;
    expect(view.options.map((option) => option.id)).toEqual(expected);
    if (approach !== "observe") expect(() => reduceTemerosaRun(temerosaStoryContent, journey.state, { type: "choose", choiceId: "evidence-record" })).toThrow("temerosa_choice_invalid");
  });

  it("requires exactly two companions and records unaccepted pacts first", () => {
    const journey = playToCompanions();
    dispatch(journey, { type: "toggle_companion", companionId: "pale" });
    expect(() => reduceTemerosaRun(temerosaStoryContent, journey.state, { type: "confirm_companions" })).toThrow("temerosa_two_companions_required");
    dispatch(journey, { type: "toggle_companion", companionId: "kano" });
    dispatch(journey, { type: "confirm_companions" });
    expect(journey.state.memory.companionPacts.map((pact) => [pact.companionId, pact.accepted])).toEqual([["pale", false], ["kano", false]]);
    expect(journey.state.nodeId).toBe("pale-boundary");
  });

  it.each([
    [["pale", "kano"], 40],
    [["pale", "nemo"], 42],
    [["kano", "nemo"], 40],
  ] as const)("completes %j through explicit pact acceptance in %i inputs", (companions, expectedInputs) => {
    const journey = completeJourney([companions[0], companions[1]], false);
    expect(journey.actions).toHaveLength(expectedInputs);
    expect(journey.state.memory.companionPacts.every((pact) => pact.accepted)).toBe(true);
    expect(journey.state.memory.registrationChoiceId).toBe("register-sign");
  });

  it("adds two inputs when the player asks for pact consequences", () => {
    expect(completeJourney(["pale", "kano"], true).actions).toHaveLength(42);
  });

  it("replays the same input log into the same result hash", () => {
    const journey = completeJourney(["pale", "nemo"]);
    const replayed = replayTemerosaRun(temerosaStoryContent, createTemerosaRun(temerosaStoryContent, "pilot", "test-session"), journey.actions);
    expect(resultHash(replayed)).toBe(resultHash(journey.state));
  });

  it("uses priority and recent-line suppression in the dialogue director", () => {
    const initial = createTemerosaRun(temerosaStoryContent, "pilot", "test-session");
    const makeLine = (id: string, priority: 0 | 1 | 2 | 3): DialogueLine => ({ id, speakerId: "alger", speakerName: "알제", text: id, assetId: "review-alger-standing", appearanceSet: "alger/finale/current", frame: "stage", priority, cooldown: 10, condition: {}, observationFact: null, dramaticCue: null });
    const candidates = [makeLine("low", 1), makeLine("high-a", 3), makeLine("high-b", 3)];
    const first = selectDialogueLine(candidates, "scene", initial.memory, "seed");
    expect(first?.priority).toBe(3);
    const memory = { ...initial.memory, lineIds: [first!.id] };
    expect(selectDialogueLine(candidates, "scene", memory, "seed")?.id).not.toBe(first?.id);
  });
});
