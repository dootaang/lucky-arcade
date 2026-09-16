import { XorShift32 } from "@lucky-arcade/engine";
import { NIEUN_VIP_LINES } from "./nieun-vip-dialogue.generated.ts";

export type VipLine = typeof NIEUN_VIP_LINES[number];
export type VipLineEvent = VipLine["event"] | "dealer-reveal";
export interface VipSpeechMemory { recent: readonly string[]; progressUsed: boolean; outcomeUsed: boolean; }
export function pickVipLine(event: VipLineEvent, context: { seed: string; hand: number; sequence: number; memory: VipSpeechMemory; force?: boolean }): VipLine | null {
  if (event === "dealer-reveal") return null;
  const progress = ["deal", "player-hit", "player-stand", "dealer-draw"].includes(event);
  const outcome = /^(player-(win|bust|natural|streak)|house-|push|dealer-(natural|bust)|both-natural|comp-|floor-miss)/.test(event);
  if (progress && context.memory.progressUsed || outcome && context.memory.outcomeUsed) return null;
  const rng = new XorShift32(`vip-speech/0.1:${context.seed}:${context.hand}:${context.sequence}:${event}`);
  if (!context.force && (progress || outcome) && rng.nextUint32() % 100 >= (progress ? 40 : 60)) return null;
  const pool = NIEUN_VIP_LINES.filter((line) => line.event === event && !context.memory.recent.includes(line.id));
  return pool.length ? pool[rng.nextUint32() % pool.length]! : null;
}
export function rememberVipLine(memory: VipSpeechMemory, line: VipLine): VipSpeechMemory {
  const progress = ["deal", "player-hit", "player-stand", "dealer-draw"].includes(line.event);
  const outcome = /^(player-(win|bust|natural|streak)|house-|push|dealer-(natural|bust)|both-natural|comp-|floor-miss)/.test(line.event);
  return { recent: [...memory.recent, line.id].slice(-6), progressUsed: memory.progressUsed || progress, outcomeUsed: memory.outcomeUsed || outcome };
}
