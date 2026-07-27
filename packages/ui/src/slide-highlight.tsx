import { useEffect, useRef } from "react";

/**
 * One block that slides behind whichever cell the pointer is over, instead of
 * every cell owning its own hover outline.
 *
 * Aceternity's HoverEffect gets this from a shared `layoutId` in motion. A
 * single absolutely positioned element and one transitioned `translate` reads
 * the same for no dependency and nothing to install.
 *
 * Desktop only, on purpose. A finger has no hover, and the pressed and selected
 * states already say everything a touch device needs. Pair with `.ca-slide`.
 */
export function useSlideHighlight<T extends HTMLElement>(cellSelector = "button"): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host || typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const move = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>(cellSelector) : null;
        if (!target || !host.contains(target)) {
          delete host.dataset.sliding;
          return;
        }
        const cell = target.getBoundingClientRect();
        const frameBox = host.getBoundingClientRect();
        if (!cell.width || !cell.height) {
          delete host.dataset.sliding;
          return;
        }
        host.style.setProperty("--slide-x", `${(cell.left - frameBox.left + host.scrollLeft).toFixed(1)}px`);
        host.style.setProperty("--slide-y", `${(cell.top - frameBox.top + host.scrollTop).toFixed(1)}px`);
        host.style.setProperty("--slide-w", `${cell.width.toFixed(1)}px`);
        host.style.setProperty("--slide-h", `${cell.height.toFixed(1)}px`);
        host.dataset.sliding = "true";
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      delete host.dataset.sliding;
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [cellSelector]);

  return ref;
}
