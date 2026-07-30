import { describe, expect, it } from "vitest";
import { bundledPack, createTemerosaExpeditionRun, reduceTemerosaExpeditionRun, replayTemerosaExpeditionRun, RECOMMENDED_FORMATIONS, type TemerosaExpeditionAction } from "../src/index.ts";

function completeRun(seed: string) {
  let state = createTemerosaExpeditionRun(bundledPack, seed, "test-session");
  const actions: TemerosaExpeditionAction[] = [{ type: "set_formation", companionIds: [...RECOMMENDED_FORMATIONS.focus] }];
  state = reduceTemerosaExpeditionRun(bundledPack, state, actions[0]!);
  while (state.phase !== "finished") {
    let action: TemerosaExpeditionAction;
    if (state.phase === "route") action = { type: "choose_node", nodeId: state.route[state.depth]![0]!.id };
    else if (state.phase === "battle-ready") action = { type: "resolve_battle" };
    else if (state.phase === "battle-report") action = { type: "acknowledge_battle" };
    else if (state.phase === "reward") action = { type: "choose_reward", rewardId: state.rewards[0]!.id };
    else break;
    actions.push(action);
    state = reduceTemerosaExpeditionRun(bundledPack, state, action);
  }
  return { state, actions };
}

describe("Temerosa Pequod expedition core", () => {
  it("builds seven grounded nodes and requires two unique companions", () => {
    const state = createTemerosaExpeditionRun(bundledPack, "route");
    expect(state.route).toHaveLength(7);
    expect(bundledPack.companions.map((companion) => companion.id)).toEqual(["pale", "kano", "nemo"]);
    expect(bundledPack.missions.map((mission) => mission.enemy)).toContain("트레인헤드");
    expect(() => reduceTemerosaExpeditionRun(bundledPack, state, { type: "set_formation", companionIds: ["pale"] })).toThrow("formation_invalid");
  });

  it("replays the same actions into the same deterministic result", () => {
    const { state, actions } = completeRun("deterministic");
    const replay = replayTemerosaExpeditionRun(bundledPack, createTemerosaExpeditionRun(bundledPack, "deterministic", "test-session"), actions);
    expect(replay).toEqual(state);
  });

  it("records a result hash before presentation", () => {
    let state = createTemerosaExpeditionRun(bundledPack, "receipt");
    state = reduceTemerosaExpeditionRun(bundledPack, state, { type: "set_formation", companionIds: [...RECOMMENDED_FORMATIONS.balanced] });
    const node = state.route[0]!.find((entry) => ["battle", "elite", "boss"].includes(entry.type));
    if (!node) return;
    state = reduceTemerosaExpeditionRun(bundledPack, state, { type: "choose_node", nodeId: node.id });
    state = reduceTemerosaExpeditionRun(bundledPack, state, { type: "resolve_battle" });
    expect(state.transcript?.resultHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps the standard safe-route policy viable across 100 fixed seeds", () => {
    let wins = 0;
    for (let seed = 0; seed < 100; seed += 1) {
      let state = createTemerosaExpeditionRun(bundledPack, `balance-${seed}`, "balance");
      state = reduceTemerosaExpeditionRun(bundledPack, state, { type: "set_formation", companionIds: [...RECOMMENDED_FORMATIONS.balanced] });
      while (state.phase !== "finished") {
        if (state.phase === "route") { const node = state.route[state.depth]!.find((entry) => !["battle", "elite"].includes(entry.type)) ?? state.route[state.depth]![0]!; state = reduceTemerosaExpeditionRun(bundledPack, state, { type: "choose_node", nodeId: node.id }); }
        else if (state.phase === "battle-ready") state = reduceTemerosaExpeditionRun(bundledPack, state, { type: "resolve_battle" });
        else if (state.phase === "battle-report") state = reduceTemerosaExpeditionRun(bundledPack, state, { type: "acknowledge_battle" });
        else if (state.phase === "reward") { const reward = state.rewards.find((entry) => entry.kind === "repair") ?? state.rewards[0]!; state = reduceTemerosaExpeditionRun(bundledPack, state, { type: "choose_reward", rewardId: reward.id }); }
      }
      if (state.outcome === "victory") wins += 1;
    }
    expect(wins).toBeGreaterThanOrEqual(70);
  });
});
