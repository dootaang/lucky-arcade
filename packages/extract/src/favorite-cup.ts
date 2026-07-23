import type { FavoriteCupCandidate, FavoriteCupCartridge, NpcGroup, Sourced } from "@lucky-arcade/contracts";

export const FAVORITE_CUP_MIN_CONFIDENCE = 0.65;
export const FAVORITE_CUP_MIN_CANDIDATES = 8;

export function favoriteCupCartridgeFromGroups(cardFingerprint: string, cardName: string, groups: readonly NpcGroup[]): FavoriteCupCartridge {
  return { contract: "favorite-cup-cartridge/0.1", cardFingerprint, cardName, candidates: groups.map((group) => ({
    npcId: group.id, displayName: group.displayName, displayNameSource: group.displayNameSource,
    representativeAssetId: group.representativeAssetId, variantAssetIds: group.variantAssetIds,
    confidence: group.confidence, evidence: group.evidence,
  })) };
}

export function favoriteCupEligibility(cartridge: FavoriteCupCartridge): Sourced<FavoriteCupCandidate[]> {
  const eligible = cartridge.candidates.filter((candidate) => candidate.confidence >= FAVORITE_CUP_MIN_CONFIDENCE && candidate.displayNameSource !== "technical-id");
  const deduplicated = new Map<string, FavoriteCupCandidate>();
  for (const candidate of eligible) {
    const key = canonicalPerson(candidate.displayName);
    const previous = deduplicated.get(key);
    if (!previous || candidate.variantAssetIds.length > previous.variantAssetIds.length) deduplicated.set(key, candidate);
  }
  const candidates = [...deduplicated.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
  return {
    value: candidates, source: "derived",
    confidence: candidates.length >= FAVORITE_CUP_MIN_CANDIDATES ? Math.min(1, candidates.reduce((sum, item) => sum + item.confidence, 0) / candidates.length) : 0,
    evidence: [`minimum-confidence:${FAVORITE_CUP_MIN_CONFIDENCE}`, `raw-candidates:${cartridge.candidates.length}`, `eligible-distinct-candidates:${candidates.length}`],
    derived: candidates.length >= FAVORITE_CUP_MIN_CANDIDATES ? "월드컵 참가 가능" : `서로 다른 신뢰 가능한 인물이 ${candidates.length}명이라 최소 ${FAVORITE_CUP_MIN_CANDIDATES}명에 못 미칩니다.`,
  };
}

function canonicalPerson(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/(?:[_\s-]+swap)$/i, "").replace(/[^\p{L}\p{N}]/gu, "");
}
