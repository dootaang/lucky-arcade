import { useEffect, useRef, useState } from "react";

/**
 * A foil sheen laid over a card, the way a holographic trading card catches
 * light. The effect is expensive to composite, so a screen shows at most one.
 * Grids use `.ca-glare` from casino.css instead.
 *
 * Two input modes, chosen by what the device actually has:
 *   fine pointer   the sheen follows the cursor
 *   coarse pointer the sheen drifts on its own, and follows a finger while held
 *
 * Device orientation is deliberately not used: iOS gates it behind a
 * permission prompt that needs its own gesture, and a card that silently does
 * nothing is worse than one that always breathes.
 */

export interface HoloFoilProps {
  children: React.ReactNode;
  className?: string;
  /** Adds a slight 3D tilt toward the pointer. Off for anything inside a scroller. */
  tilt?: boolean;
}

const FINE_POINTER = "(pointer: fine)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

export function HoloFoil({ children, className, tilt = true }: HoloFoilProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || matches(REDUCED_MOTION)) return;
    if (!matches(FINE_POINTER)) { node.dataset.holoDrift = "true"; return; }

    let frame = 0;
    const point = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
        node.style.setProperty("--holo-x", `${(x * 100).toFixed(1)}%`);
        node.style.setProperty("--holo-y", `${(y * 100).toFixed(1)}%`);
        if (tilt) {
          node.style.setProperty("--holo-rx", `${((0.5 - y) * 13).toFixed(2)}deg`);
          node.style.setProperty("--holo-ry", `${((x - 0.5) * 13).toFixed(2)}deg`);
        }
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      setLive(false);
      node.style.removeProperty("--holo-rx");
      node.style.removeProperty("--holo-ry");
    };
    const enter = () => setLive(true);

    node.addEventListener("pointerenter", enter);
    node.addEventListener("pointermove", point);
    node.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointermove", point);
      node.removeEventListener("pointerleave", leave);
    };
  }, [tilt]);

  return <div ref={ref} className={`ca-holo ${className ?? ""}`.trim()} data-holo-live={live || undefined}>
    <div className="ca-holo-body">{children}</div>
  </div>;
}
