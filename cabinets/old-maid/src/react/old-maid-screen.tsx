import { IconArrowLeft, IconCards, IconCheck, IconRefresh, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { availablePairs, createOldMaidState, discardingSeat, inspectCardReaction, reduceOldMaid, targetSeat } from "../engine.ts";
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
  const [opponentIds, setOpponentIds] = useState<string[]>(() => Object.values(state.characters));
  const [hoveredDrawCardId, setHoveredDrawCardId] = useState<string | null>(null);
  const [touchedDrawCardId, setTouchedDrawCardId] = useState<string | null>(null);
  const pointerKindRef = useRef("");
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
    const timer = window.setTimeout(() => dispatch({ type: "cpu_draw" }), 300);
    return () => window.clearTimeout(timer);
  }, [state.currentPlayerId, state.status, state.turn]);

  useEffect(() => {
    if (state.status === "ready") setOpponentIds(Object.values(state.characters));
  }, [state.sequence, state.status]);

  useEffect(() => {
    if (!detail) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDetail(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [detail]);

  useEffect(() => {
    setHoveredDrawCardId(null);
    setTouchedDrawCardId(null);
  }, [state.currentPlayerId, state.status, state.turn]);

  const nameOf = (seatId: OldMaidSeatId) => seatId === "player" ? "플레이어" : characters.get(state.characters[seatId])?.name ?? "상대";
  const targetId = state.status === "playing" ? targetSeat(state) : null;
  const discardOwner = discardingSeat(state);
  const discardPairs = state.status === "discarding" ? availablePairs(cartridge, state, discardOwner) : [];
  const discardableIds = new Set(discardOwner === "player" ? discardPairs.flat() : []);
  const handVisible = !["ready", "dealing"].includes(state.status);
  const spectating = state.safeOrder.includes("player") && state.hands.player.length === 0 && state.status !== "complete";
  const inspectedDrawCardId = hoveredDrawCardId ?? touchedDrawCardId;
  const inspectedReaction = state.status === "playing" && state.currentPlayerId === "player" && targetId !== null && targetId !== "player" && inspectedDrawCardId && state.hands[targetId].includes(inspectedDrawCardId)
    ? inspectCardReaction(cartridge, state, targetId, inspectedDrawCardId)
    : null;
  const background = assets["pequod-ruins"];

  function toggleOpponent(characterId: string) {
    setOpponentIds((current) => current.includes(characterId) ? current.filter((id) => id !== characterId) : current.length < 3 ? [...current, characterId] : [...current.slice(1), characterId]);
  }

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
          const reaction = seatId === targetId && inspectedReaction ? inspectedReaction : state.reactions[seatId];
          const portraitId = character?.portraits[reaction];
          return <SeatPanel key={seatId} seatId={seatId} state={state} name={nameOf(seatId)} portrait={portraitId ? assets[portraitId] ?? null : null} reaction={reaction} active={state.currentPlayerId === seatId} spectating={spectating} cards={cards} faces={faces} assets={assets} onDetail={setDetail} />;
        })}
      </div>

      <div className="old-maid-center">
        {!['ready', 'dealing'].includes(state.status) && <DiscardPile state={state} faces={faces} assets={assets} />}
        {state.status === "ready" && <div className="old-maid-intro">
          <IconCards size={48} />
          <span className="eyebrow">테메로세 캐릭터 카드 게임</span>
          <h2>마지막 조커를 피하세요</h2>
          <p>같은 그림 두 장을 맞춰 버리세요. 차례가 오면 지정된 상대에게서 한 장을 뽑고, 마지막까지 조커를 가진 사람이 집니다.</p>
          <strong className="old-maid-opponent-title">함께할 상대 3명을 고르세요</strong>
          <div className="old-maid-opponent-picker">{cartridge.characters.map((character) => { const selected = opponentIds.includes(character.id); const portrait = assets[character.portraits.neutral]; return <button type="button" className={selected ? "selected" : ""} aria-pressed={selected} key={character.id} onClick={() => toggleOpponent(character.id)}>{portrait && <img src={portrait} alt="" decoding="async" />}<span>{character.name}</span></button>; })}</div>
          <div className="old-maid-roster"><span>플레이어</span>{opponentIds.map((id) => <span key={id}>{characters.get(id)?.name}</span>)}</div>
          <button className="old-maid-primary" disabled={opponentIds.length !== 3} onClick={() => dispatch({ type: "start", characterIds: opponentIds as [string, string, string] })}>카드 배분 시작</button>
        </div>}

        {state.status === "dealing" && <div className="old-maid-dealing-copy" aria-live="polite"><IconCards /><strong>카드를 나누는 중…</strong><span>배분이 끝나면 처음부터 맞은 짝을 정리합니다.</span></div>}

        {state.status === "revealing" && state.pendingDraw && <DrawReveal key={`${state.turn}:${state.pendingDraw.cardId}`} event={state.pendingDraw} face={faces.get(state.pendingDraw.faceId) as OldMaidFace} assets={assets} actorName={nameOf(state.pendingDraw.actorId)} targetName={nameOf(state.pendingDraw.targetId)} playerControls={state.pendingDraw.actorId === "player"} revealFace={state.pendingDraw.actorId === "player" || state.pendingDraw.targetId === "player" || spectating} onCollect={() => dispatch({ type: "collect_draw" })} />}

        {state.status === "discarding" && discardOwner && discardPairs.length > 0 && <DiscardStage key={`${state.discardMode}:${discardOwner}:${discardPairs[0]?.join(":")}`} ownerId={discardOwner} ownerName={nameOf(discardOwner)} pairs={discardPairs} cards={cards} faces={faces} assets={assets} playerControls={discardOwner === "player"} onDiscard={(cardIds) => dispatch({ type: "discard_pair", cardIds })} />}

        {state.status === "playing" && <>
          <div className={`old-maid-turn-callout ${state.currentPlayerId === "player" ? "player" : "cpu"}`}>
            <strong>{nameOf(state.currentPlayerId)}의 차례</strong>
            <span>{state.currentPlayerId === "player" ? `${nameOf(targetId ?? "cpu-1")}의 뒷면 카드 한 장을 고르세요.` : `${nameOf(targetId ?? "player")}에게서 고르는 중…`}</span>
          </div>
          {state.currentPlayerId === "player" && targetId && <div className="old-maid-draw-row" aria-label={`${nameOf(targetId)}의 뒷면 카드`}>
            {state.hands[targetId].map((cardId, index) => <button
              key={cardId}
              className={`old-maid-card back ${inspectedDrawCardId === cardId ? "inspected" : ""}`}
              aria-label={`${index + 1}번째 뒷면 카드${touchedDrawCardId === cardId ? ", 한 번 더 누르면 뽑기" : ""}`}
              onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoveredDrawCardId(cardId); }}
              onPointerLeave={(event) => { if (event.pointerType === "mouse") setHoveredDrawCardId(null); }}
              onPointerDown={(event) => {
                pointerKindRef.current = event.pointerType;
                if (event.pointerType === "mouse") return;
                event.preventDefault();
                if (touchedDrawCardId === cardId) dispatch({ type: "draw", index });
                else setTouchedDrawCardId(cardId);
              }}
              onClick={() => {
                if (pointerKindRef.current && pointerKindRef.current !== "mouse") { pointerKindRef.current = ""; return; }
                pointerKindRef.current = "";
                dispatch({ type: "draw", index });
              }}
            ><span>THE<br />MARGIN</span></button>)}
            <span className="old-maid-inspection-hint">카드에 손을 올려 표정을 살피세요<span> · 모바일은 한 번 더 눌러 뽑기</span></span>
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

      <GameLog state={state} faces={faces} nameOf={nameOf} revealCpuDraws={spectating} />

      <section className={`old-maid-player ${state.currentPlayerId === "player" && state.status === "playing" ? "active" : ""}`} data-deal-target="player">
        <div><strong>플레이어</strong><span>{state.status === "ready" ? "배분 전" : state.status === "dealing" ? "배분 중" : `${state.hands.player.length}장`}</span></div>
        <div className="old-maid-player-hand" aria-label="내 손패">
          {handVisible && state.hands.player.map((cardId) => { const card = cards.get(cardId); const face = card ? faces.get(card.faceId) : null; return face ? <button key={cardId} className={`old-maid-card-button ${discardableIds.has(cardId) ? "discardable" : ""}`} onClick={() => setDetail(face)} aria-label={`${face.name} 크게 보기`}><CardFace face={face} assets={assets} odd={face.id === cartridge.oddFaceId} /></button> : null; })}
          {handVisible && state.hands.player.length === 0 && <span className="old-maid-safe"><IconCheck /> 손패를 모두 비웠습니다{spectating ? " · 남은 경기를 관전 중" : ""}</span>}
          {(state.status === "ready" || state.status === "dealing") && <span className="old-maid-hand-placeholder">{state.status === "ready" ? "시작하면 이곳에 내 카드가 놓입니다." : "카드가 날아오고 있습니다…"}</span>}
        </div>
      </section>

      {state.status === "dealing" && <DealingAnimation state={state} onComplete={() => dispatch({ type: "finish_deal" })} />}
    </section>
    <footer className="old-maid-notice">표정은 힌트일 뿐입니다. 상대가 포커페이스로 속일 수도 있습니다.</footer>
    {detail && <CardDetail face={detail} assets={assets} odd={detail.id === cartridge.oddFaceId} onClose={() => setDetail(null)} />}
  </main>;
}

