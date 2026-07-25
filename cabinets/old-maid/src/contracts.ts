export const OLD_MAID_VERSION = "old-maid/0.3" as const;
export const TEMEROSA_OLD_MAID_PACK_VERSION = "temerosa-old-maid/0.3" as const;

export type OldMaidSeatId = "player" | "cpu-1" | "cpu-2" | "cpu-3";
export type OldMaidCpuSeatId = Exclude<OldMaidSeatId, "player">;
export type OldMaidStatus = "ready" | "dealing" | "playing" | "revealing" | "discarding" | "complete";
export type OldMaidReaction = "neutral" | "pleased" | "tense";
export type OldMaidTellStyle = "open" | "guarded" | "bluffer";

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

export interface OldMaidCharacter {
  id: string;
  name: string;
  appearanceSet: string;
  tellStyle: OldMaidTellStyle;
  portraits: Record<OldMaidReaction, string>;
}

export interface OldMaidCartridge {
  contract: "old-maid-cartridge/0.3";
  version: typeof TEMEROSA_OLD_MAID_PACK_VERSION;
  title: string;
  oddFaceId: string;
  faces: OldMaidFace[];
  cards: OldMaidCard[];
  characters: OldMaidCharacter[];
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

export interface OldMaidDealCard {
  cardId: string;
  seatId: OldMaidSeatId;
}

export interface OldMaidState {
  contract: "old-maid-state/0.3";
  version: typeof OLD_MAID_VERSION;
  packVersion: typeof TEMEROSA_OLD_MAID_PACK_VERSION;
  sessionId: string;
  seed: string;
  sequence: number;
  turn: number;
  status: OldMaidStatus;
  currentPlayerId: OldMaidSeatId;
  hands: Record<OldMaidSeatId, string[]>;
  dealOrder: OldMaidDealCard[];
  characters: Record<OldMaidCpuSeatId, string>;
  reactions: Record<OldMaidCpuSeatId, OldMaidReaction>;
  pendingDraw: OldMaidDrawEvent | null;
  discardMode: "initial" | "draw" | null;
  discardSeatIndex: number | null;
  safeOrder: OldMaidSeatId[];
  loserId: OldMaidSeatId | null;
  discards: OldMaidDiscard[];
  lastDraw: OldMaidDrawEvent | null;
}

export type OldMaidAction =
  | { type: "start" }
  | { type: "finish_deal" }
  | { type: "draw"; index: number }
  | { type: "cpu_draw" }
  | { type: "collect_draw" }
  | { type: "discard_pair"; cardIds: [string, string] }
  | { type: "restart"; seed: string };
