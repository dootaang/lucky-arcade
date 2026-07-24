import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import type { BuiltInContentPack } from "@lucky-arcade/contracts";
import { resultHash, XorShift32 } from "@lucky-arcade/engine";

export const SPRITE_MEMORY_VERSION = "sprite-memory/0.1" as const;
export const spriteMemoryManifest: CabinetManifest = {
  id: "sprite-memory",
  version: SPRITE_MEMORY_VERSION,
  title: "작전 암호 기억",
  description: "차례로 나타난 인물을 같은 순서로 선택하세요.",
  requiredCapabilities: ["characters>=6", "expressions-per-character>=2"],
  sessionKind: "repeat",
  launchKind: "built-in",
  resumeLabel: "기억 훈련 시작",
  estimatedMinutes: { min: 1, max: 2 },
};

export interface SpriteMemoryState {
  contract: "sprite-memory-state/0.1";
  version: typeof SPRITE_MEMORY_VERSION;
  seed: string;
  status: "ready" | "preview" | "input" | "won" | "lost";
  round: number;
  roster: string[];
  sequence: string[];
  inputIndex: number;
  score: number;
}

export type SpriteMemoryAction =
  | { type: "start" }
  | { type: "preview_complete" }
  | { type: "choose"; characterId: string }
  | { type: "retry" };

export function createSpriteMemoryState(pack: BuiltInContentPack, seed: string): SpriteMemoryState {
  if (pack.characters.length < 6) throw new Error("sprite_memory_not_enough_characters");
  const roster = shuffled(pack.characters.map((character) => character.id), new XorShift32(`${pack.packId}:${seed}:roster`)).slice(0, 6);
  return {
    contract: "sprite-memory-state/0.1",
    version: SPRITE_MEMORY_VERSION,
    seed,
    status: "ready",
    round: 1,
    roster,
    sequence: makeSequence(roster, seed, 1),
    inputIndex: 0,
    score: 0,
  };
}

export function reduceSpriteMemory(state: SpriteMemoryState, action: SpriteMemoryAction): SpriteMemoryState {
  if (action.type === "retry") return { ...state, status: "ready", round: 1, sequence: makeSequence(state.roster, state.seed, 1), inputIndex: 0, score: 0 };
  if (action.type === "start" && state.status === "ready") return { ...state, status: "preview" };
  if (action.type === "preview_complete" && state.status === "preview") return { ...state, status: "input", inputIndex: 0 };
  if (action.type !== "choose" || state.status !== "input") return state;
  if (state.sequence[state.inputIndex] !== action.characterId) return { ...state, status: "lost" };
  const nextIndex = state.inputIndex + 1;
  if (nextIndex < state.sequence.length) return { ...state, inputIndex: nextIndex, score: state.score + 100 };
  if (state.round >= 5) return { ...state, status: "won", inputIndex: nextIndex, score: state.score + 500 };
  const round = state.round + 1;
  return { ...state, status: "preview", round, sequence: makeSequence(state.roster, state.seed, round), inputIndex: 0, score: state.score + 300 };
}

export function spriteMemoryResultHash(state: SpriteMemoryState): string { return resultHash(state); }

function makeSequence(roster: string[], seed: string, round: number): string[] {
  const rng = new XorShift32(`${seed}:round:${round}`), length = round + 1;
  return Array.from({ length }, () => roster[rng.nextUint32() % roster.length] ?? roster[0] as string);
}

function shuffled<T>(input: readonly T[], rng: XorShift32): T[] {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = rng.nextUint32() % (index + 1);
    [output[index], output[target]] = [output[target] as T, output[index] as T];
  }
  return output;
}
