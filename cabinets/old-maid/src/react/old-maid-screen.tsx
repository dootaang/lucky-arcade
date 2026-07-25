import { IconArrowLeft, IconCards, IconCheck, IconRefresh, IconX } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isOldMaidSpeechSilent, oldMaidSpeechSnapshot, selectOldMaidSpeech, validateOldMaidLines, type OldMaidSpeech } from "../dialogue.ts";
import { availablePairs, characterIdForSeat, createOldMaidState, discardingSeat, inspectCardReaction, reduceOldMaid, targetSeat } from "../engine.ts";
import { publicRead } from "../read.ts";
import { selectAmbientReaction } from "../tells.ts";
import type { OldMaidAction, OldMaidCartridge, OldMaidFace, OldMaidMode, OldMaidPsychologySummary, OldMaidSeatId, OldMaidState } from "../contracts.ts";
import { OLD_MAID_VERSION } from "../contracts.ts";
import { discardStageKey } from "./discard-stage-key.ts";
import { oldMaidOfferTiming, type OldMaidSpectatorSpeed } from "./offer-timing.ts";
import { pileOffset } from "./pile-layout.ts";
import "./old-maid.css";

export interface OldMaidScreenProps {
  cartridge: OldMaidCartridge;
  assets: Readonly<Record<string, string>>;
  detailAssets?: Readonly<Record<string, string>>;
  initialState: OldMaidState | null;
  matchSummary?: OldMaidMatchSummary | null;
  economy?: OldMaidEconomy;
  onPersist(previous: OldMaidState, next: OldMaidState, action: OldMaidAction, psychology: OldMaidPsychologySummary): Promise<void>;
  onExit(): void;
}

export interface OldMaidEconomy {
  balance: number;
  award?: { amount: number; rank: number } | null;
  unlockedFaceIds: readonly string[];
  onUnlock(): Promise<void>;
  prediction?: OldMaidPredictionEconomy;
}

export interface OldMaidPredictionEconomy {
  stakes: readonly number[];
  active: { predictedCharacterId: string; stake: number; status: "reserved" | "won" | "lost" | "refunded"; settlementCredit: number } | null;
  onStart(input: { seed: string; characterIds: readonly string[]; predictedCharacterId: string; stake: number }): Promise<"reserved" | "replay">;
}

export interface OldMaidMatchSummary {
  played: number;
  firstPlaces: number;
  jokerHolds: number;
  currentStreak: number;
  opponents: Array<{ participantId: string; displayName: string; played: number; beaten: number }>;
}

