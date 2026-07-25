import { IconArrowLeft, IconCards, IconCheck, IconRefresh, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createOldMaidState, reduceOldMaid, targetSeat } from "../engine.ts";
import type { OldMaidAction, OldMaidCartridge, OldMaidCpuSeatId, OldMaidFace, OldMaidSeatId, OldMaidState } from "../contracts.ts";
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
  const [detail, setDetail] = useState<OldMaidFace | null>(null);
  const stateRef = useRef(state);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const faces = useMemo(() => new Map(cartridge.faces.map((face) => [face.id, face])), [cartridge]);
  const cards = useMemo(() => new Map(cartridge.cards.map((card) => [card.id, card])), [cartridge]);
  const characters = useMemo(() => new Map(cartridge.characters.map((character) => [character.id, character])), [cartridge]);

  function dispatch(action: OldMaidAction) {
    const previous = stateRef.current;
    const next = reduceOldMaid(cartridge, previous, action);
    stateRef.current = next;
    setState(next);
    setSaveState("saving");
    const revision = ++saveRevisionRef.current;
    persistQueueRef.current = persistQueueRef.current.catch(() => undefined).then(() => onPersist(previous, next, action));
    void persistQueueRef.current.then(() => { if (saveRevisionRef.current === revision) setSaveState("saved"); }).catch(() => { if (saveRevisionRef.current === revision) setSaveState("error"); });
  }

  useEffect(() => {
    if (state.status !== "playing" || state.currentPlayerId === "player") return;
    const timer = window.setTimeout(() => dispatch({ type: "cpu_draw" }), 420);
    return () => window.clearTimeout(timer);
  }, [state.currentPlayerId, state.status, state.turn]);

  useEffect(() => {
    if (!detail) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDetail(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [detail]);

  const nameOf = (seatId: OldMaidSeatId) => seatId === "player" ? "플레이어" : characters.get(state.characters[seatId])?.name ?? "상대";
  const targetId = state.status === "playing" ? targetSeat(state) : null;
  const background = assets["pequod-ruins"];

  return <main className="old-maid-shell" style={background ? { "--old-maid-bg": `url(${JSON.stringify(background)})` } as React.CSSProperties : undefined}>
    <header className="old-maid-header">
      <button onClick={onExit} aria-label="오락실로 돌아가기"><IconArrowLeft /></button>
      <div><span>TEMEROSA · TABLE GAME</span><h1>테메로세 도둑잡기</h1></div>
      <div className="old-maid-meters"><span>{state.turn}턴</span><small aria-live="polite">{saveState === "saving" ? "저장 중…" : saveState === "error" ? "저장 재시도 필요" : "자동 저장됨"}</small></div>
    </header>

    <section className="old-maid-table" aria-label="테메로세 도둑잡기 테이블">
      <div className="old-maid-opponents">
        {(["cpu-1", "cpu-2", "cpu-3"] as const).map((seatId) => {
          const character = characters.get(state.characters[seatId]);
          const portraitId = character?.portraits[state.reactions[seatId]];
          return <SeatPanel key={seatId} seatId={seatId} state={state} name={nameOf(seatId)} portrait={portraitId ? assets[portraitId] ?? null : null} reaction={state.reactions[seatId]} active={state.currentPlayerId === seatId} />;
        })}
      </div>

      <div className="old-maid-center">
        {state.status === "ready" && <div className="old-maid-intro">
          <IconCards size={48} />
          <span className="eyebrow">테메로세 캐릭터 카드 게임</span>
          <h2>마지막 조커를 피하세요</h2>
          <p>같은 그림 두 장을 맞춰 버리세요. 오른쪽 상대에게서 한 장씩 뽑고, 마지막까지 조커를 가진 사람이 집니다.</p>
          <div className="old-maid-roster"><span>플레이어</span>{(["cpu-1", "cpu-2", "cpu-3"] as const).map((seatId) => <span key={seatId}>{nameOf(seatId)}</span>)}</div>
          <button className="old-maid-primary" onClick={() => dispatch({ type: "start" })}>19장 배분 시작</button>
        </div>}

        {state.status === "dealing" && <div className="old-maid-dealing-copy" aria-live="polite"><IconCards /><strong>카드를 나누는 중…</strong><span>배분이 끝나면 처음부터 맞은 짝을 정리합니다.</span></div>}

        {state.status === "playing" && <>
          <div className={`old-maid-turn-callout ${state.currentPlayerId === "player" ? "player" : "cpu"}`}>
            <strong>{nameOf(state.currentPlayerId)}의 차례</strong>
            <span>{state.currentPlayerId === "player" ? `${nameOf(targetId ?? "cpu-1")}의 뒷면 카드 한 장을 고르세요.` : `${nameOf(targetId ?? "player")}에게서 고르는 중…`}</span>
          </div>
          {state.currentPlayerId === "player" && targetId && <div className="old-maid-draw-row" aria-label={`${nameOf(targetId)}의 뒷면 카드`}>
            {state.hands[targetId].map((cardId, index) => <button key={cardId} className="old-maid-card back" aria-label={`${index + 1}번째 뒷면 카드`} onClick={() => dispatch({ type: "draw", index })}><span>THE<br />MARGIN</span></button>)}
          </div>}
          {state.lastDraw && <p className="old-maid-event" aria-live="polite">{state.lastDraw.madePair ? `${nameOf(state.lastDraw.actorId)}이 짝을 완성했습니다.` : state.lastDraw.faceId === cartridge.oddFaceId ? "조커가 다른 손으로 넘어갔습니다." : "뽑은 카드가 손패에 남았습니다."}</p>}
        </>}

        {state.status === "complete" && state.loserId && <div className="old-maid-result">
          <span className="old-maid-result-mark">!</span>
          <p className="eyebrow">GAME COMPLETE · {state.turn} TURNS</p>
          <h2>{nameOf(state.loserId)}에게 조커가 남았습니다</h2>
          <p>{state.loserId === "player" ? "이번 판은 플레이어가 졌습니다." : `플레이어는 ${state.safeOrder.indexOf("player") + 1}번째로 손을 비웠습니다.`}</p>
          <ol>{state.safeOrder.map((seatId, index) => <li key={seatId}><IconCheck size={16} /><b>{index + 1}</b><span>{nameOf(seatId)}</span></li>)}</ol>
          <div className="old-maid-result-actions">
            <button onClick={() => dispatch({ type: "restart", seed: state.seed })}><IconRefresh /> 같은 판 다시 하기</button>
            <button className="old-maid-primary" onClick={() => dispatch({ type: "restart", seed: `${dailySeed()}:${Date.now().toString(36)}` })}>새 상대와 섞기</button>
          </div>
        </div>}
      </div>

      <section className={`old-maid-player ${state.currentPlayerId === "player" && state.status === "playing" ? "active" : ""}`} data-deal-target="player">
        <div><strong>플레이어</strong><span>{state.status === "ready" ? "배분 전" : state.status === "dealing" ? "배분 중" : `${state.hands.player.length}장`}</span></div>
        <div className="old-maid-player-hand" aria-label="내 손패">
          {(state.status === "playing" || state.status === "complete") && state.hands.player.map((cardId) => { const card = cards.get(cardId); const face = card ? faces.get(card.faceId) : null; return face ? <button key={cardId} className="old-maid-card-button" onClick={() => setDetail(face)} aria-label={`${face.name} 크게 보기`}><CardFace face={face} assets={assets} odd={face.id === cartridge.oddFaceId} /></button> : null; })}
          {(state.status === "playing" || state.status === "complete") && state.hands.player.length === 0 && <span className="old-maid-safe"><IconCheck /> 손패를 모두 비웠습니다</span>}
          {(state.status === "ready" || state.status === "dealing") && <span className="old-maid-hand-placeholder">{state.status === "ready" ? "시작하면 이곳에 내 카드가 놓입니다." : "카드가 날아오고 있습니다…"}</span>}
        </div>
      </section>

      {state.status === "dealing" && <DealingAnimation state={state} onComplete={() => dispatch({ type: "finish_deal" })} />}
    </section>
    <footer className="old-maid-notice">표정은 힌트일 뿐입니다. 상대가 포커페이스로 속일 수도 있습니다.</footer>
    {detail && <CardDetail face={detail} assets={assets} odd={detail.id === cartridge.oddFaceId} onClose={() => setDetail(null)} />}
  </main>;
}

function SeatPanel({ seatId, state, name, portrait, reaction, active }: { seatId: OldMaidCpuSeatId; state: OldMaidState; name: string; portrait: string | null; reaction: string; active: boolean }) {
  const safe = state.safeOrder.includes(seatId);
  const hidden = state.status === "ready" || state.status === "dealing";
  return <article className={`old-maid-seat ${active ? "active" : ""} ${safe ? "safe" : ""}`} data-deal-target={seatId}>
    <div className="old-maid-seat-portrait">{portrait ? <img src={portrait} alt={`${name}의 현재 표정`} decoding="async" /> : <span>{name}</span>}<i className={`old-maid-reaction-dot ${reaction}`} aria-hidden="true" /></div>
    <div><strong>{name}</strong><span>{hidden ? (state.status === "ready" ? "배분 전" : "배분 중") : safe ? "손패 비움" : `${state.hands[seatId].length}장`}</span></div>
  </article>;
}

function CardFace({ face, assets, odd, large = false }: { face: OldMaidFace; assets: Readonly<Record<string, string>>; odd: boolean; large?: boolean }) {
  const source = face.assetId ? assets[face.assetId] : null;
  return <article className={`old-maid-card face ${odd ? "odd" : ""} ${large ? "large" : ""}`} data-face-id={face.id}>
    {source ? <img src={source} alt="" decoding="async" /> : <div className="old-maid-void"><span>THE</span><b>JOKER</b><i>?</i></div>}
    <strong>{face.name}</strong>
  </article>;
}

function CardDetail({ face, assets, odd, onClose }: { face: OldMaidFace; assets: Readonly<Record<string, string>>; odd: boolean; onClose(): void }) {
  return <div className="old-maid-modal" role="dialog" aria-modal="true" aria-labelledby="old-maid-card-name" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="old-maid-modal-panel"><button className="old-maid-modal-close" onClick={onClose} aria-label="카드 상세 닫기"><IconX /></button><CardFace face={face} assets={assets} odd={odd} large /><h2 id="old-maid-card-name">{face.name}</h2><p>{odd ? "짝이 없는 조커입니다. 마지막까지 들고 있으면 집니다." : "같은 그림의 카드 두 장을 모으면 자동으로 버립니다."}</p></div>
  </div>;
}

function DealingAnimation({ state, onComplete }: { state: OldMaidState; onComplete(): void }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let completionTimer = 0;
    const frame = window.requestAnimationFrame(() => {
      const layer = layerRef.current;
      if (!layer) return completeRef.current();
      const layerRect = layer.getBoundingClientRect();
      const cards = [...layer.querySelectorAll<HTMLElement>(".old-maid-deal-card")];
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      cards.forEach((element, index) => {
        const seatId = state.dealOrder[index]?.seatId;
        const target = seatId ? document.querySelector<HTMLElement>(`[data-deal-target="${seatId}"]`) : null;
        const rect = target?.getBoundingClientRect();
        const dx = rect ? rect.left + rect.width / 2 - (layerRect.left + layerRect.width / 2) : 0;
        const dy = rect ? rect.top + rect.height / 2 - (layerRect.top + layerRect.height / 2) : 0;
        element.animate([
          { transform: "translate(-50%, -50%) scale(.72) rotate(-7deg)", opacity: 0 },
          { transform: "translate(-50%, -50%) scale(1) rotate(0deg)", opacity: 1, offset: .18 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.45) rotate(${(index % 5 - 2) * 3}deg)`, opacity: 1 },
        ], { duration: reduced ? 90 : 430, delay: reduced ? index * 4 : index * 82, easing: "cubic-bezier(.2,.75,.2,1)", fill: "forwards" });
      });
      const totalDuration = reduced ? 190 : 430 + Math.max(0, cards.length - 1) * 82 + 220;
      completionTimer = window.setTimeout(() => completeRef.current(), totalDuration);
    });
    return () => { startedRef.current = false; window.cancelAnimationFrame(frame); window.clearTimeout(completionTimer); };
  }, [state.seed]);
  return <div className="old-maid-deal-layer" ref={layerRef} aria-hidden="true"><div className="old-maid-deck"><span>THE<br />MARGIN</span></div>{state.dealOrder.map((deal, index) => <div className="old-maid-deal-card" key={deal.cardId} style={{ zIndex: 100 + index }}><span>THE<br />MARGIN</span></div>)}</div>;
}

function dailySeed(): string { return new Date().toISOString().slice(0, 10); }
export default OldMaidScreen;
