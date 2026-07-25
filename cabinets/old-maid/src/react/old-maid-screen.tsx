import { IconArrowLeft, IconCards, IconCheck, IconRefresh } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createOldMaidState, reduceOldMaid, targetSeat } from "../engine.ts";
import type { OldMaidAction, OldMaidCartridge, OldMaidSeatId, OldMaidState } from "../contracts.ts";
import "./old-maid.css";

export interface OldMaidScreenProps {
  cartridge: OldMaidCartridge;
  assets: Readonly<Record<string, string>>;
  initialState: OldMaidState | null;
  onPersist(previous: OldMaidState, next: OldMaidState, action: OldMaidAction): Promise<void>;
  onExit(): void;
}

export function OldMaidScreen({ cartridge, assets, initialState, onPersist, onExit }: OldMaidScreenProps) {
  const [state, setState] = useState(() => initialState ?? createOldMaidState(cartridge, dailySeed()));
  const stateRef = useRef(state);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const faces = useMemo(() => new Map(cartridge.faces.map((face) => [face.id, face])), [cartridge]);
  const cards = useMemo(() => new Map(cartridge.cards.map((card) => [card.id, card])), [cartridge]);
  const seats = useMemo(() => new Map(cartridge.seats.map((seat) => [seat.id, seat])), [cartridge]);

  function dispatch(action: OldMaidAction) {
    const previous = stateRef.current;
    const next = reduceOldMaid(cartridge, previous, action);
    stateRef.current = next;
    setState(next);
    setSaveState("saving");
    const revision = ++saveRevisionRef.current;
    persistQueueRef.current = persistQueueRef.current.catch(() => undefined).then(() => onPersist(previous, next, action));
    void persistQueueRef.current
      .then(() => { if (saveRevisionRef.current === revision) setSaveState("saved"); })
      .catch(() => { if (saveRevisionRef.current === revision) setSaveState("error"); });
  }

  useEffect(() => {
    if (state.status !== "playing" || state.currentPlayerId === "player") return;
    const timer = window.setTimeout(() => dispatch({ type: "cpu_draw" }), 620);
    return () => window.clearTimeout(timer);
  }, [state.currentPlayerId, state.status, state.turn]);

  const targetId = state.status === "playing" ? targetSeat(state) : null;
  const lastFace = state.lastDraw ? faces.get(state.lastDraw.faceId) : null;
  const background = assets["pequod-ruins"];

  return <main className="old-maid-shell" style={background ? { "--old-maid-bg": `url(${JSON.stringify(background)})` } as React.CSSProperties : undefined}>
    <header className="old-maid-header">
      <button onClick={onExit} aria-label="오락실로 돌아가기"><IconArrowLeft /></button>
      <div><span>TEMEROSA · TABLE GAME</span><h1>여백의 도둑</h1></div>
      <div className="old-maid-meters"><span>{state.turn}턴</span><small aria-live="polite">{saveState === "saving" ? "저장 중…" : saveState === "error" ? "저장 재시도 필요" : "자동 저장됨"}</small></div>
    </header>

    <section className="old-maid-table" aria-label="테메로세 도둑잡기 테이블">
      <div className="old-maid-opponents">
        {(["pale", "kano", "nemo"] as const).map((seatId) => <SeatPanel key={seatId} seatId={seatId} state={state} name={seats.get(seatId)?.name ?? seatId} portrait={reactionPortrait(seatId, state, assets)} active={state.currentPlayerId === seatId} />)}
      </div>

      <div className="old-maid-center">
        {state.status === "ready" && <div className="old-maid-intro">
          <IconCards size={48} />
          <span className="eyebrow">알제의 폐기 예정 게임기</span>
          <h2>마지막 여백 기록을 피하세요</h2>
          <p>오른쪽 상대에게서 한 장을 뽑습니다. 같은 얼굴 두 장은 자동으로 사라지고, 마지막 한 장을 든 사람이 집니다.</p>
          <div className="old-maid-roster">{cartridge.seats.map((seat) => <span key={seat.id}>{seat.name}</span>)}</div>
          <button className="old-maid-primary" onClick={() => dispatch({ type: "start" })}>19장 배분하고 시작</button>
        </div>}

        {state.status === "playing" && <>
          <div className={`old-maid-turn-callout ${state.currentPlayerId === "player" ? "player" : "cpu"}`}>
            <strong>{seats.get(state.currentPlayerId)?.name}의 차례</strong>
            <span>{state.currentPlayerId === "player" ? `${seats.get(targetId ?? "pale")?.name}의 뒷면 카드 한 장을 고르세요.` : `${seats.get(targetId ?? "player")?.name}에게서 고르는 중…`}</span>
          </div>
          {state.currentPlayerId === "player" && targetId && <div className="old-maid-draw-row" aria-label={`${seats.get(targetId)?.name}의 뒷면 카드`}>
            {state.hands[targetId].map((cardId, index) => <button key={cardId} className="old-maid-card back" aria-label={`${index + 1}번째 뒷면 카드`} onClick={() => dispatch({ type: "draw", index })}><span>THE<br />MARGIN</span></button>)}
          </div>}
          {lastFace && state.lastDraw && <div className={`old-maid-last-card ${state.lastDraw.madePair ? "paired" : "kept"}`} aria-live="polite">
            <CardFace faceId={lastFace.id} name={lastFace.name} assetId={lastFace.assetId} assets={assets} odd={lastFace.id === cartridge.oddFaceId} />
            <p>{state.lastDraw.madePair ? `${seats.get(state.lastDraw.actorId)?.name}이 짝을 완성했습니다.` : lastFace.id === cartridge.oddFaceId ? "여백 기록이 손을 옮겼습니다." : "짝이 없어 손패에 남았습니다."}</p>
          </div>}
        </>}

        {state.status === "complete" && state.loserId && <div className="old-maid-result">
          <span className="old-maid-result-mark">!</span>
          <p className="eyebrow">GAME COMPLETE · {state.turn} TURNS</p>
          <h2>{seats.get(state.loserId)?.name}에게 여백 기록이 남았습니다</h2>
          <p>{state.loserId === "player" ? "이번 판은 항해사가 패배했습니다." : `항해사는 ${state.safeOrder.indexOf("player") + 1}번째로 손을 비웠습니다.`}</p>
          <ol>{state.safeOrder.map((seatId, index) => <li key={seatId}><IconCheck size={16} /><b>{index + 1}</b><span>{seats.get(seatId)?.name}</span></li>)}</ol>
          <div className="old-maid-result-actions">
            <button onClick={() => dispatch({ type: "restart", seed: state.seed })}><IconRefresh /> 같은 패 다시 보기</button>
            <button className="old-maid-primary" onClick={() => dispatch({ type: "restart", seed: `${dailySeed()}:${Date.now().toString(36)}` })}>새로 섞기</button>
          </div>
        </div>}
      </div>

      <section className={`old-maid-player ${state.currentPlayerId === "player" && state.status === "playing" ? "active" : ""}`}>
        <div><strong>항해사</strong><span>{state.hands.player.length}장</span></div>
        <div className="old-maid-player-hand" aria-label="내 손패">
          {state.hands.player.map((cardId) => { const card = cards.get(cardId); const face = card ? faces.get(card.faceId) : null; return face ? <CardFace key={cardId} faceId={face.id} name={face.name} assetId={face.assetId} assets={assets} odd={face.id === cartridge.oddFaceId} /> : null; })}
          {state.hands.player.length === 0 && <span className="old-maid-safe"><IconCheck /> 손패를 모두 비웠습니다</span>}
        </div>
      </section>
    </section>
    <footer className="old-maid-notice">원작 설정과 무관한 오락용 카드 게임 · 같은 얼굴 두 장이 한 쌍</footer>
  </main>;
}

