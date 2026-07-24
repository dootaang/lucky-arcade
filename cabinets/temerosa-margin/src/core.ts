import type { CompanionId, ChoiceNode, DialogueNode, StoryMemory, StoryNode, TemerosaAction, TemerosaRunState, TemerosaStoryContent, TemerosaView } from "./contracts.ts";
import { TEMEROSA_MARGIN_VERSION, TEMEROSA_PACK_VERSION } from "./contracts.ts";

const FIRST_ACTIONS = {
  "first-reach": { approach: "reach", preserved: "living-signal-segment", lost: "old-transmission-fragment" },
  "first-observe": { approach: "observe", preserved: "at272-transmission-record", lost: "reserve-power-cell" },
  "first-reckon": { approach: "reckon", preserved: "return-coordinate-power", lost: "first-eight-seconds" },
  "first-ask": { approach: "ask", preserved: "two-way-rescue-channel", lost: "locked-cache-power" },
} as const;

export function createTemerosaRun(content: TemerosaStoryContent, seed: string, sessionId = `temerosa-${Date.now().toString(36)}`): TemerosaRunState {
  validateStoryContent(content);
  return {
    contract: "temerosa-run-state/0.1", version: TEMEROSA_MARGIN_VERSION, packVersion: TEMEROSA_PACK_VERSION,
    sessionId, seed, sequence: 0, nodeId: content.startNodeId, lineIndex: 0,
    memory: {
      playerApproach: null, preservedResourceId: null, lostResourceId: null, choiceIds: [], lineIds: [], navigatorStage: "unregistered",
      selectedCompanions: [], companionPacts: [], nemoName: null, paleBoundaryId: null, currentRouteRecordIds: [], deadRouteRecordIds: [], salvage: {},
      echo: { deaths: 0, deadRouteCardIds: [], bossVariantIds: [], rememberedPromiseIds: [] },
      emotions: ["nieun", "alger", "pale", "kano", "nemo"].map((characterId) => ({ characterId: characterId as "nieun" | "alger" | "pale" | "kano" | "nemo", bond: "unfamiliar", pressure: "stable" })),
      flags: [],
    },
  };
}

export function reduceTemerosaRun(content: TemerosaStoryContent, state: TemerosaRunState, action: TemerosaAction): TemerosaRunState {
  if (action.type === "restart") return createTemerosaRun(content, state.seed, state.sessionId);
  const node = getNode(content, state.nodeId);
  if (action.type === "advance") {
    assert(node.kind === "dialogue", "temerosa_advance_requires_dialogue");
    const currentLine = node.lines[state.lineIndex];
    assert(currentLine, "temerosa_line_missing");
    const memory = { ...state.memory, lineIds: appendUnique(state.memory.lineIds, currentLine.id) };
    if (state.lineIndex < node.lines.length - 1) return { ...state, sequence: state.sequence + 1, lineIndex: state.lineIndex + 1, memory };
    return enterNode(content, { ...state, sequence: state.sequence + 1, memory }, resolveNextNode(node.nextId, state));
  }
  if (action.type === "choose") {
    assert(node.kind === "choice", "temerosa_choice_requires_choice_node");
    assert(node.options.some((option) => option.id === action.choiceId), "temerosa_choice_invalid");
    if (node.id === "pact-confirm" && action.choiceId === "pacts-ask" && state.memory.flags.includes("pacts-explained")) throw new Error("temerosa_choice_already_used");
    const memory = applyChoice(state.memory, action.choiceId);
    const configuredNext = node.nextByChoice[action.choiceId];
    assert(configuredNext, "temerosa_choice_route_missing");
    return enterNode(content, { ...state, sequence: state.sequence + 1, memory }, resolveChoiceNext(node, configuredNext, memory));
  }
  if (action.type === "toggle_companion") {
    assert(node.kind === "companions", "temerosa_companion_phase_required");
    assert(content.companions.some((companion) => companion.id === action.companionId), "temerosa_companion_invalid");
    const selected = state.memory.selectedCompanions.includes(action.companionId)
      ? state.memory.selectedCompanions.filter((id) => id !== action.companionId)
      : state.memory.selectedCompanions.length < 2 ? [...state.memory.selectedCompanions, action.companionId] : state.memory.selectedCompanions;
    return { ...state, sequence: state.sequence + 1, memory: { ...state.memory, selectedCompanions: selected } };
  }
  assert(node.kind === "companions", "temerosa_companion_phase_required");
  assert(state.memory.selectedCompanions.length === 2, "temerosa_two_companions_required");
  const pacts = state.memory.selectedCompanions.map((id) => companionPact(id));
  const memory = { ...state.memory, companionPacts: pacts };
  const nextId = state.memory.selectedCompanions.includes("nemo") ? "nemo-name" : state.memory.selectedCompanions.includes("pale") ? "pale-boundary" : "pact-confirm";
  return enterNode(content, { ...state, sequence: state.sequence + 1, memory }, nextId);
}

