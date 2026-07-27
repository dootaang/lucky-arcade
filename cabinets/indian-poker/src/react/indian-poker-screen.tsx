import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { PlayingCardBack, StandardPlayingCard, type CourtAtlas, type StandardPlayingCardId } from "@lucky-arcade/ui/playing-card";
import { useSlideHighlight } from "@lucky-arcade/ui/slide-highlight";
import { WAGER_MULTIPLIERS, leveragedWagerCredit, wagerExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { createIndianPokerState, indianPokerRanking, reduceIndianPoker } from "../engine.ts";
import { INDIAN_POKER_ROUNDS, INDIAN_POKER_STAKES, type IndianPokerAction, type IndianPokerCartridge, type IndianPokerStake, type IndianPokerState } from "../contracts.ts";
import "./indian-poker.css";

export interface IndianPokerScreenProps {
  cartridge: IndianPokerCartridge;
  assets: Readonly<Record<string, string>>;
  thumbAssets: Readonly<Record<string, string>>;
  atlas: CourtAtlas;
  initialState: IndianPokerState | null;
  walletBalance?: number;
  busy?: boolean;
  error?: string;
  initialMultiplier?: WagerMultiplier;
  opponentAvailability?: Readonly<Record<string, { available: boolean; label: string; availableAtUtcSecond?: number }>>;
  opponentRecords?: Readonly<Record<string, { played: number; wins: number; losses: number; draws: number }>>;
  onOpponentSelectionChange?(id: string): void;
  onStart(stake: IndianPokerStake, multiplier: WagerMultiplier): Promise<IndianPokerState>;
  onPersist(previous: IndianPokerState, next: IndianPokerState, action: IndianPokerAction): Promise<void>;
  onExit(): void;
}

export function IndianPokerScreen({ cartridge, assets, thumbAssets, atlas, initialState, walletBalance, busy = false, error, initialMultiplier = 2, opponentAvailability = {}, opponentRecords = {}, onOpponentSelectionChange, onStart, onPersist, onExit }: IndianPokerScreenProps) {
  const [state, setState] = useState(() => initialState ?? createIndianPokerState(cartridge, new Date().toISOString().slice(0, 10)));
  const [stake, setStake] = useState<IndianPokerStake>(INDIAN_POKER_STAKES[0]);
  const [multiplier, setMultiplier] = useState<WagerMultiplier>(initialMultiplier);
  const [starting, setStarting] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const opponentPickerRef = useSlideHighlight<HTMLDivElement>();
  const [hiddenPaused, setHiddenPaused] = useState(() => typeof document !== "undefined" && document.hidden);
  const stateRef = useRef(state), queueRef = useRef(Promise.resolve()), responseDelayRef = useRef<PausableDelay | null>(null);
  const randomSelectionRef = useRef(0);
  const paused = manualPaused || hiddenPaused;
  const characters = useMemo(() => new Map(cartridge.characters.map((character) => [character.id, character])), [cartridge]);
  const opponent = characters.get(state.opponentId) ?? cartridge.characters[0];
  if (!opponent) throw new Error("indian_poker_character_missing");
  const portraitId = opponent.portraits[state.npcReaction];
  const interactionBusy = busy || starting;
  const selectedOpponentUnavailable = opponentAvailability[state.opponentId]?.available === false;
  const availableCharacters = cartridge.characters.filter((character) => opponentAvailability[character.id]?.available !== false);

  const dispatch = (action: IndianPokerAction) => {
    if (interactionBusy) return;
    const previous = stateRef.current, next = reduceIndianPoker(cartridge, previous, action);
    stateRef.current = next; setState(next);
    queueRef.current = queueRef.current.catch(() => undefined).then(() => onPersist(previous, next, action));
  };

  useEffect(() => {
    if (state.status !== "ready" || !selectedOpponentUnavailable) return;
    const candidate = availableCharacters[0];
    if (!candidate || candidate.id === state.opponentId) return;
    dispatch({ type: "select-opponent", opponentId: candidate.id });
    onOpponentSelectionChange?.(candidate.id);
  }, [availableCharacters, onOpponentSelectionChange, selectedOpponentUnavailable, state.opponentId, state.status]);

  const startMatch = () => {
    if (interactionBusy || selectedOpponentUnavailable || (walletBalance ?? 0) < wagerExposure(stake, multiplier)) return;
    setStarting(true);
    queueRef.current = queueRef.current.catch(() => undefined).then(async () => {
      const next = await onStart(stake, multiplier);
      stateRef.current = next; setState(next);
    }).catch(() => undefined).finally(() => setStarting(false));
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setHiddenPaused(document.hidden);
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    responseDelayRef.current?.cancel(); responseDelayRef.current = null;
    if (state.status !== "npc-response" || busy) return;
    const expectedSequence = state.sequence;
    const delay = createPausableDelay(650, () => {
      if (stateRef.current.status === "npc-response" && stateRef.current.sequence === expectedSequence) dispatch({ type: "npc-respond" });
    });
    responseDelayRef.current = delay; if (!paused) delay.resume();
    return () => { delay.cancel(); if (responseDelayRef.current === delay) responseDelayRef.current = null; };
  }, [busy, state.sequence, state.status]);

  useEffect(() => { const delay = responseDelayRef.current; if (!delay) return; if (paused) delay.pause(); else delay.resume(); }, [paused, state.sequence, state.status]);

  useEffect(() => {
    if (typeof Image === "undefined") return;
    for (const id of [...Object.values(opponent.portraits), opponent.despairPortrait]) { const url = assets[id]; if (url) { const image = new Image(); image.decoding = "async"; image.src = url; } }
  }, [assets, opponent]);

  const showdown = state.status === "showdown";
  const lastRound = state.history[state.history.length - 1];
  const canPause = state.status === "player-action" || state.status === "npc-response";
  const result = state.outcome === "player" ? "승리" : state.outcome === "npc" ? `${opponent.name}의 승리` : "무승부";
  const exposure = wagerExposure(state.status === "ready" ? stake : state.stake ?? stake, multiplier);
  const returned = leveragedWagerCredit(state.stake ?? stake, state.creditAmount, multiplier);

  return <main className="indian-poker-shell">
    <header>
      <button onClick={onExit} aria-label="카지노로 돌아가기"><IconArrowLeft /></button>
      <div><span>THE MARGIN · HEADS-UP TABLE</span><h1>인디언 포커</h1></div>
      <div className="indian-poker-meter">{walletBalance !== undefined && <b>{walletBalance.toLocaleString("ko-KR")} P</b>}<strong>{state.round}/{INDIAN_POKER_ROUNDS} 라운드</strong></div>
      <button className="indian-poker-pause" disabled={!canPause} onClick={() => setManualPaused((value) => !value)}>{paused ? "계속" : "일시정지"}</button>
    </header>

    <section className="indian-poker-table">
      <article className={`indian-poker-npc reaction-${state.npcReaction}`}>
        <img src={assets[portraitId]} alt={`${opponent.name}의 ${reactionLabel(state.npcReaction)} 표정`} />
        <div><strong>{opponent.name}</strong><span>{state.npcChips}칩 · {reactionLabel(state.npcReaction)}</span></div>
        <div className="indian-poker-forehead">{state.npcCardId ? <ForeheadCard key={state.npcCardId} id={state.npcCardId} atlas={atlas} revealed /> : <EmptyCard />}</div>
      </article>

      <div className="indian-poker-center">
        {state.status === "ready" && <section className="indian-poker-ready">
          <h2>상대를 고르세요</h2><p>상대 카드는 보이지만 내 카드는 보이지 않습니다. 표정과 베팅을 함께 읽으세요.</p>
          <div className="indian-poker-opponent-picker ca-slide" role="list" aria-label="상대 선택" ref={opponentPickerRef}>
            {cartridge.characters.map((character) => { const selected = character.id === state.opponentId; const availability = opponentAvailability[character.id]; const record = opponentRecords[character.id]; const unavailable = !selected && availability?.available === false; return <button type="button" role="listitem" className={unavailable ? "is-unavailable" : undefined} key={character.id} aria-pressed={selected} aria-disabled={unavailable || undefined} disabled={unavailable} onClick={() => { dispatch({ type: "select-opponent", opponentId: character.id }); onOpponentSelectionChange?.(character.id); }}>
              <img src={thumbAssets[character.portraits.neutral]} alt="" loading="lazy" /><span>{character.name}<small>{selected && !selectedOpponentUnavailable ? "초대 수락" : availability?.label}</small><em>{record ? recordLabel(record) : "첫 대국"}</em></span>
            </button>; })}
          </div>
          <button className="indian-poker-random" disabled={availableCharacters.length === 0} onClick={() => { randomSelectionRef.current += 1; const candidate = availableCharacters[(state.sequence + randomSelectionRef.current) % availableCharacters.length]; if (candidate) { dispatch({ type: "select-opponent", opponentId: candidate.id }); onOpponentSelectionChange?.(candidate.id); } }}>무작위 상대</button>
          <div className="indian-poker-stakes">{INDIAN_POKER_STAKES.map((value) => <button key={value} aria-pressed={stake === value} disabled={interactionBusy || (walletBalance ?? 0) < wagerExposure(value, multiplier)} onClick={() => setStake(value)}>{value} P</button>)}</div>
          <div className="indian-poker-multipliers" aria-label="배율 선택">{WAGER_MULTIPLIERS.map((value) => <button key={value} aria-pressed={multiplier === value} disabled={interactionBusy || (walletBalance ?? 0) < wagerExposure(stake, value)} onClick={() => setMultiplier(value)}>{value}배</button>)}</div>
          <small>{exposure} P를 최대 손실액으로 예약합니다. 종료 시 남은 칩의 순손익도 {multiplier}배입니다.</small>
          {selectedOpponentUnavailable && <p className="indian-poker-availability">선택한 NPC가 다른 테이블에서 게임 중입니다.</p>}
          <button className="primary" disabled={interactionBusy || selectedOpponentUnavailable || (walletBalance ?? 0) < exposure} onClick={startMatch}>시작</button>
        </section>}

        {state.status === "player-action" && <section className="indian-poker-decision">
          <span className="indian-poker-pot">팟 {state.pot}칩</span>
          <h2>{state.npcOpening === "raise" ? `${opponent.name}가 1칩 올렸습니다` : `${opponent.name}가 체크했습니다`}</h2>
          <p>상대는 내 카드를 보고 있습니다. 상대 카드와 표정을 읽고 결정하세요.</p>
          <div className="indian-poker-actions">{state.npcOpening === "raise" ? <>
            <button onClick={() => dispatch({ type: "player-act", action: "fold" })}>폴드</button>
            <button className="primary" disabled={state.playerChips < 1} onClick={() => dispatch({ type: "player-act", action: "call" })}>콜 · 1칩</button>
          </> : <>
            <button onClick={() => dispatch({ type: "player-act", action: "check" })}>체크</button>
            <button className="primary" disabled={state.playerChips < 1} onClick={() => dispatch({ type: "player-act", action: "raise" })}>레이즈 · 1칩</button>
          </>}</div>
        </section>}

        {state.status === "npc-response" && <section><span className="indian-poker-pot">팟 {state.pot}칩</span><h2>{opponent.name}가 당신의 레이즈를 읽는 중…</h2></section>}

        {showdown && lastRound && <section className="indian-poker-round-result">
          <span className="indian-poker-pot">{lastRound.pot}칩 승부</span>
          <h2>{lastRound.winner === "player" ? "라운드 승리" : lastRound.winner === "npc" ? `${opponent.name}의 라운드 승리` : "같은 숫자 · 무승부"}</h2>
          <p>{actionSummary(lastRound.npcOpening, lastRound.playerAction, lastRound.npcResponse)} · 내 칩 {signed(lastRound.playerChipDelta)}</p>
          <button className="primary" onClick={() => dispatch({ type: "next-round" })}>{state.round >= INDIAN_POKER_ROUNDS || state.playerChips === 0 || state.npcChips === 0 ? "최종 결과" : "다음 라운드"}</button>
        </section>}

        {state.status === "complete" && <section className="indian-poker-result">
          <h2>{result}</h2><p>나 {state.playerChips}칩 · {opponent.name} {state.npcChips}칩</p>
          <small className="indian-poker-record">상대 전적 · {recordLabel(opponentRecords[opponent.id])}</small>
          <strong>{returned.toLocaleString("ko-KR")} P 반환 · {multiplier}배</strong>
          <ol>{indianPokerRanking(state).map((standing) => <li key={standing.seatId}><b>{standing.rank}위</b><span>{standing.seatId === "player" ? "플레이어" : opponent.name}</span><em>{standing.chips}칩</em></li>)}</ol>
          <button className="primary" disabled={busy} onClick={() => dispatch({ type: "restart", seed: `${state.seed}:next:${state.sequence}` })}><IconRefresh /> 다시하기</button>
        </section>}
        {error && <p role="alert">{error}</p>}
      </div>

      <article className="indian-poker-player">
        <div><strong>플레이어</strong><span>{state.playerChips}칩</span></div>
        <div className="indian-poker-forehead">{state.playerCardId ? <ForeheadCard key={state.playerCardId} id={state.playerCardId} atlas={atlas} revealed={showdown} /> : <EmptyCard />}</div>
      </article>
      {paused && canPause && <div className="indian-poker-pause-shield" role="status">일시정지됨</div>}
    </section>
  </main>;
}

