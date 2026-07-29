import {
  FIVE_CARD_DRAW_CONTRACT,
  FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS,
  FIVE_CARD_DRAW_TERMS_VERSION,
  createFiveCardDrawState,
  isFiveCardDrawState,
  reduceFiveCardDraw,
  type FiveCardDrawAction,
  type FiveCardDrawOpponent,
  type FiveCardDrawStake,
  type FiveCardDrawState,
} from "@lucky-arcade/five-card-draw";
import { FiveCardDrawScreen, type FiveCardDrawOpponentView } from "@lucky-arcade/five-card-draw/react";
import { useEffect, useRef, useState } from "react";
import { loadPlayingCardAtlas } from "../../lib/playing-card-atlas.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { createTemerosaFiveCardDrawOpponents } from "./temerosa-five-card-draw-opponents.ts";

const STORAGE_KEY = `${FIVE_CARD_DRAW_TERMS_VERSION}:envelope`;
const BEGINNER_KEY = `${FIVE_CARD_DRAW_TERMS_VERSION}:beginner`;
const INITIAL_BALANCE = 1_000;

interface PreviewEnvelope {
  contract: typeof FIVE_CARD_DRAW_TERMS_VERSION;
  balance: number;
  state: FiveCardDrawState;
  settledResultIds: readonly string[];
}

interface Ready {
  envelope: PreviewEnvelope;
  opponents: readonly FiveCardDrawOpponentView[];
  atlas: Awaited<ReturnType<typeof loadPlayingCardAtlas>>;
}

