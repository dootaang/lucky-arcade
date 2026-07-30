import { resultHash, XorShift32 } from "@lucky-arcade/engine";
import type { BattleTranscript, CombatExchange, ExpeditionRole, Intervention, RewardOption, RouteNode, RouteNodeType, Tactic, TemerosaExpeditionAction, TemerosaExpeditionContentPack, TemerosaExpeditionRunState, UnitState } from "./contracts.ts";
import { TEMEROSA_EXPEDITION_VERSION } from "./contracts.ts";

const NODE_LABELS: Record<RouteNodeType, string> = { battle: "교전", scout: "기록 탐색", supply: "보급", mystery: "겹친 기록", elite: "위험 구간", repair: "휴식", boss: "트레인헤드" };
const ROLE_PROFILE: Record<ExpeditionRole, { damage: number; hit: number; taken: number; aggro: number }> = {
  bond: { damage: 1, hit: 2, taken: .92, aggro: .9 },
  ward: { damage: .82, hit: 0, taken: .65, aggro: 1.5 },
  echo: { damage: 1.22, hit: 1, taken: 1.08, aggro: .75 },
};

export const RECOMMENDED_FORMATIONS = {
  balanced: ["pale", "kano"],
  focus: ["pale", "nemo"],
  defense: ["kano", "nemo"],
} as const;

export function createTemerosaExpeditionRun(pack: TemerosaExpeditionContentPack, seed: string, sessionId = `temerosa-expedition:${seed}`): TemerosaExpeditionRunState {
  const roster = Object.fromEntries(pack.companions.map((companion): [string, UnitState] => [companion.id, { id: companion.id, hp: companion.maxHp, maxHp: companion.maxHp, mp: companion.maxMp, maxMp: companion.maxMp, power: companion.power, status: "ready" }]));
  return { contract: "temerosa-expedition-run-state/0.1", version: TEMEROSA_EXPEDITION_VERSION, packVersion: pack.version, sessionId, seed, sequence: 0, phase: "formation", roster,
    formation: [], route: createRoute(pack, seed), depth: 0, visited: [], currentNodeId: null, tactic: "balanced", intervention: null, transcript: null, rewards: [], inventory: [], supplies: 3, outcome: null };
}

export function reduceTemerosaExpeditionRun(pack: TemerosaExpeditionContentPack, state: TemerosaExpeditionRunState, action: TemerosaExpeditionAction): TemerosaExpeditionRunState {
  if (state.phase === "finished") return state;
  const sequence = state.sequence + 1;
  switch (action.type) {
    case "set_formation": {
      assert(state.phase === "formation", "formation_phase_required");
      const unique = [...new Set(action.companionIds)];
      assert(unique.length === 2 && unique.every((id) => state.roster[id]), "formation_invalid");
      return { ...state, sequence, formation: unique, phase: "route" };
    }
    case "choose_node": {
      assert(state.phase === "route", "route_phase_required");
      const node = state.route[state.depth]?.find((candidate) => candidate.id === action.nodeId);
      assert(node, "route_node_invalid");
      const common = { ...state, sequence, currentNodeId: node.id, visited: [...state.visited, node.id] };
      if (["battle", "elite", "boss"].includes(node.type)) return { ...common, phase: "battle-ready", tactic: "balanced", intervention: { type: "brace", round: 3 }, transcript: null, rewards: [] };
      const resolved = resolveUtilityNode(common, node.type);
      return { ...resolved, phase: "reward", rewards: utilityRewards(pack, node.type, resolved) };
    }
    case "choose_tactic":
      assert(state.phase === "battle-ready", "battle_ready_required");
      return { ...state, sequence, tactic: action.tactic };
    case "schedule_intervention":
      assert(state.phase === "battle-ready", "battle_ready_required");
      assert(action.round >= 1 && action.round <= 8, "intervention_round_invalid");
      return { ...state, sequence, intervention: { type: action.intervention, round: action.round } };
    case "resolve_battle": {
      assert(state.phase === "battle-ready", "battle_ready_required");
      const transcript = resolveBattle(pack, state, currentNode(state));
      const roster = { ...state.roster };
      for (const result of transcript.alliesAfter) roster[result.id] = { ...roster[result.id]!, hp: result.hp, status: result.hp <= 0 ? "disabled" : result.hp < result.maxHp ? "damaged" : "ready" };
      return { ...state, sequence, phase: "battle-report", roster, transcript };
    }
    case "acknowledge_battle":
      assert(state.phase === "battle-report" && state.transcript, "battle_report_required");
      return state.transcript.outcome === "defeat"
        ? { ...state, sequence, phase: "finished", outcome: "defeat" }
        : { ...state, sequence, phase: "reward", rewards: battleRewards(pack, state) };
    case "choose_reward": {
      assert(state.phase === "reward", "reward_phase_required");
      const reward = state.rewards.find((candidate) => candidate.id === action.rewardId);
      assert(reward, "reward_invalid");
      const rewarded = applyReward(state, reward), nextDepth = state.depth + 1, finished = nextDepth >= state.route.length;
      return { ...rewarded, sequence, depth: nextDepth, currentNodeId: null, rewards: [], transcript: null, phase: finished ? "finished" : "route", outcome: finished ? "victory" : state.outcome };
    }
    case "retreat": return { ...state, sequence, phase: "finished", outcome: "retreated" };
  }
}

