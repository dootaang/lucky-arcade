import { XorShift32 } from "@lucky-arcade/engine";
import type { DialogueCondition, DialogueLine, StoryMemory } from "./contracts.ts";

export function conditionMatches(condition: DialogueCondition, sceneId: string, memory: StoryMemory): boolean {
  if (condition.sceneIds && !condition.sceneIds.includes(sceneId)) return false;
  if (condition.companionIds && !condition.companionIds.every((id) => memory.selectedCompanions.includes(id))) return false;
  if (condition.requiredFlags && !condition.requiredFlags.every((flag) => memory.flags.includes(flag))) return false;
  if (condition.forbiddenFlags && condition.forbiddenFlags.some((flag) => memory.flags.includes(flag))) return false;
  if (condition.playerApproaches && (!memory.playerApproach || !condition.playerApproaches.includes(memory.playerApproach))) return false;
  if (condition.navigatorStage && condition.navigatorStage !== memory.navigatorStage) return false;
  return true;
}

export function selectDialogueLine(candidates: readonly DialogueLine[], sceneId: string, memory: StoryMemory, seed: string): DialogueLine | null {
  const available = candidates.filter((candidate) => conditionMatches(candidate.condition, sceneId, memory));
  if (!available.length) return null;
  const highestPriority = Math.max(...available.map((candidate) => candidate.priority));
  const priority = available.filter((candidate) => candidate.priority === highestPriority);
  const unused = priority.filter((candidate) => !memory.lineIds.slice(-candidate.cooldown).includes(candidate.id));
  const pool = unused.length ? unused : priority;
  const rng = new XorShift32(`${seed}:${sceneId}:${memory.lineIds.length}`);
  return pool[rng.nextUint32() % pool.length] ?? null;
}