export default function FiveCardDrawView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [beginner, setBeginner] = useState(() => readBeginner());
  const readyRef = useRef<Ready | null>(null);
  const advancingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaCasinoAssets(), loadPlayingCardAtlas()]).then(([bundle, atlas]) => {
      const opponents = createTemerosaFiveCardDrawOpponents(bundle.contentAssets).map((opponent): FiveCardDrawOpponentView => {
        const portraits = Object.fromEntries(Object.entries(opponent.portraitAssetIds).map(([tell, assetId]) => {
          const portrait = bundle.assets[assetId];
          if (!portrait) throw new Error(`five_card_draw_portrait_missing:${assetId}`);
          return [tell, portrait];
        })) as NonNullable<FiveCardDrawOpponentView["portraits"]>;
        return { id: opponent.id, name: opponent.name, persona: opponent.persona, portraits };
      });
      if (opponents.length !== 30) throw new Error(`five_card_draw_opponent_count:${opponents.length}`);
      const restored = readEnvelope(opponents) ?? freshEnvelope(opponents);
      const value = { envelope: restored, opponents, atlas };
      if (!alive) return;
      readyRef.current = value;
      setReady(value);
    }).catch(() => { if (alive) setError("파이브 카드 드로 포커를 준비하지 못했습니다."); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const current = ready?.envelope.state;
    if (!current || current.phase === "ready" || current.phase === "complete" || current.currentActorId === "player" || advancingRef.current) return;
    const timer = window.setTimeout(() => {
      const latest = readyRef.current;
      if (!latest || latest.envelope.state.currentActorId === "player" || latest.envelope.state.phase === "complete") return;
      advancingRef.current = true;
      try { applyAction({ type: "advance" }); }
      finally { advancingRef.current = false; }
    }, 520);
    return () => window.clearTimeout(timer);
  }, [ready?.envelope.state]);

  function update(nextEnvelope: PreviewEnvelope): void {
    writeEnvelope(nextEnvelope);
    setReady((current) => {
      if (!current) return current;
      const next = { ...current, envelope: nextEnvelope };
      readyRef.current = next;
      return next;
    });
  }

  function applyAction(action: FiveCardDrawAction): void {
    const current = readyRef.current;
    if (!current) return;
    setError("");
    try {
      const state = reduceFiveCardDraw(current.envelope.state, action);
      update(settleIfComplete({ ...current.envelope, state }));
    } catch {
      setError("그 행동은 지금 선택할 수 없습니다.");
    }
  }

  function start(selected: readonly FiveCardDrawOpponentView[], stake: FiveCardDrawStake): void {
    const current = readyRef.current;
    if (!current || busy) return;
    const reservation = stake * FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS;
    if (current.envelope.balance < reservation) { setError("시험 포인트가 부족합니다. 시험 지갑을 초기화해 주세요."); return; }
    setBusy(true);
    setError("");
    try {
      const context = {
        sessionId: `five-card-draw:preview:${crypto.randomUUID()}`,
        opponents: selected.map(stripPresentation),
      };
      const fresh = createFiveCardDrawState(context, current.envelope.state.dealerIndex);
      const state = reduceFiveCardDraw(fresh, { type: "start", seed: crypto.randomUUID(), stake });
      update({ ...current.envelope, balance: current.envelope.balance - reservation, state });
    } catch { setError("대국을 시작하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function reset(): void {
    const current = readyRef.current;
    if (!current || current.envelope.state.phase !== "complete") return;
    update({ ...current.envelope, state: reduceFiveCardDraw(current.envelope.state, { type: "reset" }) });
  }

  function resetWallet(): void {
    const current = readyRef.current;
    if (!current || current.envelope.state.phase !== "ready") return;
    update({ ...current.envelope, balance: INITIAL_BALANCE });
    setError("");
  }

  function changeBeginner(value: boolean): void {
    setBeginner(value);
    try { localStorage.setItem(BEGINNER_KEY, value ? "1" : "0"); } catch { /* optional preference */ }
  }

  if (!ready) return <main className="game-shell"><div className="game-loading">포커 테이블을 준비하고 있습니다…</div>{error && <p role="alert">{error}</p>}</main>;
  return <FiveCardDrawScreen
    state={ready.envelope.state}
    opponents={ready.opponents}
    atlas={ready.atlas}
    balance={ready.envelope.balance}
    busy={busy}
    error={error}
    beginner={beginner}
    onBeginner={changeBeginner}
    onStart={start}
    onAction={applyAction}
    onReset={reset}
    onResetWallet={resetWallet}
    onExit={onExit}
  />;
}

function settleIfComplete(envelope: PreviewEnvelope): PreviewEnvelope {
  const result = envelope.state.result;
  if (envelope.state.phase !== "complete" || !result || envelope.settledResultIds.includes(result.resultId)) return envelope;
  return { ...envelope, balance: envelope.balance + result.playerCredit, settledResultIds: [...envelope.settledResultIds.slice(-99), result.resultId] };
}

function freshEnvelope(opponents: readonly FiveCardDrawOpponentView[]): PreviewEnvelope {
  const first = opponents[0];
  if (!first) throw new Error("five_card_draw_opponent_missing");
  return {
    contract: FIVE_CARD_DRAW_TERMS_VERSION,
    balance: INITIAL_BALANCE,
    state: createFiveCardDrawState({ sessionId: "five-card-draw:preview:ready", opponents: [stripPresentation(first)] }),
    settledResultIds: [],
  };
}

function readEnvelope(opponents: readonly FiveCardDrawOpponentView[]): PreviewEnvelope | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PreviewEnvelope>;
    const ids = new Set(opponents.map((opponent) => opponent.id));
    if (value.contract !== FIVE_CARD_DRAW_TERMS_VERSION || !Number.isInteger(value.balance) || value.balance! < 0 || !isFiveCardDrawState(value.state)
      || value.state.contract !== FIVE_CARD_DRAW_CONTRACT || value.state.context.opponents.some((opponent) => !ids.has(opponent.id)) || !Array.isArray(value.settledResultIds)) return null;
    return value as PreviewEnvelope;
  } catch { return null; }
}

function writeEnvelope(envelope: PreviewEnvelope): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope)); } catch { /* preview can continue in memory */ }
}

function readBeginner(): boolean {
  try { return localStorage.getItem(BEGINNER_KEY) !== "0"; } catch { return true; }
}

function stripPresentation(opponent: FiveCardDrawOpponentView): FiveCardDrawOpponent {
  return { id: opponent.id, name: opponent.name, persona: { ...opponent.persona } };
}
