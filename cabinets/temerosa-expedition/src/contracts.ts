import { z } from "zod";

export const TEMEROSA_EXPEDITION_VERSION = "temerosa-pequod-expedition/0.1" as const;
export const TEMEROSA_EXPEDITION_PACK_VERSION = "0.1.0" as const;
export const expeditionRoleSchema = z.enum(["bond", "ward", "echo"]);
export type ExpeditionRole = z.infer<typeof expeditionRoleSchema>;

export const companionSchema = z.object({
  id: z.string(), name: z.string(), role: expeditionRoleSchema, grade: z.number().int().min(1).max(6),
  maxHp: z.number().positive(), maxMp: z.number().positive(), power: z.number().positive(), mood: z.number(),
  description: z.string(), asset: z.string(),
});
export type CompanionDefinition = z.infer<typeof companionSchema>;

export const expeditionNodeSchema = z.object({
  id: z.string(), name: z.string(), enemy: z.string(), factions: z.array(z.string()), power: z.number().positive(),
  description: z.string(), boss: z.string().optional(), rewards: z.record(z.string(), z.number()),
});
export type ExpeditionNodeDefinition = z.infer<typeof expeditionNodeSchema>;

export const contentPackSchema = z.object({
  contract: z.literal("temerosa-expedition-content-pack/0.1"), packId: z.literal("temerosa-pequod-expedition"), version: z.string(),
  companions: z.array(companionSchema).length(3),
  boss: companionSchema.omit({ role: true }).extend({ role: z.literal("boss") }),
  missions: z.array(expeditionNodeSchema).length(7),
  records: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
  salvage: z.array(z.object({ id: z.string(), name: z.string(), power: z.number(), description: z.string() })),
  assets: z.record(z.string(), z.string()),
});
export type TemerosaExpeditionContentPack = z.infer<typeof contentPackSchema>;

export type ExpeditionPhase = "formation" | "route" | "battle-ready" | "battle-report" | "reward" | "finished";
export type RouteNodeType = "battle" | "scout" | "supply" | "mystery" | "elite" | "repair" | "boss";
export type Tactic = "focus" | "balanced" | "cover";
export type Intervention = "focus" | "brace" | "barrage";

export interface RouteNode { id: string; depth: number; type: RouteNodeType; label: string; danger: number; missionId: string; }
export interface UnitState { id: string; hp: number; maxHp: number; mp: number; maxMp: number; power: number; status: "ready" | "damaged" | "disabled"; }
export interface CombatExchange { side: "ally" | "enemy"; actorId: string; targetId: string | null; hit: boolean; critical: boolean; damage: number; hpAfter: number; }
export interface CombatRound { round: number; exchanges: CombatExchange[]; morale: Array<{ companionId: string; success: boolean }>; }
export interface BattleTranscript {
  battleId: string; seed: string; rulesVersion: typeof TEMEROSA_EXPEDITION_VERSION; tactic: Tactic;
  intervention: { type: Intervention; round: number } | null; rounds: CombatRound[];
  alliesAfter: Array<{ id: string; hp: number; maxHp: number }>; enemiesAfter: Array<{ id: string; name: string; hp: number; maxHp: number }>;
  outcome: "victory" | "defeat"; resultHash: string;
}
export interface RewardOption { id: string; kind: "repair" | "supply" | "record"; label: string; detail: string; }
export interface TemerosaExpeditionRunState {
  contract: "temerosa-expedition-run-state/0.1"; version: typeof TEMEROSA_EXPEDITION_VERSION; packVersion: string; sessionId: string; seed: string;
  sequence: number; phase: ExpeditionPhase; roster: Record<string, UnitState>; formation: string[]; route: RouteNode[][];
  depth: number; visited: string[]; currentNodeId: string | null; tactic: Tactic; intervention: { type: Intervention; round: number } | null;
  transcript: BattleTranscript | null; rewards: RewardOption[]; inventory: string[]; supplies: number; outcome: "victory" | "defeat" | "retreated" | null;
}

export type TemerosaExpeditionAction =
  | { type: "set_formation"; companionIds: string[] }
  | { type: "choose_node"; nodeId: string }
  | { type: "choose_tactic"; tactic: Tactic }
  | { type: "schedule_intervention"; intervention: Intervention; round: number }
  | { type: "resolve_battle" }
  | { type: "acknowledge_battle" }
  | { type: "choose_reward"; rewardId: string }
  | { type: "retreat" };
