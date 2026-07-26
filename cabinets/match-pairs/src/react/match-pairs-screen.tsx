import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createMatchPairsState, reduceMatchPairs } from "../engine.ts";
import type { MatchPairsAction, MatchPairsDifficulty, MatchPairsFace, MatchPairsState } from "../contracts.ts";
import "./match-pairs.css";

export const MATCH_PAIRS_MISMATCH_HOLD_MS = 800;
const MATCH_PAIRS_FLIP_MS = 360;

export interface MatchPairsScreenProps {
  faces: readonly MatchPairsFace[];
  assets: Readonly<Record<string, string>>;
  packVersion: string;
  seed: string;
  sessionId: string;
  initialState?: MatchPairsState | null;
  initialDifficulty?: MatchPairsDifficulty;
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

interface DelayScheduler {
  now(): number;
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

interface DecodableImage {
  src: string;
  decoding: "async" | "auto" | "sync";
  decode(): Promise<void>;
}

export function MatchPairsScreen({
  faces,
  assets,
  packVersion,
  seed,
  sessionId,
  initialState = null,
  initialDifficulty = "easy",
  onTransition,
  createRestartSeed,
  onExit,
}: MatchPairsScreenProps) {
  const [state, setState] = useState(() => initialState ?? createMatchPairsState(faces, packVersion, seed, initialDifficulty, sessionId));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [imageLoad, setImageLoad] = useState<{ signature: string | null; status: "loading" | "ready" | "error" }>({ signature: null, status: "loading" });
  const [manualPaused, setManualPaused] = useState(false);
  const [hiddenPaused, setHiddenPaused] = useState(() => typeof document !== "undefined" && document.hidden);
  const [announcement, setAnnouncement] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const reducedMotion = useReducedMotion();
  const paused = manualPaused || hiddenPaused;
  const stateRef = useRef(state);
  const facesRef = useRef(faces);
  const transitionRef = useRef(onTransition);
  const saveQueueRef = useRef(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const pausedRef = useRef(paused);
  const timerRef = useRef<{ key: string; delay: PausableDelay } | null>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  stateRef.current = state;
  facesRef.current = faces;
  transitionRef.current = onTransition;

  const dispatch = useCallback((action: MatchPairsAction): MatchPairsState => {
    const previous = stateRef.current;
    const next = reduceMatchPairs(facesRef.current, previous, action);
    stateRef.current = next;
    setState(next);
    const transition = transitionRef.current;
    if (transition) {
      const revision = ++saveRevisionRef.current;
      setSaveStatus("saving");
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(() => transition(previous, next, action))
        .then(() => { if (saveRevisionRef.current === revision) setSaveStatus("saved"); })
        .catch(() => { if (saveRevisionRef.current === revision) setSaveStatus("error"); });
    }
    return next;
  }, []);

  const faceById = useMemo(() => new Map(faces.map((face) => [face.id, face])), [faces]);
  const boardAssets = useMemo(() => {
    const pairIds = [...new Set(state.cards.map((card) => card.pairId))];
    return pairIds.map((pairId) => {
      const face = faceById.get(pairId);
      return { pairId, assetId: face?.assetId ?? null, url: face ? assets[face.assetId] ?? null : null };
    });
  }, [assets, faceById, state.cards]);
  const assetSignature = boardAssets.map(({ pairId, assetId, url }) => `${pairId}\u0001${assetId ?? ""}\u0001${url ?? ""}`).join("\u0002");
  const loadStatus = imageLoad.signature === assetSignature ? imageLoad.status : "loading";
  const resolutionPaused = paused || loadStatus !== "ready";
  pausedRef.current = resolutionPaused;

  useEffect(() => {
    let active = true;
    setImageLoad({ signature: assetSignature, status: "loading" });
    const assetIds = boardAssets.map(({ assetId }) => assetId);
    const urls = boardAssets.map(({ url }) => url);
    if (boardAssets.some(({ assetId, url }) => !assetId || !url)
      || new Set(assetIds).size !== boardAssets.length
      || new Set(urls).size !== boardAssets.length) {
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
    if (!checkingKey) {
      timerRef.current?.delay.cancel();
      timerRef.current = null;
      return;
    }
    const expectedSequence = stateRef.current.sequence;
    const delay = createPausableDelay(resolutionDelay, () => {
      const current = stateRef.current;
      if (current.status === "checking" && current.sequence === expectedSequence) dispatch({ type: "resolve" });
    });
    timerRef.current = { key: checkingKey, delay };
    if (!pausedRef.current) delay.resume();
    return () => {
      delay.cancel();
      if (timerRef.current?.delay === delay) timerRef.current = null;
    };
  }, [checkingKey, dispatch, resolutionDelay]);

  useEffect(() => {
    const delay = timerRef.current?.delay;
    if (!delay) return;
    if (resolutionPaused) delay.pause();
    else delay.resume();
  }, [checkingKey, resolutionPaused]);

  useEffect(() => {
    if (state.status !== "checking" || state.openIndexes.length !== 2) return;
    const [first, second] = state.openIndexes;
    const firstCard = state.cards[first!];
    const secondCard = state.cards[second!];
    if (!firstCard || !secondCard) return;
    const firstCoordinate = matchPairsCoordinate(first!, state.difficulty);
    const secondCoordinate = matchPairsCoordinate(second!, state.difficulty);
    setAnnouncement(firstCard.pairId === secondCard.pairId
      ? `${firstCoordinate}과 ${secondCoordinate}의 짝이 맞았습니다`
      : `${firstCoordinate}과 ${secondCoordinate}의 짝이 맞지 않습니다`);
  }, [state.cards, state.difficulty, state.openIndexes, state.sequence, state.status]);

  const chooseDifficulty = (difficulty: MatchPairsDifficulty) => {
    if (state.status === "ready" && difficulty !== state.difficulty) dispatch({ type: "restart", seed: state.seed, difficulty });
  };
  const restart = () => dispatch({
    type: "restart",
    seed: createRestartSeed?.(state) ?? `${state.seed}:restart:${state.sequence + 1}`,
    difficulty: state.difficulty,
  });
  const columns = state.difficulty === "easy" ? 3 : 4;
  const matchedPairIds = new Set(state.matchedPairIds);
  const openIndexes = new Set(state.openIndexes);
  const canPause = state.status === "playing" || state.status === "checking";

  return <main className="match-pairs-shell">
    <header className="match-pairs-header">
      {onExit && <button type="button" className="match-pairs-exit" onClick={onExit} aria-label="오락실로 돌아가기">←</button>}
      <div className="match-pairs-title"><span>QUICK TABLE · IMAGE MATCH</span><h1>짝맞추기</h1></div>
      <div className="match-pairs-meters">
        <strong>시도 {state.attempts}회</strong>
        <button type="button" onClick={() => setManualPaused((value) => !value)} disabled={!canPause}>{paused ? "계속" : "일시정지"}</button>
        {onTransition && <small aria-live="polite">{saveStatus === "saving" ? "저장 중…" : saveStatus === "error" ? "저장하지 못했습니다" : saveStatus === "saved" ? "저장됨" : ""}</small>}
      </div>
    </header>

    <section className="match-pairs-table" aria-label="짝맞추기 카드판">
      <div className="match-pairs-board" data-difficulty={state.difficulty} aria-busy={loadStatus === "loading"}>
        {state.cards.map((card, index) => {
          const coordinate = matchPairsCoordinate(index, state.difficulty);
          const face = faceById.get(card.pairId);
          const url = face ? assets[face.assetId] : undefined;
          const matched = matchedPairIds.has(card.pairId);
          const faceUp = matched || openIndexes.has(index);
          const locked = loadStatus !== "ready" || paused || state.status !== "playing" || faceUp;
          return <button
            type="button"
            className={`match-pairs-card${matched ? " is-matched" : ""}`}
            key={card.cardId}
            ref={(node) => { cardRefs.current[index] = node; }}
            data-face-up={faceUp}
            aria-disabled={locked}
            aria-label={matched ? `${coordinate} 카드 짝 맞음` : faceUp ? `${coordinate} 카드 앞면` : `${coordinate} 카드 뒤집기`}
            onClick={() => { if (!locked) dispatch({ type: "reveal", index }); }}
            onKeyDown={(event) => moveCardFocus(event, index, columns, state.cards.length, cardRefs.current)}
          >
            <span className="match-pairs-card-inner">
              <span className="match-pairs-card-side match-pairs-card-back" aria-hidden="true"><b>{coordinate}</b><i /></span>
              <span className="match-pairs-card-side match-pairs-card-front" aria-hidden="true">
                <img {...(url ? { src: url } : {})} alt="" draggable={false} />
              </span>
            </span>
          </button>;
        })}
      </div>

      {state.status === "ready" && <section className="match-pairs-panel match-pairs-ready-panel" aria-label="게임 준비">
        <p>같은 그림 두 장을 찾아 모든 짝을 맞춰 보세요.</p>
        <div className="match-pairs-difficulty" aria-label="난도 선택">
          <button type="button" aria-pressed={state.difficulty === "easy"} onClick={() => chooseDifficulty("easy")}>쉬움 · 6쌍</button>
          <button type="button" aria-pressed={state.difficulty === "normal"} onClick={() => chooseDifficulty("normal")}>보통 · 8쌍</button>
        </div>
        {loadStatus === "loading" && <p role="status">이미지 준비 중…</p>}
        {loadStatus === "error" && <div role="alert"><p>이미지를 준비하지 못했습니다. 같은 보드로 다시 시도할 수 있습니다.</p><button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>같은 보드 다시 시도</button></div>}
        <button type="button" className="match-pairs-primary" disabled={loadStatus !== "ready"} onClick={() => dispatch({ type: "start" })}>시작</button>
      </section>}

      {state.status !== "ready" && loadStatus === "error" && <section className="match-pairs-panel" role="alert">
        <p>이미지를 준비하지 못했습니다. 현재 보드는 그대로 유지됩니다.</p>
        <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>같은 보드 다시 시도</button>
      </section>}
      {paused && canPause && <div className="match-pairs-pause-shield" role="status">일시정지됨</div>}
      {state.status === "complete" && <section className="match-pairs-panel match-pairs-result" aria-live="polite">
        <h2>모든 짝을 찾았습니다</h2>
        <p>시도 {state.attempts}회</p>
        <button type="button" className="match-pairs-primary" onClick={restart}>다시하기</button>
      </section>}
      <p className="match-pairs-announcement" aria-live="polite">{announcement}</p>
    </section>
  </main>;
}

export async function preloadMatchPairsImages(
  urls: readonly string[],
  createImage?: () => DecodableImage,
): Promise<void> {
  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.some((url) => typeof url !== "string" || url.length === 0)) throw new Error("match_pairs_image_url_invalid");
  await Promise.all(uniqueUrls.map((url) => createImage ? decodeImage(url, createImage) : decodeImageOnceWhilePending(url)));
}

const pendingImageDecodes = new Map<string, Promise<void>>();

function decodeImageOnceWhilePending(url: string): Promise<void> {
  const pending = pendingImageDecodes.get(url);
  if (pending) return pending;
  const decode = decodeImage(url, defaultImageFactory);
  pendingImageDecodes.set(url, decode);
  void decode.then(
    () => { if (pendingImageDecodes.get(url) === decode) pendingImageDecodes.delete(url); },
    () => { if (pendingImageDecodes.get(url) === decode) pendingImageDecodes.delete(url); },
  );
  return decode;
}

async function decodeImage(url: string, createImage: () => DecodableImage): Promise<void> {
  const image = createImage();
  image.decoding = "async";
  image.src = url;
  await image.decode();
}

export function createPausableDelay(
  durationMs: number,
  onComplete: () => void,
  scheduler: DelayScheduler = defaultDelayScheduler,
): PausableDelay {
  let remainingMs = Math.max(0, durationMs);
  let startedAt = 0;
  let handle: unknown = null;
  let settled = false;
  let cancelled = false;
  const finish = () => {
    if (cancelled || settled) return;
    handle = null;
    remainingMs = 0;
    settled = true;
    onComplete();
  };
  return {
    get remainingMs() { return remainingMs; },
    get settled() { return settled; },
    pause() {
      if (handle === null || settled || cancelled) return;
      scheduler.clear(handle);
      handle = null;
      remainingMs = Math.max(0, remainingMs - (scheduler.now() - startedAt));
    },
    resume() {
      if (handle !== null || settled || cancelled) return;
      if (remainingMs === 0) { finish(); return; }
      startedAt = scheduler.now();
      handle = scheduler.set(finish, remainingMs);
    },
    cancel() {
      if (handle !== null) scheduler.clear(handle);
      handle = null;
      cancelled = true;
    },
  };
}

export function matchPairsCoordinate(index: number, difficulty: MatchPairsDifficulty): string {
  const columns = difficulty === "easy" ? 3 : 4;
  const column = String.fromCharCode(65 + index % columns);
  const row = Math.floor(index / columns) + 1;
  return `${column}${row}`;
}

function moveCardFocus(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  columns: number,
  cardCount: number,
  refs: readonly (HTMLButtonElement | null)[],
): void {
  const movement = event.key === "ArrowLeft" ? -1
    : event.key === "ArrowRight" ? 1
      : event.key === "ArrowUp" ? -columns
        : event.key === "ArrowDown" ? columns
          : 0;
  if (movement === 0) return;
  const next = index + movement;
  if (next < 0 || next >= cardCount) return;
  event.preventDefault();
  refs[next]?.focus();
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

function defaultImageFactory(): DecodableImage {
  if (typeof Image === "undefined") throw new Error("match_pairs_image_api_unavailable");
  return new Image();
}

const defaultDelayScheduler: DelayScheduler = {
  now: () => Date.now(),
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
