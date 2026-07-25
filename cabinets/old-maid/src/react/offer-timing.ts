export type OldMaidSpectatorSpeed = "normal" | "fast";

export interface OldMaidOfferTiming {
  prepareDelay: number;
  moveDuration: number;
  settleDelay: number;
  drawDelay: number;
}

export function oldMaidOfferTiming(input: {
  moved: boolean;
  npcToNpc: boolean;
  spectatorSpeed: OldMaidSpectatorSpeed;
  reducedMotion: boolean;
}): OldMaidOfferTiming {
  if (input.reducedMotion) return { prepareDelay: 40, moveDuration: 90, settleDelay: 160, drawDelay: 120 };
  const pace = (input.npcToNpc ? 0.75 : 1) * (input.spectatorSpeed === "fast" ? 0.65 : 1);
  return {
    prepareDelay: Math.round(180 * pace),
    moveDuration: Math.round((input.moved ? 600 : 0) * pace),
    settleDelay: Math.round((input.moved ? 600 : 420) * pace),
    drawDelay: Math.round(300 * pace),
  };
}