function SeatPanel({ seatId, state, name, portrait, active }: { seatId: OldMaidSeatId; state: OldMaidState; name: string; portrait: string | null; active: boolean }) {
  const safe = state.safeOrder.includes(seatId);
  return <article className={`old-maid-seat ${active ? "active" : ""} ${safe ? "safe" : ""}`}>
    <div className="old-maid-seat-portrait">{portrait ? <img src={portrait} alt={`${name}의 반응`} decoding="async" /> : <span>{name}</span>}</div>
    <div><strong>{name}</strong><span>{safe ? "안전" : `${state.hands[seatId].length}장`}</span></div>
  </article>;
}

function CardFace({ faceId, name, assetId, assets, odd }: { faceId: string; name: string; assetId: string | null; assets: Readonly<Record<string, string>>; odd: boolean }) {
  const source = assetId ? assets[assetId] : null;
  return <article className={`old-maid-card face ${odd ? "odd" : ""}`} data-face-id={faceId} aria-label={name}>
    {source ? <img src={source} alt="" decoding="async" /> : <div className="old-maid-void"><span>THE</span><b>MARGIN</b><i>?</i></div>}
    <strong>{name}</strong>
  </article>;
}

function reactionPortrait(seatId: Exclude<OldMaidSeatId, "player">, state: OldMaidState, assets: Readonly<Record<string, string>>): string | null {
  const base = { pale: "review-pale-standing", kano: "review-kano-standing", nemo: "review-bacikal-standing" } as const;
  const paired = { pale: "review-pale-smirk", kano: "review-kano-standing", nemo: "review-bacikal-smile" } as const;
  const odd = { pale: "review-pale-standing", kano: "review-kano-upset", nemo: "review-bacikal-disappointed" } as const;
  const isActor = state.lastDraw?.actorId === seatId;
  const assetId = state.status === "complete" && state.loserId === seatId ? odd[seatId]
    : isActor && state.lastDraw?.faceId === "margin-record" ? odd[seatId]
    : isActor && state.lastDraw?.madePair ? paired[seatId]
    : base[seatId];
  return assets[assetId] ?? null;
}

function dailySeed(): string { return new Date().toISOString().slice(0, 10); }

export default OldMaidScreen;
