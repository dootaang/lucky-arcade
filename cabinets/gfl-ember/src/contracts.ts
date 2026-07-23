import { z } from "zod";

export const GFL_EMBER_VERSION = "gfl-ember/0.1" as const;
export const GFL_PACK_VERSION = "1.0.0" as const;
export const dollClassSchema = z.enum(["AR", "SMG", "SG", "MG", "RF", "HG"]);
export type DollClass = z.infer<typeof dollClassSchema>;

export const dollSchema = z.object({
  id: z.string(), name: z.string(), class: dollClassSchema, grade: z.number().int().min(1).max(6),
  maxHp: z.number().positive(), maxMp: z.number().positive(), power: z.number().positive(), mood: z.number(),
  description: z.string(), asset: z.string(), squad: z.string().optional(),
});
export type DollDefinition = z.infer<typeof dollSchema>;

export const missionSchema = z.object({
  id: z.string(), name: z.string(), enemy: z.string(), factions: z.array(z.string()), power: z.number().positive(),
  description: z.string(), boss: z.string().optional(), rewards: z.record(z.string(), z.number()),
});
export type MissionDefinition = z.infer<typeof missionSchema>;

export const contentPackSchema = z.object({
  contract: z.literal("gfl-content-pack/0.1"), packId: z.literal("gfl-ember"), version: z.string(),
  dolls: z.array(dollSchema).length(12), boss: dollSchema.omit({ class: true }).extend({ class: z.literal("BOSS") }),
  missions: z.array(missionSchema).min(1), items: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
  equipment: z.array(z.object({ id: z.string(), name: z.string(), power: z.number(), description: z.string() })),
  assets: z.record(z.string(), z.string()),
});
export type GflContentPack = z.infer<typeof contentPackSchema>;

export type GflPhase = "formation" | "route" | "battle-ready" | "battle-report" | "reward" | "finished";
export type RouteNodeType = "battle" | "scout" | "supply" | "mystery" | "elite" | "repair" | "boss";
export type Tactic = "focus" | "balanced" | "cover";
export type Intervention = "focus" | "brace" | "barrage";

export interface RouteNode { id: string; depth: number; type: RouteNodeType; label: string; danger: number; missionId: string; }
export interface UnitState { id: string; hp: number; maxHp: number; mp: number; maxMp: number; power: number; status: "ready" | "damaged" | "disabled"; }
export interface CombatExchange { side: "ally" | "enemy"; actorId: string; targetId: string | null; hit: boolean; critical: boolean; damage: number; hpAfter: number; }
export interface CombatRound { round: number; exchanges: CombatExchange[]; morale: Array<{ dollId: string; success: boolean }>; }
export interface BattleTranscript {
  battleId: string; seed: string; rulesVersion: typeof GFL_EMBER_VERSION; tactic: Tactic;
  intervention: { type: Intervention; round: number } | null; rounds: CombatRound[];
  alliesAfter: Array<{ id: string; hp: number; maxHp: number }>; enemiesAfter: Array<{ id: string; name: string; hp: number; maxHp: number }>;
  outcome: "victory" | "defeat"; resultHash: string;
}
export interface RewardOption { id: string; kind: "repair" | "supply" | "equipment" | "recruit"; label: string; detail: string; }
export interface GflRunState {
  contract: "gfl-run-state/0.1"; version: typeof GFL_EMBER_VERSION; packVersion: string; sessionId: string; seed: string;
  sequence: number; phase: GflPhase; roster: Record<string, UnitState>; formation: string[]; route: RouteNode[][];
  depth: number; visited: string[]; currentNodeId: string | null; tactic: Tactic; intervention: { type: Intervention; round: number } | null;
  transcript: BattleTranscript | null; rewards: RewardOption[]; inventory: string[]; supplies: number; outcome: "victory" | "defeat" | "retreated" | null;
}

export type GflAction =
  | { type: "set_formation"; dollIds: string[] }
  | { type: "choose_node"; nodeId: string }
  | { type: "choose_tactic"; tactic: Tactic }
  | { type: "schedule_intervention"; intervention: Intervention; round: number }
  | { type: "resolve_battle" }
  | { type: "acknowledge_battle" }
  | { type: "choose_reward"; rewardId: string }
  | { type: "retreat" };