export function replayTemerosaExpeditionRun(pack: TemerosaExpeditionContentPack, initial: TemerosaExpeditionRunState, actions: readonly TemerosaExpeditionAction[]): TemerosaExpeditionRunState {
  return actions.reduce((state, action) => reduceTemerosaExpeditionRun(pack, state, action), initial);
}

function createRoute(pack: TemerosaExpeditionContentPack, seed: string): RouteNode[][] {
  const rng = new XorShift32(`${seed}:route`), pools: RouteNodeType[][] = [
    ["battle", "scout", "supply"], ["battle", "mystery", "repair"], ["battle", "elite", "scout"], ["battle", "supply", "mystery"], ["elite", "battle", "repair"], ["elite", "supply", "battle"], ["boss"],
  ];
  return pools.map((pool, depth) => shuffled(pool, rng).slice(0, depth === 6 ? 1 : 2).map((type, index): RouteNode => ({ id: `n${depth}-${index}-${type}`, depth, type, label: NODE_LABELS[type], danger: Math.min(5, 1 + Math.floor(depth / 2) + (type === "elite" ? 1 : type === "boss" ? 2 : 0)), missionId: pack.missions[depth]!.id })));
}

function resolveBattle(pack: TemerosaExpeditionContentPack, state: TemerosaExpeditionRunState, node: RouteNode): BattleTranscript {
  const mission = pack.missions.find((entry) => entry.id === node.missionId) ?? pack.missions[0]!;
  const rng = new XorShift32(`${state.seed}:battle:${node.id}`);
  const allies = state.formation.map((id, index) => {
    const definition = pack.companions.find((companion) => companion.id === id)!, unit = state.roster[id]!;
    return { id, name: definition.name, role: definition.role, grade: definition.grade, power: unit.power, hp: unit.hp, maxHp: unit.maxHp, row: index };
  });
  const enemyCount = node.type === "boss" ? 1 : node.type === "elite" ? 3 : 2;
  const totalPower = mission.power * (node.type === "elite" ? 1.12 : node.type === "boss" ? 1.2 : 1);
  const enemies = Array.from({ length: enemyCount }, (_, index) => {
    const boss = node.type === "boss" && index === 0, power = boss ? pack.boss.power : Math.round(totalPower / enemyCount), maxHp = boss ? pack.boss.maxHp : Math.max(520, Math.round(totalPower * 2.2 / enemyCount));
    return { id: boss ? pack.boss.id : `${node.id}-enemy-${index + 1}`, name: boss ? pack.boss.name : `${mission.enemy} ${index + 1}`, power, hp: maxHp, maxHp };
  });
  const rounds: BattleTranscript["rounds"] = [], tactic = TACTICS[state.tactic];
  for (let round = 1; round <= 8; round += 1) {
    const exchanges: CombatExchange[] = [], morale: Array<{ companionId: string; success: boolean }> = [];
    for (const ally of allies.filter((unit) => unit.hp > 0)) {
      const targets = enemies.filter((enemy) => enemy.hp > 0), target = state.intervention?.type === "focus" && state.intervention.round === round ? targets.sort((a, b) => a.hp - b.hp)[0] : targets[0];
      if (!target) break;
      const profile = ROLE_PROFILE[ally.role], roll = 1 + (rng.nextUint32() % 20), critical = roll === 20, hit = critical || roll + ally.grade + profile.hit + tactic.hit >= 8;
      const intervention = state.intervention?.round === round ? state.intervention.type : null;
      const damage = hit ? Math.max(1, Math.round(ally.power * .28 * profile.damage * tactic.damage * (critical ? 1.6 : 1) * (intervention === "focus" ? 1.2 : 1) - target.power * .018)) : 0;
      target.hp = Math.max(0, target.hp - damage); exchanges.push({ side: "ally", actorId: ally.id, targetId: target.id, hit, critical, damage, hpAfter: target.hp });
    }
    for (const enemy of enemies.filter((unit) => unit.hp > 0)) {
      const living = allies.filter((unit) => unit.hp > 0); if (!living.length) break;
      const weights = living.map((unit) => Math.round(ROLE_PROFILE[unit.role].aggro * (unit.row === 0 ? 1.2 : .9) * 100));
      let pick = rng.nextUint32() % weights.reduce((sum, value) => sum + value, 0), target = living[0]!;
      for (let index = 0; index < living.length; index += 1) { pick -= weights[index]!; if (pick < 0) { target = living[index]!; break; } }
      const roll = 1 + (rng.nextUint32() % 20), critical = roll === 20, hit = critical || roll + (state.intervention?.type === "barrage" && state.intervention.round === round ? -3 : 0) >= 8;
      const brace = state.intervention?.type === "brace" && state.intervention.round === round ? .5 : 1;
      const damage = hit ? Math.max(1, Math.round((enemy.power * .46 - target.power * .01) * ROLE_PROFILE[target.role].taken * tactic.incoming * brace * (critical ? 1.5 : 1))) : 0;
      target.hp = Math.max(0, target.hp - damage); exchanges.push({ side: "enemy", actorId: enemy.id, targetId: target.id, hit, critical, damage, hpAfter: target.hp });
    }
    for (const ally of allies.filter((unit) => unit.hp > 0 && unit.hp / unit.maxHp < .25)) { const success = (1 + (rng.nextUint32() % 20)) + Math.floor((pack.companions.find((companion) => companion.id === ally.id)?.mood ?? 50) / 20) >= 8; morale.push({ companionId: ally.id, success }); }
    rounds.push({ round, exchanges, morale });
    if (!allies.some((unit) => unit.hp > 0) || !enemies.some((unit) => unit.hp > 0)) break;
  }
  const draft = { battleId: `${state.sessionId}:${node.id}`, seed: `${state.seed}:battle:${node.id}`, rulesVersion: TEMEROSA_EXPEDITION_VERSION, tactic: state.tactic, intervention: state.intervention, rounds,
    alliesAfter: allies.map(({ id, hp, maxHp }) => ({ id, hp, maxHp })), enemiesAfter: enemies.map(({ id, name, hp, maxHp }) => ({ id, name, hp, maxHp })), outcome: enemies.every((unit) => unit.hp <= 0) ? "victory" as const : "defeat" as const };
  return { ...draft, resultHash: resultHash(draft) };
}

