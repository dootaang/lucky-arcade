export const OLD_MAID_VERSION = "old-maid/0.1" as const;
export const TEMEROSA_OLD_MAID_PACK_VERSION = "temerosa-old-maid/0.1" as const;

export type OldMaidSeatId = "player" | "pale" | "kano" | "nemo";
export type OldMaidStatus = "ready" | "playing" | "complete";

export interface OldMaidFace {
  id: string;
  name: string;
  assetId: string | null;
}

export interface OldMaidCard {
  id: string;
  faceId: string;
  pairId: string | null;
}

export interface OldMaidSeat {
  id: OldMaidSeatId;
  name: string;
  portraitAssetId: string | null;
}

export interface OldMaidCartridge {
  contract: "old-maid-cartridge/0.1";
  version: typeof TEMEROSA_OLD_MAID_PACK_VERSION;
  title: string;
  oddFaceId: string;
  faces: OldMaidFace[];
  cards: OldMaidCard[];
  seats: OldMaidSeat[];
}

export interface OldMaidDiscard {
  turn: number;
  ownerId: OldMaidSeatId;
  faceId: string;
  cardIds: [string, string];
}

export interface OldMaidDrawEvent {
  actorId: OldMaidSeatId;
  targetId: OldMaidSeatId;
  cardId: string;
  faceId: string;
  madePair: boolean;
}

export interface OldMaidState {
  contract: "old-maid-state/0.1";
  version: typeof OLD_MAID_VERSION;
  packVersion: typeof TEMEROSA_OLD_MAID_PACK_VERSION;
  sessionId: string;
  seed: string;
  sequence: number;
  turn: number;
  status: OldMaidStatus;
  currentPlayerId: OldMaidSeatId;
  hands: Record<OldMaidSeatId, string[]>;
  safeOrder: OldMaidSeatId[];
  loserId: OldMaidSeatId | null;
  discards: OldMaidDiscard[];
  lastDraw: OldMaidDrawEvent | null;
}

export type OldMaidAction =
  | { type: "start" }
  | { type: "draw"; index: number }
  | { type: "cpu_draw" }
  | { type: "restart"; seed: string };
