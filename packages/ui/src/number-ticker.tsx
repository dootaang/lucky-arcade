import { useEffect, useRef, useState } from "react";

const PREFERS_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PREFERS_REDUCED_MOTION).matches;
}

export interface NumberTickerProps {
  value: number;
  /** Milliseconds the count takes to land. */
  durationMs?: number;
  className?: string;
  /** Rendered before the number, inside the same element. */
  prefix?: string;
  /** Rendered after the number, inside the same element. */
  suffix?: string;
}

/**
 * A number that rolls to its new value instead of snapping.
 *
 * The count is presentation only: the committed value is whatever the caller
 * passes, so a reader that jumps straight to the end (reduced motion, or a
 * screen reader announcing the element) still sees the settled amount.
 */
export function NumberTicker({ value, durationMs = 850, className, prefix, suffix }: NumberTickerProps): React.ReactElement {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    if (shownRef.current === value) return;
    if (reducedMotion()) { shownRef.current = value; setShown(value); return; }
    const from = shownRef.current;
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now: number): void {
      const progress = Math.min(1, (now - started) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(from + (value - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <span className={className}>{prefix}{shown.toLocaleString("ko-KR")}{suffix}</span>;
}
