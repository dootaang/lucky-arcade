import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import type { LoreCircuitCartridge, LoreCircuitClue, LoreCircuitNode, LoreCircuitPuzzle } from "@lucky-arcade/contracts";
import { XorShift32 } from "@lucky-arcade/engine";

export const LORE_CIRCUIT_VERSION = "lore-circuit/0.1" as const;
export const loreCircuitManifest: CabinetManifest = {
  id: "lore-circuit",
  version: LORE_CIRCUIT_VERSION,
  title: "로어 회로",
  description: "카드 원문 속 단어를 따라 숨은 기록을 발굴하세요.",
  requiredCapabilities: ["verified-lore-puzzles>=3"],
  sessionKind: "repeat",
  launchKind: "card",
  resumeLabel: "발굴 이어하기",
  estimatedMinutes: { min: 3, max: 8 },
};

export type LoreCircuitStatus = "ready" | "playing" | "won" | "lost";
export interface LoreCircuitState {
  contract: "lore-circuit-state/0.1";
  version: typeof LORE_CIRCUIT_VERSION;
  sessionId: string;
  seed: string;
  puzzleId: string;
  status: LoreCircuitStatus;
  revealedLoreIds: string[];
  usedKeywords: string[];
  moves: number;
  mistakes: number;
  score: number;
}
export type LoreCircuitAction =
  | { type: "start" }
  | { type: "dig"; keyword: string }
  | { type: "restart" };

export interface LoreCircuitView {
  status: LoreCircuitStatus;
  startKeyword: string;
  targetName: string;
  optimalHops: number;
  moves: number;
  mistakes: number;
  score: number;
  records: LoreCircuitNode[];
  clues: LoreCircuitClue[];
  target: LoreCircuitNode | null;
}

export function createLoreCircuitState(cartridge: LoreCircuitCartridge, seed: string): LoreCircuitState {
  if (cartridge.puzzles.length < 1) throw new Error("lore_circuit_no_puzzles");
  const rng = new XorShift32(`${cartridge.cardFingerprint}:${seed}`);
  const puzzle = cartridge.puzzles[rng.nextUint32() % cartridge.puzzles.length];
  if (!puzzle) throw new Error("lore_circuit_puzzle_missing");
  return {
    contract: "lore-circuit-state/0.1",
    version: LORE_CIRCUIT_VERSION,
    sessionId: `${cartridge.cardFingerprint.slice(0, 12)}:${seed}`,
    seed,
    puzzleId: puzzle.id,
    status: "ready",
    revealedLoreIds: [],
    usedKeywords: [],
    moves: 0,
    mistakes: 0,
    score: 0,
  };
}

export function reduceLoreCircuit(state: LoreCircuitState, action: LoreCircuitAction, cartridge: LoreCircuitCartridge): LoreCircuitState {
  const puzzle = requirePuzzle(state, cartridge);
  if (action.type === "restart") return createLoreCircuitState(cartridge, state.seed);
  if (action.type === "start" && state.status === "ready") return { ...state, status: "playing", revealedLoreIds: [puzzle.startLoreId] };
  if (action.type !== "dig" || state.status !== "playing") return state;

  const keyword = action.keyword.normalize("NFKC").trim();
  const available = availableClues(state, cartridge);
  const clue = available.find((item) => normalize(item.keyword) === normalize(keyword));
  if (!clue) {
    const mistakes = state.mistakes + 1;
    return { ...state, mistakes, status: mistakes >= 3 ? "lost" : "playing" };
  }
  const newlyRevealed = clue.targetLoreIds.filter((id) => !state.revealedLoreIds.includes(id));
  if (!newlyRevealed.length) return state;
  const revealedLoreIds = [...state.revealedLoreIds, ...newlyRevealed];
  const moves = state.moves + 1;
  const won = revealedLoreIds.includes(puzzle.targetLoreId);
  return {
    ...state,
    status: won ? "won" : "playing",
    revealedLoreIds,
    usedKeywords: [...state.usedKeywords, clue.keyword],
    moves,
    score: won ? scoreFor(moves, state.mistakes, puzzle.optimalHops) : 0,
  };
}

export function selectLoreCircuit(state: LoreCircuitState, cartridge: LoreCircuitCartridge): LoreCircuitView {
  const puzzle = requirePuzzle(state, cartridge), byId = new Map(cartridge.nodes.map((node) => [node.id, node]));
  return {
    status: state.status,
    startKeyword: puzzle.startKeyword,
    targetName: puzzle.targetName,
    optimalHops: puzzle.optimalHops,
    moves: state.moves,
    mistakes: state.mistakes,
    score: state.score,
    records: state.revealedLoreIds.flatMap((id) => byId.get(id) ?? []),
    clues: availableClues(state, cartridge),
    target: state.status === "won" ? byId.get(puzzle.targetLoreId) ?? null : null,
  };
}

export function scoreFor(moves: number, mistakes: number, optimalHops: number): number {
  return Math.max(100, 1000 - Math.max(0, moves - optimalHops) * 120 - mistakes * 150);
}

export function migrateLoreCircuit(savedVersion: string, saved: unknown): LoreCircuitState {
  if (savedVersion !== LORE_CIRCUIT_VERSION || !saved || typeof saved !== "object") throw new Error("lore_circuit_save_incompatible");
  const candidate = saved as Partial<LoreCircuitState>;
  if (candidate.contract !== "lore-circuit-state/0.1" || candidate.version !== LORE_CIRCUIT_VERSION) throw new Error("lore_circuit_save_invalid");
  return candidate as LoreCircuitState;
}

function availableClues(state: LoreCircuitState, cartridge: LoreCircuitCartridge): LoreCircuitClue[] {
  const revealed = new Set(state.revealedLoreIds), used = new Set(state.usedKeywords.map(normalize));
  const nodes = new Map(cartridge.nodes.map((node) => [node.id, node]));
  const grouped = new Map<string, LoreCircuitClue>();
  for (const id of revealed) for (const clue of nodes.get(id)?.clues ?? []) {
    if (used.has(normalize(clue.keyword)) || clue.targetLoreIds.every((target) => revealed.has(target))) continue;
    const known = grouped.get(normalize(clue.keyword));
    grouped.set(normalize(clue.keyword), known ? { keyword: known.keyword, targetLoreIds: [...new Set([...known.targetLoreIds, ...clue.targetLoreIds])] } : clue);
  }
  return [...grouped.values()];
}

function requirePuzzle(state: LoreCircuitState, cartridge: LoreCircuitCartridge): LoreCircuitPuzzle {
  const puzzle = cartridge.puzzles.find((item) => item.id === state.puzzleId);
  if (!puzzle) throw new Error("lore_circuit_puzzle_missing");
  return puzzle;
}
function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase().trim(); }
