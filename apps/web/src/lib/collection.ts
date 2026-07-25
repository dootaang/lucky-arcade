import type { CollectionSnapshot, WalletSnapshot } from "@lucky-arcade/persistence";
import { openCollectionItem, readCollection } from "./database.ts";

export interface CollectionState {
  collection: CollectionSnapshot;
  wallet: WalletSnapshot;
  lastUnlockedFaceId?: string;
}

export { readCollection };
export { selectCollectionFace } from "./collection-rules.ts";

export async function unlockCollectionItem(collectionId: string, faceIds: readonly string[]): Promise<{ wallet: WalletSnapshot; collection: CollectionSnapshot; unlockedFaceId: string }> {
  return openCollectionItem(collectionId, faceIds);
}