export function OldMaidScreen({ cartridge, assets, detailAssets = assets, initialState, matchSummary, economy, onPersist, onExit }: OldMaidScreenProps) {
  useMemo(() => validateOldMaidLines(cartridge), [cartridge]);
  const [state, setState] = useState(() => initialState ?? createOldMaidState(cartridge, dailySeed()));
  const [detail, setDetail] = useState<OldMaidFace | null>(null);
  const [opponentIds, setOpponentIds] = useState<string[]>(() => Object.values(state.characters));
  const [lobbyMode, setLobbyMode] = useState<OldMaidMode>(() => state.mode);
  const [hoveredDrawCardId, setHoveredDrawCardId] = useState<string | null>(null);
  const [touchedDrawCardId, setTouchedDrawCardId] = useState<string | null>(null);
  const [inspectedDrawCardIds, setInspectedDrawCardIds] = useState<string[]>([]);
  const [reorderFrom, setReorderFrom] = useState<number | null>(null);
  const [speech, setSpeech] = useState<DisplayedSpeech | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionError, setCollectionError] = useState("");
  const [predictedCharacterId, setPredictedCharacterId] = useState("");
  const [predictionStake, setPredictionStake] = useState(() => economy?.prediction?.stakes[0] ?? 10);
  const [predictionError, setPredictionError] = useState("");
  const [predictionStarting, setPredictionStarting] = useState(false);
  const [spectatorSpeed, setSpectatorSpeed] = useState<OldMaidSpectatorSpeed>("normal");
  const pointerKindRef = useRef("");
  const recentLineIdsRef = useRef<string[]>([]);
  const speechTimersRef = useRef<number[]>([]);
  const speechRevisionRef = useRef(0);
  const longPressRef = useRef<number | null>(null);
  const playerHandRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const psychologyRef = useRef<OldMaidPsychologySummary>(loadPsychologySummary(state.sessionId, state.seed));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const faces = useMemo(() => new Map(cartridge.faces.map((face) => [face.id, face])), [cartridge]);
  const cards = useMemo(() => new Map(cartridge.cards.map((card) => [card.id, card])), [cartridge]);
  const characters = useMemo(() => new Map(cartridge.characters.map((character) => [character.id, character])), [cartridge]);
  const selectableCharacters = useMemo(() => {
    const selectable = new Set(cartridge.selectableCharacterIds ?? cartridge.characters.map((character) => character.id));
    return cartridge.characters.filter((character) => selectable.has(character.id));
  }, [cartridge]);

  function dispatch(action: OldMaidAction) {
    const previous = stateRef.current;
    const next = reduceOldMaid(cartridge, previous, action);
    if (action.type === "start" || action.type === "restart") psychologyRef.current = emptyPsychologySummary();
    else recordPsychologyAction(cartridge, previous, next, action, psychologyRef.current);
    savePsychologySummary(next.sessionId, next.seed, psychologyRef.current);
    const previousSpeech = oldMaidSpeechSnapshot(previous);
    const nextSpeech = oldMaidSpeechSnapshot(next);
    const selectedSpeech = selectOldMaidSpeech(cartridge, previousSpeech, nextSpeech, recentLineIdsRef.current);
    if (isOldMaidSpeechSilent(nextSpeech)) clearSpeech();
    else if (selectedSpeech) showSpeech(selectedSpeech);
    stateRef.current = next;
    setState(next);
    setSaveState("saving");
    const revision = ++saveRevisionRef.current;
    const psychology = { ...psychologyRef.current };
    persistQueueRef.current = persistQueueRef.current.catch(() => undefined).then(() => onPersist(previous, next, action, psychology));
    void persistQueueRef.current.then(() => { if (saveRevisionRef.current === revision) setSaveState("saved"); }).catch(() => { if (saveRevisionRef.current === revision) setSaveState("error"); });
  }

  function showSpeech(selected: OldMaidSpeech) {
    cancelSpeechTimers();
    recentLineIdsRef.current = [...recentLineIdsRef.current, selected.line.id].slice(-6);
    const revision = ++speechRevisionRef.current;
    const showBeat = (beat: number) => setSpeech({ ...selected, beat, revision });
    showBeat(0);
    if (selected.line.text.length === 1) {
      speechTimersRef.current.push(window.setTimeout(() => setSpeech(null), 2_400));
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gap = reduced ? 250 : 700;
    let elapsed = 0;
    for (let beat = 0; beat < selected.line.text.length; beat += 1) {
      elapsed += 2_000;
      if (beat === selected.line.text.length - 1) break;
      speechTimersRef.current.push(window.setTimeout(() => setSpeech(null), elapsed));
      elapsed += gap;
      speechTimersRef.current.push(window.setTimeout(() => showBeat(beat + 1), elapsed));
    }
    speechTimersRef.current.push(window.setTimeout(() => setSpeech(null), elapsed));
  }

  function clearSpeech() {
    cancelSpeechTimers();
    speechRevisionRef.current += 1;
    setSpeech(null);
  }

  function cancelSpeechTimers() {
    for (const timer of speechTimersRef.current) window.clearTimeout(timer);
    speechTimersRef.current = [];
  }

  useEffect(() => {
    const humanActor = state.currentPlayerId === "player" && state.mode === "play";
    if (state.version !== OLD_MAID_VERSION) {
      if (state.status !== "playing" || humanActor) return;
      const timer = window.setTimeout(() => dispatch({ type: "cpu_draw" }), 300);
      return () => window.clearTimeout(timer);
    }
    const offer = state.offer;
    if (!offer) return;
    const humanTarget = offer.targetId === "player" && state.mode === "play";
    const npcToNpc = !humanActor && !humanTarget;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timing = oldMaidOfferTiming({ moved: Boolean(offer.lastMove), npcToNpc, spectatorSpeed, reducedMotion });
    if (state.status === "offering" && offer.phase === "arranging" && !humanTarget) {
      const timer = window.setTimeout(() => dispatch({ type: "prepare_cpu_offer" }), timing.prepareDelay);
      return () => window.clearTimeout(timer);
    }
    if (state.status === "offering" && offer.phase === "settling") {
      const timer = window.setTimeout(() => dispatch({ type: "finish_offer" }), timing.settleDelay);
      return () => window.clearTimeout(timer);
    }
    if (state.status === "playing" && offer.phase === "ready" && !humanActor) {
      const timer = window.setTimeout(() => dispatch({ type: "cpu_draw" }), timing.drawDelay);
      return () => window.clearTimeout(timer);
    }
  }, [state.sequence, state.status, state.turn, spectatorSpeed]);

  useEffect(() => () => cancelSpeechTimers(), []);

  useEffect(() => {
    if (state.status === "ready") {
      setLobbyMode(state.mode);
      setOpponentIds(state.spectatorCharacterId ? [...Object.values(state.characters), state.spectatorCharacterId] : Object.values(state.characters));
    }
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
    setInspectedDrawCardIds([]);
    setReorderFrom(null);
  }, [state.currentPlayerId, state.status, state.turn]);

  const nameOf = (seatId: OldMaidSeatId) => seatId === "player" && state.mode === "play" ? "플레이어" : characters.get(characterIdForSeat(state, seatId) ?? "")?.name ?? "상대";
  const targetId = state.status === "playing" ? targetSeat(state) : null;
  const discardOwner = discardingSeat(state);
  const discardPairs = state.status === "discarding" ? availablePairs(cartridge, state, discardOwner) : [];
  const discardableIds = new Set(discardOwner === "player" ? discardPairs.flat() : []);
  const handVisible = !["ready", "dealing"].includes(state.status);
  const humanFinishedWatching = state.mode === "play" && state.safeOrder.includes("player") && state.hands.player.length === 0 && state.status !== "complete";
  const inspectedDrawCardId = hoveredDrawCardId ?? touchedDrawCardId;
  const activeOfferTiming = oldMaidOfferTiming({
    moved: Boolean(state.offer?.lastMove),
    npcToNpc: Boolean(state.offer && !(state.mode === "play" && (state.offer.actorId === "player" || state.offer.targetId === "player"))),
    spectatorSpeed,
    reducedMotion: typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  useHandFlip(playerHandRef, state.hands.player.join("|"), activeOfferTiming.moveDuration);
  const inspectedReaction = state.status === "playing" && state.currentPlayerId === "player" && targetId !== null && targetId !== "player" && inspectedDrawCardId && inspectedDrawCardIds.includes(inspectedDrawCardId) && state.hands[targetId].includes(inspectedDrawCardId)
    ? inspectCardReaction(cartridge, state, targetId, inspectedDrawCardId)
    : null;
  const background = assets["pequod-ruins"];

  function toggleOpponent(characterId: string) {
    const limit = lobbyMode === "spectate" ? 4 : 3;
    setOpponentIds((current) => current.includes(characterId) ? current.filter((id) => id !== characterId) : current.length < limit ? [...current, characterId] : [...current.slice(1), characterId]);
  }

  function chooseMode(mode: OldMaidMode) {
    setLobbyMode(mode);
    setOpponentIds((current) => {
      const limit = mode === "spectate" ? 4 : 3;
      const next = current.slice(0, limit);
      for (const character of selectableCharacters) if (next.length < limit && !next.includes(character.id)) next.push(character.id);
      return next;
    });
  }

  async function startMatch() {
    setPredictionError("");
    if (lobbyMode === "spectate" && economy?.prediction) {
      const predictionTarget = opponentIds.includes(predictedCharacterId) ? predictedCharacterId : opponentIds[0];
      if (!predictionTarget) return;
      setPredictionStarting(true);
      try {
        await economy.prediction.onStart({ seed: state.seed, characterIds: opponentIds, predictedCharacterId: predictionTarget, stake: predictionStake });
      } catch (error) {
        setPredictionError(error instanceof Error && error.message === "insufficient_points" ? "포인트가 부족합니다. 직접 플레이 두 판이면 첫 10 P를 마련할 수 있습니다." : error instanceof Error && error.message === "outcome_already_wagered" ? "이 대국에는 이미 베팅했습니다. 같은 결과는 무료로 다시 볼 수 있습니다." : "베팅을 예약하지 못했습니다.");
        return;
      } finally { setPredictionStarting(false); }
    }
    dispatch({ type: "start", mode: lobbyMode, characterIds: opponentIds });
  }

  function inspectDrawCard(cardId: string) {
    setInspectedDrawCardIds((current) => {
      if (current.includes(cardId) || current.length >= 3) return current;
      psychologyRef.current.inspectedCards += 1;
      savePsychologySummary(stateRef.current.sessionId, stateRef.current.seed, psychologyRef.current);
      return [...current, cardId];
    });
  }

  function reorderPlayerHand(from: number, to: number) {
    dispatch({ type: stateRef.current.version === OLD_MAID_VERSION ? "reorder_offer" : "reorder_hand", from, to });
  }

  return <main className="old-maid-shell" style={background ? { "--old-maid-bg": `url(${JSON.stringify(background)})` } as React.CSSProperties : undefined}>
    <header className="old-maid-header">
      <button onClick={onExit} aria-label="오락실로 돌아가기"><IconArrowLeft /></button>
      <div><span>BOT CARD · TABLE GAME</span><h1>{cartridge.title}</h1></div>
      <div className="old-maid-meters">{economy && <button className="old-maid-wallet" onClick={() => setCollectionOpen(true)}>{economy.balance.toLocaleString("ko-KR")} P</button>}<span>{state.turn}턴</span><small aria-live="polite">{saveState === "saving" ? "저장 중…" : saveState === "error" ? "저장 재시도 필요" : "자동 저장됨"}</small></div>
    </header>

    <section className="old-maid-table" aria-label={`${cartridge.title} 테이블`}>
      <div className="old-maid-opponents">
        {(["cpu-1", "cpu-2", "cpu-3"] as const).map((seatId) => {
          const character = characters.get(state.characters[seatId]);
          const baseReaction = state.status === "revealing" || state.status === "discarding" ? state.reactions[seatId] : selectAmbientReaction(cartridge, state, seatId);
          const reaction = seatId === targetId && inspectedReaction ? inspectedReaction : baseReaction;
          const portraitId = state.status === "complete" && state.loserId === seatId ? character?.despairPortrait : character?.portraits[reaction];
          return <SeatPanel key={seatId} seatId={seatId} state={state} name={nameOf(seatId)} portrait={portraitId ? assets[portraitId] ?? null : null} reaction={reaction} active={state.currentPlayerId === seatId} reordered={publicRead(state, seatId).reorderedSinceTargetDraw} showHand={state.mode === "spectate" || humanFinishedWatching} cards={cards} faces={faces} assets={assets} speech={speech?.seatId === seatId ? speech : null} onDetail={setDetail} />;
        })}
      </div>

      <div className="old-maid-center">
        {!['ready', 'dealing', 'complete'].includes(state.status) && <DiscardPile state={state} faces={faces} assets={assets} />}
        {state.status === "ready" && <div className="old-maid-intro">
          <IconCards size={48} />
          <span className="eyebrow">캐릭터 카드 게임</span>
          <h2>마지막 조커를 피하세요</h2>
          <p>같은 그림 두 장을 맞춰 버리세요. 차례가 오면 지정된 상대에게서 한 장을 뽑고, 마지막까지 조커를 가진 사람이 집니다.</p>
          <div className="old-maid-mode-picker" aria-label="대국 방식"><button type="button" className={lobbyMode === "play" ? "selected" : ""} onClick={() => chooseMode("play")}>직접 플레이</button><button type="button" className={lobbyMode === "spectate" ? "selected" : ""} onClick={() => chooseMode("spectate")}>NPC 4명 관전</button></div>
          <strong className="old-maid-opponent-title">{lobbyMode === "spectate" ? "관전할 NPC 4명을 고르세요" : "함께할 상대 3명을 고르세요"}</strong>
          <div className="old-maid-opponent-picker">{selectableCharacters.map((character) => { const selected = opponentIds.includes(character.id); const portrait = assets[character.portraits.neutral]; return <button type="button" className={selected ? "selected" : ""} aria-pressed={selected} key={character.id} onClick={() => toggleOpponent(character.id)}>{portrait && <img src={portrait} alt="" decoding="async" />}<span>{character.name}</span></button>; })}</div>
          <div className="old-maid-roster">{lobbyMode === "play" && <span>플레이어</span>}{opponentIds.map((id) => <span key={id}>{characters.get(id)?.name}</span>)}</div>
          {lobbyMode === "spectate" && economy?.prediction && <section className="old-maid-prediction" aria-label="최종 조커 보유자 예측">
            <strong>마지막 조커를 가질 인물에게 베팅</strong>
            <div>{opponentIds.map((id) => <button type="button" className={(predictedCharacterId || opponentIds[0]) === id ? "selected" : ""} key={id} onClick={() => setPredictedCharacterId(id)}>{characters.get(id)?.name}</button>)}</div>
            <div>{economy.prediction.stakes.map((stake) => <button type="button" className={predictionStake === stake ? "selected" : ""} key={stake} onClick={() => setPredictionStake(stake)} disabled={economy.balance < stake}>{stake} P</button>)}</div>
            <small>적중하면 판돈을 돌려받고 순이익 {predictionStake * 3} P · 실패하면 판돈을 잃습니다.</small>
            {predictionError && <p>{predictionError}</p>}
          </section>}
          <button className="old-maid-primary" disabled={predictionStarting || opponentIds.length !== (lobbyMode === "spectate" ? 4 : 3)} onClick={() => void startMatch()}>{predictionStarting ? "판돈 예약 중…" : lobbyMode === "spectate" ? "예측하고 NPC 대국 관전" : "카드 배분 시작"}</button>
        </div>}

        {state.status === "dealing" && <div className="old-maid-dealing-copy" aria-live="polite"><IconCards /><strong>카드를 나누는 중…</strong><span>배분이 끝나면 처음부터 맞은 짝을 정리합니다.</span></div>}

        {state.status === "revealing" && state.pendingDraw && <DrawReveal key={`${state.turn}:${state.pendingDraw.cardId}`} event={state.pendingDraw} face={faces.get(state.pendingDraw.faceId) as OldMaidFace} assets={assets} actorName={nameOf(state.pendingDraw.actorId)} targetName={nameOf(state.pendingDraw.targetId)} revealFace={state.mode === "spectate" || state.pendingDraw.actorId === "player" || state.pendingDraw.targetId === "player" || humanFinishedWatching} onCollect={() => dispatch({ type: "collect_draw" })} />}

        {state.status === "discarding" && discardOwner && discardPairs.length > 0 && <DiscardStage key={discardStageKey(state.discardMode, discardOwner, discardPairs)} ownerId={discardOwner} ownerName={nameOf(discardOwner)} pairs={discardPairs} cards={cards} faces={faces} assets={assets} playerControls={discardOwner === "player" && state.mode === "play"} onDiscard={(cardIds) => dispatch({ type: "discard_pair", cardIds })} />}

        {state.offer && (state.status === "offering" || state.status === "playing") && <OfferStage
          state={state}
          cards={cards}
          faces={faces}
          assets={assets}
          actorName={nameOf(state.offer.actorId)}
          targetName={nameOf(state.offer.targetId)}
          revealFaces={state.mode === "spectate" || humanFinishedWatching}
          moveDuration={activeOfferTiming.moveDuration}
          inspectedCardId={inspectedDrawCardId}
          touchedCardId={touchedDrawCardId}
          onHover={(cardId) => { if (cardId) inspectDrawCard(cardId); setHoveredDrawCardId(cardId); }}
          onTouch={(cardId, index) => {
            if (touchedDrawCardId === cardId) dispatch({ type: "draw", index });
            else { inspectDrawCard(cardId); setTouchedDrawCardId(cardId); }
          }}
          onDraw={(index) => dispatch({ type: "draw", index })}
          onFinish={() => dispatch({ type: "finish_offer" })}
        />}

        {state.mode === "spectate" && state.offer && <div className="old-maid-speed-controls" aria-label="관전 속도"><button type="button" className={spectatorSpeed === "normal" ? "selected" : ""} onClick={() => setSpectatorSpeed("normal")}>보통</button><button type="button" className={spectatorSpeed === "fast" ? "selected" : ""} onClick={() => setSpectatorSpeed("fast")}>빠르게</button></div>}

        {state.status === "playing" && <>
          <div className={`old-maid-turn-callout ${state.currentPlayerId === "player" ? "player" : "cpu"}`}>
            <strong>{nameOf(state.currentPlayerId)}의 차례</strong>
            <span>{state.currentPlayerId === "player" && state.mode === "play" ? `${nameOf(targetId ?? "cpu-1")}의 뒷면 카드 한 장을 고르세요.` : `${nameOf(targetId ?? "player")}에게서 고르는 중…`}</span>
          </div>
          {!state.offer && state.currentPlayerId === "player" && state.mode === "play" && targetId && <div className="old-maid-draw-row" aria-label={`${nameOf(targetId)}의 뒷면 카드`}>
            {state.hands[targetId].map((cardId, index) => <button
              key={cardId}
              className={`old-maid-card back ${inspectedDrawCardId === cardId ? "inspected" : ""}`}
              aria-label={`${index + 1}번째 뒷면 카드${touchedDrawCardId === cardId ? ", 한 번 더 누르면 뽑기" : ""}`}
              onPointerEnter={(event) => { if (event.pointerType === "mouse") { inspectDrawCard(cardId); setHoveredDrawCardId(cardId); } }}
              onPointerLeave={(event) => { if (event.pointerType === "mouse") setHoveredDrawCardId(null); }}
              onPointerDown={(event) => {
                pointerKindRef.current = event.pointerType;
                if (event.pointerType === "mouse") return;
                event.preventDefault();
                if (touchedDrawCardId === cardId) dispatch({ type: "draw", index });
                else { inspectDrawCard(cardId); setTouchedDrawCardId(cardId); }
              }}
              onClick={() => {
                if (pointerKindRef.current && pointerKindRef.current !== "mouse") { pointerKindRef.current = ""; return; }
                pointerKindRef.current = "";
                dispatch({ type: "draw", index });
              }}
            ><span>THE<br />MARGIN</span></button>)}
            <span className="old-maid-inspection-hint">표정 살피기 {Math.max(0, 3 - inspectedDrawCardIds.length)}회 남음<span> · 모바일은 한 번 더 눌러 뽑기</span></span>
          </div>}
          {state.lastDraw && <p className="old-maid-event" aria-live="polite">{state.lastDraw.madePair ? `${nameOf(state.lastDraw.actorId)}이 짝을 완성했습니다.` : state.lastDraw.faceId === cartridge.oddFaceId ? "조커가 다른 손으로 넘어갔습니다." : "뽑은 카드가 손패에 남았습니다."}</p>}
        </>}

        {state.status === "complete" && state.loserId && <div className="old-maid-result">
          <span className="old-maid-result-mark">!</span>
          <p className="eyebrow">GAME COMPLETE · {state.turn} TURNS</p>
          <h2>{nameOf(state.loserId)}에게 조커가 남았습니다</h2>
          {characterIdForSeat(state, state.loserId) && <img className="old-maid-loser-portrait" src={assets[characters.get(characterIdForSeat(state, state.loserId) ?? "")?.despairPortrait ?? ""]} alt={`${nameOf(state.loserId)}의 절망한 표정`} />}
          <p>{state.mode === "spectate" ? `${nameOf(state.loserId)}이 마지막 조커를 피하지 못했습니다.` : state.loserId === "player" ? "이번 판은 플레이어가 졌습니다." : `플레이어는 ${state.safeOrder.indexOf("player") + 1}번째로 손을 비웠습니다.`}</p>
          <ol>{state.safeOrder.map((seatId, index) => <li key={seatId}><IconCheck size={16} /><b>{index + 1}</b><span>{nameOf(seatId)}</span></li>)}</ol>
          {matchSummary && matchSummary.played > 0 && <section className="old-maid-history" aria-label="누적 전적">
            <strong>{matchSummary.played}판 · 1등 {matchSummary.firstPlaces}회 · 조커 {matchSummary.jokerHolds}회 · {streakLabel(matchSummary.currentStreak)}</strong>
            {matchSummary.opponents.slice(0, 3).map((opponent) => <span key={opponent.participantId}>{opponent.displayName} {opponent.played}판 {opponent.beaten}승</span>)}
          </section>}
          {economy?.award && <p className="old-maid-award">{economy.award.amount >= 0 ? "+" : ""}{economy.award.amount} · {economy.award.rank}등</p>}
          {state.mode === "spectate" && economy?.prediction?.active && <p className={`old-maid-prediction-result ${economy.prediction.active.status}`}>
            {economy.prediction.active.status === "won" ? `예측 적중 · +${economy.prediction.active.settlementCredit - economy.prediction.active.stake} P` : economy.prediction.active.status === "lost" ? `예측 실패 · -${economy.prediction.active.stake} P` : economy.prediction.active.status === "refunded" ? "대국 무효 · 판돈 반환" : "정산 중…"}
          </p>}
          <div className="old-maid-result-actions">
            <button onClick={() => dispatch({
              type: "restart",
              seed: state.seed,
              mode: state.mode,
              characterIds: state.mode === "spectate" && state.spectatorCharacterId
                ? [...Object.values(state.characters), state.spectatorCharacterId]
                : Object.values(state.characters),
            })}><IconRefresh /> 같은 판 다시 하기</button>
            <button className="old-maid-primary" onClick={() => dispatch({ type: "restart", seed: `${dailySeed()}:${Date.now().toString(36)}` })}>새 상대와 섞기</button>
          </div>
        </div>}
      </div>

      <GameLog state={state} faces={faces} nameOf={nameOf} revealCpuDraws={state.mode === "spectate" || humanFinishedWatching} />

      {state.mode === "spectate" && state.status !== "ready" ? <SpectatorSeat state={state} name={nameOf("player")} character={characters.get(state.spectatorCharacterId ?? "")} reaction={state.status === "revealing" || state.status === "discarding" ? state.reactions.player : selectAmbientReaction(cartridge, state, "player")} portrait={assets[(state.status === "complete" && state.loserId === "player" ? characters.get(state.spectatorCharacterId ?? "")?.despairPortrait : characters.get(state.spectatorCharacterId ?? "")?.portraits[state.status === "revealing" || state.status === "discarding" ? state.reactions.player : selectAmbientReaction(cartridge, state, "player")]) ?? ""] ?? null} cards={cards} faces={faces} assets={assets} onDetail={setDetail} /> : <section className={`old-maid-player ${state.currentPlayerId === "player" && state.status === "playing" ? "active" : ""}`} data-deal-target="player">
        <div><strong>플레이어</strong><span>{state.status === "ready" ? "배분 전" : state.status === "dealing" ? "배분 중" : `${state.hands.player.length}장`}</span></div>
        <div className="old-maid-player-hand" aria-label="내 손패" ref={playerHandRef}>
          {handVisible && state.hands.player.map((cardId, index) => { const card = cards.get(cardId); const face = card ? faces.get(card.faceId) : null; const currentOfferReorder = state.status === "offering" && state.offer?.phase === "arranging" && state.offer.targetId === "player" && state.mode === "play" && state.offer.reorderCount < 3; const legacyReorder = state.version !== OLD_MAID_VERSION && state.status === "playing" && state.currentPlayerId === "player" && state.mode === "play" && (state.lastReorder?.turn !== state.turn || state.lastReorder.count < 3); const canReorder = currentOfferReorder || legacyReorder; return face ? <button key={cardId} data-card-id={cardId} className={`old-maid-card-button ${discardableIds.has(cardId) ? "discardable" : ""} ${reorderFrom === index ? "reordering" : ""}`} draggable={canReorder} onDragStart={(event) => event.dataTransfer.setData("text/old-maid-index", String(index))} onDragOver={(event) => { if (canReorder) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/old-maid-index")); if (canReorder && Number.isInteger(from) && from !== index) reorderPlayerHand(from, index); }} onPointerDown={(event) => { if (!canReorder || event.pointerType === "mouse") return; longPressRef.current = window.setTimeout(() => setReorderFrom(index), 450); }} onPointerUp={() => { if (longPressRef.current !== null) window.clearTimeout(longPressRef.current); longPressRef.current = null; }} onKeyDown={(event) => { if (!canReorder || event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const to = Math.max(0, Math.min(state.hands.player.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1))); if (to !== index) reorderPlayerHand(index, to); }} onClick={() => { if (reorderFrom !== null && canReorder) { if (reorderFrom !== index) reorderPlayerHand(reorderFrom, index); setReorderFrom(null); } else setDetail(face); }} aria-label={`${face.name} 크게 보기${canReorder ? ", 좌우 화살표로 재배열" : ""}`}><CardFace face={face} assets={assets} odd={face.id === cartridge.oddFaceId} /></button> : null; })}
          {handVisible && state.status === "offering" && state.offer?.targetId === "player" && state.mode === "play" && <small className="old-maid-reorder-budget">손패 재배열 {Math.max(0, 3 - state.offer.reorderCount)}회 남음</small>}
          {handVisible && state.version !== OLD_MAID_VERSION && state.status === "playing" && state.currentPlayerId === "player" && state.mode === "play" && <small className="old-maid-reorder-budget">손패 재배열 {Math.max(0, 3 - (state.lastReorder?.turn === state.turn ? state.lastReorder.count : 0))}회 남음</small>}
          {handVisible && state.hands.player.length === 0 && <span className="old-maid-safe"><IconCheck /> 손패를 모두 비웠습니다{humanFinishedWatching ? " · 남은 경기를 관전 중" : ""}</span>}
          {(state.status === "ready" || state.status === "dealing") && <span className="old-maid-hand-placeholder">{state.status === "ready" ? "시작하면 이곳에 내 카드가 놓입니다." : "카드가 날아오고 있습니다…"}</span>}
        </div>
      </section>}

      {state.status === "dealing" && <DealingAnimation state={state} onComplete={() => dispatch({ type: "finish_deal" })} />}
    </section>
    <footer className="old-maid-notice">표정은 힌트일 뿐입니다. 상대가 포커페이스로 속일 수도 있습니다.</footer>
    {detail && <CardDetail face={detail} assets={detailAssets} odd={detail.id === cartridge.oddFaceId} onClose={() => setDetail(null)} />}
    {collectionOpen && economy && <div className="old-maid-modal" role="dialog" aria-modal="true" aria-label="얼굴 도감"><div className="old-maid-collection-panel">
      <button className="old-maid-modal-close" onClick={() => setCollectionOpen(false)} aria-label="도감 닫기"><IconX /></button>
      <h2>얼굴 도감</h2><p>발견 {economy.unlockedFaceIds.length} / {cartridge.faces.length}</p>
      <div className="old-maid-collection-grid">{cartridge.faces.map((face) => {
        const unlocked = economy.unlockedFaceIds.includes(face.id);
        return <div key={face.id} className={unlocked ? "unlocked" : "locked"}>{unlocked && face.assetId && assets[face.assetId] ? <img src={assets[face.assetId]} alt="" /> : <span>?</span>}<b>{unlocked ? face.name : "미발견"}</b></div>;
      })}</div>
      {economy.unlockedFaceIds.length < cartridge.faces.length && <button className="old-maid-primary" disabled={economy.balance < 12} onClick={() => { setCollectionError(""); void economy.onUnlock().catch((error: unknown) => setCollectionError(error instanceof Error && error.message === "insufficient_points" ? "포인트가 부족합니다." : "도감을 열지 못했습니다.")); }}>12 P로 확정 신규 개봉</button>}
      {collectionError && <p>{collectionError}</p>}
    </div></div>}
  </main>;
}

interface DisplayedSpeech extends OldMaidSpeech { beat: number; revision: number; }

function streakLabel(value: number): string {
  if (value > 0) return `현재 ${value}연승`;
  if (value < 0) return `현재 ${Math.abs(value)}연패`;
  return "현재 연속 기록 없음";
}

function SeatPanel({ seatId, state, name, portrait, reaction, active, reordered, showHand, cards, faces, assets, speech, onDetail }: { seatId: Exclude<OldMaidSeatId, "player">; state: OldMaidState; name: string; portrait: string | null; reaction: string; active: boolean; reordered: boolean; showHand: boolean; cards: Map<string, { faceId: string }>; faces: Map<string, OldMaidFace>; assets: Readonly<Record<string, string>>; speech: DisplayedSpeech | null; onDetail(face: OldMaidFace): void }) {
  const safe = state.safeOrder.includes(seatId);
  const hidden = state.status === "ready" || state.status === "dealing";
  return <article className={`old-maid-seat seat-${seatId} ${active ? "active" : ""} ${safe ? "safe" : ""} ${speech ? "speaking" : ""}`} data-deal-target={seatId}>
    {speech && <div className="old-maid-speech" data-line-id={speech.line.id} data-beat={speech.beat} key={`${speech.line.id}:${speech.beat}:${speech.revision}`}><p>{speech.line.text[speech.beat]}</p></div>}
    <div className="old-maid-seat-portrait">{portrait ? <img src={portrait} alt={`${name}의 현재 표정`} decoding="async" /> : <span>{name}</span>}<i className={`old-maid-reaction-dot ${reaction}`} aria-hidden="true" /></div>
    <div><strong>{name}</strong><em className={`old-maid-reaction-text ${reaction}`}>{reactionLabel(reaction)}</em><span>{hidden ? (state.status === "ready" ? "배분 전" : "배분 중") : safe ? "손패 비움" : reordered ? `${state.hands[seatId].length}장 · 손패를 섞어 둠` : `${state.hands[seatId].length}장`}</span></div>
    {showHand && !safe && <div className="old-maid-spectator-hand" aria-label={`${name}의 공개된 손패`}>{state.hands[seatId].map((cardId) => { const face = faces.get(cards.get(cardId)?.faceId ?? ""); return face ? <button key={cardId} onClick={() => onDetail(face)}><CardFace face={face} assets={assets} odd={face.id === "joker"} /></button> : null; })}</div>}
  </article>;
}

function SpectatorSeat({ state, name, character, reaction, portrait, cards, faces, assets, onDetail }: { state: OldMaidState; name: string; character: OldMaidCartridge["characters"][number] | undefined; reaction: string; portrait: string | null; cards: Map<string, { faceId: string }>; faces: Map<string, OldMaidFace>; assets: Readonly<Record<string, string>>; onDetail(face: OldMaidFace): void }) {
  const safe = state.safeOrder.includes("player");
  return <article className={`old-maid-player old-maid-spectator-seat ${state.currentPlayerId === "player" && state.status === "playing" ? "active" : ""} ${safe ? "safe" : ""}`} data-deal-target="player">
    <div className="old-maid-spectator-profile"><div className="old-maid-seat-portrait">{portrait ? <img src={portrait} alt={`${name}의 현재 표정`} decoding="async" /> : <span>{name}</span>}</div><div><strong>{name}</strong><em className={`old-maid-reaction-text ${reaction}`}>{reactionLabel(reaction)}</em><span>{state.status === "dealing" ? "배분 중" : safe ? "손패 비움" : `${state.hands.player.length}장`}</span></div></div>
    <span className="old-maid-spectator-label">관전 좌석 · 이번 판 반응 {tellStyleLabel(character?.tellStyle)}</span>
    {!safe && <div className="old-maid-spectator-hand old-maid-spectator-bottom-hand" aria-label={`${name}의 관전 손패`}>{state.hands.player.map((cardId) => { const face = faces.get(cards.get(cardId)?.faceId ?? ""); return face ? <button key={cardId} onClick={() => onDetail(face)} aria-label={`${face.name} 크게 보기`}><CardFace face={face} assets={assets} odd={face.id === "joker"} /></button> : null; })}</div>}
  </article>;
}

function OfferStage({ state, cards, faces, assets, actorName, targetName, revealFaces, moveDuration, inspectedCardId, touchedCardId, onHover, onTouch, onDraw, onFinish }: {
  state: OldMaidState;
  cards: Map<string, { faceId: string }>;
  faces: Map<string, OldMaidFace>;
  assets: Readonly<Record<string, string>>;
  actorName: string;
  targetName: string;
  revealFaces: boolean;
  moveDuration: number;
  inspectedCardId: string | null;
  touchedCardId: string | null;
  onHover(cardId: string | null): void;
  onTouch(cardId: string, index: number): void;
  onDraw(index: number): void;
  onFinish(): void;
}) {
  const handRef = useRef<HTMLDivElement>(null);
  const pointerKindRef = useRef("");
  const offer = state.offer;
  const targetHand = offer ? state.hands[offer.targetId] : [];
  useHandFlip(handRef, targetHand.join("|"), moveDuration);
  if (!offer) return null;
  const humanTarget = state.mode === "play" && offer.targetId === "player";
  const humanActorReady = state.mode === "play" && offer.actorId === "player" && state.status === "playing" && offer.phase === "ready";
  const phaseCopy = offer.phase === "arranging" ? `${targetName}의 손패 정리 중` : offer.phase === "settling" ? `${targetName}이 카드를 내미는 중` : `${actorName}, 한 장을 고르세요`;
  return <section className={`old-maid-offer-stage phase-${offer.phase}`} data-offer-target={offer.targetId} aria-label={`${targetName}의 손패 제시`}>
    <div className="old-maid-offer-copy"><span>{actorName} → {targetName}</span><strong>{phaseCopy}</strong></div>
    {!humanTarget && <div className="old-maid-offer-hand" ref={handRef}>
      {targetHand.map((cardId, index) => {
        const face = faces.get(cards.get(cardId)?.faceId ?? "");
        const canDraw = humanActorReady;
        return <button
          type="button"
          key={cardId}
          data-card-id={cardId}
          className={`old-maid-offer-card ${inspectedCardId === cardId ? "inspected" : ""}`}
          disabled={!canDraw}
          aria-label={`${index + 1}번째 ${revealFaces && face ? face.name : "뒷면 카드"}${canDraw ? touchedCardId === cardId ? ", 한 번 더 누르면 뽑기" : ", 뽑기" : ""}`}
          onPointerEnter={(event) => { if (canDraw && event.pointerType === "mouse") onHover(cardId); }}
          onPointerLeave={(event) => { if (canDraw && event.pointerType === "mouse") onHover(null); }}
          onPointerDown={(event) => {
            if (!canDraw) return;
            pointerKindRef.current = event.pointerType;
            if (event.pointerType === "mouse") return;
            event.preventDefault();
            onTouch(cardId, index);
          }}
          onClick={() => {
            if (!canDraw) return;
            if (pointerKindRef.current && pointerKindRef.current !== "mouse") { pointerKindRef.current = ""; return; }
            pointerKindRef.current = "";
            onDraw(index);
          }}
        >{revealFaces && face ? <CardFace face={face} assets={assets} odd={face.id === "joker"} /> : <CardBack />}</button>;
      })}
    </div>}
    {humanTarget && offer.phase === "arranging" && <div className="old-maid-offer-confirm"><p>카드 순서를 정한 뒤 상대에게 손패를 내밉니다.</p><button type="button" className="old-maid-primary" onClick={onFinish}>재배열 종료 · 이대로 내밀기</button></div>}
    {!humanTarget && offer.phase === "settling" && <small>{offer.lastMove ? "카드 위치가 바뀌었습니다." : "순서를 유지했습니다."}</small>}
  </section>;
}

function useHandFlip(containerRef: React.RefObject<HTMLElement | null>, orderKey: string, duration: number): void {
  const previousRects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const nextRects = new Map<string, DOMRect>();
    for (const element of container.querySelectorAll<HTMLElement>("[data-card-id]")) {
      const cardId = element.dataset.cardId;
      if (!cardId) continue;
      const next = element.getBoundingClientRect();
      nextRects.set(cardId, next);
      const previous = previousRects.current.get(cardId);
      if (!previous || duration <= 0) continue;
      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      try {
        element.animate([
          { transform: `translate(${dx}px, ${dy}px)`, zIndex: 4 },
          { transform: "translate(0, 0)", zIndex: 1 },
        ], { duration, easing: "cubic-bezier(.2,.75,.2,1)" });
      } catch { /* Motion is presentational; state and timers continue without it. */ }
    }
    previousRects.current = nextRects;
  }, [containerRef, orderKey, duration]);
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

function DrawReveal({ event, face, assets, actorName, targetName, revealFace, onCollect }: { event: NonNullable<OldMaidState["pendingDraw"]>; face: OldMaidFace; assets: Readonly<Record<string, string>>; actorName: string; targetName: string; revealFace: boolean; onCollect(): void }) {
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
      autoTimer = window.setTimeout(() => collect(), revealFace ? 1350 : 1050);
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

  return <div className="old-maid-reveal-stage" aria-live="polite"><p><b>{actorName}</b>{subjectParticle(actorName)} {targetName}에게서 한 장을 뽑았습니다</p><div className="old-maid-flip-card" ref={cardRef}>{revealFace ? <CardFace face={face} assets={assets} odd={face.id === "joker"} /> : <CardBack />}</div><strong className="old-maid-revealed-name">{ready ? revealFace ? face.name : collecting ? "카드 이동 중…" : "한 장을 뽑았습니다" : "카드 확인 중…"}</strong><span>{collecting ? `${actorName}의 손으로 이동합니다…` : revealFace ? "확인 후 자동으로 손패에 들어갑니다." : ""}</span></div>;
}

function CardBack() { return <div className="old-maid-card back standalone"><span>THE<br />MARGIN</span></div>; }

function GameLog({ state, faces, nameOf, revealCpuDraws }: { state: OldMaidState; faces: Map<string, OldMaidFace>; nameOf(seatId: OldMaidSeatId): string; revealCpuDraws: boolean }) {
  const entries = [...state.history].reverse();
  return <aside className="old-maid-log" aria-label="경기 기록"><strong>경기 기록 · 최신순</strong><ol>{entries.map((entry, index) => {
    if (entry.type === "discard") return <li key={`${index}:discard`}><b>{nameOf(entry.ownerId)}</b> · {faces.get(entry.faceId)?.name ?? "한 쌍"} 버림</li>;
    const canReveal = revealCpuDraws || state.mode === "play" && (entry.actorId === "player" || entry.targetId === "player");
    return <li key={`${index}:draw`}><b>{nameOf(entry.actorId)}</b> → {nameOf(entry.targetId)} · {canReveal ? faces.get(entry.faceId)?.name ?? "카드" : "카드 1장"}</li>;
  })}{state.history.length === 0 && <li>카드를 나누면 기록이 쌓입니다.</li>}</ol></aside>;
}

function DiscardStage({ ownerId, ownerName, pairs, cards, faces, assets, playerControls, onDiscard }: { ownerId: OldMaidSeatId; ownerName: string; pairs: [string, string][]; cards: Map<string, { faceId: string }>; faces: Map<string, OldMaidFace>; assets: Readonly<Record<string, string>>; playerControls: boolean; onDiscard(cardIds: [string, string]): void }) {
  const first = pairs[0] as [string, string];
  const throwingRef = useRef(false);
  const commitTimerRef = useRef(0);
  const [throwingKey, setThrowingKey] = useState<string | null>(null);

  function throwPair(pair: [string, string]) {
    if (throwingRef.current) return;
    throwingRef.current = true;
    const key = pair.join(":");
    setThrowingKey(key);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    commitTimerRef.current = window.setTimeout(() => onDiscard(pair), reduced ? 90 : 180);
  }

  useEffect(() => {
    if (playerControls) return;
    const timer = window.setTimeout(() => throwPair(first), 420);
    return () => window.clearTimeout(timer);
  }, [first[0], first[1], ownerId, playerControls]);
  useEffect(() => () => window.clearTimeout(commitTimerRef.current), []);
  return <div className="old-maid-discard-stage" aria-live="polite"><p><b>{ownerName}</b>{playerControls ? "의 손에서 버릴 수 있는 짝입니다" : "이 다음 짝을 버립니다"}</p><div className={`old-maid-discard-options ${throwingKey ? "throwing" : ""}`}>{pairs.map((pair) => { const key = pair.join(":"); const face = faces.get(cards.get(pair[0])?.faceId ?? ""); return face ? <button className={throwingKey === key ? "throwing" : ""} key={key} disabled={!playerControls || Boolean(throwingKey)} onClick={() => throwPair(pair)} aria-label={`${face.name} 두 장 버리기`}><span className="old-maid-discard-pair"><CardFace face={face} assets={assets} odd={false} /><CardFace face={face} assets={assets} odd={false} /></span><strong>{playerControls ? "이 짝 버리기" : `${face.name} 버리는 중…`}</strong></button> : null; })}</div></div>;
}

function DiscardPile({ state, faces, assets }: { state: OldMaidState; faces: Map<string, OldMaidFace>; assets: Readonly<Record<string, string>> }) {
  const pairRefs = useRef(new Map<number, HTMLDivElement>());
  const seenRef = useRef(state.discards.length);
  useEffect(() => {
    if (state.discards.length < seenRef.current) { seenRef.current = state.discards.length; return; }
    if (state.discards.length === seenRef.current) return;
    const index = state.discards.length - 1;
    const discard = state.discards[index];
    let animation: Animation | null = null;
    let finishTimer = 0;
    const frame = window.requestAnimationFrame(() => {
      seenRef.current = state.discards.length;
      const element = pairRefs.current.get(index);
      const slot = element?.closest<HTMLElement>(".old-maid-pile-slot");
      const source = discard ? document.querySelector<HTMLElement>(`[data-deal-target="${discard.ownerId}"]`) : null;
      if (!element || !slot || !source) return;
      slot.dataset.arriving = "true";
      const target = element.getBoundingClientRect(), origin = source.getBoundingClientRect();
      const dx = origin.left + origin.width / 2 - (target.left + target.width / 2);
      const dy = origin.top + origin.height / 2 - (target.top + target.height / 2);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduced ? 90 : 560;
      animation = element.animate([
        { transform: `translate(${dx}px,${dy}px) scale(.55)`, opacity: .35 },
        { transform: "translate(0,0) scale(1)", opacity: 1 },
      ], { duration, easing: "cubic-bezier(.18,.8,.2,1)" });
      finishTimer = window.setTimeout(() => { delete slot.dataset.arriving; }, duration);
    });
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(finishTimer); animation?.cancel(); };
  }, [state.discards.length]);
  return <div className="old-maid-discard-pile" aria-label={`테이블에 버린 카드 ${state.discards.length}쌍`}>
    {state.discards.map((discard, index) => {
      const face = faces.get(discard.faceId);
      if (!face) return null;
      const offset = pileOffset(state.seed, index, discard.cardIds[0]);
      const style = {
        "--pile-angle": `${discardAngle(discard.ownerId)}deg`,
        "--jitter-x": `${offset.x}px`,
        "--jitter-y": `${offset.y}px`,
        "--jitter-r": `${offset.rotation}deg`,
        "--pile-z": 1,
      } as React.CSSProperties;
      return <div className="old-maid-pile-slot" data-owner={discard.ownerId} style={style} key={`${discard.turn}:${discard.faceId}:${index}`}><div className="old-maid-pile-pair" ref={(node) => { if (node) pairRefs.current.set(index, node); else pairRefs.current.delete(index); }}><CardFace face={face} assets={assets} odd={false} /><CardFace face={face} assets={assets} odd={false} /></div></div>;
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
function tellStyleLabel(style: OldMaidCartridge["characters"][number]["tellStyle"] | undefined): string { return style === "open" ? "공개형" : style === "guarded" ? "경계형" : style === "bluffer" ? "허세형" : "표준형"; }
function emptyPsychologySummary(): OldMaidPsychologySummary { return { inspectedCards: 0, reorderActions: 0, reorderTurns: 0, reorderSignals: 0, movedSlotDraws: 0, successfulBaits: 0, offers: 0, reorderedOffers: 0, playerOfferConfirms: 0, npcToNpcOffers: 0 }; }
function psychologyStorageKey(sessionId: string, seed: string): string { return `lucky-arcade:old-maid-psychology:${sessionId}:${seed}`; }
function loadPsychologySummary(sessionId: string, seed: string): OldMaidPsychologySummary {
  if (typeof window === "undefined") return emptyPsychologySummary();
  try {
    const value = JSON.parse(window.localStorage.getItem(psychologyStorageKey(sessionId, seed)) ?? "null") as Partial<OldMaidPsychologySummary> | null;
    return value ? { ...emptyPsychologySummary(), ...value } : emptyPsychologySummary();
  } catch { return emptyPsychologySummary(); }
}
function savePsychologySummary(sessionId: string, seed: string, summary: OldMaidPsychologySummary): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(psychologyStorageKey(sessionId, seed), JSON.stringify(summary)); } catch { /* telemetry must never block play */ }
}
function recordPsychologyAction(cartridge: OldMaidCartridge, previous: OldMaidState, next: OldMaidState, action: OldMaidAction, summary: OldMaidPsychologySummary): void {
  if (action.type === "reorder_hand" || action.type === "reorder_offer") {
    summary.reorderActions += 1;
    if (action.type === "reorder_offer" ? previous.offer?.reorderCount === 0 : previous.lastReorder?.turn !== previous.turn) summary.reorderTurns += 1;
    return;
  }
  if (action.type === "prepare_cpu_offer") {
    summary.offers += 1;
    if (next.offer?.lastMove) summary.reorderedOffers += 1;
    if (previous.offer && (previous.mode === "spectate" || previous.offer.actorId !== "player" && previous.offer.targetId !== "player")) summary.npcToNpcOffers += 1;
    return;
  }
  if (action.type === "finish_offer" && previous.offer?.targetId === "player" && previous.mode === "play") {
    summary.offers += 1;
    summary.playerOfferConfirms += 1;
    if (previous.offer.reorderCount > 0) summary.reorderedOffers += 1;
    return;
  }
  if (action.type !== "cpu_draw" || !next.pendingDraw) return;
  const targetId = next.pendingDraw.targetId;
  const read = publicRead(previous, targetId);
  if (!read.reorderedSinceTargetDraw || read.reorderIndex === null) return;
  summary.reorderSignals += 1;
  const drawnIndex = previous.hands[targetId].indexOf(next.pendingDraw.cardId);
  if (drawnIndex !== read.reorderIndex) return;
  summary.movedSlotDraws += 1;
  const drawn = cartridge.cards.find((card) => card.id === next.pendingDraw?.cardId);
  if (drawn?.faceId !== cartridge.oddFaceId) summary.successfulBaits += 1;
}
function subjectParticle(value: string): string { const code = value.charCodeAt(value.length - 1) - 0xac00; return code >= 0 && code <= 11171 && code % 28 !== 0 ? "이" : "가"; }
export default OldMaidScreen;