const TACTICS: Record<Tactic, { hit: number; damage: number; incoming: number }> = { focus: { hit: 2, damage: 1.15, incoming: 1.15 }, balanced: { hit: 0, damage: 1, incoming: 1 }, cover: { hit: -2, damage: .86, incoming: .7 } };
function currentNode(state: TemerosaExpeditionRunState): RouteNode { const node = state.route[state.depth]?.find((candidate) => candidate.id === state.currentNodeId); assert(node, "current_node_missing"); return node; }
function resolveUtilityNode(state: TemerosaExpeditionRunState, type: RouteNodeType): TemerosaExpeditionRunState { if (type === "repair") { const roster = Object.fromEntries(Object.entries(state.roster).map(([id, unit]) => [id, { ...unit, hp: Math.min(unit.maxHp, unit.hp + Math.ceil(unit.maxHp * .25)), status: "ready" as const }])); return { ...state, roster }; } return type === "supply" ? { ...state, supplies: state.supplies + 2 } : state; }
function utilityRewards(pack: TemerosaExpeditionContentPack, type: RouteNodeType, state: TemerosaExpeditionRunState): RewardOption[] { return type === "repair" ? [{ id: "field-repair", kind: "repair", label: "숨 고르기", detail: "손상이 큰 두 동료를 더 회복" }] : type === "supply" ? [{ id: "supply-box", kind: "supply", label: "보급함", detail: "보급품 3개 획득" }] : battleRewards(pack, state).slice(0, 2); }
function battleRewards(pack: TemerosaExpeditionContentPack, state: TemerosaExpeditionRunState): RewardOption[] { const rng = new XorShift32(`${state.seed}:loot:${state.currentNodeId}`), salvage = pack.salvage[rng.nextUint32() % pack.salvage.length]!; return [{ id: "repair", kind: "repair", label: "현장 수복", detail: "손상이 큰 두 동료 체력 35% 회복" }, { id: "supply", kind: "supply", label: "보급 회수", detail: "보급품 2개 획득" }, { id: `record:${salvage.id}`, kind: "record", label: salvage.name, detail: salvage.description }]; }
function applyReward(state: TemerosaExpeditionRunState, reward: RewardOption): TemerosaExpeditionRunState { if (reward.kind === "repair") { const roster = { ...state.roster }, targets = state.formation.map((id) => roster[id]!).filter(Boolean).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 2); for (const unit of targets) roster[unit.id] = { ...unit, hp: Math.min(unit.maxHp, unit.hp + Math.ceil(unit.maxHp * .35)), status: "ready" }; return { ...state, roster }; } if (reward.kind === "supply") return { ...state, supplies: state.supplies + (reward.id === "supply-box" ? 3 : 2) }; return { ...state, inventory: [...state.inventory, reward.label] }; }
function shuffled<T>(input: readonly T[], rng: XorShift32): T[] { const output = [...input]; for (let index = output.length - 1; index > 0; index -= 1) { const target = rng.nextUint32() % (index + 1); [output[index], output[target]] = [output[target] as T, output[index] as T]; } return output; }
function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
