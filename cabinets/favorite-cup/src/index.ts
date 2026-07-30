import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import type { FavoriteCupCandidate, FavoriteCupCartridge } from "@lucky-arcade/contracts";
import { resultHash, XorShift32 } from "@lucky-arcade/engine";

export const FAVORITE_CUP_VERSION = "favorite-cup/0.1" as const;
export const favoriteCupManifest: CabinetManifest = {
  id: "favorite-cup", version: FAVORITE_CUP_VERSION, title: "최애 월드컵",
  description: "카드 속 인물들을 한 명씩 골라 오늘의 최애를 정합니다.", requiredCapabilities: ["distinct-npc-portraits>=8"],
  sessionKind: "instant", launchKind: "both", resumeLabel: "새 대진 시작", estimatedMinutes: { min: 1, max: 3 },
};

export type FavoriteCupStatus = "playing" | "won";
export interface FavoriteCupState {
  contract: "favorite-cup-state/0.1";
  version: typeof FAVORITE_CUP_VERSION;
  seed: string;
  status: FavoriteCupStatus;
  entrants: string[];
  todaySelection: boolean;
  round: number;
  participants: string[];
  matchIndex: number;
  winners: string[];
  topFour: string[];
  championId: string | null;
  picks: string[];
}

export interface FavoriteCupView {
  status: FavoriteCupStatus;
  roundLabel: string;
  progress: { completed: number; total: number };
  match: [FavoriteCupCandidate, FavoriteCupCandidate] | null;
  topFour: FavoriteCupCandidate[];
  champion: FavoriteCupCandidate | null;
  todaySelection: boolean;
}

export interface FavoriteCupCreateOptions {
  entrantCount?: number;
  groupById?: Readonly<Record<string, string>>;
}

export function createFavoriteCupState(cartridge: FavoriteCupCartridge, seed: string, eligible: readonly FavoriteCupCandidate[], options: FavoriteCupCreateOptions = {}): FavoriteCupState {
  if (eligible.length < 8) throw new Error("favorite_cup_not_enough_candidates");
  const entrantCount = options.entrantCount ?? Math.min(16, eligible.length);
  if (!Number.isSafeInteger(entrantCount) || entrantCount < 8 || entrantCount > eligible.length || entrantCount > 2_048) throw new Error("favorite_cup_invalid_entrant_count");
  const shuffled = shuffle(eligible.map((item) => item.npcId), new XorShift32(`${cartridge.cardFingerprint}:${seed}`));
  const todaySelection = shuffled.length > entrantCount;
  const selected = shuffled.slice(0, entrantCount);
  const bracketSize = nextPowerOfTwo(selected.length);
  const slots = separateFirstRoundGroups(spreadByes(selected, bracketSize), options.groupById);
  return normalize({ contract: "favorite-cup-state/0.1", version: FAVORITE_CUP_VERSION, seed, status: "playing", entrants: selected, todaySelection, round: 1, participants: slots, matchIndex: 0, winners: [], topFour: [], championId: null, picks: [] });
}

export function reduceFavoriteCup(state: FavoriteCupState, npcId: string): FavoriteCupState {
  if (state.status !== "playing") return state;
  const pair = currentPair(state);
  if (!pair || !pair.includes(npcId)) return state;
  return normalize({ ...state, winners: [...state.winners, npcId], matchIndex: state.matchIndex + 2, picks: [...state.picks, npcId] });
}

export function selectFavoriteCup(state: FavoriteCupState, cartridge: FavoriteCupCartridge): FavoriteCupView {
  const byId = new Map(cartridge.candidates.map((item) => [item.npcId, item]));
  const pair = currentPair(state);
  return {
    status: state.status,
    roundLabel: state.participants.length === 4 ? "준결승" : state.participants.length === 2 ? "결승" : `${state.participants.length}강`,
    progress: { completed: state.picks.length, total: state.entrants.length - 1 },
    match: pair ? [requireCandidate(byId, pair[0]), requireCandidate(byId, pair[1])] : null,
    topFour: state.topFour.map((id) => requireCandidate(byId, id)),
    champion: state.championId ? requireCandidate(byId, state.championId) : null,
    todaySelection: state.todaySelection,
  };
}
export function favoriteCupResultHash(state: FavoriteCupState): string { return resultHash(state); }

function normalize(input: FavoriteCupState): FavoriteCupState {
  let state = input;
  while (state.status === "playing") {
    if (state.matchIndex >= state.participants.length) {
      if (state.winners.length === 1) return { ...state, status: "won", championId: state.winners[0] ?? null };
      const next = state.winners;
      state = { ...state, round: state.round + 1, participants: next, matchIndex: 0, winners: [], topFour: next.length === 4 ? [...next] : state.topFour };
      continue;
    }
    const left = state.participants[state.matchIndex], right = state.participants[state.matchIndex + 1];
    if (left && right) return state;
    const bye = left || right;
    state = { ...state, matchIndex: state.matchIndex + 2, winners: bye ? [...state.winners, bye] : state.winners };
  }
  return state;
}

function currentPair(state: FavoriteCupState): [string, string] | null {
  const left = state.participants[state.matchIndex], right = state.participants[state.matchIndex + 1];
  return left && right ? [left, right] : null;
}
function requireCandidate(byId: Map<string, FavoriteCupCandidate>, id: string): FavoriteCupCandidate { const value = byId.get(id); if (!value) throw new Error(`favorite_cup_candidate_missing:${id}`); return value; }
function shuffle<T>(input: readonly T[], rng: XorShift32): T[] { const output = [...input]; for (let index = output.length - 1; index > 0; index -= 1) { const target = rng.nextUint32() % (index + 1); [output[index], output[target]] = [output[target] as T, output[index] as T]; } return output; }
function spreadByes(ids: string[], size: number): string[] { if (ids.length === size) return ids; const slots = Array<string>(size).fill(""); ids.forEach((id, index) => { slots[Math.floor(index * size / ids.length)] = id; }); return slots; }
function nextPowerOfTwo(value: number): number { let result = 8; while (result < value) result *= 2; return result; }
function separateFirstRoundGroups(slots: string[], groupById?: Readonly<Record<string, string>>): string[] {
  if (!groupById) return slots;
  const output = [...slots];
  for (let index = 0; index < output.length; index += 2) {
    const left = output[index], right = output[index + 1];
    if (!left || !right || !groupById[left] || groupById[left] !== groupById[right]) continue;
    for (let candidate = index + 2; candidate < output.length; candidate += 1) {
      const replacement = output[candidate];
      if (replacement && groupById[replacement] !== groupById[left]) { output[index + 1] = replacement; output[candidate] = right; break; }
    }
  }
  return output;
}
