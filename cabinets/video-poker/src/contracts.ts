import type { StandardCardId } from "@lucky-arcade/card-table";
import { WAGER_MULTIPLIERS, type WagerMultiplier } from "@lucky-arcade/engine";

export const VIDEO_POKER_VERSION = "video-poker/0.1" as const;
export const VIDEO_POKER_STATE_CONTRACT = "video-poker-state/0.1" as const;
export const TEMEROSA_VIDEO_POKER_PACK_VERSION = "temerosa-video-poker/0.1" as const;
export const JACKS_OR_BETTER_TERMS_VERSION = "jacks-or-better-paytable/0.1" as const;
export const VIDEO_POKER_STAKES = [10, 50, 200] as const;
export const VIDEO_POKER_WAGER_MULTIPLIERS = WAGER_MULTIPLIERS;

export type VideoPokerStake = (typeof VIDEO_POKER_STAKES)[number];
export type VideoPokerWagerMultiplier = WagerMultiplier;
export type VideoPokerStatus = "ready" | "holding" | "complete";
export type JacksOrBetterCategory =
  | "royal-flush"
  | "straight-flush"
  | "four-of-a-kind"
  | "full-house"
  | "flush"
  | "straight"
  | "three-of-a-kind"
  | "two-pair"
  | "jacks-or-better"
  | "low-pair"
  | "high-card";

export interface VideoPokerWagerInput {
  stake: VideoPokerStake;
  multiplier: VideoPokerWagerMultiplier;
  wagerId: string;
}

export interface JacksOrBetterHandValue {
  category: JacksOrBetterCategory;
  label: string;
  payoutMultiplier: number;
}

export interface VideoPokerOutcome {
  hand: JacksOrBetterHandValue;
  wageredPoints: number;
  creditedPoints: number;
}

export interface VideoPokerState {
  contract: typeof VIDEO_POKER_STATE_CONTRACT;
  version: typeof VIDEO_POKER_VERSION;
  packVersion: string;
  sessionId: string;
  sequence: number;
  status: VideoPokerStatus;
  seed: string;
  deck: readonly StandardCardId[];
  cursor: number;
  hand: readonly StandardCardId[];
  heldCardIndexes: readonly number[];
  exchangeCount: 0 | 1;
  wager: VideoPokerWagerInput | null;
  outcome: VideoPokerOutcome | null;
}

export type VideoPokerAction =
  | { type: "deal"; seed: string; wager: VideoPokerWagerInput }
  | { type: "toggle-hold"; cardIndex: number }
  | { type: "draw" }
  | { type: "restart" };

export const VIDEO_POKER_ERRORS = {
  stateInvalid: "video_poker_state_invalid",
  packVersionInvalid: "video_poker_pack_version_invalid",
  sessionInvalid: "video_poker_session_invalid",
  dealInvalid: "video_poker_deal_invalid",
  wagerInvalid: "video_poker_wager_invalid",
  holdInvalid: "video_poker_hold_invalid",
  drawInvalid: "video_poker_draw_invalid",
  restartInvalid: "video_poker_restart_invalid",
  handInvalid: "video_poker_hand_invalid",
} as const;
