import type { OldMaidSeatId, OldMaidState } from "../contracts.ts";

export function discardStageKey(mode: OldMaidState["discardMode"], ownerId: OldMaidSeatId, pairs: readonly [string, string][]): string {
  const pairSet = pairs
    .map(([left, right]) => [left, right].sort().join(":"))
    .sort()
    .join("|");
  return `${mode}:${ownerId}:${pairSet}`;
}
