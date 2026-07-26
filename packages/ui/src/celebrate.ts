/**
 * Gold confetti for the moments that deserve it.
 *
 * `canvas-confetti` is loaded on demand, so it never reaches the initial chunk
 * and only downloads once a player actually wins something.
 */

const GOLD = ["#f3bd55", "#ffdda4", "#c79a3c", "#f7f2e6", "#8b0000"];

function reducedMotion(): boolean {
  return typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type CelebrationScale = "modest" | "full";

/**
 * Fires once and resolves when the burst has been scheduled. Never throws: a
 * failed celebration must not take down the screen that asked for it.
 */
export async function celebrate(scale: CelebrationScale = "full"): Promise<void> {
  if (reducedMotion()) return;
  try {
    const { default: confetti } = await import("canvas-confetti");
    const shared = { colors: GOLD, disableForReducedMotion: true, scalar: 0.9, zIndex: 60 } as const;
    if (scale === "modest") {
      void confetti({ ...shared, particleCount: 48, spread: 62, startVelocity: 32, origin: { y: 0.42 } });
      return;
    }
    void confetti({ ...shared, particleCount: 90, spread: 74, startVelocity: 42, origin: { y: 0.38 } });
    window.setTimeout(() => { void confetti({ ...shared, particleCount: 44, spread: 96, startVelocity: 30, origin: { x: 0.18, y: 0.5 } }); }, 160);
    window.setTimeout(() => { void confetti({ ...shared, particleCount: 44, spread: 96, startVelocity: 30, origin: { x: 0.82, y: 0.5 } }); }, 260);
  } catch {
    // A missing or blocked chunk simply means no confetti.
  }
}
