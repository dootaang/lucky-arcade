export const OLD_MAID_LEGACY_VERSION = "old-maid/0.6" as const;
export const OLD_MAID_PREVIOUS_VERSION = "old-maid/0.7" as const;
export const OLD_MAID_VERSION = "old-maid/0.8" as const;
export const TEMEROSA_OLD_MAID_PACK_VERSION = "temerosa-old-maid/0.7" as const;

export type OldMaidSeatId = "player" | "cpu-1" | "cpu-2" | "cpu-3";
export type OldMaidCpuSeatId = Exclude<OldMaidSeatId, "player">;
export type OldMaidStatus = "ready" | "dealing" | "offering" | "playing" | "revealing" | "discarding" | "complete";
export type OldMaidReaction = "neutral" | "pleased" | "tense";
export type OldMaidTellStyle = "standard" | "open" | "guarded" | "bluffer";
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
  /** Omitted only by legacy 0.6 cartridges, which treat every character as selectable. */
  readonly selectableCharacterIds?: readonly string[];
  readonly dealPairCount?: number;
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

export interface OldMaidOffer {
  actorId: OldMaidSeatId;
  targetId: OldMaidSeatId;
  phase: "arranging" | "settling" | "ready";
  reorderCount: number;
  lastMove: { fromIndex: number; toIndex: number } | null;
  revision: number;
}

export interface OldMaidState {
  contract: "old-maid-state/0.6" | "old-maid-state/0.7";
  version: typeof OLD_MAID_VERSION | typeof OLD_MAID_PREVIOUS_VERSION | typeof OLD_MAID_LEGACY_VERSION;
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
  /** Added for 0.7 games. The player entry mirrors lastReorder for 0.6 readers. */
  lastReorders?: Partial<Record<OldMaidSeatId, { turn: number; fromIndex: number; toIndex: number; count: number }>>;
  /** Added for 0.8 games. Card identities deliberately remain in hands, never in this public phase record. */
  offer?: OldMaidOffer | null;
}

export interface OldMaidPsychologySummary {
  inspectedCards: number;
  reorderActions: number;
  reorderTurns: number;
  reorderSignals: number;
  movedSlotDraws: number;
  successfulBaits: number;
  offers: number;
  reorderedOffers: number;
  playerOfferConfirms: number;
  npcToNpcOffers: number;
}

export type OldMaidAction =
  | { type: "start"; mode?: OldMaidMode; characterIds?: string[] }
  | { type: "finish_deal" }
  | { type: "draw"; index: number }
  | { type: "cpu_draw" }
  | { type: "collect_draw" }
  | { type: "discard_pair"; cardIds: [string, string] }
  | { type: "reorder_hand"; from: number; to: number }
  | { type: "prepare_cpu_offer" }
  | { type: "reorder_offer"; from: number; to: number }
  | { type: "finish_offer" }
  | { type: "restart"; seed: string; mode?: OldMaidMode; characterIds?: string[] };