export function selectTemerosaView(content: TemerosaStoryContent, state: TemerosaRunState): TemerosaView {
  const node = getNode(content, state.nodeId);
  const progress = Math.min(1, state.sequence / 28);
  if (node.kind === "dialogue") {
    const current = node.lines[state.lineIndex];
    assert(current, "temerosa_line_missing");
    return { kind: "dialogue", scene: node.scene, title: node.title, line: current, canAdvance: true, progress };
  }
  if (node.kind === "choice") {
    const options = node.id === "pact-confirm" && state.memory.flags.includes("pacts-explained") ? node.options.filter((option) => option.id !== "pacts-ask") : node.options;
    return { kind: "choice", scene: node.scene, title: node.title, prompt: node.prompt, options, progress };
  }
  if (node.kind === "companions") return { kind: "companions", scene: 2, title: node.title, companions: content.companions, selected: state.memory.selectedCompanions, canConfirm: state.memory.selectedCompanions.length === 2, progress };
  return { kind: "complete", scene: 2, title: node.title, companions: content.companions.filter((companion) => state.memory.selectedCompanions.includes(companion.id)), memory: state.memory, progress: 1 };
}

export function replayTemerosaRun(content: TemerosaStoryContent, initial: TemerosaRunState, actions: readonly TemerosaAction[]): TemerosaRunState {
  return actions.reduce((state, action) => reduceTemerosaRun(content, state, action), initial);
}

export function validateStoryContent(content: TemerosaStoryContent): void {
  assert(content.contract === "temerosa-story-content/0.1", "temerosa_content_contract_invalid");
  assert(content.version === TEMEROSA_PACK_VERSION, "temerosa_content_version_invalid");
  const ids = new Set<string>();
  const lineIds = new Set<string>();
  for (const node of content.nodes) {
    assert(!ids.has(node.id), `temerosa_node_duplicate:${node.id}`); ids.add(node.id);
    if (node.kind === "dialogue") for (const storyLine of node.lines) {
      assert(!lineIds.has(storyLine.id), `temerosa_line_duplicate:${storyLine.id}`); lineIds.add(storyLine.id);
      if (storyLine.assetId) assert(storyLine.appearanceSet, `temerosa_appearance_missing:${storyLine.id}`);
    }
  }
  assert(ids.has(content.startNodeId), "temerosa_start_node_missing");
  for (const node of content.nodes) {
    if (node.kind === "dialogue") assert(ids.has(node.nextId), `temerosa_route_missing:${node.id}:${node.nextId}`);
    if (node.kind === "choice") for (const option of node.options) {
      const destination = node.nextByChoice[option.id] ?? "";
      assert(destination === "departure" || ids.has(destination), `temerosa_choice_route_missing:${node.id}:${option.id}`);
    }
  }
}

function applyChoice(memory: StoryMemory, choiceId: string): StoryMemory {
  let next: StoryMemory = { ...memory, choiceIds: [...memory.choiceIds, choiceId] };
  const first = FIRST_ACTIONS[choiceId as keyof typeof FIRST_ACTIONS];
  if (first) next = { ...next, playerApproach: first.approach, preservedResourceId: first.preserved, lostResourceId: first.lost };
  if (choiceId.startsWith("register-")) next = { ...next, navigatorStage: "provisional", flags: appendUnique(next.flags, "provisional-navigator") };
  if (choiceId === "name-nemo") next = { ...next, nemoName: "nemo" };
  if (choiceId === "name-bacikal") next = { ...next, nemoName: "bacikal" };
  if (choiceId === "name-self") next = { ...next, nemoName: "self" };
  if (choiceId.startsWith("pale-")) next = { ...next, paleBoundaryId: choiceId };
  if (choiceId === "pacts-ask") next = { ...next, flags: appendUnique(next.flags, "pacts-explained") };
  if (choiceId === "pacts-accept") next = { ...next, companionPacts: next.companionPacts.map((pact) => ({ ...pact, accepted: true })), flags: appendUnique(next.flags, "pacts-accepted") };
  return next;
}

function resolveChoiceNext(node: ChoiceNode, nextId: string, memory: StoryMemory): string {
  if (node.id === "nemo-name" && !memory.selectedCompanions.includes("pale")) return "pact-confirm";
  if (node.id === "pale-boundary" && !memory.selectedCompanions.includes("pale")) return "pact-confirm";
  if (node.id === "pact-confirm" && nextId === "departure") return departureNode(memory.selectedCompanions);
  return nextId;
}

function resolveNextNode(nextId: string, state: TemerosaRunState): string {
  if (nextId === "pale-boundary" && !state.memory.selectedCompanions.includes("pale")) return "pact-confirm";
  return nextId;
}

function departureNode(companions: CompanionId[]): string {
  const key = [...companions].sort().join("-");
  if (key === "kano-pale") return "departure-pale-kano";
  if (key === "nemo-pale") return "departure-pale-nemo";
  if (key === "kano-nemo") return "departure-kano-nemo";
  throw new Error("temerosa_companion_pair_invalid");
}

function companionPact(id: CompanionId) {
  return { companionId: id, conditionId: `${id}-condition`, refusalRuleId: `${id}-refusal`, accepted: false, breached: false };
}

function enterNode(content: TemerosaStoryContent, state: TemerosaRunState, nodeId: string): TemerosaRunState {
  getNode(content, nodeId);
  return { ...state, nodeId, lineIndex: 0 };
}

function getNode(content: TemerosaStoryContent, id: string): StoryNode {
  const node = content.nodes.find((candidate) => candidate.id === id);
  assert(node, `temerosa_node_missing:${id}`);
  return node;
}

function appendUnique(values: string[], value: string): string[] { return values.includes(value) ? values : [...values, value]; }
function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
