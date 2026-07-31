import { useSlideHighlight } from "@lucky-arcade/ui/slide-highlight";
import { WAGER_MULTIPLIERS, leveragedWagerCredit, wagerExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { selectMatchPairsSpeeches, type MatchPairsLine, type MatchPairsSpeech } from "../dialogue.ts";
import { characterIdForMatchPairsActor, createMatchPairsState, isCpuActor, matchPairsWinCreditRate, reduceMatchPairs } from "../engine.ts";
import { MATCH_PAIRS_ACTORS, MATCH_PAIRS_FOCUS_LEVELS, MATCH_PAIRS_STAKES, type MatchPairsAction, type MatchPairsActor, type MatchPairsDifficulty, type MatchPairsFace, type MatchPairsMode, type MatchPairsOpponent, type MatchPairsStake, type MatchPairsState } from "../contracts.ts";
import "./match-pairs.css";

export const MATCH_PAIRS_MISMATCH_HOLD_MS = 800;
export const MATCH_PAIRS_NPC_FIRST_REVEAL_MS = 420;
export const MATCH_PAIRS_NPC_SECOND_REVEAL_MS = 560;
const MATCH_PAIRS_FLIP_MS = 360;

export interface MatchPairsScreenProps {
  faces: readonly MatchPairsFace[];
  opponents: readonly MatchPairsOpponent[];
  assets: Readonly<Record<string, string>>;
  thumbAssets?: Readonly<Record<string, string>>;
  packVersion: string;
  seed: string;
  sessionId: string;
  initialState?: MatchPairsState | null;
  initialDifficulty?: MatchPairsDifficulty;
  initialOpponentId?: string;
  walletBalance?: number;
  wageringEnabled?: boolean;
  busy?: boolean;
  wagerError?: string;
  initialMultiplier?: WagerMultiplier;
  opponentAvailability?: Readonly<Record<string, { available: boolean; label: string; availableAtUtcSecond?: number }>>;
  opponentRecords?: Readonly<Record<string, { played: number; wins: number; losses: number; draws: number }>>;
  lines?: readonly MatchPairsLine[];
  activePrediction?: { predictedCharacterId: string; stake: number; multiplier: number; status: "reserved" | "won" | "lost" | "refunded" } | null;
  onOpponentSelectionChange?(ids: readonly string[]): void;
  onStart?(input: { mode: MatchPairsMode; stake: MatchPairsStake; multiplier: WagerMultiplier; predictedCharacterId?: string }): MatchPairsState | Promise<MatchPairsState>;
  onTransition?(previous: MatchPairsState, next: MatchPairsState, action: MatchPairsAction): void | Promise<void>;
  createRestartSeed?(state: MatchPairsState): string;
  onExit?(): void;
}

export interface PausableDelay {
  readonly remainingMs: number;
  readonly settled: boolean;
  pause(): void;
  resume(): void;
  cancel(): void;
}

interface DelayScheduler { now(): number; set(callback: () => void, delayMs: number): unknown; clear(handle: unknown): void; }
interface DecodableImage { src: string; decoding: "async" | "auto" | "sync"; decode(): Promise<void>; }
interface DisplayedMatchPairsSpeech extends MatchPairsSpeech { beat: number; }

export function MatchPairsScreen({
  faces,
  opponents,
  assets,
  thumbAssets = assets,
  packVersion,
  seed,
  sessionId,
  initialState = null,
  initialDifficulty = "easy",
  initialOpponentId = opponents[0]?.id ?? "",
  walletBalance = 0,
  wageringEnabled = true,
  busy = false,
  wagerError = "",
  initialMultiplier = 2,
  opponentAvailability = {},
  opponentRecords = {},
  lines = [],
  activePrediction = null,
  onOpponentSelectionChange,
  onStart,
  onTransition,
  createRestartSeed,
  onExit,
}: MatchPairsScreenProps) {
  const [state, setState] = useState(() => initialState ?? createMatchPairsState(faces, opponents, packVersion, seed, initialDifficulty, initialOpponentId, sessionId));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [imageLoad, setImageLoad] = useState<{ signature: string | null; status: "loading" | "ready" | "error" }>({ signature: null, status: "loading" });
  const [manualPaused, setManualPaused] = useState(false);
  const opponentPickerRef = useSlideHighlight<HTMLDivElement>();
  const [hiddenPaused, setHiddenPaused] = useState(() => typeof document !== "undefined" && document.hidden);
  const [announcement, setAnnouncement] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selectedStake, setSelectedStake] = useState<MatchPairsStake>(10);
  const [selectedMultiplier, setSelectedMultiplier] = useState<WagerMultiplier>(initialMultiplier);
  const [selectionActor, setSelectionActor] = useState<MatchPairsActor>("npc");
  const [predictedCharacterId, setPredictedCharacterId] = useState<string | null>(initialState?.mode === "spectate" ? initialState.opponentIds.player : null);
  const [speeches, setSpeeches] = useState<Partial<Record<MatchPairsActor, DisplayedMatchPairsSpeech>>>({});
  const reducedMotion = useReducedMotion();
  const paused = manualPaused || hiddenPaused;
  const stateRef = useRef(state);
  const facesRef = useRef(faces);
  const opponentsRef = useRef(opponents);
  const transitionRef = useRef(onTransition);
  const saveQueueRef = useRef(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const pausedRef = useRef(paused);
  const resolutionTimerRef = useRef<PausableDelay | null>(null);
  const npcTimerRef = useRef<PausableDelay | null>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const randomSelectionRef = useRef(0);
  const recentLineIdsRef = useRef<string[]>([]);
  const speechTimersRef = useRef<number[]>([]);
  stateRef.current = state;
  facesRef.current = faces;
  opponentsRef.current = opponents;
  transitionRef.current = onTransition;

  const presentSpeeches = useCallback((previous: MatchPairsState, next: MatchPairsState) => {
    const selectedSpeeches = selectMatchPairsSpeeches(previous, next, opponentsRef.current, lines, recentLineIdsRef.current);
    if (selectedSpeeches.length === 0) return;
    recentLineIdsRef.current = [...recentLineIdsRef.current, ...selectedSpeeches.map((speech) => speech.line.id)].slice(-8);
    for (const timer of speechTimersRef.current) window.clearTimeout(timer);
    speechTimersRef.current = [];
    selectedSpeeches.forEach((speech, index) => {
      const startsAt = previous.status === "ready" ? index * 400 : 0, beatLength = 2_000;
      speech.line.text.forEach((_beat, beat) => speechTimersRef.current.push(window.setTimeout(() => setSpeeches((current) => ({ ...current, [speech.actor]: { ...speech, beat } })), startsAt + beat * beatLength)));
      speechTimersRef.current.push(window.setTimeout(() => setSpeeches((current) => { const copy = { ...current }; delete copy[speech.actor]; return copy; }), startsAt + (speech.line.text.length === 1 ? 2_400 : speech.line.text.length * beatLength)));
    });
  }, [lines]);

  const dispatch = useCallback((action: MatchPairsAction): MatchPairsState => {
    const previous = stateRef.current;
    const next = reduceMatchPairs(facesRef.current, opponentsRef.current, previous, action);
    stateRef.current = next;
    setState(next);
    presentSpeeches(previous, next);
    const transition = transitionRef.current;
    if (transition) {
      const revision = ++saveRevisionRef.current;
      setSaveStatus("saving");
      saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(() => transition(previous, next, action))
        .then(() => { if (saveRevisionRef.current === revision) setSaveStatus("saved"); })
        .catch(() => { if (saveRevisionRef.current === revision) setSaveStatus("error"); });
    }
    return next;
  }, [presentSpeeches]);

  const faceById = useMemo(() => new Map(faces.map((face) => [face.id, face])), [faces]);
  const opponentById = useMemo(() => new Map(opponents.map((opponent) => [opponent.id, opponent])), [opponents]);
  const opponentFor = (actor: MatchPairsActor) => {
    const id = characterIdForMatchPairsActor(state, actor);
    return id ? opponentById.get(id) : undefined;
  };
  const opponent = opponentFor("npc") ?? opponents[0];
  if (!opponent) throw new Error("match_pairs_opponent_missing");
  const selectedCharacterIds = MATCH_PAIRS_ACTORS.flatMap((actor) => state.opponentIds[actor] ? [state.opponentIds[actor] as string] : []);
  const selectedOpponentUnavailable = selectedCharacterIds.some((id) => opponentAvailability[id]?.available === false);
  const availableOpponents = opponents.filter((candidate) => opponentAvailability[candidate.id]?.available !== false);
  const boardAssets = useMemo(() => [...new Set(state.cards.map((card) => card.pairId))].map((pairId) => {
    const face = faceById.get(pairId);
    return { pairId, assetId: face?.assetId ?? null, url: face ? assets[face.assetId] ?? null : null };
  }), [assets, faceById, state.cards]);
  const selectedOpponents = MATCH_PAIRS_ACTORS.flatMap((actor) => {
    const candidate = opponentFor(actor); return candidate ? [{ actor, opponent: candidate }] : [];
  });
  const portraitAssetIds = selectedOpponents.flatMap(({ opponent: candidate }) => [...Object.values(candidate.portraits), candidate.despairPortrait]);
  const portraitUrls = portraitAssetIds.map((assetId) => assets[assetId] ?? null);
  const assetSignature = [...boardAssets.map(({ pairId, assetId, url }) => `${pairId}\u0001${assetId ?? ""}\u0001${url ?? ""}`), ...portraitAssetIds.map((assetId, index) => `${assetId}\u0001${portraitUrls[index] ?? ""}`)].join("\u0002");
  const loadStatus = imageLoad.signature === assetSignature ? imageLoad.status : "loading";
  const timersPaused = paused || loadStatus !== "ready";
  pausedRef.current = timersPaused;

  useEffect(() => {
    if (state.status !== "ready" || !selectedOpponentUnavailable) return;
    const actor = MATCH_PAIRS_ACTORS.find((seat) => {
      const id = state.opponentIds[seat]; return id && opponentAvailability[id]?.available === false;
    });
    if (!actor || state.mode === "play" && actor === "player") return;
    const otherId = state.opponentIds[actor === "player" ? "npc" : "player"];
    const candidate = availableOpponents.find((item) => item.id !== otherId);
    if (!candidate) return;
    const next = dispatch({ type: "select-opponent", opponentId: candidate.id, actor });
    onOpponentSelectionChange?.(selectedCharacterIdsFor(next));
  }, [availableOpponents, dispatch, onOpponentSelectionChange, opponentAvailability, selectedOpponentUnavailable, state.mode, state.opponentIds, state.status]);

  useEffect(() => {
    let active = true;
    setImageLoad({ signature: assetSignature, status: "loading" });
    const urls = [...boardAssets.map(({ url }) => url), ...portraitUrls];
    const boardUrls = boardAssets.map(({ url }) => url);
    if (urls.some((url) => !url) || new Set(boardUrls).size !== boardAssets.length) {
      setImageLoad({ signature: assetSignature, status: "error" });
      return () => { active = false; };
    }
    void preloadMatchPairsImages(urls as string[]).then(
      () => { if (active) setImageLoad({ signature: assetSignature, status: "ready" }); },
      () => { if (active) setImageLoad({ signature: assetSignature, status: "error" }); },
    );
    return () => { active = false; };
  }, [assetSignature, loadAttempt]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setHiddenPaused(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => () => { for (const timer of speechTimersRef.current) window.clearTimeout(timer); }, []);

  const checkingKey = state.status === "checking" ? `${state.sessionId}:${state.sequence}` : null;
  const checkingMatches = state.status === "checking" && state.openIndexes.length === 2
    ? state.cards[state.openIndexes[0]!]?.pairId === state.cards[state.openIndexes[1]!]?.pairId
    : false;
  const resolutionDelay = checkingMatches ? reducedMotion ? 0 : MATCH_PAIRS_FLIP_MS : MATCH_PAIRS_MISMATCH_HOLD_MS;

  useEffect(() => {
    resolutionTimerRef.current?.cancel();
    resolutionTimerRef.current = null;
    if (!checkingKey) return;
    const expectedSequence = stateRef.current.sequence;
    const delay = createPausableDelay(resolutionDelay, () => {
      const current = stateRef.current;
      if (current.status === "checking" && current.sequence === expectedSequence) dispatch({ type: "resolve" });
    });
    resolutionTimerRef.current = delay;
    if (!pausedRef.current) delay.resume();
    return () => { delay.cancel(); if (resolutionTimerRef.current === delay) resolutionTimerRef.current = null; };
  }, [checkingKey, dispatch, resolutionDelay]);

  const npcKey = state.status === "playing" && isCpuActor(state, state.currentTurn) ? `${state.sessionId}:${state.currentTurn}:${state.sequence}:${state.openIndexes.length}` : null;
  useEffect(() => {
    npcTimerRef.current?.cancel();
    npcTimerRef.current = null;
    if (!npcKey) return;
    const expectedSequence = stateRef.current.sequence;
    const duration = reducedMotion ? 0 : stateRef.current.openIndexes.length === 0 ? MATCH_PAIRS_NPC_FIRST_REVEAL_MS : MATCH_PAIRS_NPC_SECOND_REVEAL_MS;
    const delay = createPausableDelay(duration, () => {
      const current = stateRef.current;
      if (current.status === "playing" && isCpuActor(current, current.currentTurn) && current.sequence === expectedSequence) dispatch({ type: "npc-reveal" });
    });
    npcTimerRef.current = delay;
    if (!pausedRef.current) delay.resume();
    return () => { delay.cancel(); if (npcTimerRef.current === delay) npcTimerRef.current = null; };
  }, [dispatch, npcKey, reducedMotion]);

  useEffect(() => {
    for (const delay of [resolutionTimerRef.current, npcTimerRef.current]) {
      if (!delay) continue;
      if (timersPaused) delay.pause(); else delay.resume();
    }
  }, [checkingKey, npcKey, timersPaused]);

  useEffect(() => {
    if (state.status !== "checking" || state.openIndexes.length !== 2) return;
    const [first, second] = state.openIndexes;
    const matches = state.cards[first!]?.pairId === state.cards[second!]?.pairId;
    const actor = state.revealActor === "player" && state.mode === "play" ? "플레이어" : opponentFor(state.revealActor ?? "npc")?.name ?? "NPC";
    setAnnouncement(`${actor}: ${matchPairsCoordinate(first!, state.difficulty)}와 ${matchPairsCoordinate(second!, state.difficulty)}${matches ? " 짝맞춤" : " 불일치"}`);
  }, [opponentById, state.difficulty, state.mode, state.openIndexes, state.opponentIds, state.revealActor, state.sequence, state.status]);

  const chooseDifficulty = (difficulty: MatchPairsDifficulty) => {
    if (state.status === "ready" && difficulty !== state.difficulty) dispatch({ type: "restart", seed: state.seed, difficulty, opponentIds: state.opponentIds });
  };
  const restart = () => dispatch({ type: "restart", seed: createRestartSeed?.(state) ?? `${state.seed}:restart:${state.sequence + 1}`, difficulty: state.difficulty, mode: state.mode, focus: state.focus, opponentIds: state.opponentIds });
  const startGame = () => {
    if (onStart) {
      const previous = stateRef.current;
      void Promise.resolve(onStart({ mode: state.mode, stake: selectedStake, multiplier: selectedMultiplier, ...(state.mode === "spectate" && predictedCharacterId ? { predictedCharacterId } : {}) })).then((next) => { stateRef.current = next; setState(next); presentSpeeches(previous, next); }).catch(() => undefined);
      return;
    }
    dispatch(state.mode === "play" ? { type: "start", seed: `${state.seed}:local-preview`, stake: selectedStake, wagerId: `local-preview:${state.sequence}` } : { type: "start", seed: `${state.seed}:local-preview` });
  };
  const columns = state.difficulty === "easy" ? 3 : 4;
  const matchedPairIds = new Set(state.matchedPairIds);
  const openIndexes = new Set(state.openIndexes);
  const canPause = state.status === "playing" || state.status === "checking";
  const exposure = wagerExposure(state.status === "ready" ? selectedStake : state.stake ?? selectedStake, selectedMultiplier);
  const leveragedCredit = leveragedWagerCredit(state.stake ?? selectedStake, state.creditAmount, selectedMultiplier);
  const actorName = (actor: MatchPairsActor) => actor === "player" && state.mode === "play" ? "나" : opponentFor(actor)?.name ?? "NPC";
  const resultTitle = state.outcome === "draw" ? "무승부입니다" : state.outcome ? `${actorName(state.outcome)}의 승리` : "대국 결과";

  return <main className="match-pairs-shell">
    <header className="match-pairs-header">
      {onExit && <button type="button" className="match-pairs-exit" onClick={onExit} aria-label="오락실로 돌아가기">←</button>}
      <div className="match-pairs-title"><span>QUICK TABLE · {state.mode === "spectate" ? "NPC MATCH" : "VERSUS MATCH"}</span><h1>짝맞추기</h1></div>
      <div className="match-pairs-meters">
        <strong>{actorName("player")} {state.claims.player.length} : {state.claims.npc.length} {actorName("npc")}</strong>
        <button type="button" onClick={() => setManualPaused((value) => !value)} disabled={!canPause}>{paused ? "계속" : "일시정지"}</button>
        {onTransition && <small aria-live="polite">{saveStatus === "saving" ? "저장 중…" : saveStatus === "error" ? "저장하지 못했습니다" : saveStatus === "saved" ? "저장됨" : ""}</small>}
      </div>
    </header>

    <section className="match-pairs-table" aria-label="짝맞추기 카드판">
      <div className={`match-pairs-opponents is-${state.mode}`}>
        {selectedOpponents.map(({ actor, opponent: candidate }) => {
          const reaction = state.reactions[actor];
          const portraitId = reaction === "despair" ? candidate.despairPortrait : candidate.portraits[reaction];
          const speech = speeches[actor];
          return <aside key={actor} className={`match-pairs-opponent seat-${actor} is-${reaction}`} aria-label={`${candidate.name} 좌석`}>
            {speech && <div className="match-pairs-speech" data-line-id={speech.line.id} data-beat={speech.beat}><p>{speech.line.text[speech.beat]}</p></div>}
            {assets[portraitId] && <img src={assets[portraitId]} alt="" draggable={false} />}
            <div><b>{candidate.name}</b><span>{state.status === "complete" ? `${state.claims[actor].length}짝` : state.currentTurn === actor ? "생각하는 중…" : state.mode === "play" ? "당신의 차례" : "상대를 지켜보는 중"}</span></div>
          </aside>;
        })}
      </div>
      <div className="match-pairs-board" data-difficulty={state.difficulty} aria-busy={loadStatus === "loading"}>
        {state.cards.map((card, index) => {
          const coordinate = matchPairsCoordinate(index, state.difficulty);
          const face = faceById.get(card.pairId);
          const url = face ? assets[face.assetId] : undefined;
          const matched = matchedPairIds.has(card.pairId);
          const faceUp = matched || openIndexes.has(index);
          const locked = loadStatus !== "ready" || paused || state.status !== "playing" || state.mode !== "play" || state.currentTurn !== "player" || faceUp;
          return <button type="button" className={`match-pairs-card${matched ? " is-matched" : ""}`} key={card.cardId}
            ref={(node) => { cardRefs.current[index] = node; }} data-face-up={faceUp} aria-disabled={locked}
            aria-label={matched ? `${coordinate} 카드 짝맞춤` : faceUp ? `${coordinate} 카드 앞면` : `${coordinate} 카드 뒤집기`}
            onClick={() => { if (!locked) dispatch({ type: "player-reveal", index }); }}
            onKeyDown={(event) => moveCardFocus(event, index, columns, state.cards.length, cardRefs.current)}>
            <span className="match-pairs-card-inner">
              <span className="match-pairs-card-side match-pairs-card-back" aria-hidden="true"><b>{coordinate}</b><i /></span>
              <span className="match-pairs-card-side match-pairs-card-front" aria-hidden="true"><img {...(url ? { src: url } : {})} alt="" draggable={false} /></span>
            </span>
          </button>;
        })}
      </div>

      {state.status === "ready" && <section className="match-pairs-panel match-pairs-ready-panel" aria-label="게임 준비">
        <h2>{state.mode === "play" ? "상대를 고르세요" : "관전할 두 NPC를 고르세요"}</h2>
        <p>같은 그림 두 장을 찾으면 한 번 더 뒤집습니다. 공개된 카드만 기억해 더 많은 짝을 가져간 쪽이 승리합니다.</p>
        <div className="match-pairs-mode" aria-label="대국 방식">
          <button type="button" aria-pressed={state.mode === "play"} onClick={() => { setSelectionActor("npc"); setPredictedCharacterId(null); const next = dispatch({ type: "set-mode", mode: "play" }); onOpponentSelectionChange?.(selectedCharacterIdsFor(next)); }}>직접 대결</button>
          <button type="button" aria-pressed={state.mode === "spectate"} onClick={() => { setSelectionActor("player"); const next = dispatch({ type: "set-mode", mode: "spectate" }); setPredictedCharacterId(next.opponentIds.player); onOpponentSelectionChange?.(selectedCharacterIdsFor(next)); }}>NPC 대 NPC</button>
        </div>
        {state.mode === "spectate" && <div className="match-pairs-seat-tabs" aria-label="선택할 좌석">
          <button type="button" aria-pressed={selectionActor === "player"} onClick={() => setSelectionActor("player")}>왼쪽 · {actorName("player")}</button>
          <button type="button" aria-pressed={selectionActor === "npc"} onClick={() => setSelectionActor("npc")}>오른쪽 · {actorName("npc")}</button>
        </div>}
        <div className="match-pairs-opponent-picker ca-slide" role="list" aria-label="상대 선택" ref={opponentPickerRef}>
          {opponents.map((candidate) => {
            const selected = candidate.id === state.opponentIds[selectionActor];
            const thumb = thumbAssets[candidate.portraits.neutral];
            const availability = opponentAvailability[candidate.id];
            const record = opponentRecords[candidate.id];
            const otherActor = selectionActor === "player" ? "npc" : "player";
            const duplicate = state.mode === "spectate" && state.opponentIds[otherActor] === candidate.id;
            const unavailable = !selected && (availability?.available === false || duplicate);
            return <button type="button" role="listitem" key={candidate.id} className={unavailable ? "is-unavailable" : undefined} aria-pressed={selected} aria-disabled={unavailable || undefined} disabled={unavailable} onClick={() => { const next = dispatch({ type: "select-opponent", opponentId: candidate.id, actor: selectionActor }); if (state.mode === "spectate" && (!predictedCharacterId || predictedCharacterId === state.opponentIds[selectionActor])) setPredictedCharacterId(next.opponentIds[selectionActor]); onOpponentSelectionChange?.(selectedCharacterIdsFor(next)); }}>
              {thumb && <img src={thumb} alt="" loading="lazy" />}<span>{candidate.name}</span>
              <small>{selected && !selectedOpponentUnavailable ? `기억 난도 ${"★".repeat(candidate.difficultyTier)}` : duplicate ? "다른 좌석" : availability?.label}</small>
              <em>{record ? recordLabel(record) : "첫 대국"}</em>
            </button>;
          })}
        </div>
        <button type="button" className="match-pairs-random" disabled={availableOpponents.length < (state.mode === "spectate" ? 2 : 1)} onClick={() => { randomSelectionRef.current += 1; const next = dispatch({ type: "random-opponents" }); setPredictedCharacterId(next.mode === "spectate" ? next.opponentIds.player : null); onOpponentSelectionChange?.(selectedCharacterIdsFor(next)); }}>무작위 {state.mode === "spectate" ? "대진" : "상대"}</button>
        <div className="match-pairs-difficulty" aria-label="난도 선택">
          <button type="button" aria-pressed={state.difficulty === "easy"} onClick={() => chooseDifficulty("easy")}>쉬움 · 6짝</button>
          <button type="button" aria-pressed={state.difficulty === "normal"} onClick={() => chooseDifficulty("normal")}>보통 · 8짝</button>
        </div>
        <div className="match-pairs-focus" aria-label="NPC 기억 집중도">
          <strong>NPC 기억 집중도</strong>
          {MATCH_PAIRS_FOCUS_LEVELS.map((focus) => <button type="button" key={focus} aria-pressed={state.focus === focus}
            onClick={() => dispatch({ type: "set-focus", focus })}>{focusLabel(focus)}</button>)}
          <small>{focusDescription(state.focus)}</small>
        </div>
        {wageringEnabled && state.mode === "spectate" && <div className="match-pairs-prediction-target" aria-label="승자 예측">
          <strong>누가 이길까요?</strong>
          {MATCH_PAIRS_ACTORS.map((actor) => {
            const characterId = state.opponentIds[actor];
            return characterId && <button type="button" key={actor} aria-pressed={predictedCharacterId === characterId} onClick={() => setPredictedCharacterId(characterId)}>{actorName(actor)}</button>;
          })}
        </div>}
        {wageringEnabled ? <div className="match-pairs-wager" aria-label={state.mode === "spectate" ? "예측 판돈 선택" : "판돈 선택"}>
          <div><span>보유 포인트</span><strong>{walletBalance} P</strong></div>
          <div className="match-pairs-stakes">
            {MATCH_PAIRS_STAKES.map((stake) => <button type="button" key={stake} aria-pressed={selectedStake === stake}
              disabled={busy || Boolean(onStart) && walletBalance < wagerExposure(stake, selectedMultiplier)} onClick={() => setSelectedStake(stake)}>{stake} P</button>)}
          </div>
          <div className="match-pairs-multipliers" aria-label="배율 선택">
            {WAGER_MULTIPLIERS.map((multiplier) => <button type="button" key={multiplier} aria-pressed={selectedMultiplier === multiplier}
              disabled={busy || Boolean(onStart) && walletBalance < wagerExposure(selectedStake, multiplier)} onClick={() => setSelectedMultiplier(multiplier)}>{multiplier}배</button>)}
          </div>
          <small>최대 손실 {exposure} P · {state.mode === "play" ? `승리 시 ${Math.round(selectedStake * matchPairsWinCreditRate(opponent, state.focus) * selectedMultiplier)} P 반환` : `예측 적중 시 ${exposure * 2} P 반환`} · 무승부는 전액 환불</small>
        </div> : <p className="match-pairs-wager-notice">직접 대국은 무료입니다. 예정된 NPC 대국 베팅은 카지노 플로어의 통합 관전 시장에서 받습니다.</p>}
        {wagerError && <p className="match-pairs-wager-error" role="alert">{wagerError}</p>}
        {selectedOpponentUnavailable && <p className="match-pairs-wager-error">선택한 NPC가 다른 테이블에서 게임 중입니다.</p>}
        {loadStatus === "loading" && <p role="status">카드 준비 중…</p>}
        {loadStatus === "error" && <div role="alert"><p>이미지를 준비하지 못했습니다.</p><button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>다시 불러오기</button></div>}
        <button type="button" className="match-pairs-primary" disabled={loadStatus !== "ready" || busy || selectedOpponentUnavailable || wageringEnabled && state.mode === "spectate" && !predictedCharacterId || wageringEnabled && Boolean(onStart) && walletBalance < exposure} onClick={startGame}>{busy ? "준비 중…" : !wageringEnabled ? state.mode === "spectate" ? "NPC 대국 관전" : "대국 시작" : state.mode === "spectate" ? `${selectedStake} P · ${selectedMultiplier}배 예측하고 관전` : `${selectedStake} P · ${selectedMultiplier}배로 시작`}</button>
      </section>}

      {state.status !== "ready" && loadStatus === "error" && <section className="match-pairs-panel" role="alert"><p>이미지를 준비하지 못했습니다. 현재 판은 그대로 유지됩니다.</p><button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>다시 불러오기</button></section>}
      {paused && canPause && <div className="match-pairs-pause-shield" role="status">일시정지됨</div>}
      {state.status === "complete" && <section className="match-pairs-panel match-pairs-result" aria-live="polite">
        <h2>{resultTitle}</h2><p>{actorName("player")} {state.claims.player.length}짝 · {actorName("npc")} {state.claims.npc.length}짝</p>
        {state.mode === "play" && <small className="match-pairs-record">상대 전적 · {recordLabel(opponentRecords[opponent.id])}</small>}
        <strong className="match-pairs-credit">{!wageringEnabled ? state.mode === "spectate" ? "관전 완료" : "대국 완료" : state.mode === "spectate" ? activePrediction ? predictionLabel(activePrediction) : "관전 완료" : state.outcome === "player" ? `${leveragedCredit} P 반환` : state.outcome === "draw" ? `${exposure} P 환불` : `${exposure} P 손실`}</strong>
        <button type="button" className="match-pairs-primary" onClick={restart}>다시하기</button>
      </section>}
      <p className="match-pairs-announcement" aria-live="polite">{announcement}</p>
    </section>
  </main>;
}

function recordLabel(record: { wins: number; losses: number; draws: number } | undefined): string {
  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const draws = record?.draws ?? 0;
  return `${wins}승 ${losses}패${draws > 0 ? ` ${draws}무` : ""}`;
}

function predictionLabel(prediction: NonNullable<MatchPairsScreenProps["activePrediction"]>): string {
  if (prediction.status === "won") return `${prediction.stake * prediction.multiplier * 2} P 반환 · 예측 적중`;
  if (prediction.status === "lost") return `${prediction.stake * prediction.multiplier} P 손실 · 예측 실패`;
  if (prediction.status === "refunded") return `${prediction.stake * prediction.multiplier} P 환불`;
  return "예측 정산 중…";
}
function focusLabel(focus: MatchPairsState["focus"]): string { return focus === "relaxed" ? "느긋함" : focus === "standard" ? "보통" : "날카로움"; }
function focusDescription(focus: MatchPairsState["focus"]): string {
  return focus === "relaxed" ? "기억 용량과 회상이 줄어듭니다. 승리 환급도 낮습니다."
    : focus === "standard" ? "인물별 기억 성격을 그대로 적용합니다."
      : "기억과 관찰이 예리해집니다. 승리 환급도 높습니다.";
}
function selectedCharacterIdsFor(state: Pick<MatchPairsState, "opponentIds">): string[] { return [state.opponentIds.player, state.opponentIds.npc].filter((id): id is string => Boolean(id)); }

export async function preloadMatchPairsImages(urls: readonly string[], createImage?: () => DecodableImage): Promise<void> {
  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.some((url) => typeof url !== "string" || url.length === 0)) throw new Error("match_pairs_image_url_invalid");
  await Promise.all(uniqueUrls.map((url) => createImage ? decodeImage(url, createImage) : decodeImageOnceWhilePending(url)));
}

const pendingImageDecodes = new Map<string, Promise<void>>();
function decodeImageOnceWhilePending(url: string): Promise<void> { const pending = pendingImageDecodes.get(url); if (pending) return pending; const decode = decodeImage(url, defaultImageFactory); pendingImageDecodes.set(url, decode); void decode.then(() => { if (pendingImageDecodes.get(url) === decode) pendingImageDecodes.delete(url); }, () => { if (pendingImageDecodes.get(url) === decode) pendingImageDecodes.delete(url); }); return decode; }
async function decodeImage(url: string, createImage: () => DecodableImage): Promise<void> { const image = createImage(); image.decoding = "async"; image.src = url; await image.decode(); }

export function createPausableDelay(durationMs: number, onComplete: () => void, scheduler: DelayScheduler = defaultDelayScheduler): PausableDelay {
  let remainingMs = Math.max(0, durationMs), startedAt = 0, handle: unknown = null, settled = false, cancelled = false;
  const finish = () => { if (cancelled || settled) return; handle = null; remainingMs = 0; settled = true; onComplete(); };
  return {
    get remainingMs() { return remainingMs; }, get settled() { return settled; },
    pause() { if (handle === null || settled || cancelled) return; scheduler.clear(handle); handle = null; remainingMs = Math.max(0, remainingMs - (scheduler.now() - startedAt)); },
    resume() { if (handle !== null || settled || cancelled) return; if (remainingMs === 0) { finish(); return; } startedAt = scheduler.now(); handle = scheduler.set(finish, remainingMs); },
    cancel() { if (handle !== null) scheduler.clear(handle); handle = null; cancelled = true; },
  };
}

export function matchPairsCoordinate(index: number, difficulty: MatchPairsDifficulty): string { const columns = difficulty === "easy" ? 3 : 4; return `${String.fromCharCode(65 + index % columns)}${Math.floor(index / columns) + 1}`; }
function moveCardFocus(event: KeyboardEvent<HTMLButtonElement>, index: number, columns: number, cardCount: number, refs: readonly (HTMLButtonElement | null)[]): void { const movement = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columns : event.key === "ArrowDown" ? columns : 0; if (!movement) return; const next = index + movement; if (next < 0 || next >= cardCount) return; event.preventDefault(); refs[next]?.focus(); }
function useReducedMotion(): boolean { const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches); useEffect(() => { if (typeof window === "undefined") return; const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReduced(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []); return reduced; }
function defaultImageFactory(): DecodableImage { if (typeof Image === "undefined") throw new Error("match_pairs_image_api_unavailable"); return new Image(); }
const defaultDelayScheduler: DelayScheduler = { now: () => Date.now(), set: (callback, delayMs) => setTimeout(callback, delayMs), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
