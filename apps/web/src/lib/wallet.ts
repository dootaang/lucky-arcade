import { oldMaidOutcome, type OldMaidState } from "@lucky-arcade/old-maid";
import type { PointWalletSnapshot } from "@lucky-arcade/persistence";
import { grantCompletionPoints, readWallet } from "./database.ts";

export const INITIAL_POINT_BALANCE = 0;
export const COLLECTION_OPEN_COST = 12;
export const DIRECT_PLAY_COMPLETION_REWARD = 5;

export interface PointAwardResult { wallet: PointWalletSnapshot; amount: number; rank: number; }

export { readWallet };

export async function grantOldMaidCompletion(previous: OldMaidState, next: OldMaidState, cabinetId: string): Promise<PointAwardResult | null> {
  if (previous.status === "complete" || next.status !== "complete") return null;
  const outcome = oldMaidOutcome(next);
  if (!outcome || next.mode === "spectate") return null;
  const player = outcome.ranking.find((standing) => standing.seatId === "player");
  if (!player) return null;
  const granted = await grantCompletionPoints({
    sessionId: next.sessionId,
    sequence: next.sequence,
    cabinetId,
    spectated: false,
  });
  return { ...granted, rank: player.rank };
}
