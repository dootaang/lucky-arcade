import { oldMaidOutcome, type OldMaidState } from "@lucky-arcade/old-maid";
import type { WalletSnapshot } from "@lucky-arcade/persistence";
import { grantMedals, readWallet } from "./database.ts";

export const INITIAL_MEDAL_BALANCE = 100;
export const COLLECTION_OPEN_COST = 12;

export interface MedalAwardResult { wallet: WalletSnapshot; amount: number; rank: number; }

export { readWallet };

export async function grantOldMaidCompletion(previous: OldMaidState, next: OldMaidState, cabinetId: string): Promise<MedalAwardResult | null> {
  if (previous.status === "complete" || next.status !== "complete") return null;
  const outcome = oldMaidOutcome(next);
  if (!outcome || next.mode === "spectate") return null;
  const player = outcome.ranking.find((standing) => standing.seatId === "player");
  if (!player) return null;
  const granted = await grantMedals({
    sessionId: next.sessionId,
    sequence: next.sequence,
    cabinetId,
    rank: player.rank,
    seatCount: outcome.ranking.length,
    spectated: false,
  });
  return { ...granted, rank: player.rank };
}
