import { IconArrowLeft, IconCards, IconCheck, IconPlayerPause, IconPlayerPlay, IconRefresh, IconX } from "@tabler/icons-react";
import { celebrate } from "@lucky-arcade/ui/celebrate";
import { HoloFoil } from "@lucky-arcade/ui/holo-card";
import { NumberTicker } from "@lucky-arcade/ui/number-ticker";
import { useSlideHighlight } from "@lucky-arcade/ui/slide-highlight";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isOldMaidSpeechSilent, oldMaidSpeechSnapshot, selectOldMaidSpeeches, validateOldMaidLines, type OldMaidSpeech } from "../dialogue.ts";
import { automaticCharacterIds, availablePairs, characterIdForSeat, createOldMaidState, discardingSeat, inspectCardReaction, reduceOldMaid, targetSeat, usesOfferFlow } from "../engine.ts";
import { publicRead } from "../read.ts";
import { selectAmbientReaction } from "../tells.ts";
import type { OldMaidAction, OldMaidCartridge, OldMaidFace, OldMaidMode, OldMaidPsychologySummary, OldMaidSeatId, OldMaidState } from "../contracts.ts";
import { discardStageKey } from "./discard-stage-key.ts";
import { subjectParticle } from "./korean-particles.ts";
import { oldMaidOfferTiming, type OldMaidSpectatorSpeed } from "./offer-timing.ts";
import { pileOffset } from "./pile-layout.ts";
import "./old-maid.css";

export interface OldMaidScreenProps {
  cartridge: OldMaidCartridge;
  thumbAssets?: Readonly<Record<string, string>>;
  assets: Readonly<Record<string, string>>;
  detailAssets?: Readonly<Record<string, string>>;
  initialState: OldMaidState | null;
  matchSummary?: OldMaidMatchSummary | null;
  economy?: OldMaidEconomy;
  opponentAvailability?: Readonly<Record<string, { available: boolean; label: string; availableAtUtcSecond?: number }>>;
  onOpponentSelectionChange?(ids: readonly string[]): void;
  onPersist(previous: OldMaidState, next: OldMaidState, action: OldMaidAction, psychology: OldMaidPsychologySummary): Promise<void>;
  /** Reuses the native table and presentation without writing game progress. */
  presentationOnly?: boolean;
  onReplay?(): void;
  onExit(): void;
}

export interface OldMaidEconomy {
  balance: number;
  award?: { amount: number; rank: number; correction?: boolean } | null;
  unlockedFaceIds: readonly string[];
  onUnlock(): Promise<void>;
  prediction?: OldMaidPredictionEconomy;
}

export interface OldMaidPredictionEconomy {
  stakes: readonly number[];
  multipliers: readonly number[];
  active: { market?: "joker-holder" | "first-place"; predictedCharacterId: string; stake: number; multiplier: number; reservedAmount: number; status: "reserved" | "won" | "lost" | "refunded"; settlementCredit: number } | null;
  onStart(input: { seed: string; mode: OldMaidMode; characterIds: readonly string[]; market: "joker-holder" | "first-place"; predictedCharacterId: string; stake: number; multiplier: number }): Promise<"reserved" | "replay">;
  onClear(): void;
}

export interface OldMaidMatchSummary {
  played: number;
  firstPlaces: number;
  jokerHolds: number;
  currentStreak: number;
  opponents: Array<{ participantId: string; displayName: string; played: number; beaten: number }>;
}

