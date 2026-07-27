import { useEffect, useMemo, useRef, useState } from "react";
import { WAGER_MULTIPLIERS, leveragedWagerCredit, wagerExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import {
  SLOT_MACHINE_LINE_MULTIPLIER,
  SLOT_MACHINE_PAYLINES,
  SLOT_MACHINE_REACH_DURATION_MS,
  SLOT_MACHINE_REEL_DURATIONS_MS,
  SLOT_MACHINE_STAKES,
  createSlotMachinePresentation,
  hasSlotMachineReach,
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
  initialMultiplier?: WagerMultiplier;
  onSpin(stake: SlotMachineStake, multiplier: WagerMultiplier): void | Promise<void>;
  onFinish(): void | Promise<void>;
  onExit(): void;
}

type SlotRevealPhase = "ready" | "spinning" | "lines" | "cutin" | "settling" | "complete";

export function SlotMachineScreen({ state, symbols, variants, balance, busy, error, initialMultiplier = 2, onSpin, onFinish, onExit }: SlotMachineScreenProps) {
  const [stake, setStake] = useState<SlotMachineStake>(SLOT_MACHINE_STAKES[0]);
  const [multiplier, setMultiplier] = useState<WagerMultiplier>(initialMultiplier);
  const [leverPulled, setLeverPulled] = useState(false);
  const [revealPhase, setRevealPhase] = useState<SlotRevealPhase>(() => state.status === "complete" ? "complete" : state.status === "spinning" ? "spinning" : "ready");
  const [reelStopPulse, setReelStopPulse] = useState(0);
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
  const leverLockRef = useRef(false);
  const leverTimersRef = useRef<number[]>([]);
  finishRef.current = onFinish;
  const paused = manualPaused || hiddenPaused;
  const symbolById = useMemo(() => new Map(symbols.map((symbol) => [symbol.id, symbol])), [symbols]);
  const outcome = state.outcome;
  const credit = slotMachineCredit(state);
  const actualCredit = leveragedWagerCredit(state.stake ?? stake, credit, multiplier);
  const exposure = wagerExposure(state.status === "ready" ? stake : state.stake ?? stake, multiplier);
  const spinning = state.status === "spinning";
  const canSpin = !busy && !spinning && balance >= wagerExposure(stake, multiplier);
  const affordableStakes = useMemo(() => SLOT_MACHINE_STAKES.filter((value) => wagerExposure(value, multiplier) <= balance), [balance, multiplier]);
  const readyGrid = useMemo(() => Array.from({ length: 9 }, (_, cell) => symbols[(cell * 5 + Math.floor(cell / 3)) % symbols.length]?.id ?? ""), [symbols]);
  const presentation = useMemo<SlotMachinePresentation | null>(() => {
    if (!outcome || !state.spinSeed) return null;
    return createSlotMachinePresentation(variants, outcome, state.spinSeed, previousGridRef.current ?? readyGrid);
  }, [outcome, readyGrid, state.spinSeed, variants]);
  const staticVisuals = useMemo(() => selectStaticVisuals(variants, outcome?.grid ?? readyGrid, state.spinSeed ?? "slot-ready"), [outcome?.grid, readyGrid, state.spinSeed, variants]);
  const showingWin = revealPhase === "lines" || revealPhase === "cutin" || revealPhase === "settling" || revealPhase === "complete";
  const highlightingWin = revealPhase === "cutin" || revealPhase === "settling" || revealPhase === "complete";
  const winningCells = useMemo(() => new Set<number>(
    highlightingWin && outcome
      ? outcome.winningLineIndexes.flatMap((lineIndex) => [...(SLOT_MACHINE_PAYLINES[lineIndex] ?? [])])
      : [],
  ), [highlightingWin, outcome]);
  const winnerVisual = useMemo(() => {
    const winningCell = [...winningCells][0];
    const symbolId = winningCell === undefined ? undefined : outcome?.grid[winningCell];
    if (!symbolId) return null;
    const pleased = variants.filter((variant) => variant.symbolId === symbolId && ["pleased", "smile"].includes(variant.expression));
    return selectSlotMachineVisualVariant(pleased.length > 0 ? pleased : variants, symbolId, `${state.spinSeed}:winner`);
  }, [outcome?.grid, state.spinSeed, variants, winningCells]);
  const displayedCredit = useCountUp(state.status === "complete" ? actualCredit : 0, reducedMotion);

  useEffect(() => {
    if (state.status === "complete" && outcome) previousGridRef.current = outcome.grid;
    if (!spinning) previousVisualsRef.current = staticVisuals;
  }, [outcome, spinning, state.status, staticVisuals]);

  useEffect(() => {
    if (balance >= wagerExposure(stake, multiplier) || affordableStakes.length === 0) return;
    setStake(affordableStakes.at(-1) ?? SLOT_MACHINE_STAKES[0]);
  }, [affordableStakes, balance, multiplier, stake]);

  useEffect(() => {
    if (state.status === "ready") setRevealPhase("ready");
    else if (state.status === "complete") setRevealPhase("complete");
  }, [state.status]);

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
    setRevealPhase("spinning");
    setReelStopPulse(0);
    const generation = animationGenerationRef.current + 1;
    animationGenerationRef.current = generation;
    finishedSpinRef.current = null;
    if (reducedMotion) {
      const timer = window.setTimeout(() => {
        if (animationGenerationRef.current === generation) setRevealPhase("settling");
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
        const reach = reel === 2 && outcome !== null && hasSlotMachineReach(outcome);
        const duration = reach ? SLOT_MACHINE_REACH_DURATION_MS : SLOT_MACHINE_REEL_DURATIONS_MS[reel] ?? SLOT_MACHINE_REEL_DURATIONS_MS[2];
        /* A reach reel does not glide to a stop. It stalls, creeps, stalls again
           and only then lands — two keyframes sharing a value make each pause.
           Offsets are fractions of the travel so they stay ordered at any tile
           count, and the effect easing is linear so the plateaus read as stops. */
        const animation = track.animate(reach ? [
          { transform: "translate3d(0, 0, 0)", offset: 0, easing: "cubic-bezier(.3,0,.7,1)" },
          { transform: `translate3d(0, ${-Math.min(distance * .34, tileHeight * 7)}px, 0)`, offset: .22, easing: "cubic-bezier(.16,.7,.3,1)" },
          { transform: `translate3d(0, ${-(distance * .62)}px, 0)`, offset: .40, easing: "linear" },
          { transform: `translate3d(0, ${-(distance * .62)}px, 0)`, offset: .50, easing: "cubic-bezier(.16,.7,.3,1)" },
          { transform: `translate3d(0, ${-(distance * .86)}px, 0)`, offset: .70, easing: "linear" },
          { transform: `translate3d(0, ${-(distance * .86)}px, 0)`, offset: .82, easing: "cubic-bezier(.25,.85,.35,1)" },
          { transform: `translate3d(0, ${-(distance + 11)}px, 0)`, offset: .95, easing: "ease-out" },
          { transform: `translate3d(0, ${-distance}px, 0)`, offset: 1 },
        ] : [
          { transform: "translate3d(0, 0, 0)", offset: 0 },
          { transform: `translate3d(0, ${-Math.min(distance * .08, tileHeight * 1.6)}px, 0)`, offset: .08 },
          { transform: `translate3d(0, ${-Math.min(distance * .34, tileHeight * 7)}px, 0)`, offset: .25 },
          { transform: `translate3d(0, ${-(distance - tileHeight * 2.2)}px, 0)`, offset: .74 },
          { transform: `translate3d(0, ${-(distance + 11)}px, 0)`, offset: .95 },
          { transform: `translate3d(0, ${-distance}px, 0)`, offset: 1 },
        ], { duration, easing: reach ? "linear" : "cubic-bezier(.12,.72,.18,1)", fill: "forwards" });
        void animation.finished.then(() => {
          if (animationGenerationRef.current === generation) setReelStopPulse(reel + 1);
        }).catch(() => undefined);
        return [animation];
      });
      reelAnimationsRef.current = animations;
      if (manualPaused || hiddenPaused) for (const animation of animations) animation.pause();
      const completion = animations.length === 3
        ? Promise.all(animations.map((animation) => animation.finished))
        : delay(outcome && hasSlotMachineReach(outcome) ? SLOT_MACHINE_REACH_DURATION_MS : SLOT_MACHINE_REEL_DURATIONS_MS[2]);
      void completion.then(() => {
        if (animationGenerationRef.current !== generation || finishedSpinRef.current === state.spinSeed) return;
        setRevealPhase("lines");
      }).catch(() => undefined);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      animationGenerationRef.current += 1;
      for (const animation of reelAnimationsRef.current) animation.cancel();
      reelAnimationsRef.current = [];
    };
  }, [outcome, presentation, reducedMotion, spinning, state.spinSeed]);

  useEffect(() => {
    if (!spinning || !state.spinSeed || paused || revealPhase === "ready" || revealPhase === "spinning" || revealPhase === "complete") return;
    if (revealPhase === "settling") {
      if (finishedSpinRef.current === state.spinSeed) return;
      finishedSpinRef.current = state.spinSeed;
      void finishRef.current();
      return;
    }
    const duration = revealPhase === "lines" ? (credit > 0 ? Math.max(520, (outcome?.winningLineIndexes.length ?? 1) * 360) : 420) : 900;
    const timer = window.setTimeout(() => setRevealPhase(revealPhase === "lines" && credit > 0 ? "cutin" : "settling"), duration);
    return () => window.clearTimeout(timer);
  }, [credit, outcome?.winningLineIndexes.length, paused, revealPhase, spinning, state.spinSeed]);

  useEffect(() => {
    for (const animation of reelAnimationsRef.current) {
      if (paused) animation.pause();
      else animation.play();
    }
  }, [paused]);

  useEffect(() => () => { for (const timer of leverTimersRef.current) window.clearTimeout(timer); }, []);

  function cycleStake() {
    if (affordableStakes.length === 0 || spinning || busy) return;
    const current = affordableStakes.indexOf(stake);
    setStake(affordableStakes[(current + 1) % affordableStakes.length] ?? affordableStakes[0]!);
  }

  function selectMaximumStake() {
    const maximum = affordableStakes.at(-1);
    if (maximum !== undefined && !spinning && !busy) setStake(maximum);
  }

  function pullLever() {
    if (!canSpin || leverLockRef.current) return;
    leverLockRef.current = true;
    setLeverPulled(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(18);
    leverTimersRef.current.push(window.setTimeout(() => { void onSpin(stake, multiplier); }, 180));
    leverTimersRef.current.push(window.setTimeout(() => { setLeverPulled(false); leverLockRef.current = false; }, 520));
  }

  return <main className="slot-machine-shell">
    <header className="slot-machine-header">
      <button type="button" className="slot-machine-exit" onClick={onExit} aria-label="카지노로 돌아가기">←</button>
      <div><span>THE MARGIN · CHARACTER REELS</span><h1>슬롯 777</h1></div>
      <strong className="slot-machine-balance">{balance.toLocaleString("ko-KR")} P</strong>
    </header>

    <section className="slot-machine-stage" aria-label="슬롯머신">
      <div className={`slot-machine-cabinet${spinning ? " is-spinning" : ""}${revealPhase !== "spinning" && spinning ? " is-revealing" : ""}${showingWin && credit > 0 ? " is-winning" : ""}${paused ? " is-paused" : ""} reel-stop-${reelStopPulse}`} data-spin-seed={state.spinSeed ?? undefined} data-symbol-count={symbols.length} data-variant-count={variants.length} data-series-count={new Set(variants.map((variant) => variant.series)).size} data-reveal-phase={revealPhase}>
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
          {showingWin && credit > 0 && outcome && <WinningLines lineIndexes={outcome.winningLineIndexes} />}
          {revealPhase === "complete" && credit > 0 && <span className="slot-machine-win-sweep" aria-hidden="true" />}
        </div>
        <div className="slot-machine-lamps" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div>
        {winnerVisual && credit > 0 && (revealPhase === "cutin" || revealPhase === "settling" || revealPhase === "complete") && <div className="slot-machine-winner-cutin" aria-label={`${symbolById.get(winnerVisual.symbolId)?.label ?? winnerVisual.symbolId} 당첨`}>
          <img src={winnerVisual.src} alt="" /><span>WIN</span><strong>{symbolById.get(winnerVisual.symbolId)?.label ?? winnerVisual.symbolId}</strong>
        </div>}
        <button type="button" className={`slot-machine-lever${leverPulled ? " is-pulled" : ""}`} disabled={!canSpin} onClick={pullLever} aria-label={busy ? "회전 준비 중" : balance < wagerExposure(stake, multiplier) ? "포인트 부족" : `${stake} P, ${multiplier}배 베팅 레버 당기기`}>
          <span className="slot-machine-lever-rail" aria-hidden="true"><i /><b /></span><strong>{spinning ? "SPIN" : "PULL"}</strong>
        </button>
      </div>

      <aside className="slot-machine-console">
        <section className="slot-machine-paytable">
          <span>게임 룰</span>
          <h2>같은 인물 세 명을 맞춰라</h2>
          <p>위·가운데·아래와 대각선 두 줄을 판정합니다. 맞은 한 줄마다 판돈의 {SLOT_MACHINE_LINE_MULTIPLIER}배를 지급합니다.</p>
          <small>매 회전 서로 다른 인물 6명과 시리즈별 감정 스프라이트를 고릅니다.</small>
        </section>

        <div className="slot-machine-bet-console" aria-label="판돈 선택">
          <span>CURRENT BET</span><strong className="ca-num">{stake} P × {multiplier}</strong>
          <button type="button" className="ca-gold-rim ca-press" disabled={spinning || busy || affordableStakes.length === 0} onClick={cycleStake}>BET</button>
          <button type="button" className="ca-gold-rim ca-press" disabled={spinning || busy || affordableStakes.length === 0} onClick={selectMaximumStake}>MAX BET</button>
          <div className="slot-machine-multipliers" aria-label="배율 선택">{WAGER_MULTIPLIERS.map((value) => <button type="button" key={value} aria-pressed={multiplier === value} disabled={spinning || busy || balance < wagerExposure(stake, value)} onClick={() => setMultiplier(value)}>{value}배</button>)}</div>
          <small>최대 손실 {wagerExposure(stake, multiplier)} P · 당첨 순이익도 {multiplier}배</small>
        </div>

        {state.status === "complete" && outcome && <section className={`slot-machine-result${credit > 0 ? " won" : " lost"}`} aria-live="polite">
          <strong>{credit > 0 ? `${outcome.winningLineIndexes.length}줄 적중` : "당첨 없음"}</strong>
          <span>{credit > 0 ? `${displayedCredit.toLocaleString("ko-KR")} P 지급` : `${exposure} P 손실`}</span>
        </section>}
        {spinning && <p className="slot-machine-status" aria-live="polite">{paused ? "일시정지됨" : revealPhase === "lines" ? credit > 0 ? "당첨선을 확인하는 중…" : "결과를 확인하는 중…" : revealPhase === "cutin" ? "당첨 연출 중…" : revealPhase === "settling" ? "포인트를 정산하는 중…" : "릴이 돌아가는 중…"}</p>}
        {error && <p className="slot-machine-error" role="alert">{error}</p>}

        {spinning && <div className="slot-machine-actions"><button type="button" className="ca-gold-rim ca-press" onClick={() => setManualPaused((value) => !value)}>{paused ? "계속" : "일시정지"}</button></div>}
        <p className="slot-machine-lever-hint">판돈을 정한 뒤 기계의 레버를 당기세요.</p>
      </aside>
    </section>
  </main>;
}