function SeatPanel({ seatId, state, name, portrait, reaction, active, spectating, cards, faces, assets, onDetail }: { seatId: OldMaidCpuSeatId; state: OldMaidState; name: string; portrait: string | null; reaction: string; active: boolean; spectating: boolean; cards: Map<string, { faceId: string }>; faces: Map<string, OldMaidFace>; assets: Readonly<Record<string, string>>; onDetail(face: OldMaidFace): void }) {
  const safe = state.safeOrder.includes(seatId);
  const hidden = state.status === "ready" || state.status === "dealing";
  return <article className={`old-maid-seat seat-${seatId} ${active ? "active" : ""} ${safe ? "safe" : ""}`} data-deal-target={seatId}>
    <div className="old-maid-seat-portrait">{portrait ? <img src={portrait} alt={`${name}의 현재 표정`} decoding="async" /> : <span>{name}</span>}<i className={`old-maid-reaction-dot ${reaction}`} aria-hidden="true" /></div>
    <div><strong>{name}</strong><em className={`old-maid-reaction-text ${reaction}`}>{reactionLabel(reaction)}</em><span>{hidden ? (state.status === "ready" ? "배분 전" : "배분 중") : safe ? "손패 비움" : `${state.hands[seatId].length}장`}</span></div>
    {spectating && !safe && <div className="old-maid-spectator-hand" aria-label={`${name}의 공개된 손패`}>{state.hands[seatId].map((cardId) => { const face = faces.get(cards.get(cardId)?.faceId ?? ""); return face ? <button key={cardId} onClick={() => onDetail(face)}><CardFace face={face} assets={assets} odd={face.id === "joker"} /></button> : null; })}</div>}
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

function DrawReveal({ event, face, assets, actorName, targetName, playerControls, revealFace, onCollect }: { event: NonNullable<OldMaidState["pendingDraw"]>; face: OldMaidFace; assets: Readonly<Record<string, string>>; actorName: string; targetName: string; playerControls: boolean; revealFace: boolean; onCollect(): void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const collectRef = useRef(onCollect);
  const collectingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [collecting, setCollecting] = useState(false);
  collectRef.current = onCollect;

  useEffect(() => {
    let revealTimer = 0;
    let autoTimer = 0;
    const frame = window.requestAnimationFrame(() => {
      const element = cardRef.current;
      const target = document.querySelector<HTMLElement>(`[data-deal-target="${event.targetId}"]`);
      if (!element || !target) return setReady(true);
      const center = element.getBoundingClientRect();
      const source = target.getBoundingClientRect();
      const dx = source.left + source.width / 2 - (center.left + center.width / 2);
      const dy = source.top + source.height / 2 - (center.top + center.height / 2);
      element.animate([
        { transform: `translate(${dx}px,${dy}px) scale(.42) rotateY(180deg)`, opacity: .35 },
        { transform: "translate(0,0) scale(1) rotateY(180deg)", opacity: 1, offset: .58 },
        { transform: `translate(0,0) scale(1) rotateY(${revealFace ? 0 : 180}deg)`, opacity: 1 },
      ], { duration: 720, easing: "cubic-bezier(.2,.75,.2,1)", fill: "forwards" });
      revealTimer = window.setTimeout(() => setReady(true), 720);
      if (!playerControls) autoTimer = window.setTimeout(() => collect(), 1050);
    });
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(revealTimer); window.clearTimeout(autoTimer); };
  }, [event.cardId]);

  useEffect(() => {
    if (!collecting) return;
    const timer = window.setTimeout(() => collectRef.current(), 440);
    return () => window.clearTimeout(timer);
  }, [collecting]);

  function collect() {
    if (collectingRef.current) return;
    collectingRef.current = true;
    setCollecting(true);
    const element = cardRef.current;
    const target = document.querySelector<HTMLElement>(`[data-deal-target="${event.actorId}"]`);
    if (!element || !target) return;
    const center = element.getBoundingClientRect();
    const destination = target.getBoundingClientRect();
    const dx = destination.left + destination.width / 2 - (center.left + center.width / 2);
    const dy = destination.top + destination.height / 2 - (center.top + center.height / 2);
    try {
      element.animate([
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(.42)`, opacity: .35 },
      ], { duration: 430, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
    } catch { /* 이동 연출이 불가능해도 판정 단계는 위 타이머로 계속 진행한다. */ }
  }

  return <div className="old-maid-reveal-stage" aria-live="polite"><p><b>{actorName}</b>{subjectParticle(actorName)} {targetName}에게서 뽑았습니다</p><div className={`old-maid-flip-card ${revealFace ? "" : "hidden"}`} ref={cardRef}>{revealFace ? <CardFace face={face} assets={assets} odd={face.id === "joker"} /> : <CardBack />}</div><strong className="old-maid-revealed-name">{ready ? revealFace ? face.name : "상대끼리 뽑은 카드는 비공개" : "카드 확인 중…"}</strong>{playerControls && <button className="old-maid-primary" disabled={!ready || collecting} onClick={collect}>{collecting ? "내 손으로 가져오는 중…" : "이 카드를 내 손으로 가져오기"}</button>}{!playerControls && <span>{actorName}의 손으로 이동합니다…</span>}</div>;
}

function CardBack() { return <div className="old-maid-card back standalone"><span>THE<br />MARGIN</span></div>; }

function GameLog({ state, faces, nameOf, revealCpuDraws }: { state: OldMaidState; faces: Map<string, OldMaidFace>; nameOf(seatId: OldMaidSeatId): string; revealCpuDraws: boolean }) {
  const entries = [...state.history].reverse();
  return <aside className="old-maid-log" aria-label="경기 기록"><strong>경기 기록 · 최신순</strong><ol>{entries.map((entry, index) => {
    if (entry.type === "discard") return <li key={`${index}:discard`}><b>{nameOf(entry.ownerId)}</b> · {faces.get(entry.faceId)?.name ?? "한 쌍"} 버림</li>;
    const canReveal = revealCpuDraws || entry.actorId === "player" || entry.targetId === "player";
    return <li key={`${index}:draw`}><b>{nameOf(entry.actorId)}</b> → {nameOf(entry.targetId)} · {canReveal ? faces.get(entry.faceId)?.name ?? "카드" : "카드 1장"}</li>;
  })}{state.history.length === 0 && <li>카드를 나누면 기록이 쌓입니다.</li>}</ol></aside>;
}

function DiscardStage({ ownerId, ownerName, pairs, cards, faces, assets, playerControls, onDiscard }: { ownerId: OldMaidSeatId; ownerName: string; pairs: [string, string][]; cards: Map<string, { faceId: string }>; faces: Map<string, OldMaidFace>; assets: Readonly<Record<string, string>>; playerControls: boolean; onDiscard(cardIds: [string, string]): void }) {
  const first = pairs[0] as [string, string];
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const throwingRef = useRef(false);
  const [throwingKey, setThrowingKey] = useState<string | null>(null);

  function throwPair(pair: [string, string]) {
    if (throwingRef.current) return;
    throwingRef.current = true;
    const key = pair.join(":");
    setThrowingKey(key);
    window.requestAnimationFrame(() => {
      const element = optionRefs.current.get(key);
      const source = document.querySelector<HTMLElement>(`[data-deal-target="${ownerId}"]`);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduced ? 90 : 560;
      if (element && source) {
        const center = element.getBoundingClientRect();
        const origin = source.getBoundingClientRect();
        const dx = origin.left + origin.width / 2 - (center.left + center.width / 2);
        const dy = origin.top + origin.height / 2 - (center.top + center.height / 2);
        element.animate([
          { transform: `translate(${dx}px,${dy}px) rotate(${discardAngle(ownerId)}deg) scale(.55)`, opacity: .35 },
          { transform: `translate(0,0) rotate(${discardAngle(ownerId)}deg) scale(1)`, opacity: 1 },
        ], { duration, easing: "cubic-bezier(.18,.8,.2,1)", fill: "forwards" });
      }
      window.setTimeout(() => onDiscard(pair), duration + 40);
    });
  }

  useEffect(() => {
    if (playerControls) return;
    const timer = window.setTimeout(() => throwPair(first), 420);
    return () => window.clearTimeout(timer);
  }, [first[0], first[1], ownerId, playerControls]);
  return <div className="old-maid-discard-stage" aria-live="polite"><p><b>{ownerName}</b>{playerControls ? "의 손에서 버릴 수 있는 짝입니다" : "이 다음 짝을 버립니다"}</p><div className={`old-maid-discard-options ${throwingKey ? "throwing" : ""}`}>{pairs.map((pair) => { const key = pair.join(":"); const face = faces.get(cards.get(pair[0])?.faceId ?? ""); return face ? <button ref={(node) => { if (node) optionRefs.current.set(key, node); else optionRefs.current.delete(key); }} className={throwingKey === key ? "throwing" : ""} key={key} disabled={!playerControls || Boolean(throwingKey)} onClick={() => throwPair(pair)} aria-label={`${face.name} 두 장 버리기`}><span className="old-maid-discard-pair"><CardFace face={face} assets={assets} odd={false} /><CardFace face={face} assets={assets} odd={false} /></span><strong>{playerControls ? "이 짝 버리기" : `${face.name} 버리는 중…`}</strong></button> : null; })}</div></div>;
}

function DiscardPile({ state, faces, assets }: { state: OldMaidState; faces: Map<string, OldMaidFace>; assets: Readonly<Record<string, string>> }) {
  return <div className="old-maid-discard-pile" aria-label={`테이블에 버린 카드 ${state.discards.length}쌍`}>
    {state.discards.map((discard, index) => {
      const face = faces.get(discard.faceId);
      if (!face) return null;
      const column = index % 5 - 2;
      const row = Math.floor(index / 5);
      const style = {
        "--pile-angle": `${discardAngle(discard.ownerId)}deg`,
        "--pile-x": `${column * 18 + row * 4}px`,
        "--pile-y": `${row * 15 + Math.abs(column) * 2}px`,
        "--pile-z": index + 1,
      } as React.CSSProperties;
      return <div className="old-maid-pile-pair" style={style} key={`${discard.turn}:${discard.faceId}:${index}`}><CardFace face={face} assets={assets} odd={false} /><CardFace face={face} assets={assets} odd={false} /></div>;
    })}
  </div>;
}

function discardAngle(ownerId: OldMaidSeatId): number {
  return ownerId === "cpu-1" ? 180 : ownerId === "cpu-2" ? 90 : ownerId === "cpu-3" ? -90 : 0;
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
function reactionLabel(reaction: string): string { return reaction === "pleased" ? "만족한 듯" : reaction === "tense" ? "긴장한 듯" : "침착한 듯"; }
function subjectParticle(value: string): string { const code = value.charCodeAt(value.length - 1) - 0xac00; return code >= 0 && code <= 11171 && code % 28 !== 0 ? "이" : "가"; }
export default OldMaidScreen;
