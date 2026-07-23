import type { FavoriteCupCandidate, FavoriteCupCartridge } from "@lucky-arcade/contracts";
import { XorShift32 } from "@lucky-arcade/engine";
import { FAVORITE_CUP_MIN_CONFIDENCE } from "./favorite-cup.ts";

export type RestorationProblem =
  | { id: string; type: "portrait-swap"; subjectId: string; shownName: string; shownAssetId: string; originalName: string; originalAssetId: string; correctPart: "portrait"; evidence: string[] }
  | { id: string; type: "name-swap"; subjectId: string; shownName: string; shownAssetId: string; originalName: string; originalAssetId: string; correctPart: "name"; evidence: string[] }
  | { id: string; type: "expression-intruder"; subjectId: string; shownName: string; assetIds: string[]; intruderAssetId: string; originalName: string; originalAssetId: string; correctPart: "intruder"; evidence: string[] };
export interface RestorationDeck { contract: "restoration-deck/0.1"; cardFingerprint: string; seed: string; problems: RestorationProblem[]; discarded: string[]; }

export function restorationEligibility(cartridge: FavoriteCupCartridge): FavoriteCupCandidate[] { return cartridge.candidates.filter((candidate) => candidate.confidence >= FAVORITE_CUP_MIN_CONFIDENCE && candidate.displayNameSource !== "technical-id"); }

export function generateRestorationDeck(cartridge: FavoriteCupCartridge, seed: string): RestorationDeck {
  const candidates = restorationEligibility(cartridge), discarded: string[] = [];
  if (candidates.length < 4) return { contract: "restoration-deck/0.1", cardFingerprint: cartridge.cardFingerprint, seed, problems: [], discarded: ["distinct-reliable-npcs<4"] };
  const rng = new XorShift32(`${cartridge.cardFingerprint}:${seed}:restoration`), shuffled = shuffle(candidates, rng), problems: RestorationProblem[] = [];
  for (let index = 0; index < Math.min(5, shuffled.length); index += 1) {
    const subject = shuffled[index], other = shuffled[(index + 1) % shuffled.length];
    if (!subject || !other || subject.npcId === other.npcId) { discarded.push(`pair-${index}:not-unique`); continue; }
    if (index % 3 === 0) problems.push({ id: `${seed}:${index}`, type: "portrait-swap", subjectId: subject.npcId, shownName: subject.displayName, shownAssetId: other.representativeAssetId, originalName: subject.displayName, originalAssetId: subject.representativeAssetId, correctPart: "portrait", evidence: [`name:${subject.npcId}`, `portrait-from:${other.npcId}`] });
    else if (index % 3 === 1) problems.push({ id: `${seed}:${index}`, type: "name-swap", subjectId: subject.npcId, shownName: other.displayName, shownAssetId: subject.representativeAssetId, originalName: subject.displayName, originalAssetId: subject.representativeAssetId, correctPart: "name", evidence: [`portrait:${subject.npcId}`, `name-from:${other.npcId}`] });
    else { const own = [...new Set(subject.variantAssetIds)].slice(0, 3), intruder = other.representativeAssetId; if (own.includes(intruder) || own.length < 2) { discarded.push(`pair-${index}:intruder-not-unique`); continue; } problems.push({ id: `${seed}:${index}`, type: "expression-intruder", subjectId: subject.npcId, shownName: subject.displayName, assetIds: shuffle([...own, intruder], rng), intruderAssetId: intruder, originalName: subject.displayName, originalAssetId: subject.representativeAssetId, correctPart: "intruder", evidence: [`group:${subject.npcId}`, `intruder-from:${other.npcId}`] }); }
  }
  return { contract: "restoration-deck/0.1", cardFingerprint: cartridge.cardFingerprint, seed, problems: problems.slice(0, 5), discarded };
}
function shuffle<T>(input: readonly T[], rng: XorShift32): T[] { const output = [...input]; for (let index = output.length - 1; index > 0; index -= 1) { const target = rng.nextUint32() % (index + 1); [output[index], output[target]] = [output[target] as T, output[index] as T]; } return output; }
