import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * 펠트 테이블 공용 표현 계층.
 *
 * 이 모듈은 어떤 규칙도 알지 못한다. 코어 상태 두 개의 차이에서 만들어진 표현
 * 이벤트를 순서대로 재생하고, 카드와 칩을 앵커에서 앵커로 옮길 뿐이다. 판정과
 * 타이밍은 각 게임의 엔진이 그대로 소유한다.
 *
 * 좌표계: 앵커 요소에 `data-stage-anchor="이름"`을, 테이블 루트에
 * `data-stage-root`를 붙인다. 비행 레이어는 루트 안에서만 앵커를 찾는다.
 */

export interface StageRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number }

export function stageAnchor(name: string): { "data-stage-anchor": string } { return { "data-stage-anchor": name }; }

export function stageAnchorRect(root: HTMLElement | null, name: string): StageRect | null {
  const element = root?.querySelector<HTMLElement>(`[data-stage-anchor="${name}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/* ───────────────────────── 표현 큐 ───────────────────────── */

export interface PresentationStep<TEvent> {
  readonly event: TEvent;
  /** 이 단계에 배정된 시간(ms). 큐가 밀리면 비례해서 짧아진다. */
  readonly duration: number;
  /** 참이면 다음 코어 상태를 이 단계의 시작에 적용한다. 기본은 프레임의 끝. */
  readonly commit?: boolean;
}

export interface PresentationQueue<TState, TEvent> {
  /** 화면이 그려야 할 상태. 연출이 남아 있으면 실제 상태보다 뒤에 있다. */
  readonly display: TState;
  readonly event: TEvent | null;
  readonly busy: boolean;
  readonly backlog: number;
  skip(): void;
}

/**
 * 코어 상태 변화를 표현 이벤트 열로 바꿔 순서대로 재생한다.
 *
 * `speed`가 0 이하면 큐를 쓰지 않고 즉시 최신 상태로 넘어간다
 * (`prefers-reduced-motion`). 큐가 밀리면 남은 프레임 수에 따라 각 단계를
 * 자동으로 압축해 실제 상태와의 간격이 벌어지지 않게 한다.
 */
export function usePresentationQueue<TState, TEvent>(
  live: TState,
  plan: (previous: TState, next: TState) => readonly PresentationStep<TEvent>[],
  speed = 1,
): PresentationQueue<TState, TEvent> {
  const [display, setDisplay] = useState(live);
  const [event, setEvent] = useState<TEvent | null>(null);
  const [backlog, setBacklog] = useState(0);
  const planRef = useRef(plan);
  const speedRef = useRef(speed);
  const liveRef = useRef(live);
  const framesRef = useRef<Array<{ state: TState; steps: readonly PresentationStep<TEvent>[] }>>([]);
  const runningRef = useRef(false);
  const timerRef = useRef(0);
  const runRef = useRef<() => void>(() => undefined);
  planRef.current = plan;
  speedRef.current = speed;

  runRef.current = () => {
    if (runningRef.current) return;
    const frame = framesRef.current[0];
    if (!frame) { setEvent(null); return; }
    runningRef.current = true;
    const pressure = framesRef.current.length > 2 ? 0.45 : framesRef.current.length > 1 ? 0.72 : 1;
    const rate = Math.max(0, speedRef.current) * pressure;
    let index = 0;
    const advance = (): void => {
      const step = frame.steps[index];
      index += 1;
      if (!step) {
        setDisplay(frame.state);
        framesRef.current = framesRef.current.slice(1);
        setBacklog(framesRef.current.length);
        runningRef.current = false;
        runRef.current();
        return;
      }
      if (step.commit) setDisplay(frame.state);
      setEvent(step.event);
      timerRef.current = window.setTimeout(advance, Math.max(0, Math.round(step.duration * rate)));
    };
    advance();
  };

  const skip = useCallback(() => {
    window.clearTimeout(timerRef.current);
    runningRef.current = false;
    framesRef.current = [];
    setBacklog(0);
    setEvent(null);
    setDisplay(liveRef.current);
  }, []);

  useEffect(() => {
    if (speed <= 0) skip();
  }, [speed, skip]);

  useEffect(() => {
    if (Object.is(live, liveRef.current)) return;
    const previous = liveRef.current;
    liveRef.current = live;
    if (speedRef.current <= 0) { skip(); return; }
    const steps = planRef.current(previous, live);
    if (steps.length === 0 && framesRef.current.length === 0 && !runningRef.current) { setDisplay(live); return; }
    framesRef.current = [...framesRef.current, { state: live, steps }];
    setBacklog(framesRef.current.length);
    runRef.current();
  }, [live, skip]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { display, event, busy: backlog > 0 || event !== null, backlog, skip };
}

/* ───────────────────────── 비행 레이어 ───────────────────────── */

export interface StageFlight {
  /** 이벤트가 바뀔 때마다 달라져야 한다. 같은 id는 같은 비행으로 취급된다. */
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly front: ReactNode;
  readonly back?: ReactNode;
  /** 출발 시점에 앞면인가. 기본은 뒷면. */
  readonly faceUp?: boolean;
  /** 비행 중 뒤집기. `flipAt`(0~1) 지점에서 시작한다. */
  readonly flip?: boolean;
  readonly flipAt?: number;
  readonly duration: number;
  readonly delay?: number;
  /** 도착 시 z축 회전(도). 좌석 방향감을 준다. */
  readonly spin?: number;
  readonly scaleFrom?: number;
  readonly scaleTo?: number;
  readonly fadeOut?: boolean;
  /** 도착 앵커 안에서의 상대 위치. 앵커 크기에 대한 비율이다. */
  readonly toOffset?: { readonly x: number; readonly y: number };
  readonly fromOffset?: { readonly x: number; readonly y: number };
  readonly variant?: "card" | "chip";
}

export function CardFlightLayer({ flights, className }: { flights: readonly StageFlight[]; className?: string }) {
  return <div className={`ca-stage-layer${className ? ` ${className}` : ""}`} aria-hidden="true">
    {flights.map((flight) => <StageFlightItem key={flight.id} flight={flight} />)}
  </div>;
}

function StageFlightItem({ flight }: { flight: StageFlight }) {
  const ref = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    const layer = node?.parentElement;
    if (!node || !layer) return;
    const root = layer.closest<HTMLElement>("[data-stage-root]") ?? layer;
    const bounds = layer.getBoundingClientRect();
    const from = stageAnchorRect(root, flight.from) ?? centerOf(bounds);
    const to = stageAnchorRect(root, flight.to) ?? centerOf(bounds);
    const width = node.offsetWidth || 1;
    const height = node.offsetHeight || 1;
    const start = placement(from, bounds, width, height, flight.fromOffset);
    const end = placement(to, bounds, width, height, flight.toOffset);
    const duration = Math.max(1, flight.duration);
    const delay = Math.max(0, flight.delay ?? 0);
    const animations: Animation[] = [];
    try {
      animations.push(node.animate([
        { transform: `translate3d(${start.x}px, ${start.y}px, 0) rotateZ(0deg) scale(${flight.scaleFrom ?? 1})`, opacity: flight.delay ? 0 : 1, offset: 0 },
        { transform: `translate3d(${start.x}px, ${start.y}px, 0) rotateZ(0deg) scale(${flight.scaleFrom ?? 1})`, opacity: 1, offset: 0.001 },
        { transform: `translate3d(${end.x}px, ${end.y}px, 0) rotateZ(${flight.spin ?? 0}deg) scale(${flight.scaleTo ?? 1})`, opacity: flight.fadeOut ? 0.15 : 1, offset: 1 },
      ], { duration, delay, easing: "cubic-bezier(.22,.72,.24,1)", fill: "both" }));
      const flip = flipRef.current;
      if (flip && flight.flip) {
        const facing = flight.faceUp === true;
        animations.push(flip.animate([
          { transform: `rotateY(${facing ? 180 : 0}deg)` },
          { transform: `rotateY(${facing ? 0 : 180}deg)` },
        ], { duration: Math.round(duration * 0.42), delay: delay + Math.round(duration * (flight.flipAt ?? 0.55)), easing: "cubic-bezier(.4,0,.2,1)", fill: "both" }));
      }
    } catch { /* 연출은 보조 수단이다. 실패해도 큐 타이머가 상태를 계속 진행시킨다. */ }
    return () => { for (const animation of animations) animation.cancel(); };
  }, [flight.id]);

  return <div className={`ca-stage-flight ca-stage-flight-${flight.variant ?? "card"}`} ref={ref}>
    <div className="ca-stage-flip" ref={flipRef} data-face={flight.faceUp ? "front" : "back"}>
      <div className="ca-stage-side ca-stage-front">{flight.front}</div>
      <div className="ca-stage-side ca-stage-back">{flight.back ?? flight.front}</div>
    </div>
  </div>;
}

function centerOf(bounds: DOMRect): StageRect { return { left: bounds.left + bounds.width / 2, top: bounds.top + bounds.height / 2, width: 0, height: 0 }; }

function placement(target: StageRect, bounds: DOMRect, width: number, height: number, offset?: { readonly x: number; readonly y: number }): { x: number; y: number } {
  return {
    x: target.left - bounds.left + target.width / 2 - width / 2 + (offset?.x ?? 0) * target.width,
    y: target.top - bounds.top + target.height / 2 - height / 2 + (offset?.y ?? 0) * target.height,
  };
}

/* ───────────────────────── 테이블 부품 ───────────────────────── */

export function DeckShoe({ anchor = "deck", label, remaining, className }: { anchor?: string; label?: string; remaining?: number; className?: string }) {
  return <div className={`ca-deck${className ? ` ${className}` : ""}`} {...stageAnchor(anchor)}>
    <span className="ca-deck-body" aria-hidden="true" />
    {label && <small>{label}{remaining !== undefined ? ` ${remaining}` : ""}</small>}
  </div>;
}

export function MuckPile({ anchor = "muck", count, label, className }: { anchor?: string; count: number; label?: string; className?: string }) {
  return <div className={`ca-muck${className ? ` ${className}` : ""}`} data-empty={count === 0 || undefined} {...stageAnchor(anchor)}>
    <span className="ca-muck-body" aria-hidden="true" style={{ "--ca-muck-depth": Math.min(6, count) } as CSSProperties} />
    {label && <small>{label}</small>}
  </div>;
}

export function PotStack({ anchor = "pot", units, children, pulse, className }: { anchor?: string; units: number; children?: ReactNode; pulse?: string; className?: string }) {
  return <div className={`ca-pot${className ? ` ${className}` : ""}`} data-pulse={pulse ?? undefined} {...stageAnchor(anchor)}>
    <span className="ca-pot-chips" aria-hidden="true" style={{ "--ca-pot-units": Math.min(8, Math.max(0, units)) } as CSSProperties}>
      {Array.from({ length: Math.min(8, Math.max(0, units)) }, (_, index) => <i key={index} style={{ "--ca-chip-index": index } as CSSProperties} />)}
    </span>
    {children}
  </div>;
}

export function ActionHalo({ active, className }: { active: boolean; className?: string }) {
  return <span className={`ca-halo${className ? ` ${className}` : ""}`} data-active={active || undefined} aria-hidden="true" />;
}

export function CardFan({ children, count, spread = 1, anchor, className }: { children: ReactNode; count: number; spread?: number; anchor?: string; className?: string }) {
  return <div className={`ca-fan${className ? ` ${className}` : ""}`} {...(anchor ? stageAnchor(anchor) : {})} style={{ "--ca-fan-count": count, "--ca-fan-spread": spread } as CSSProperties}>{children}</div>;
}

export function CardFanItem({ index, count, children, style, className }: { index: number; count: number; children: ReactNode; style?: CSSProperties; className?: string }) {
  const middle = (count - 1) / 2;
  return <div className={`ca-fan-item${className ? ` ${className}` : ""}`} style={{ "--ca-fan-index": index, "--ca-fan-offset": index - middle, ...style } as CSSProperties}>{children}</div>;
}

/**
 * 족보 공개 배너. `tier`는 0(없음)부터 7(로열 플러시)까지의 희귀도 등급이고,
 * 등급별 연출은 `card-stage.css`의 `[data-hand-tier]` 규칙이 담당한다.
 */
export function HandReveal({ tier, label, note, className }: { tier: number; label: string; note?: string; className?: string }) {
  return <div className={`ca-hand-reveal${className ? ` ${className}` : ""}`} data-hand-tier={tier}>
    <strong>{label}</strong>
    {note && <small>{note}</small>}
  </div>;
}

/** 테이블 전체를 덮는 최상위 등급 연출. 6등급은 조명 전환, 7등급은 금빛 카드 비. */
export function StageFlourish({ tier }: { tier: number }) {
  if (tier < 6) return null;
  return <div className="ca-flourish" data-hand-tier={tier} aria-hidden="true">
    {tier >= 7 && Array.from({ length: 14 }, (_, index) => <i key={index} style={{ "--ca-rain-index": index } as CSSProperties} />)}
  </div>;
}
