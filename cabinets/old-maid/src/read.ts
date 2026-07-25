import type { OldMaidSeatId, OldMaidState } from "./contracts.ts";

export interface OldMaidPublicRead {
  targetHandSize: number;
  targetDiscardCount: number;
  turnsSinceTargetDrew: number;
  reorderedSinceTargetDraw: boolean;
  reorderIndex: number | null;
  reorderCount: number;
  reorderedImmediatelyAfterDraw: boolean;
}

export function publicRead(state: OldMaidState, targetId: OldMaidSeatId): OldMaidPublicRead {
  const lastTargetAction = [...state.history].reverse().find((entry) => entry.type === "draw" && entry.actorId === targetId);
  const lastDrawFromTarget = [...state.history].reverse().find((entry) => entry.type === "draw" && entry.targetId === targetId);
  const reorder = state.lastReorders?.[targetId] ?? (targetId === "player" && state.lastReorder ? { ...state.lastReorder, fromIndex: state.lastReorder.toIndex } : null);
  const reorderStillVisible = reorder !== null && (!lastDrawFromTarget || lastDrawFromTarget.turn < reorder.turn);
  return {
    targetHandSize: state.hands[targetId].length,
    targetDiscardCount: state.discards.filter((discard) => discard.ownerId === targetId).length,
    turnsSinceTargetDrew: lastTargetAction ? Math.max(0, state.turn - lastTargetAction.turn) : state.turn,
    reorderedSinceTargetDraw: reorderStillVisible,
    reorderIndex: reorderStillVisible && reorder ? Math.min(reorder.toIndex, Math.max(0, state.hands[targetId].length - 1)) : null,
    reorderCount: reorderStillVisible && reorder ? reorder.count : 0,
    reorderedImmediatelyAfterDraw: Boolean(reorderStillVisible && reorder && lastTargetAction && lastTargetAction.turn === reorder.turn),
  };
}
