import { characterIdForSeat } from "./engine.ts";
import type { OldMaidSeatId, OldMaidState } from "./contracts.ts";

export interface OldMaidOutcome {
  turns: number;
  loserId: OldMaidSeatId;
  oddCardHolderId: OldMaidSeatId;
  oddCardHolderCharacterId: string | null;
  ranking: Array<{ seatId: OldMaidSeatId; characterId: string | null; rank: number }>;
}

export function oldMaidOutcome(state: OldMaidState): OldMaidOutcome | null {
  if (state.status !== "complete" || !state.loserId) return null;
  const ordered = [...state.safeOrder.filter((seatId) => seatId !== state.loserId), state.loserId];
  return {
    turns: state.turn,
    loserId: state.loserId,
    oddCardHolderId: state.loserId,
    oddCardHolderCharacterId: characterIdForSeat(state, state.loserId),
    ranking: ordered.map((seatId, index) => ({
      seatId,
      characterId: characterIdForSeat(state, seatId),
      rank: index + 1,
    })),
  };
}
