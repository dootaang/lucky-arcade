import type { OldMaidSeatId, OldMaidState } from "./contracts.ts";

export interface OldMaidPublicRead {
  targetHandSize: number;
  targetDiscardCount: number;
  turnsSinceTargetDrew: number;
  reorderedSinceTargetDraw: boolean;
  reorderIndex: number | null;
}

export function publicRead(state: OldMaidState, targetId: OldMaidSeatId): OldMaidPublicRead {
  const lastTargetAction = [...state.history].reverse().find((entry) => entry.type === "draw" && entry.actorId === targetId);
  const lastDrawFromTarget = [...state.history].reverse().find((entry) => entry.type === "draw" && entry.targetId === targetId);
  const reorderStillVisible = targetId === "player" && state.lastReorder !== null && (!lastDrawFromTarget || lastDrawFromTarget.turn < state.lastReorder.turn);
  return {
    targetHandSize: state.hands[targetId].length,
    targetDiscardCount: state.discards.filter((discard) => discard.ownerId === targetId).length,
    turnsSinceTargetDrew: lastTargetAction ? Math.max(0, state.turn - lastTargetAction.turn) : state.turn,
    reorderedSinceTargetDraw: reorderStillVisible,
    reorderIndex: reorderStillVisible && state.lastReorder ? Math.min(state.lastReorder.toIndex, Math.max(0, state.hands[targetId].length - 1)) : null,
  };
}
