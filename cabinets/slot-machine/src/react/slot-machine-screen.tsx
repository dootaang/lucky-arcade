import { useEffect, useMemo, useRef, useState } from "react";
import { SLOT_MACHINE_LINE_MULTIPLIER, SLOT_MACHINE_PAYLINES, SLOT_MACHINE_STAKES, slotMachineCredit, type SlotMachineStake, type SlotMachineState, type SlotMachineSymbol } from "../index.ts";
import "./slot-machine.css";

export interface SlotMachineScreenProps {
  state: SlotMachineState;
  symbols: readonly SlotMachineSymbol[];
  assets: Readonly<Record<string, string>>;
  balance: number;
  busy: boolean;
  error?: string;
  onSpin(stake: SlotMachineStake): void | Promise<void>;
  onFinish(): void | Promise<void>;
  onExit(): void;
}

const SPIN_DURATION_MS = 1_650;

export function SlotMachineScreen({ state, symbols, assets, balance, busy, error, onSpin, onFinish, onExit }: SlotMachineScreenProps) {
  const [stake, setStake] = useState<SlotMachineStake>(SLOT_MACHINE_STAKES[0]);
  const [manualPaused, setManualPaused] = useState(false);
  const [hiddenPaused, setHiddenPaused] = useState(() => typeof document !== "undefined" && document.hidden);
  const reducedMotion = useReducedMotion();
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const paused = manualPaused || hiddenPaused;
  const symbolById = useMemo(() => new Map(symbols.map((symbol) => [symbol.id, symbol])), [symbols]);
  const winningCells = useMemo(() => new Set(
    state.status === "complete" && state.outcome
      ? state.outcome.winningLineIndexes.flatMap((lineIndex) => [...(SLOT_MACHINE_PAYLINES[lineIndex] ?? [])])
      : [],
  ), [state.outcome, state.status]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setHiddenPaused(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (state.status !== "spinning" || paused) return;
    const timer = window.setTimeout(() => { void finishRef.current(); }, reducedMotion ? 0 : SPIN_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [paused, reducedMotion, state.spinSeed, state.status]);

  const outcome = state.outcome;
  const credit = slotMachineCredit(state);
  const spinning = state.status === "spinning";
  const canSpin = !busy && !spinning && balance >= stake;

  return <main className="slot-machine-shell">
    <header className="slot-machine-header">
      <button type="button" className="slot-machine-exit" onClick={onExit} aria-label="카지노로 돌아가기">←</button>
      <div><span>THE MARGIN · SLOT MACHINE</span><h1>슬롯 777</h1></div>
      <strong className="slot-machine-balance">{balance.toLocaleString("ko-KR")} P</strong>
    </header>

    <section className="slot-machine-stage" aria-label="슬롯머신">
      <div className={`slot-machine-cabinet${spinning ? " is-spinning" : ""}${state.status === "complete" && credit > 0 ? " is-winning" : ""}`} data-spin-seed={state.spinSeed ?? undefined}>
        <div className="slot-machine-marquee"><small>DETERMINISTIC REELS</small><strong>777</strong><span>다섯 라인</span></div>
        <div className="slot-machine-window" aria-live="polite" aria-busy={spinning}>
          <span className="slot-machine-payline" aria-hidden="true" />
          {[0, 1, 2].map((reel) => <div className="slot-machine-reel" data-reel={reel + 1} key={`${state.spinSeed ?? "ready"}:${reel}`}>
            {[0, 1, 2].map((row) => {
              const cell = row * 3 + reel;
              const symbolId = outcome?.grid[cell] ?? symbols[(cell * 5 + reel) % symbols.length]?.id;
              const symbol = symbolId ? symbolById.get(symbolId) : undefined;
              return <div className={`slot-machine-symbol${winningCells.has(cell) ? " is-winning" : ""}`} key={`${row}:${symbolId ?? "empty"}`} aria-label={symbol ? `${symbol.label} 심볼` : "빈 심볼"}>
                {symbol && assets[symbol.id] ? <img src={assets[symbol.id]} alt="" draggable={false} /> : <span>?</span>}
              </div>;
            })}
          </div>)}
        </div>
        <div className="slot-machine-lamps" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div>
      </div>

      <aside className="slot-machine-console">
        <section className="slot-machine-paytable">
          <span>게임 룰</span>
          <h2>같은 그림 세 개를 맞춰라</h2>
          <p>위·가운데·아래와 대각선 두 줄을 판정합니다. 맞은 한 줄마다 판돈의 {SLOT_MACHINE_LINE_MULTIPLIER}배를 지급합니다.</p>
          <small>16개 심볼은 모두 같은 확률입니다.</small>
        </section>

        <div className="slot-machine-stakes" aria-label="판돈 선택">
          {SLOT_MACHINE_STAKES.map((value) => <button type="button" key={value} aria-pressed={stake === value} disabled={spinning || busy || balance < value} onClick={() => setStake(value)}>{value} P</button>)}
        </div>

        {state.status === "complete" && outcome && <section className={`slot-machine-result${credit > 0 ? " won" : " lost"}`} aria-live="polite">
          <strong>{credit > 0 ? `${outcome.winningLineIndexes.length}줄 적중` : "당첨 없음"}</strong>
          <span>{credit > 0 ? `${credit.toLocaleString("ko-KR")} P 지급` : `${state.stake ?? 0} P 사용`}</span>
        </section>}
        {spinning && <p className="slot-machine-status">{paused ? "일시정지됨" : "릴이 돌아가는 중…"}</p>}
        {error && <p className="slot-machine-error" role="alert">{error}</p>}

        <div className="slot-machine-actions">
          {spinning && <button type="button" onClick={() => setManualPaused((value) => !value)}>{paused ? "계속" : "일시정지"}</button>}
          <button type="button" className="slot-machine-spin" disabled={!canSpin} onClick={() => { void onSpin(stake); }}>{busy ? "포인트 처리 중…" : balance < stake ? "포인트 부족" : `${stake} P로 돌리기`}</button>
        </div>
      </aside>
    </section>
  </main>;
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