function SymbolTile({ symbol, visual, winning = false }: { symbol: SlotMachineSymbol | undefined; visual: SlotMachineVisualVariant | undefined; winning?: boolean }) {
  return <div className={`slot-machine-symbol${winning ? " is-winning" : ""}`} aria-label={symbol ? `${symbol.label} 심볼` : "빈 심볼"}>
    {symbol && visual ? <img src={visual.src} alt="" draggable={false} /> : <span>?</span>}
  </div>;
}

const PAYLINE_GEOMETRY = [
  [12, 50, 288, 50],
  [12, 150, 288, 150],
  [12, 250, 288, 250],
  [16, 16, 284, 284],
  [16, 284, 284, 16],
] as const;

function WinningLines({ lineIndexes }: { lineIndexes: readonly number[] }) {
  return <svg className="slot-machine-winning-lines" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
    {lineIndexes.map((lineIndex) => { const line = PAYLINE_GEOMETRY[lineIndex]; return line ? <line key={lineIndex} x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} /> : null; })}
  </svg>;
}

function selectStaticVisuals(variants: readonly SlotMachineVisualVariant[], grid: readonly string[], seed: string): Readonly<Record<string, SlotMachineVisualVariant>> {
  return Object.freeze(Object.fromEntries([...new Set(grid.filter(Boolean))].map((symbolId) => [symbolId, selectSlotMachineVisualVariant(variants, symbolId, seed)])));
}

function delay(duration: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, duration)); }

function useCountUp(value: number, reducedMotion: boolean): number {
  const [displayed, setDisplayed] = useState(value);
  useEffect(() => {
    if (reducedMotion || value <= 0) { setDisplayed(value); return; }
    setDisplayed(0);
    const startedAt = performance.now();
    let frame = 0;
    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 760);
      setDisplayed(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, value]);
  return displayed;
}

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
