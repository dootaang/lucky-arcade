export function selectCollectionFace(collectionId: string, unlockedFaceIds: readonly string[], allFaceIds: readonly string[]): string | null {
  const unlocked = new Set(unlockedFaceIds);
  const remaining = [...new Set(allFaceIds)].filter((faceId) => !unlocked.has(faceId)).sort();
  if (remaining.length === 0) return null;
  return remaining[deterministicIndex(`${collectionId}:${unlockedFaceIds.length}`, remaining.length)] ?? null;
}

function deterministicIndex(seed: string, length: number): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16_777_619) >>> 0;
  return hash % length;
}