export function OldMaidScreen({ cartridge, assets, thumbAssets = assets, detailAssets = assets, initialState, matchSummary, economy, opponentAvailability = {}, onOpponentSelectionChange, onPersist, presentationOnly = false, onReplay, onExit }: OldMaidScreenProps) {
  useMemo(() => validateOldMaidLines(cartridge), [cartridge]);
  const [state, setState] = useState(() => initialState ?? createOldMaidState(cartridge, dailySeed()));
  const [detail, setDetail] = useState<OldMaidFace | null>(null);
  const [opponentIds, setOpponentIds] = useState<string[]>(() => Object.values(state.characters));
  const [lobbyMode, setLobbyMode] = useState<OldMaidMode>(() => state.mode);
  const opponentPickerRef = useSlideHighlight<HTMLDivElement>();
  const [hoveredDrawCardId, setHoveredDrawCardId] = useState<string | null>(null);
  const [touchedDrawCardId, setTouchedDrawCardId] = useState<string | null>(null);
  const [inspectedDrawCardIds, setInspectedDrawCardIds] = useState<string[]>([]);
  const [reorderFrom, setReorderFrom] = useState<number | null>(null);
  const [speeches, setSpeeches] = useState<DisplayedSpeech[]>([]);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionError, setCollectionError] = useState("");
  const [predictedCharacterId, setPredictedCharacterId] = useState("");
  const [predictionStake, setPredictionStake] = useState(() => economy?.prediction?.stakes[0] ?? 10);
  const [predictionMultiplier, setPredictionMultiplier] = useState(2);
  const [predictionError, setPredictionError] = useState("");
  const [predictionStarting, setPredictionStarting] = useState(false);
  const [directPrediction, setDirectPrediction] = useState(false);
  const [preparingAssets, setPreparingAssets] = useState(false);
  const [replaySetup, setReplaySetup] = useState(false);
  const [spectatorSpeed, setSpectatorSpeed] = useState<OldMaidSpectatorSpeed>("normal");
  const [paused, setPaused] = useState(false);
  const [progressMode, setProgressMode] = useState<"auto" | "manual">("auto");
  const [manualRunning, setManualRunning] = useState(false);
  const [speechHolding, setSpeechHolding] = useState(false);
  const pointerKindRef = useRef("");
  const recentLineIdsRef = useRef<string[]>([]);
  const speechTimersRef = useRef<number[]>([]);
  const speechRevisionRef = useRef(0);
  const autoPausedRef = useRef(false);
  const pausedRef = useRef(false);
  const manualSeatRef = useRef<OldMaidSeatId | null>(null);
  const longPressRef = useRef<number | null>(null);
  const randomSelectionRef = useRef(0);
  const playerHandRef = useRef<HTMLDivElement>(null);
  const drawFlightRef = useRef<DrawFlightOrigin | null>(null);
  const stateRef = useRef(state);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const psychologyRef = useRef<OldMaidPsychologySummary>(presentationOnly ? emptyPsychologySummary() : loadPsychologySummary(state.sessionId, state.seed));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const faces = useMemo(() => new Map(cartridge.faces.map((face) => [face.id, face])), [cartridge]);
  const cards = useMemo(() => new Map(cartridge.cards.map((card) => [card.id, card])), [cartridge]);
  const characters = useMemo(() => new Map(cartridge.characters.map((character) => [character.id, character])), [cartridge]);
  const selectableCharacters = useMemo(() => {
    const selectable = new Set(cartridge.selectableCharacterIds ?? cartridge.characters.map((character) => character.id));
    return cartridge.characters.filter((character) => selectable.has(character.id));
  }, [cartridge]);
  const availableCharacters = selectableCharacters.filter((character) => opponentAvailability[character.id]?.available !== false);
  const hasUnavailableOpponent = !replaySetup && opponentIds.some((id) => opponentAvailability[id]?.available === false);

  function updatePaused(next: boolean) {
    // Timers can fire before React commits the paused render. Keep an
    // immediate guard so no presentation callback advances the game after the
    // user has already pressed pause.
    pausedRef.current = next;
    setPaused(next);
  }

  function dispatch(action: OldMaidAction) {
    if ((pausedRef.current || speechHolding) && action.type !== "restart") return;
    const previous = stateRef.current;
    const next = reduceOldMaid(cartridge, previous, action);
    if (next.status === "revealing" && next.pendingDraw && previous.status === "playing") {
      drawFlightRef.current = captureDrawOrigin(next.pendingDraw.cardId);
    } else if (action.type === "collect_draw" || action.type === "start" || action.type === "restart") {
      drawFlightRef.current = null;
    }
    if (!presentationOnly) {
      if (action.type === "start" || action.type === "restart") psychologyRef.current = emptyPsychologySummary();
      else recordPsychologyAction(cartridge, previous, next, action, psychologyRef.current);
      savePsychologySummary(next.sessionId, next.seed, psychologyRef.current);
    }
    const previousSpeech = oldMaidSpeechSnapshot(previous);
    const nextSpeech = oldMaidSpeechSnapshot(next);
    const selectedSpeeches = selectOldMaidSpeeches(cartridge, previousSpeech, nextSpeech, recentLineIdsRef.current);
    if (isOldMaidSpeechSilent(nextSpeech)) clearSpeech();
    else if (selectedSpeeches.length > 0) showSpeeches(selectedSpeeches);
    stateRef.current = next;
    setState(next);
    if (!presentationOnly) {
      setSaveState("saving");
      const revision = ++saveRevisionRef.current;
      const psychology = { ...psychologyRef.current };
      persistQueueRef.current = persistQueueRef.current.catch(() => undefined).then(() => onPersist(previous, next, action, psychology));
      void persistQueueRef.current.then(() => { if (saveRevisionRef.current === revision) setSaveState("saved"); }).catch(() => { if (saveRevisionRef.current === revision) setSaveState("error"); });
    }
  }

  function showSpeeches(selected: readonly OldMaidSpeech[]) {
    cancelSpeechTimers();
    recentLineIdsRef.current = [...recentLineIdsRef.current, ...selected.map((speech) => speech.line.id)].slice(-8);
    const revision = ++speechRevisionRef.current;
    const showBeat = (speech: OldMaidSpeech, beat: number) => setSpeeches((current) => [
      ...current.filter((item) => item.seatId !== speech.seatId),
      { ...speech, beat, revision },
    ]);
    const remove = (speech: OldMaidSpeech) => setSpeeches((current) => current.filter((item) => item.seatId !== speech.seatId || item.revision !== revision));
    const tableOpening = selected.every((speech) => speech.line.event === "table-open");
    setSpeeches(tableOpening ? [] : selected.map((speech) => ({ ...speech, beat: 0, revision })));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fast = stateRef.current.mode === "spectate" && spectatorSpeed === "fast";
    const beatDuration = fast ? 1_200 : 2_000;
    const gap = reduced ? 250 : fast ? 350 : 700;
    if (tableOpening) {
      setSpeechHolding(true);
      const visibleFor = reduced ? 900 : 1_200;
      selected.forEach((speech, index) => {
        const startsAt = index * (visibleFor + 400);
        speechTimersRef.current.push(window.setTimeout(() => showBeat(speech, 0), startsAt));
        speechTimersRef.current.push(window.setTimeout(() => remove(speech), startsAt + visibleFor));
      });
      speechTimersRef.current.push(window.setTimeout(() => setSpeechHolding(false), selected.length * visibleFor + Math.max(0, selected.length - 1) * 400));
      return;
    }
    for (const speech of selected) {
      if (speech.line.text.length === 1) {
        speechTimersRef.current.push(window.setTimeout(() => remove(speech), fast ? 1_500 : 2_400));
        continue;
      }
      let elapsed = 0;
      for (let beat = 0; beat < speech.line.text.length; beat += 1) {
        elapsed += beatDuration;
        if (beat === speech.line.text.length - 1) break;
        speechTimersRef.current.push(window.setTimeout(() => remove(speech), elapsed));
        elapsed += gap;
        speechTimersRef.current.push(window.setTimeout(() => showBeat(speech, beat + 1), elapsed));
      }
      speechTimersRef.current.push(window.setTimeout(() => remove(speech), elapsed));
    }
  }

  function clearSpeech() {
    cancelSpeechTimers();
    speechRevisionRef.current += 1;
    setSpeeches([]);
    setSpeechHolding(false);
  }

  function cancelSpeechTimers(releaseHold = true) {
    for (const timer of speechTimersRef.current) window.clearTimeout(timer);
    speechTimersRef.current = [];
    if (releaseHold) setSpeechHolding(false);
  }

  useEffect(() => {
    if (paused || speechHolding || progressMode === "manual" && !manualRunning) return;
    const humanActor = state.currentPlayerId === "player" && state.mode === "play";
    if (!usesOfferFlow(state.version)) {
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
  }, [state.sequence, state.status, state.turn, spectatorSpeed, paused, speechHolding, progressMode, manualRunning]);

  useEffect(() => {
    if (!manualRunning) return;
    const humanActor = state.currentPlayerId === "player" && state.mode === "play";
    if (state.status === "complete" || humanActor || state.currentPlayerId !== manualSeatRef.current) {
      manualSeatRef.current = null;
      setManualRunning(false);
    }
  }, [manualRunning, state.currentPlayerId, state.mode, state.status]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (!paused) autoPausedRef.current = true;
        updatePaused(true);
      } else if (autoPausedRef.current) {
        autoPausedRef.current = false;
        updatePaused(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [paused]);

  useEffect(() => () => cancelSpeechTimers(false), []);

  // Confetti belongs to the moment the result lands, never to a re-render of it.
  const celebratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.status !== "complete") { celebratedRef.current = null; return; }
    if (celebratedRef.current === state.sessionId) return;
    celebratedRef.current = state.sessionId;
    if (state.mode !== "play") return;
    const place = state.safeOrder.indexOf("player");
    if (place === 0) void celebrate("full");
    else if (place > 0) void celebrate("modest");
  }, [state.status, state.sessionId, state.mode, state.safeOrder]);

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
  const outcomeLine = (seatId: OldMaidSeatId, rank: number | null) => {
    if (state.mode === "play" && seatId === "player") return null;
    const characterId = characterIdForSeat(state, seatId);
    if (!characterId) return null;
    const event = rank === null ? "defeat" : rank === 1 ? "finish-1st" : rank === 2 ? "finish-2nd" : "finish-3rd";
    return cartridge.lines?.find((line) => line.characterId === characterId && line.event === event)?.text.join(" ")
      ?? (rank !== null ? cartridge.lines?.find((line) => line.characterId === characterId && line.event === "emptied")?.text.join(" ") : null)
      ?? null;
  };
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
    if (!opponentIds.includes(characterId) && opponentAvailability[characterId]?.available === false) return;
    const limit = lobbyMode === "spectate" ? 4 : 3;
    const next = opponentIds.includes(characterId) ? opponentIds.filter((id) => id !== characterId) : opponentIds.length < limit ? [...opponentIds, characterId] : [...opponentIds.slice(1), characterId];
    setOpponentIds(next);
    onOpponentSelectionChange?.(next);
  }

  function chooseMode(mode: OldMaidMode) {
    setLobbyMode(mode);
    setDirectPrediction(false);
    setPredictedCharacterId("");
    const limit = mode === "spectate" ? 4 : 3;
    const next = opponentIds.slice(0, limit);
    for (const character of availableCharacters) if (next.length < limit && !next.includes(character.id)) next.push(character.id);
    setOpponentIds(next);
    onOpponentSelectionChange?.(next);
  }

  function chooseRandomOpponents() {
    randomSelectionRef.current += 1;
    const eligibleIds = availableCharacters.map((character) => character.id);
    const next = automaticCharacterIds({ ...cartridge, selectableCharacterIds: eligibleIds }, `${state.seed}:lobby:${randomSelectionRef.current}`, lobbyMode);
    setOpponentIds(next);
    onOpponentSelectionChange?.(next);
    setPredictedCharacterId("");
  }

  async function startMatch(withPrediction: boolean) {
    setPredictionError("");
    if (!replaySetup && opponentIds.some((id) => opponentAvailability[id]?.available === false)) {
      setPredictionError("선택한 NPC가 다른 테이블에서 게임 중입니다. 이용 가능한 상대를 골라주세요.");
      return;
    }
    setPreparingAssets(true);
    await preloadMatchImages(cartridge, state, opponentIds, assets);
    setPreparingAssets(false);
    if (withPrediction && economy?.prediction) {
      // A participant must never be able to profit by steering the result toward an opponent.
      const eligibleTargets = lobbyMode === "play" ? ["player"] : opponentIds;
      const predictionTarget = eligibleTargets.includes(predictedCharacterId) ? predictedCharacterId : eligibleTargets[0];
      if (!predictionTarget) return;
      setPredictionStarting(true);
      try {
        await economy.prediction.onStart({
          seed: state.seed,
          mode: lobbyMode,
          characterIds: opponentIds,
          market: lobbyMode === "spectate" ? "joker-holder" : "first-place",
          predictedCharacterId: predictionTarget,
          stake: predictionStake,
          multiplier: predictionMultiplier,
        });
      } catch (error) {
        setPredictionError(error instanceof Error && error.message === "insufficient_points" ? "포인트가 부족합니다. 직접 플레이 두 판이면 첫 10 P를 마련할 수 있습니다." : error instanceof Error && error.message === "outcome_already_wagered" ? "이 대국에는 이미 베팅했습니다. 같은 결과는 무료로 다시 볼 수 있습니다." : "베팅을 예약하지 못했습니다.");
        return;
      } finally { setPredictionStarting(false); }
    } else economy?.prediction?.onClear();
    dispatch({ type: "start", mode: lobbyMode, characterIds: opponentIds });
    setReplaySetup(false);
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
    dispatch({ type: usesOfferFlow(stateRef.current.version) ? "reorder_offer" : "reorder_hand", from, to });
  }

  function advanceManualTurn() {
    const current = stateRef.current;
    if (paused || current.status === "complete" || current.status === "ready" || current.currentPlayerId === "player" && current.mode === "play") return;
    manualSeatRef.current = current.currentPlayerId;
    setManualRunning(true);
  }

  function returnToReady(sameOpponents: boolean) {
    const characterIds = state.mode === "spectate" && state.spectatorCharacterId
      ? [...Object.values(state.characters), state.spectatorCharacterId]
      : Object.values(state.characters);
    economy?.prediction?.onClear();
    setDirectPrediction(false);
    setPredictedCharacterId("");
    setReplaySetup(sameOpponents);
    dispatch({ type: "restart", seed: `${dailySeed()}:${Date.now().toString(36)}`, mode: state.mode, characterIds });
  }

  function renderProgressControls(placement: "mobile" | "desktop") {
    if (state.status === "ready" || state.status === "complete") return null;
    return <div className={`old-maid-speed-controls old-maid-progress-controls old-maid-progress-controls-${placement}`} aria-label="진행 방식">
      <button type="button" className={progressMode === "auto" ? "selected" : ""} onClick={() => { setManualRunning(false); setProgressMode("auto"); }}>자동</button>
      <button type="button" className={progressMode === "manual" ? "selected" : ""} onClick={() => setProgressMode("manual")}>수동</button>
      {progressMode === "manual" && <button type="button" className="selected" disabled={paused || manualRunning || state.currentPlayerId === "player" && state.mode === "play"} onClick={advanceManualTurn}>{manualRunning ? "진행 중…" : "다음"}</button>}
      {state.mode === "spectate" && <><button type="button" className={spectatorSpeed === "normal" ? "selected" : ""} onClick={() => setSpectatorSpeed("normal")}>보통</button><button type="button" className={spectatorSpeed === "fast" ? "selected" : ""} onClick={() => setSpectatorSpeed("fast")}>빠르게</button></>}
    </div>;
  }

  return <main className={`old-maid-shell${state.status !== "ready" && state.status !== "complete" ? " is-live" : ""}`} data-presentation-hold={speechHolding || undefined} aria-busy={speechHolding || undefined} style={background ? { "--old-maid-bg": `url(${JSON.stringify(background)})` } as React.CSSProperties : undefined}>
    <header className="old-maid-header">
      <button onClick={onExit} aria-label="오락실로 돌아가기"><IconArrowLeft /></button>
      <div><span>BOT CARD · TABLE GAME</span><h1>{cartridge.title}</h1></div>
      <div className="old-maid-meters">{economy && <button className="old-maid-wallet" onClick={() => setCollectionOpen(true)}>{economy.balance.toLocaleString("ko-KR")} P</button>}<button className="old-maid-pause" onClick={() => { autoPausedRef.current = false; updatePaused(!pausedRef.current); }} disabled={state.status === "ready" || state.status === "complete"}>{paused ? <IconPlayerPlay size={15} /> : <IconPlayerPause size={15} />}{paused ? "계속" : "일시정지"}</button><span>{state.turn}턴</span>{!presentationOnly && <small aria-live="polite">{paused ? "일시정지됨" : saveState === "saving" ? "저장 중…" : saveState === "error" ? "저장 재시도 필요" : "자동 저장됨"}</small>}</div>
    </header>

    <section className="old-maid-table" aria-label={`${cartridge.title} 테이블`}>
      <div className="old-maid-opponents">
        {(["cpu-1", "cpu-2", "cpu-3"] as const).map((seatId, seatIndex) => {
          const previewCharacterId = state.status === "ready" ? opponentIds[seatIndex] : null;
          const character = characters.get(previewCharacterId ?? state.characters[seatId]);
          const baseReaction = state.status === "ready" ? "neutral" : state.status === "revealing" || state.status === "discarding" ? state.reactions[seatId] : selectAmbientReaction(cartridge, state, seatId);
          const reaction = seatId === targetId && inspectedReaction ? inspectedReaction : baseReaction;
          const portraitId = state.status === "complete" && state.loserId === seatId ? character?.despairPortrait : character?.portraits[reaction];
          return <SeatPanel key={seatId} seatId={seatId} state={state} name={character?.name ?? nameOf(seatId)} portrait={portraitId ? assets[portraitId] ?? null : null} reaction={reaction} active={state.currentPlayerId === seatId} reordered={publicRead(state, seatId).reorderedSinceTargetDraw} showHand={handVisible && (state.mode === "spectate" || humanFinishedWatching)} cards={cards} faces={faces} assets={assets} speech={speeches.find((item) => item.seatId === seatId) ?? null} onDetail={setDetail} />;
        })}
      </div>

      <div className="old-maid-center">
        {!['ready', 'dealing', 'complete'].includes(state.status) && <DiscardPile state={state} faces={faces} assets={assets} />}
        {state.status === "ready" && <div className="old-maid-intro">
          <IconCards size={48} />
          <span className="eyebrow">게임 룰</span>
          <h2>조커를 피해라</h2>
          <p>같은 그림 두 장을 맞춰 버리세요. 차례가 오면 지정된 상대에게서 한 장을 뽑고, 마지막까지 조커를 가진 사람이 집니다.</p>
          {!replaySetup && <div className="old-maid-mode-picker" aria-label="대국 방식"><button type="button" className={lobbyMode === "play" ? "selected" : ""} onClick={() => chooseMode("play")}>직접 플레이</button><button type="button" className={lobbyMode === "spectate" ? "selected" : ""} onClick={() => chooseMode("spectate")}>NPC 4명 관전</button></div>}
          <strong className="old-maid-opponent-title">{replaySetup ? "같은 상대와 새 패로 다시 시작합니다" : lobbyMode === "spectate" ? "관전할 NPC 4명을 고르기" : "함께할 상대 3명 고르기"}</strong>
          {!replaySetup && <><button type="button" className="old-maid-random" disabled={availableCharacters.length < (lobbyMode === "spectate" ? 4 : 3)} onClick={chooseRandomOpponents}><IconRefresh size={15} /> 무작위 선택</button><div className="old-maid-opponent-picker ca-slide" ref={opponentPickerRef}>{selectableCharacters.map((character) => { const selected = opponentIds.includes(character.id); const availability = opponentAvailability[character.id]; const unavailable = !selected && availability?.available === false; const portrait = thumbAssets[character.portraits.neutral] ?? assets[character.portraits.neutral]; return <button type="button" className={`${selected ? "selected" : ""}${unavailable ? " unavailable" : ""}`} aria-pressed={selected} aria-disabled={unavailable || undefined} disabled={unavailable} key={character.id} onClick={() => toggleOpponent(character.id)}>{portrait && <img src={portrait} alt="" decoding="async" loading="lazy" />}<span>{character.name}<small>{selected && availability?.available !== false ? "초대 수락" : availability?.label}</small></span></button>; })}</div></>}
          <div className="old-maid-roster" aria-label="선택한 좌석 순서">{lobbyMode === "play" && <span>하단 · 플레이어</span>}{opponentIds.map((id, index) => <span key={id}>{index < 3 ? `상단 ${index + 1}` : "하단"} · {characters.get(id)?.name}</span>)}</div>
          {economy?.prediction && (lobbyMode === "spectate" || directPrediction) && <section className="old-maid-prediction" aria-label={lobbyMode === "spectate" ? "최종 조커 보유자 예측" : "1등 예측 베팅"}>
            <strong>{lobbyMode === "spectate" ? "마지막 조커를 가질 인물에게 베팅" : "내가 가장 먼저 손을 비울지 베팅"}</strong>
            <div>{(lobbyMode === "play" ? ["player"] : opponentIds).map((id) => <button type="button" className={(predictedCharacterId || (lobbyMode === "play" ? "player" : opponentIds[0])) === id ? "selected" : ""} key={id} onClick={() => setPredictedCharacterId(id)}>{id === "player" ? "나" : characters.get(id)?.name}</button>)}</div>
            <div>{economy.prediction.stakes.map((stake) => <button type="button" className={predictionStake === stake ? "selected" : ""} key={stake} onClick={() => setPredictionStake(stake)} disabled={economy.balance < stake * predictionMultiplier}>{stake} P</button>)}</div>
            <div aria-label="배팅 배율">{economy.prediction.multipliers.map((multiplier) => <button type="button" className={predictionMultiplier === multiplier ? "selected" : ""} key={multiplier} onClick={() => setPredictionMultiplier(multiplier)} disabled={economy.balance < predictionStake * multiplier}>{multiplier}배</button>)}</div>
            <small>최대 손익 {predictionStake * predictionMultiplier} P · 적중과 실패 모두 선택 배율을 적용합니다.</small>
            {predictionError && <p>{predictionError}</p>}
          </section>}
          {hasUnavailableOpponent && <p className="old-maid-availability-warning">다른 테이블에서 게임 중인 NPC가 포함되어 있습니다.</p>}
          {lobbyMode === "play" ? <><div className="old-maid-start-actions"><button className="old-maid-primary" disabled={predictionStarting || preparingAssets || opponentIds.length !== 3 || hasUnavailableOpponent} onClick={() => void startMatch(false)}>{preparingAssets ? "카드 준비 중…" : "시작"}</button>{economy?.prediction && (directPrediction ? <button disabled={predictionStarting || preparingAssets || economy.balance < predictionStake * predictionMultiplier || opponentIds.length !== 3 || hasUnavailableOpponent} onClick={() => void startMatch(true)}>{predictionStarting ? "판돈 예약 중…" : "베팅하고 시작"}</button> : <button onClick={() => setDirectPrediction(true)}>선택 베팅 열기</button>)}</div>{economy && <small className="old-maid-rank-rewards">순위 보상 · 1등 60 P · 2등 30 P · 3등 15 P · 4등 5 P</small>}</> : <button className="old-maid-primary" disabled={predictionStarting || preparingAssets || opponentIds.length !== 4 || hasUnavailableOpponent || Boolean(economy?.prediction && economy.balance < predictionStake * predictionMultiplier)} onClick={() => void startMatch(Boolean(economy?.prediction))}>{preparingAssets ? "카드 준비 중…" : predictionStarting ? "판돈 예약 중…" : economy?.prediction ? "예측하고 NPC 대국 관전" : "NPC 대국 관전"}</button>}
        </div>}

        {state.status === "dealing" && <div className="old-maid-dealing-copy" aria-live="polite"><IconCards /><strong>카드를 나누는 중…</strong><span>배분이 끝나면 처음부터 맞은 짝을 정리합니다.</span></div>}

        {state.status === "revealing" && state.pendingDraw && <DrawReveal key={`${state.turn}:${state.pendingDraw.cardId}`} event={state.pendingDraw} face={faces.get(state.pendingDraw.faceId) as OldMaidFace} assets={assets} actorName={nameOf(state.pendingDraw.actorId)} targetName={nameOf(state.pendingDraw.targetId)} origin={drawFlightRef.current?.cardId === state.pendingDraw.cardId ? drawFlightRef.current : null} centerReveal={state.mode === "play" && (state.pendingDraw.actorId === "player" || state.pendingDraw.targetId === "player")} sourceFaceVisible={state.mode === "spectate" || humanFinishedWatching || state.mode === "play" && state.pendingDraw.targetId === "player"} paused={paused || speechHolding} onCollect={() => dispatch({ type: "collect_draw" })} />}

        {state.status === "discarding" && discardOwner && discardPairs.length > 0 && <DiscardStage key={discardStageKey(state.discardMode, discardOwner, discardPairs)} ownerId={discardOwner} ownerName={nameOf(discardOwner)} pairs={discardPairs} cards={cards} faces={faces} assets={assets} playerControls={discardOwner === "player" && state.mode === "play"} paused={paused || speechHolding} onDiscard={(cardIds) => dispatch({ type: "discard_pair", cardIds })} />}

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

        {renderProgressControls("mobile")}

        {state.status === "playing" && <>
          <div className={`old-maid-turn-callout ${state.currentPlayerId === "player" ? "player" : "cpu"}`}>
            <strong>{nameOf(state.currentPlayerId)}의 차례</strong>
            <span>{state.currentPlayerId === "player" && state.mode === "play" ? `${nameOf(targetId ?? "cpu-1")}의 뒷면 카드 한 장을 고르세요.` : `${nameOf(targetId ?? "player")}에게서 고르는 중…`}</span>
          </div>
          {!state.offer && state.currentPlayerId === "player" && state.mode === "play" && targetId && <div className="old-maid-draw-row" aria-label={`${nameOf(targetId)}의 뒷면 카드`}>
            {state.hands[targetId].map((cardId, index) => <button
              key={cardId}
              data-card-id={cardId}
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
          {state.mode === "play" && <strong className={`old-maid-verdict ca-serif ${state.loserId === "player" ? "lost" : ""}`}>{state.loserId === "player" ? "패배" : state.safeOrder.indexOf("player") === 0 ? "승리" : `${state.safeOrder.indexOf("player") + 1}등`}</strong>}
          <h2>{nameOf(state.loserId)}에게 조커가 남았습니다</h2>
          {characterIdForSeat(state, state.loserId) && <img className="old-maid-loser-portrait" src={assets[characters.get(characterIdForSeat(state, state.loserId) ?? "")?.despairPortrait ?? ""]} alt={`${nameOf(state.loserId)}의 절망한 표정`} />}
          <p>{state.mode === "spectate" ? `${nameOf(state.loserId)}${subjectParticle(nameOf(state.loserId))} 마지막 조커를 피하지 못했습니다.` : state.loserId === "player" ? "이번 판은 플레이어가 졌습니다." : `플레이어는 ${state.safeOrder.indexOf("player") + 1}번째로 손을 비웠습니다.`}</p>
          <ol>{state.safeOrder.map((seatId, index) => <li key={seatId}><IconCheck size={16} /><b>{index + 1}</b><span>{nameOf(seatId)}{outcomeLine(seatId, index + 1) && <small>{outcomeLine(seatId, index + 1)}</small>}</span></li>)}</ol>
          {outcomeLine(state.loserId, null) && <p className="old-maid-defeat-line">{nameOf(state.loserId)} · “{outcomeLine(state.loserId, null)}”</p>}
          {matchSummary && matchSummary.played > 0 && <section className="old-maid-history" aria-label="누적 전적">
            <strong>{matchSummary.played}판 · 1등 {matchSummary.firstPlaces}회 · 조커 {matchSummary.jokerHolds}회 · {streakLabel(matchSummary.currentStreak)}</strong>
            {matchSummary.opponents.slice(0, 3).map((opponent) => <span key={opponent.participantId}>{opponent.displayName} {opponent.played}판 {opponent.beaten}승</span>)}
          </section>}
          {economy?.award && <p className="old-maid-award">+<NumberTicker className="ca-num" value={economy.award.amount} /> P · {economy.award.rank}등 {economy.award.correction ? "보상 누락분" : "순위 보상"}</p>}
          {economy?.prediction?.active && <p className={`old-maid-prediction-result ${economy.prediction.active.status}`}>
            {economy.prediction.active.status === "won" ? `예측 적중 · ${economy.prediction.active.multiplier}배 · +${economy.prediction.active.stake * economy.prediction.active.multiplier} P` : economy.prediction.active.status === "lost" ? `예측 실패 · ${economy.prediction.active.multiplier}배 · -${economy.prediction.active.reservedAmount} P` : economy.prediction.active.status === "refunded" ? `대국 무효 · ${economy.prediction.active.reservedAmount} P 반환` : `${economy.prediction.active.multiplier}배 정산 중…`}
          </p>}
          <div className="old-maid-result-actions">
            {presentationOnly ? <button className="old-maid-primary" onClick={onReplay}><IconRefresh /> 처음부터 다시 보기</button> : <>
              <button onClick={() => returnToReady(true)}><IconRefresh /> 다시하기</button>
              <button className="old-maid-primary" onClick={() => returnToReady(false)}>상대 다시 고르기</button>
            </>}
          </div>
        </div>}
      </div>

      {renderProgressControls("desktop")}

      <GameLog state={state} faces={faces} nameOf={nameOf} revealCpuDraws={state.mode === "spectate" || humanFinishedWatching} />

      {state.mode === "spectate" && state.status !== "ready" ? <SpectatorSeat state={state} name={nameOf("player")} character={characters.get(state.spectatorCharacterId ?? "")} reaction={state.status === "revealing" || state.status === "discarding" ? state.reactions.player : selectAmbientReaction(cartridge, state, "player")} portrait={assets[(state.status === "complete" && state.loserId === "player" ? characters.get(state.spectatorCharacterId ?? "")?.despairPortrait : characters.get(state.spectatorCharacterId ?? "")?.portraits[state.status === "revealing" || state.status === "discarding" ? state.reactions.player : selectAmbientReaction(cartridge, state, "player")]) ?? ""] ?? null} cards={cards} faces={faces} assets={assets} speech={speeches.find((item) => item.seatId === "player") ?? null} onDetail={setDetail} /> : <section className={`old-maid-player ${state.currentPlayerId === "player" && state.status === "playing" ? "active" : ""}`} data-deal-target="player">
        <div><strong>플레이어</strong><span>{state.status === "ready" ? "배분 전" : state.status === "dealing" ? "배분 중" : `${state.hands.player.length}장`}</span></div>
        <div className="old-maid-player-hand" aria-label="내 손패" ref={playerHandRef}>
          {handVisible && state.hands.player.map((cardId, index) => { const card = cards.get(cardId); const face = card ? faces.get(card.faceId) : null; const currentOfferReorder = state.status === "offering" && state.offer?.phase === "arranging" && state.offer.targetId === "player" && state.mode === "play" && state.offer.reorderCount < 3; const legacyReorder = !usesOfferFlow(state.version) && state.status === "playing" && state.currentPlayerId === "player" && state.mode === "play" && (state.lastReorder?.turn !== state.turn || state.lastReorder.count < 3); const canReorder = currentOfferReorder || legacyReorder; return face ? <button key={cardId} data-card-id={cardId} className={`old-maid-card-button ${discardableIds.has(cardId) ? "discardable" : ""} ${reorderFrom === index ? "reordering" : ""}`} draggable={canReorder} onDragStart={(event) => event.dataTransfer.setData("text/old-maid-index", String(index))} onDragOver={(event) => { if (canReorder) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/old-maid-index")); if (canReorder && Number.isInteger(from) && from !== index) reorderPlayerHand(from, index); }} onPointerDown={(event) => { if (!canReorder || event.pointerType === "mouse") return; longPressRef.current = window.setTimeout(() => setReorderFrom(index), 450); }} onPointerUp={() => { if (longPressRef.current !== null) window.clearTimeout(longPressRef.current); longPressRef.current = null; }} onKeyDown={(event) => { if (!canReorder || event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const to = Math.max(0, Math.min(state.hands.player.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1))); if (to !== index) reorderPlayerHand(index, to); }} onClick={() => { if (reorderFrom !== null && canReorder) { if (reorderFrom !== index) reorderPlayerHand(reorderFrom, index); setReorderFrom(null); } else setDetail(face); }} aria-label={`${face.name} 크게 보기${canReorder ? ", 좌우 화살표로 재배열" : ""}`}><CardFace face={face} assets={assets} odd={face.id === cartridge.oddFaceId} /></button> : null; })}
          {handVisible && state.status === "offering" && state.offer?.targetId === "player" && state.mode === "play" && <small className="old-maid-reorder-budget">손패 재배열 {Math.max(0, 3 - state.offer.reorderCount)}회 남음</small>}
          {handVisible && !usesOfferFlow(state.version) && state.status === "playing" && state.currentPlayerId === "player" && state.mode === "play" && <small className="old-maid-reorder-budget">손패 재배열 {Math.max(0, 3 - (state.lastReorder?.turn === state.turn ? state.lastReorder.count : 0))}회 남음</small>}
          {handVisible && state.hands.player.length === 0 && <span className="old-maid-safe"><IconCheck /> 손패를 모두 비웠습니다{humanFinishedWatching ? " · 남은 경기를 관전 중" : ""}</span>}
          {(state.status === "ready" || state.status === "dealing") && <span className="old-maid-hand-placeholder">{state.status === "ready" ? "시작하면 이곳에 내 카드가 놓입니다." : "카드가 날아오고 있습니다…"}</span>}
        </div>
      </section>}

      {state.status === "dealing" && <DealingAnimation state={state} paused={paused} onComplete={() => dispatch({ type: "finish_deal" })} />}
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
    {showHand && !hidden && !safe && <div className="old-maid-spectator-hand" aria-label={`${name}의 공개된 손패`}>{state.hands[seatId].map((cardId) => { const face = faces.get(cards.get(cardId)?.faceId ?? ""); return face ? <button key={cardId} onClick={() => onDetail(face)}><CardFace face={face} assets={assets} odd={face.id === "joker"} /></button> : null; })}</div>}
  </article>;
}

function SpectatorSeat({ state, name, character, reaction, portrait, cards, faces, assets, speech, onDetail }: { state: OldMaidState; name: string; character: OldMaidCartridge["characters"][number] | undefined; reaction: string; portrait: string | null; cards: Map<string, { faceId: string }>; faces: Map<string, OldMaidFace>; assets: Readonly<Record<string, string>>; speech: DisplayedSpeech | null; onDetail(face: OldMaidFace): void }) {
  const safe = state.safeOrder.includes("player");
  return <article className={`old-maid-player old-maid-spectator-seat seat-player ${state.currentPlayerId === "player" && state.status === "playing" ? "active" : ""} ${safe ? "safe" : ""} ${speech ? "speaking" : ""}`} data-deal-target="player">
    {speech && <div className="old-maid-speech" data-line-id={speech.line.id} data-beat={speech.beat} key={`${speech.line.id}:${speech.beat}:${speech.revision}`}><p>{speech.line.text[speech.beat]}</p></div>}
    <div className="old-maid-spectator-profile"><div className="old-maid-seat-portrait">{portrait ? <img src={portrait} alt={`${name}의 현재 표정`} decoding="async" /> : <span>{name}</span>}</div><div><strong>{name}</strong><em className={`old-maid-reaction-text ${reaction}`}>{reactionLabel(reaction)}</em><span>{state.status === "dealing" ? "배분 중" : safe ? "손패 비움" : `${state.hands.player.length}장`}</span></div></div>
    <span className="old-maid-spectator-label">관전 좌석 · 이번 판 반응 {tellStyleLabel(character?.tellStyle)}</span>
    {state.status !== "dealing" && !safe && <div className="old-maid-spectator-hand old-maid-spectator-bottom-hand" aria-label={`${name}의 관전 손패`}>{state.hands.player.map((cardId) => { const face = faces.get(cards.get(cardId)?.faceId ?? ""); return face ? <button key={cardId} onClick={() => onDetail(face)} aria-label={`${face.name} 크게 보기`}><CardFace face={face} assets={assets} odd={face.id === "joker"} /></button> : null; })}</div>}
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
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return <article className={`old-maid-card face ${odd ? "odd" : ""} ${large ? "large" : ""}`} data-face-id={face.id}>
    {source && !failed ? <img src={source} alt="" decoding="async" onError={() => setFailed(true)} /> : <div className="old-maid-void"><span>THE</span><b>{odd ? "JOKER" : "CARD"}</b><i>?</i></div>}
    <strong>{face.name}</strong>
  </article>;
}

function CardDetail({ face, assets, odd, onClose }: { face: OldMaidFace; assets: Readonly<Record<string, string>>; odd: boolean; onClose(): void }) {
  return <div className="old-maid-modal" role="dialog" aria-modal="true" aria-labelledby="old-maid-card-name" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="old-maid-modal-panel"><button className="old-maid-modal-close" onClick={onClose} aria-label="카드 상세 닫기"><IconX /></button><HoloFoil className="old-maid-modal-foil"><CardFace face={face} assets={assets} odd={odd} large /></HoloFoil><h2 id="old-maid-card-name">{face.name}</h2><p>{odd ? "짝이 없는 조커입니다. 마지막까지 들고 있으면 집니다." : "같은 그림의 카드 두 장을 모으면 자동으로 버립니다."}</p></div>
  </div>;
}

interface DrawFlightOrigin {
  cardId: string;
  rect: { left: number; top: number; width: number; height: number };
}

function captureDrawOrigin(cardId: string): DrawFlightOrigin | null {
  const candidates = [...document.querySelectorAll<HTMLElement>("[data-card-id]")];
  const element = candidates.find((candidate) => candidate.dataset.cardId === cardId && candidate.closest(".old-maid-offer-stage"))
    ?? candidates.find((candidate) => candidate.dataset.cardId === cardId && candidate.closest(".old-maid-player-hand"))
    ?? candidates.find((candidate) => candidate.dataset.cardId === cardId);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { cardId, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
}

function DrawReveal({ event, face, assets, actorName, targetName, origin, centerReveal, sourceFaceVisible, paused, onCollect }: { event: NonNullable<OldMaidState["pendingDraw"]>; face: OldMaidFace; assets: Readonly<Record<string, string>>; actorName: string; targetName: string; origin: DrawFlightOrigin | null; centerReveal: boolean; sourceFaceVisible: boolean; paused: boolean; onCollect(): void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const centerTransformRef = useRef("translate(0,0) scale(1)");
  const collectRef = useRef(onCollect);
  const collectingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [revealPhase, setRevealPhase] = useState<"back" | "flipping" | "face" | "collecting">(sourceFaceVisible ? "face" : "back");
  collectRef.current = onCollect;

  useLayoutEffect(() => {
    if (paused) return;
    let revealTimer = 0;
    let revealCompleteTimer = 0;
    let autoTimer = 0;
    const element = cardRef.current;
    const fallback = document.querySelector<HTMLElement>(`[data-deal-target="${event.targetId}"]`)?.getBoundingClientRect();
    const source = origin?.rect ?? fallback;
    if (!element || !source) {
      if (centerReveal) setRevealPhase("face");
      setReady(true);
      autoTimer = window.setTimeout(() => collect(), centerReveal ? 900 : 120);
      return () => window.clearTimeout(autoTimer);
    }
    const resting = element.getBoundingClientRect();
    const sourceTransform = flightTransform(source, resting);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!centerReveal) {
      const destination = document.querySelector<HTMLElement>(`[data-deal-target="${event.actorId}"]`)?.getBoundingClientRect();
      const destinationTransform = destination ? flightTransform(destination, resting, .42) : "translate(0,0) scale(.42)";
      element.animate([
        { transform: sourceTransform, opacity: 1 },
        { transform: destinationTransform, opacity: .45 },
      ], { duration: reducedMotion ? 180 : 420, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
      autoTimer = window.setTimeout(() => collectRef.current(), reducedMotion ? 185 : 425);
      return () => window.clearTimeout(autoTimer);
    }
    const center = document.querySelector<HTMLElement>(".old-maid-center")?.getBoundingClientRect() ?? resting;
    const centerTransform = flightTransform(center, resting, 1);
    centerTransformRef.current = centerTransform;
    element.animate([
      { transform: sourceTransform, opacity: .72 },
      { transform: centerTransform, opacity: 1 },
    ], { duration: reducedMotion ? 220 : 620, easing: "cubic-bezier(.2,.75,.2,1)", fill: "forwards" });
    revealTimer = window.setTimeout(() => {
      if (sourceFaceVisible) {
        setReady(true);
        return;
      }
      setRevealPhase(reducedMotion ? "face" : "flipping");
      if (reducedMotion) setReady(true);
    }, reducedMotion ? 220 : 620);
    if (!sourceFaceVisible && !reducedMotion) revealCompleteTimer = window.setTimeout(() => {
      setRevealPhase("face");
      setReady(true);
    }, 960);
    autoTimer = window.setTimeout(() => collect(), reducedMotion ? 760 : 1_480);
    return () => { window.clearTimeout(revealTimer); window.clearTimeout(revealCompleteTimer); window.clearTimeout(autoTimer); };
  }, [event.cardId, paused]);

  useEffect(() => {
    if (!collecting || paused) return;
    const timer = window.setTimeout(() => collectRef.current(), 440);
    return () => window.clearTimeout(timer);
  }, [collecting, paused]);

  function collect() {
    if (collectingRef.current) return;
    collectingRef.current = true;
    setCollecting(true);
    setRevealPhase("collecting");
    const element = cardRef.current;
    const target = document.querySelector<HTMLElement>(`[data-deal-target="${event.actorId}"]`);
    if (!element || !target) return;
    const resting = { left: 0, top: 0, width: element.offsetWidth, height: element.offsetHeight } as DOMRect;
    const destination = target.getBoundingClientRect();
    try {
      element.animate([
        { transform: centerTransformRef.current, opacity: 1 },
        { transform: flightTransform(destination, resting, .42), opacity: .35 },
      ], { duration: 430, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
    } catch { /* 이동 연출이 불가능해도 판정 단계는 위 타이머로 계속 진행한다. */ }
  }

  const flight = typeof document === "undefined" ? null : createPortal(<div className="old-maid-flight-layer" data-draw-path={centerReveal ? "center" : "direct"} data-card-id={event.cardId} data-reveal-phase={revealPhase} data-source-x={origin ? Math.round(origin.rect.left + origin.rect.width / 2) : undefined} data-source-y={origin ? Math.round(origin.rect.top + origin.rect.height / 2) : undefined} aria-label={`${actorName}${subjectParticle(actorName)} ${targetName}에게서 카드 한 장을 가져갑니다`}><div className="old-maid-flight-card" ref={cardRef}><div className="old-maid-flight-card-inner" data-reveal-phase={revealPhase}><div className="old-maid-flight-side old-maid-flight-back"><CardBack /></div><div className="old-maid-flight-side old-maid-flight-front"><CardFace face={face} assets={assets} odd={face.id === "joker"} /></div></div></div></div>, document.body);

  if (!centerReveal) return flight;

  return <><div className="old-maid-reveal-stage" data-draw-path="center" data-card-id={event.cardId} aria-live="polite"><p><b>{actorName}</b>{subjectParticle(actorName)} {targetName}에게서 한 장을 뽑았습니다</p><div className="old-maid-reveal-card-space" aria-hidden="true" /><strong className="old-maid-revealed-name">{ready ? face.name : "카드 확인 중…"}</strong><span>{collecting ? `${actorName}의 손으로 이동합니다…` : "확인 후 자동으로 손패에 들어갑니다."}</span></div>{flight}</>;
}

function flightTransform(source: { left: number; top: number; width: number; height: number }, resting: DOMRect, forcedScale?: number): string {
  const dx = source.left + source.width / 2 - (resting.left + resting.width / 2);
  const dy = source.top + source.height / 2 - (resting.top + resting.height / 2);
  const scale = forcedScale ?? Math.min(source.width / Math.max(1, resting.width), source.height / Math.max(1, resting.height));
  return `translate(${dx}px,${dy}px) scale(${scale})`;
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

function DiscardStage({ ownerId, ownerName, pairs, cards, faces, assets, playerControls, paused, onDiscard }: { ownerId: OldMaidSeatId; ownerName: string; pairs: [string, string][]; cards: Map<string, { faceId: string }>; faces: Map<string, OldMaidFace>; assets: Readonly<Record<string, string>>; playerControls: boolean; paused: boolean; onDiscard(cardIds: [string, string]): void }) {
  const first = pairs[0] as [string, string];
  const throwingRef = useRef(false);
  const commitTimerRef = useRef(0);
  const [throwingKey, setThrowingKey] = useState<string | null>(null);

  function throwPair(pair: [string, string]) {
    if (throwingRef.current || paused) return;
    throwingRef.current = true;
    const key = pair.join(":");
    setThrowingKey(key);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    commitTimerRef.current = window.setTimeout(() => onDiscard(pair), reduced ? 90 : 180);
  }

  useEffect(() => {
    if (playerControls || paused) return;
    const timer = window.setTimeout(() => throwPair(first), 420);
    return () => window.clearTimeout(timer);
  }, [first[0], first[1], ownerId, playerControls, paused]);
  useEffect(() => {
    if (!paused) return;
    window.clearTimeout(commitTimerRef.current);
    throwingRef.current = false;
    setThrowingKey(null);
  }, [paused]);
  useEffect(() => () => window.clearTimeout(commitTimerRef.current), []);
  return <div className="old-maid-discard-stage" aria-live="polite"><p><b>{ownerName}</b>{playerControls ? "의 손에서 버릴 수 있는 짝입니다" : "이 다음 짝을 버립니다"}</p><div className={`old-maid-discard-options ${throwingKey ? "throwing" : ""}`}>{pairs.map((pair) => { const key = pair.join(":"); const face = faces.get(cards.get(pair[0])?.faceId ?? ""); return face ? <button className={throwingKey === key ? "throwing" : ""} key={key} disabled={!playerControls || paused || Boolean(throwingKey)} onClick={() => throwPair(pair)} aria-label={`${face.name} 두 장 버리기`}><span className="old-maid-discard-pair"><CardFace face={face} assets={assets} odd={false} /><CardFace face={face} assets={assets} odd={false} /></span><strong>{playerControls ? "이 짝 버리기" : `${face.name} 버리는 중…`}</strong></button> : null; })}</div></div>;
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
        "--jitter-x": `${offset.x}px`,
        "--jitter-y": `${offset.y}px`,
        "--jitter-r": `${offset.rotation}deg`,
        "--pile-z": 1,
      } as React.CSSProperties;
      return <div className="old-maid-pile-slot" data-owner={discard.ownerId} style={style} key={`${discard.turn}:${discard.faceId}:${index}`}><div className="old-maid-pile-pair" ref={(node) => { if (node) pairRefs.current.set(index, node); else pairRefs.current.delete(index); }}><CardFace face={face} assets={assets} odd={false} /><CardFace face={face} assets={assets} odd={false} /></div></div>;
    })}
  </div>;
}

function DealingAnimation({ state, paused, onComplete }: { state: OldMaidState; paused: boolean; onComplete(): void }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  useEffect(() => {
    if (paused) return;
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
  }, [state.seed, paused]);
  return <div className="old-maid-deal-layer" ref={layerRef} aria-hidden="true"><div className="old-maid-deck"><span>THE<br />MARGIN</span></div>{state.dealOrder.map((deal, index) => <div className="old-maid-deal-card" key={deal.cardId} style={{ zIndex: 100 + index }}><span>THE<br />MARGIN</span></div>)}</div>;
}

async function preloadMatchImages(cartridge: OldMaidCartridge, state: OldMaidState, characterIds: readonly string[], assets: Readonly<Record<string, string>>): Promise<void> {
  if (typeof Image === "undefined") return;
  const cards = new Map(cartridge.cards.map((card) => [card.id, card]));
  const faces = new Map(cartridge.faces.map((face) => [face.id, face]));
  const characters = new Map(cartridge.characters.map((character) => [character.id, character]));
  const assetIds = new Set<string>();
  for (const cardId of Object.values(state.hands).flat()) {
    const assetId = faces.get(cards.get(cardId)?.faceId ?? "")?.assetId;
    if (assetId) assetIds.add(assetId);
  }
  for (const characterId of characterIds) {
    const character = characters.get(characterId);
    if (!character) continue;
    assetIds.add(character.despairPortrait);
    for (const assetId of Object.values(character.portraits)) assetIds.add(assetId);
  }
  await Promise.all([...assetIds].map((assetId) => assets[assetId]).filter((url): url is string => Boolean(url)).map(preloadImage));
}

function preloadImage(source: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(resolve, 6_000);
    const done = () => { window.clearTimeout(timer); resolve(); };
    image.onload = done;
    image.onerror = done;
    image.src = source;
  });
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
export default OldMaidScreen;