function recordLabel(record: { wins: number; losses: number; draws: number } | undefined): string {
  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const draws = record?.draws ?? 0;
  return `${wins}승 ${losses}패${draws > 0 ? ` ${draws}무` : ""}`;
}

function ForeheadCard({ id, atlas, revealed }: { id: string; atlas: CourtAtlas; revealed: boolean }) {
  return <div className="indian-poker-card-scene" data-face-up={revealed}><div className="indian-poker-card-inner">
    <div className="indian-poker-card-side indian-poker-card-back"><PlayingCardBack decorative={revealed} label="보이지 않는 내 카드" /></div>
    <div className="indian-poker-card-side indian-poker-card-front"><StandardPlayingCard id={id as StandardPlayingCardId} atlas={atlas} decorative={!revealed} /></div>
  </div></div>;
}
function EmptyCard() { return <div className="indian-poker-card-empty" aria-hidden="true">카드 대기</div>; }
function reactionLabel(reaction: string): string { return reaction === "pleased" ? "여유" : reaction === "tense" ? "긴장" : "무표정"; }
function signed(value: number): string { return `${value >= 0 ? "+" : ""}${value}`; }
function actionSummary(opening: "check" | "raise", player: string, response: string | null): string { return `${opening === "raise" ? "상대 레이즈" : "상대 체크"} · ${player === "raise" ? "내 레이즈" : player === "call" ? "내 콜" : player === "fold" ? "내 폴드" : "내 체크"}${response ? ` · 상대 ${response === "call" ? "콜" : "폴드"}` : ""}`; }

interface PausableDelay { pause(): void; resume(): void; cancel(): void; }
function createPausableDelay(durationMs: number, complete: () => void): PausableDelay {
  let remaining = durationMs, started = 0, handle: ReturnType<typeof setTimeout> | null = null, cancelled = false;
  const finish = () => { if (cancelled) return; handle = null; remaining = 0; complete(); };
  return {
    pause() { if (handle === null) return; clearTimeout(handle); handle = null; remaining = Math.max(0, remaining - (Date.now() - started)); },
    resume() { if (cancelled || handle !== null) return; if (remaining <= 0) { finish(); return; } started = Date.now(); handle = setTimeout(finish, remaining); },
    cancel() { if (handle !== null) clearTimeout(handle); handle = null; cancelled = true; },
  };
}
