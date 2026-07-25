export const OLD_MAID_VERSION = "old-maid/0.6" as const;
export const TEMEROSA_OLD_MAID_PACK_VERSION = "temerosa-old-maid/0.6" as const;

export type OldMaidSeatId = "player" | "cpu-1" | "cpu-2" | "cpu-3";
export type OldMaidCpuSeatId = Exclude<OldMaidSeatId, "player">;
export type OldMaidStatus = "ready" | "dealing" | "playing" | "revealing" | "discarding" | "complete";
export type OldMaidReaction = "neutral" | "pleased" | "tense";
export type OldMaidTellStyle = "open" | "guarded" | "bluffer";
export type OldMaidMode = "play" | "spectate";
export type OldMaidLineEvent =
  | "watching" | "idle-draw" | "pair-discard" | "taken-from"
  | "pair-made" | "joker-drawn" | "joker-left" | "emptied";

export interface OldMaidLine {
  id: string;
  characterId: string;
  event: OldMaidLineEvent;
  text: readonly string[];
}

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
  despairPortrait: string;
}

export interface OldMaidCartridge {
  contract: "old-maid-cartridge/0.6";
  version: string;
  title: string;
  oddFaceId: string;
  faces: OldMaidFace[];
  cards: OldMaidCard[];
  characters: OldMaidCharacter[];
  lines?: readonly OldMaidLine[];
}

export type OldMaidHistoryEntry =
  | { type: "draw"; turn: number; actorId: OldMaidSeatId; targetId: OldMaidSeatId; faceId: string; madePair: boolean }
  | { type: "discard"; turn: number; ownerId: OldMaidSeatId; faceId: string };

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
  contract: "old-maid-state/0.6";
  version: typeof OLD_MAID_VERSION;
  packVersion: string;
  sessionId: string;
  seed: string;
  sequence: number;
  turn: number;
  status: OldMaidStatus;
  mode: OldMaidMode;
  currentPlayerId: OldMaidSeatId;
  hands: Record<OldMaidSeatId, string[]>;
  dealOrder: OldMaidDealCard[];
  characters: Record<OldMaidCpuSeatId, string>;
  spectatorCharacterId: string | null;
  reactions: Record<OldMaidSeatId, OldMaidReaction>;
  pendingDraw: OldMaidDrawEvent | null;
  discardMode: "initial" | "draw" | null;
  discardSeatIndex: number | null;
  safeOrder: OldMaidSeatId[];
  loserId: OldMaidSeatId | null;
  discards: OldMaidDiscard[];
  lastDraw: OldMaidDrawEvent | null;
  history: OldMaidHistoryEntry[];
  lastReorder: { turn: number; toIndex: number; count: number } | null;
}

export type OldMaidAction =
  | { type: "start"; mode?: OldMaidMode; characterIds?: string[] }
  | { type: "finish_deal" }
  | { type: "draw"; index: number }
  | { type: "cpu_draw" }
  | { type: "collect_draw" }
  | { type: "discard_pair"; cardIds: [string, string] }
  | { type: "reorder_hand"; from: number; to: number }
  | { type: "restart"; seed: string; mode?: OldMaidMode; characterIds?: string[] };
