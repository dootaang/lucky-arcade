import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import type { RestorationDeck } from "@lucky-arcade/extract";
import { resultHash } from "@lucky-arcade/engine";

export const RESTORATION_VERSION = "restoration-crew/0.1" as const;
export const restorationManifest: CabinetManifest = {
  id: "restoration-crew", version: RESTORATION_VERSION, title: "카드 복구반",
  description: "이름과 그림 사이의 이상한 부분을 찾아 원래 기록으로 복구합니다.",
  requiredCapabilities: ["distinct-npc-portraits>=4"], sessionKind: "instant", launchKind: "card",
  resumeLabel: "새 복구 시작", estimatedMinutes: { min: 2, max: 5 },
};
export interface RestorationAnswer { problemId: string; correct: boolean; elapsedMs: number; subjectId: string; }
export interface RestorationState { contract: "restoration-state/0.1"; version: typeof RESTORATION_VERSION; status: "playing" | "won"; phase: "question" | "reveal"; index: number; score: number; combo: number; mistakes: number; answers: RestorationAnswer[]; }
export type RestorationAction = { type: "answer"; selection: string; elapsedMs: number } | { type: "next" } | { type: "timeout" };
export function createRestorationState(deck: RestorationDeck): RestorationState { if (deck.problems.length < 3) throw new Error("restoration_not_enough_problems"); return { contract: "restoration-state/0.1", version: RESTORATION_VERSION, status: "playing", phase: "question", index: 0, score: 0, combo: 0, mistakes: 0, answers: [] }; }
export function reduceRestoration(state: RestorationState, action: RestorationAction, deck: RestorationDeck): RestorationState {
  if (state.status === "won") return state;
  if (action.type === "next" && state.phase === "reveal") { const index = state.index + 1; return index >= deck.problems.length ? { ...state, status: "won", index } : { ...state, phase: "question", index }; }
  if (action.type === "next") return state;
  if (state.phase !== "question") return state;
  const problem = deck.problems[state.index]; if (!problem) return { ...state, status: "won" };
  const elapsedMs = action.type === "timeout" ? 15_000 : Math.max(0, Math.min(15_000, action.elapsedMs));
  const correct = action.type !== "timeout" && isCorrect(problem, action.selection);
  const combo = correct ? state.combo + 1 : 0, gained = correct ? Math.max(100, 1000 - Math.floor(elapsedMs / 25)) + combo * 75 : 0;
  return { ...state, phase: "reveal", score: state.score + gained, combo, mistakes: state.mistakes + Number(!correct), answers: [...state.answers, { problemId: problem.id, correct, elapsedMs, subjectId: problem.subjectId }] };
}
export function restorationGrade(state: RestorationState): "S" | "A" | "B" | "C" { const correct = state.answers.filter((item) => item.correct).length, ratio = state.answers.length ? correct / state.answers.length : 0; return ratio === 1 ? "S" : ratio >= .8 ? "A" : ratio >= .6 ? "B" : "C"; }
export function restorationResultHash(state: RestorationState): string { return resultHash(state); }
function isCorrect(problem: RestorationDeck["problems"][number], selection: string): boolean { return problem.type === "expression-intruder" ? selection === problem.intruderAssetId : selection === problem.correctPart; }
