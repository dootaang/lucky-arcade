import { useSlideHighlight } from "@lucky-arcade/ui/slide-highlight";
import { WAGER_MULTIPLIERS, leveragedWagerCredit, wagerExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createMatchPairsState, reduceMatchPairs } from "../engine.ts";
import { MATCH_PAIRS_STAKES, type MatchPairsAction, type MatchPairsDifficulty, type MatchPairsFace, type MatchPairsOpponent, type MatchPairsStake, type MatchPairsState } from "../contracts.ts";
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
  busy?: boolean;
  wagerError?: string;
  initialMultiplier?: WagerMultiplier;
  opponentAvailability?: Readonly<Record<string, { available: boolean; label: string; availableAtUtcSecond?: number }>>;
  opponentRecords?: Readonly<Record<string, { played: number; wins: number; losses: number; draws: number }>>;
  onOpponentSelectionChange?(id: string): void;
  onStart?(stake: MatchPairsStake, multiplier: WagerMultiplier): MatchPairsState | Promise<MatchPairsState>;
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
  busy = false,
  wagerError = "",
  initialMultiplier = 2,
  opponentAvailability = {},
  opponentRecords = {},
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
  stateRef.current = state;
  facesRef.current = faces;
  opponentsRef.current = opponents;
  transitionRef.current = onTransition;

  const dispatch = useCallback((action: MatchPairsAction): MatchPairsState => {
    const previous = stateRef.current;
    const next = reduceMatchPairs(facesRef.current, opponentsRef.current, previous, action);
    stateRef.current = next;
    setState(next);
    const transition = transitionRef.current;
    if (transition) {
      const revision = ++saveRevisionRef.current;
      setSaveStatus("saving");
      saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(() => transition(previous, next, action))
        .then(() => { if (saveRevisionRef.current === revision) setSaveStatus("saved"); })
        .catch(() => { if (saveRevisionRef.current === revision) setSaveStatus("error"); });
    }
    return next;
  }, []);

  const faceById = useMemo(() => new Map(faces.map((face) => [face.id, face])), [faces]);
  const opponentById = useMemo(() => new Map(opponents.map((opponent) => [opponent.id, opponent])), [opponents]);
  const opponent = opponentById.get(state.opponentId) ?? opponents[0];
  if (!opponent) throw new Error("match_pairs_opponent_missing");
  const selectedOpponentUnavailable = opponentAvailability[state.opponentId]?.available === false;
  const availableOpponents = opponents.filter((candidate) => opponentAvailability[candidate.id]?.available !== false);
  const boardAssets = useMemo(() => [...new Set(state.cards.map((card) => card.pairId))].map((pairId) => {
    const face = faceById.get(pairId);
    return { pairId, assetId: face?.assetId ?? null, url: face ? assets[face.assetId] ?? null : null };
  }), [assets, faceById, state.cards]);
  const portraitAssetIds = [...Object.values(opponent.portraits), opponent.despairPortrait];
  const portraitAssetId = state.npcReaction === "despair" ? opponent.despairPortrait : opponent.portraits[state.npcReaction];
  const portraitUrl = assets[portraitAssetId] ?? null;
  const portraitUrls = portraitAssetIds.map((assetId) => assets[assetId] ?? null);
  const assetSignature = [...boardAssets.map(({ pairId, assetId, url }) => `${pairId}\u0001${assetId ?? ""}\u0001${url ?? ""}`), ...portraitAssetIds.map((assetId, index) => `${opponent.id}\u0001${assetId}\u0001${portraitUrls[index] ?? ""}`)].join("\u0002");
  const loadStatus = imageLoad.signature === assetSignature ? imageLoad.status : "loading";
  const timersPaused = paused || loadStatus !== "ready";
  pausedRef.current = timersPaused;

  useEffect(() => {
    if (state.status !== "ready" || !selectedOpponentUnavailable) return;
    const candidate = availableOpponents[0];
    if (!candidate || candidate.id === state.opponentId) return;
    dispatch({ type: "select-opponent", opponentId: candidate.id });
    onOpponentSelectionChange?.(candidate.id);
  }, [availableOpponents, dispatch, onOpponentSelectionChange, selectedOpponentUnavailable, state.opponentId, state.status]);

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

  const npcKey = state.status === "playing" && state.currentTurn === "npc" ? `${state.sessionId}:${state.sequence}:${state.openIndexes.length}` : null;
  useEffect(() => {
    npcTimerRef.current?.cancel();
    npcTimerRef.current = null;
    if (!npcKey) return;
    const expectedSequence = stateRef.current.sequence;
    const duration = reducedMotion ? 0 : stateRef.current.openIndexes.length === 0 ? MATCH_PAIRS_NPC_FIRST_REVEAL_MS : MATCH_PAIRS_NPC_SECOND_REVEAL_MS;
    const delay = createPausableDelay(duration, () => {
      const current = stateRef.current;
      if (current.status === "playing" && current.currentTurn === "npc" && current.sequence === expectedSequence) dispatch({ type: "npc-reveal" });
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
    const actor = state.revealActor === "npc" ? opponent.name : "플레이어";
    setAnnouncement(`${actor}: ${matchPairsCoordinate(first!, state.difficulty)}와 ${matchPairsCoordinate(second!, state.difficulty)}${matches ? " 짝맞춤" : " 불일치"}`);
  }, [opponent.name, state.difficulty, state.openIndexes, state.revealActor, state.sequence, state.status]);

  const chooseDifficulty = (difficulty: MatchPairsDifficulty) => {
    if (state.status === "ready" && difficulty !== state.difficulty) dispatch({ type: "restart", seed: state.seed, difficulty, opponentId: state.opponentId });
  };
  const restart = () => dispatch({ type: "restart", seed: createRestartSeed?.(state) ?? `${state.seed}:restart:${state.sequence + 1}`, difficulty: state.difficulty, opponentId: state.opponentId });
  const startGame = () => {
    if (onStart) {
      void Promise.resolve(onStart(selectedStake, selectedMultiplier)).then((next) => { stateRef.current = next; setState(next); }).catch(() => undefined);
      return;
    }
    dispatch({ type: "start", seed: `${state.seed}:local-preview`, stake: selectedStake, wagerId: `local-preview:${state.sequence}` });
  };
  const columns = state.difficulty === "easy" ? 3 : 4;
  const matchedPairIds = new Set(state.matchedPairIds);
  const openIndexes = new Set(state.openIndexes);
  const canPause = state.status === "playing" || state.status === "checking";
  const exposure = wagerExposure(state.status === "ready" ? selectedStake : state.stake ?? selectedStake, selectedMultiplier);
  const leveragedCredit = leveragedWagerCredit(state.stake ?? selectedStake, state.creditAmount, selectedMultiplier);
  const resultTitle = state.outcome === "player" ? "승리했습니다" : state.outcome === "npc" ? `${opponent.name}의 승리` : "무승부입니다";

  return <main className="match-pairs-shell">
    <header className="match-pairs-header">
      {onExit && <button type="button" className="match-pairs-exit" onClick={onExit} aria-label="오락실로 돌아가기">←</button>}
      <div className="match-pairs-title"><span>QUICK TABLE · VERSUS MATCH</span><h1>짝맞추기</h1></div>
      <div className="match-pairs-meters">
        <strong>나 {state.claims.player.length} : {state.claims.npc.length} {opponent.name}</strong>
        <button type="button" onClick={() => setManualPaused((value) => !value)} disabled={!canPause}>{paused ? "계속" : "일시정지"}</button>
        {onTransition && <small aria-live="polite">{saveStatus === "saving" ? "저장 중…" : saveStatus === "error" ? "저장하지 못했습니다" : saveStatus === "saved" ? "저장됨" : ""}</small>}
      </div>
    </header>

    <section className="match-pairs-table" aria-label="짝맞추기 카드판">
      <aside className={`match-pairs-opponent is-${state.npcReaction}`} aria-label={`상대 ${opponent.name}`}>
        {portraitUrl && <img src={portraitUrl} alt="" draggable={false} />}
        <div><b>{opponent.name}</b><span>{state.status === "complete" ? `${state.claims.npc.length}짝` : state.currentTurn === "npc" ? "생각하는 중…" : "당신의 차례"}</span></div>
      </aside>
      <div className="match-pairs-board" data-difficulty={state.difficulty} aria-busy={loadStatus === "loading"}>
        {state.cards.map((card, index) => {
          const coordinate = matchPairsCoordinate(index, state.difficulty);
          const face = faceById.get(card.pairId);
          const url = face ? assets[face.assetId] : undefined;
          const matched = matchedPairIds.has(card.pairId);
          const faceUp = matched || openIndexes.has(index);
          const locked = loadStatus !== "ready" || paused || state.status !== "playing" || state.currentTurn !== "player" || faceUp;
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
        <h2>상대를 고르세요</h2>
        <p>같은 그림 두 장을 찾으면 한 번 더 뒤집습니다. 이름 없이 이미지만 보고 더 많은 짝을 가져가세요.</p>
        <div className="match-pairs-opponent-picker ca-slide" role="list" aria-label="상대 선택" ref={opponentPickerRef}>
          {opponents.map((candidate) => {
            const selected = candidate.id === state.opponentId;
            const thumb = thumbAssets[candidate.portraits.neutral];
            const availability = opponentAvailability[candidate.id];
            const record = opponentRecords[candidate.id];
            const unavailable = !selected && availability?.available === false;
            return <button type="button" role="listitem" key={candidate.id} className={unavailable ? "is-unavailable" : undefined} aria-pressed={selected} aria-disabled={unavailable || undefined} disabled={unavailable} onClick={() => { dispatch({ type: "select-opponent", opponentId: candidate.id }); onOpponentSelectionChange?.(candidate.id); }}>
              {thumb && <img src={thumb} alt="" loading="lazy" />}<span>{candidate.name}</span>
              <small>{selected && !selectedOpponentUnavailable ? "초대 수락" : availability?.label}</small>
              <em>{record ? recordLabel(record) : "첫 대국"}</em>
            </button>;
          })}
        </div>
        <button type="button" className="match-pairs-random" disabled={availableOpponents.length === 0} onClick={() => { randomSelectionRef.current += 1; const candidate = availableOpponents[(state.sequence + randomSelectionRef.current) % availableOpponents.length]; if (candidate) { dispatch({ type: "select-opponent", opponentId: candidate.id }); onOpponentSelectionChange?.(candidate.id); } }}>무작위 상대</button>
        <div className="match-pairs-difficulty" aria-label="난도 선택">
          <button type="button" aria-pressed={state.difficulty === "easy"} onClick={() => chooseDifficulty("easy")}>쉬움 · 6짝</button>
          <button type="button" aria-pressed={state.difficulty === "normal"} onClick={() => chooseDifficulty("normal")}>보통 · 8짝</button>
        </div>
        <div className="match-pairs-wager" aria-label="판돈 선택">
          <div><span>보유 포인트</span><strong>{walletBalance} P</strong></div>
          <div className="match-pairs-stakes">
            {MATCH_PAIRS_STAKES.map((stake) => <button type="button" key={stake} aria-pressed={selectedStake === stake}
              disabled={busy || Boolean(onStart) && walletBalance < wagerExposure(stake, selectedMultiplier)} onClick={() => setSelectedStake(stake)}>{stake} P</button>)}
          </div>
          <div className="match-pairs-multipliers" aria-label="배율 선택">
            {WAGER_MULTIPLIERS.map((multiplier) => <button type="button" key={multiplier} aria-pressed={selectedMultiplier === multiplier}
              disabled={busy || Boolean(onStart) && walletBalance < wagerExposure(selectedStake, multiplier)} onClick={() => setSelectedMultiplier(multiplier)}>{multiplier}배</button>)}
          </div>
          <small>최대 손실 {exposure} P · 승리 시 {Math.round(selectedStake * opponent.winCreditMultiplier * selectedMultiplier)} P 반환 · 무승부는 전액 환불</small>
        </div>
        {wagerError && <p className="match-pairs-wager-error" role="alert">{wagerError}</p>}
        {selectedOpponentUnavailable && <p className="match-pairs-wager-error">선택한 NPC가 다른 테이블에서 게임 중입니다.</p>}
        {loadStatus === "loading" && <p role="status">카드 준비 중…</p>}
        {loadStatus === "error" && <div role="alert"><p>이미지를 준비하지 못했습니다.</p><button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>다시 불러오기</button></div>}
        <button type="button" className="match-pairs-primary" disabled={loadStatus !== "ready" || busy || selectedOpponentUnavailable || Boolean(onStart) && walletBalance < exposure} onClick={startGame}>{busy ? "예약 중…" : `${selectedStake} P · ${selectedMultiplier}배로 시작`}</button>
      </section>}

      {state.status !== "ready" && loadStatus === "error" && <section className="match-pairs-panel" role="alert"><p>이미지를 준비하지 못했습니다. 현재 판은 그대로 유지됩니다.</p><button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>다시 불러오기</button></section>}
      {paused && canPause && <div className="match-pairs-pause-shield" role="status">일시정지됨</div>}
      {state.status === "complete" && <section className="match-pairs-panel match-pairs-result" aria-live="polite">
        <h2>{resultTitle}</h2><p>나 {state.claims.player.length}짝 · {opponent.name} {state.claims.npc.length}짝</p>
        <small className="match-pairs-record">상대 전적 · {recordLabel(opponentRecords[opponent.id])}</small>
        <strong className="match-pairs-credit">{state.outcome === "player" ? `${leveragedCredit} P 반환` : state.outcome === "draw" ? `${exposure} P 환불` : `${exposure} P 손실`}</strong>
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
