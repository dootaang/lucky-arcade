import { useEffect, useMemo, useRef, useState } from "react";
import {
  SLOT_MACHINE_LINE_MULTIPLIER,
  SLOT_MACHINE_PAYLINES,
  SLOT_MACHINE_STAKES,
  createSlotMachinePresentation,
  selectSlotMachineVisualVariant,
  slotMachineCredit,
  type SlotMachinePresentation,
  type SlotMachineStake,
  type SlotMachineState,
  type SlotMachineSymbol,
  type SlotMachineVisualVariant,
} from "../index.ts";
import "./slot-machine.css";

export interface SlotMachineScreenProps {
  state: SlotMachineState;
  symbols: readonly SlotMachineSymbol[];
  variants: readonly SlotMachineVisualVariant[];
  balance: number;
  busy: boolean;
  error?: string;
  onSpin(stake: SlotMachineStake): void | Promise<void>;
  onFinish(): void | Promise<void>;
  onExit(): void;
}

const REEL_DURATIONS_MS = [1_100, 1_430, 1_820] as const;

export function SlotMachineScreen({ state, symbols, variants, balance, busy, error, onSpin, onFinish, onExit }: SlotMachineScreenProps) {
  const [stake, setStake] = useState<SlotMachineStake>(SLOT_MACHINE_STAKES[0]);
  const [manualPaused, setManualPaused] = useState(false);
  const [hiddenPaused, setHiddenPaused] = useState(() => typeof document !== "undefined" && document.hidden);
  const reducedMotion = useReducedMotion();
  const finishRef = useRef(onFinish);
  const reelTracksRef = useRef<Array<HTMLDivElement | null>>([]);
  const reelAnimationsRef = useRef<Animation[]>([]);
  const animationGenerationRef = useRef(0);
  const finishedSpinRef = useRef<string | null>(null);
  const previousGridRef = useRef<readonly string[] | undefined>(undefined);
  const previousVisualsRef = useRef<Readonly<Record<string, SlotMachineVisualVariant>>>({});
  finishRef.current = onFinish;
  const paused = manualPaused || hiddenPaused;
  const symbolById = useMemo(() => new Map(symbols.map((symbol) => [symbol.id, symbol])), [symbols]);
  const outcome = state.outcome;
  const credit = slotMachineCredit(state);
  const spinning = state.status === "spinning";
  const canSpin = !busy && !spinning && balance >= stake;
  const readyGrid = useMemo(() => Array.from({ length: 9 }, (_, cell) => symbols[(cell * 5 + Math.floor(cell / 3)) % symbols.length]?.id ?? ""), [symbols]);
  const presentation = useMemo<SlotMachinePresentation | null>(() => {
    if (!outcome || !state.spinSeed) return null;
    return createSlotMachinePresentation(variants, outcome, state.spinSeed, previousGridRef.current ?? readyGrid);
  }, [outcome, readyGrid, state.spinSeed, variants]);
  const staticVisuals = useMemo(() => selectStaticVisuals(variants, outcome?.grid ?? readyGrid, state.spinSeed ?? "slot-ready"), [outcome?.grid, readyGrid, state.spinSeed, variants]);
  const winningCells = useMemo(() => new Set<number>(
    state.status === "complete" && outcome
      ? outcome.winningLineIndexes.flatMap((lineIndex) => [...(SLOT_MACHINE_PAYLINES[lineIndex] ?? [])])
      : [],
  ), [outcome, state.status]);
  const winnerVisual = useMemo(() => {
    const winningCell = [...winningCells][0];
    const symbolId = winningCell === undefined ? undefined : outcome?.grid[winningCell];
    if (!symbolId) return null;
    const pleased = variants.filter((variant) => variant.symbolId === symbolId && ["pleased", "smile"].includes(variant.expression));
    return selectSlotMachineVisualVariant(pleased.length > 0 ? pleased : variants, symbolId, `${state.spinSeed}:winner`);
  }, [outcome?.grid, state.spinSeed, variants, winningCells]);

  useEffect(() => {
    if (state.status === "complete" && outcome) previousGridRef.current = outcome.grid;
    if (!spinning) previousVisualsRef.current = staticVisuals;
  }, [outcome, spinning, state.status, staticVisuals]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setHiddenPaused(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!spinning || !state.spinSeed || !presentation) return;
    setManualPaused(false);
    const generation = animationGenerationRef.current + 1;
    animationGenerationRef.current = generation;
    finishedSpinRef.current = null;
    if (reducedMotion) {
      const timer = window.setTimeout(() => {
        if (animationGenerationRef.current === generation && finishedSpinRef.current !== state.spinSeed) {
          finishedSpinRef.current = state.spinSeed;
          void finishRef.current();
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const frame = window.requestAnimationFrame(() => {
      const animations = reelTracksRef.current.flatMap((track, reel) => {
        if (!track) return [];
        const tile = track.querySelector<HTMLElement>(".slot-machine-symbol");
        const tileHeight = tile?.getBoundingClientRect().height ?? 0;
        const landingSteps = Math.max(0, track.children.length - 3);
        const distance = tileHeight * landingSteps;
        if (distance <= 0 || typeof track.animate !== "function") return [];
        const animation = track.animate([
          { transform: "translate3d(0, 0, 0)", offset: 0 },
          { transform: `translate3d(0, ${-Math.min(distance * .14, tileHeight * 3)}px, 0)`, offset: .14 },
          { transform: `translate3d(0, ${-(distance - tileHeight * .72)}px, 0)`, offset: .79 },
          { transform: `translate3d(0, ${-(distance + 9)}px, 0)`, offset: .94 },
          { transform: `translate3d(0, ${-distance}px, 0)`, offset: 1 },
        ], { duration: REEL_DURATIONS_MS[reel] ?? REEL_DURATIONS_MS[2], easing: "cubic-bezier(.17,.67,.2,1)", fill: "forwards" });
        return [animation];
      });
      reelAnimationsRef.current = animations;
      if (manualPaused || hiddenPaused) for (const animation of animations) animation.pause();
      const completion = animations.length === 3
        ? Promise.all(animations.map((animation) => animation.finished))
        : delay(REEL_DURATIONS_MS[2]);
      void completion.then(() => {
        if (animationGenerationRef.current !== generation || finishedSpinRef.current === state.spinSeed) return;
        finishedSpinRef.current = state.spinSeed;
        void finishRef.current();
      }).catch(() => undefined);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      animationGenerationRef.current += 1;
      for (const animation of reelAnimationsRef.current) animation.cancel();
      reelAnimationsRef.current = [];
    };
  }, [presentation, reducedMotion, spinning, state.spinSeed]);

  useEffect(() => {
    for (const animation of reelAnimationsRef.current) {
      if (paused) animation.pause();
      else animation.play();
    }
  }, [paused]);

  return <main className="slot-machine-shell">
    <header className="slot-machine-header">
      <button type="button" className="slot-machine-exit" onClick={onExit} aria-label="카지노로 돌아가기">←</button>
      <div><span>THE MARGIN · CHARACTER REELS</span><h1>슬롯 777</h1></div>
      <strong className="slot-machine-balance">{balance.toLocaleString("ko-KR")} P</strong>
    </header>

    <section className="slot-machine-stage" aria-label="슬롯머신">
      <div className={`slot-machine-cabinet${spinning ? " is-spinning" : ""}${state.status === "complete" && credit > 0 ? " is-winning" : ""}${paused ? " is-paused" : ""}`} data-spin-seed={state.spinSeed ?? undefined} data-symbol-count={symbols.length} data-variant-count={variants.length} data-series-count={new Set(variants.map((variant) => variant.series)).size}>
        <div className="slot-machine-marquee"><small>FOUR SERIES · EMOTION REELS</small><strong>777</strong><span>다섯 라인</span></div>
        <div className="slot-machine-window" aria-busy={spinning}>
          <span className="slot-machine-payline" aria-hidden="true" />
          {[0, 1, 2].map((reel) => <div className="slot-machine-reel" data-reel={reel + 1} key={`${state.spinSeed ?? "ready"}:${reel}`}>
            {spinning && presentation
              ? <div className="slot-machine-track" data-track-count={presentation.reels[reel]?.length ?? 0} ref={(node) => { reelTracksRef.current[reel] = node; }} aria-hidden="true">
                {(presentation.reels[reel] ?? []).map((symbolId, index) => <SymbolTile key={`${index}:${symbolId}`} symbol={symbolById.get(symbolId)} visual={index < 3 ? previousVisualsRef.current[symbolId] ?? presentation.variantsBySymbolId[symbolId] : presentation.variantsBySymbolId[symbolId]} />)}
              </div>
              : <div className="slot-machine-track is-settled">
                {[0, 1, 2].map((row) => {
                  const cell = row * 3 + reel;
                  const symbolId = outcome?.grid[cell] ?? readyGrid[cell];
                  return <SymbolTile key={`${row}:${symbolId}`} symbol={symbolId ? symbolById.get(symbolId) : undefined} visual={symbolId ? staticVisuals[symbolId] : undefined} winning={winningCells.has(cell)} />;
                })}
              </div>}
          </div>)}
          {state.status === "complete" && credit > 0 && <span className="slot-machine-win-sweep" aria-hidden="true" />}
        </div>
        <div className="slot-machine-lamps" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div>
        {winnerVisual && state.status === "complete" && credit > 0 && <div className="slot-machine-winner-cutin" aria-label={`${symbolById.get(winnerVisual.symbolId)?.label ?? winnerVisual.symbolId} 당첨`}>
          <img src={winnerVisual.src} alt="" /><span>WIN</span><strong>{symbolById.get(winnerVisual.symbolId)?.label ?? winnerVisual.symbolId}</strong>
        </div>}
      </div>

      <aside className="slot-machine-console">
        <section className="slot-machine-paytable">
          <span>게임 룰</span>
          <h2>같은 인물 세 명을 맞춰라</h2>
          <p>위·가운데·아래와 대각선 두 줄을 판정합니다. 맞은 한 줄마다 판돈의 {SLOT_MACHINE_LINE_MULTIPLIER}배를 지급합니다.</p>
          <small>매 회전 서로 다른 인물 6명과 시리즈별 감정 스프라이트를 고릅니다.</small>
        </section>

        <div className="slot-machine-stakes" aria-label="판돈 선택">
          {SLOT_MACHINE_STAKES.map((value) => <button type="button" key={value} aria-pressed={stake === value} disabled={spinning || busy || balance < value} onClick={() => setStake(value)}>{value} P</button>)}
        </div>

        {state.status === "complete" && outcome && <section className={`slot-machine-result${credit > 0 ? " won" : " lost"}`} aria-live="polite">
          <strong>{credit > 0 ? `${outcome.winningLineIndexes.length}줄 적중` : "당첨 없음"}</strong>
          <span>{credit > 0 ? `${credit.toLocaleString("ko-KR")} P 지급` : `${state.stake ?? 0} P 사용`}</span>
        </section>}
        {spinning && <p className="slot-machine-status" aria-live="polite">{paused ? "일시정지됨" : "릴이 돌아가는 중…"}</p>}
        {error && <p className="slot-machine-error" role="alert">{error}</p>}

        <div className="slot-machine-actions">
          {spinning && <button type="button" onClick={() => setManualPaused((value) => !value)}>{paused ? "계속" : "일시정지"}</button>}
          <button type="button" className="slot-machine-spin" disabled={!canSpin} onClick={() => { void onSpin(stake); }}>{busy ? "회전 준비 중…" : balance < stake ? "포인트 부족" : `${stake} P로 돌리기`}</button>
        </div>
      </aside>
    </section>
  </main>;
}

function SymbolTile({ symbol, visual, winning = false }: { symbol: SlotMachineSymbol | undefined; visual: SlotMachineVisualVariant | undefined; winning?: boolean }) {
  return <div className={`slot-machine-symbol${winning ? " is-winning" : ""}`} aria-label={symbol ? `${symbol.label} 심볼` : "빈 심볼"}>
    {symbol && visual ? <img src={visual.src} alt="" draggable={false} /> : <span>?</span>}
  </div>;
}

function selectStaticVisuals(variants: readonly SlotMachineVisualVariant[], grid: readonly string[], seed: string): Readonly<Record<string, SlotMachineVisualVariant>> {
  return Object.freeze(Object.fromEntries([...new Set(grid.filter(Boolean))].map((symbolId) => [symbolId, selectSlotMachineVisualVariant(variants, symbolId, seed)])));
}

function delay(duration: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, duration)); }

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}
