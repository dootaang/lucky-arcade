import type { MatchPairsActor, MatchPairsState } from "@lucky-arcade/match-pairs";
import type { OldMaidAction, OldMaidSeatId, OldMaidState } from "@lucky-arcade/old-maid";
import type { CasinoSpectatorMarket } from "@lucky-arcade/casino-ledger";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { resolveCasinoSideMarketReplay, type CasinoSideMarketReplay, type MatchPairsSideMarketReplay, type OldMaidSideMarketReplay } from "../../lib/casino-side-market-replay.ts";

const REPLAY_DURATION_MS = 45_000;

export default function CasinoSideMarketReplayView({ market, currentUtcSecond, onClose }: { market: CasinoSpectatorMarket; currentUtcSecond: number; onClose(): void }): React.ReactElement {
  const [replay, setReplay] = useState<CasinoSideMarketReplay>();
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [playbackMs, setPlaybackMs] = useState(0);
  const live = currentUtcSecond < market.settlesAtUtcSecond;
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);
  useEffect(() => {
    let alive = true;
    void resolveCasinoSideMarketReplay(market).then((value) => { if (alive) setReplay(value); }).catch(() => { if (alive) setError("대국 기록을 불러오지 못했습니다."); });
    return () => { alive = false; };
  }, [market.marketId]);
  useEffect(() => {
    if (live || !playing || !replay) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(), elapsed = now - previous; previous = now;
      setPlaybackMs((value) => Math.min(REPLAY_DURATION_MS, value + elapsed * speed));
    }, 100);
    return () => window.clearInterval(timer);
  }, [live, playing, replay, speed]);
  useEffect(() => { if (playbackMs >= REPLAY_DURATION_MS) setPlaying(false); }, [playbackMs]);
  const frameCount = replay?.game.frames.length ?? 0;
  const progress = live
    ? Math.max(0, Math.min(1, (currentUtcSecond - market.startsAtUtcSecond) / (market.settlesAtUtcSecond - market.startsAtUtcSecond)))
    : Math.max(0, Math.min(1, playbackMs / REPLAY_DURATION_MS));
  const frameIndex = frameCount === 0 ? 0 : Math.min(frameCount - 1, Math.floor(progress * frameCount));
  return createPortal(<div className="side-market-replay-backdrop" role="dialog" aria-modal="true" aria-labelledby="side-market-replay-title" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="side-market-replay-modal">
      <header><div><span className="ca-label">CANONICAL MATCH REPLAY</span><h3 id="side-market-replay-title">{market.title} 관전석</h3></div><button type="button" className="ca-ghost-btn" onClick={onClose}>닫기</button></header>
      {!replay && <div className="side-market-replay-loading" role={error ? "alert" : undefined}>{error || "실제 대국 기록을 계산하는 중…"}</div>}
      {replay && <>
        <div className="side-market-replay-status"><strong>{live ? "LIVE · 실시간 동기화" : playbackMs >= REPLAY_DURATION_MS ? "대국 종료" : playing ? "REPLAY · 재생 중" : "일시정지"}</strong><span>{frameIndex + 1} / {frameCount}</span></div>
        {replay.kind === "match-pairs" ? <MatchPairsReplayTable replay={replay} frameIndex={frameIndex} /> : <OldMaidReplayTable replay={replay} frameIndex={frameIndex} />}
        <div className="side-market-replay-controls">
          <input aria-label="대국 진행 위치" type="range" min="0" max="1000" value={Math.round(progress * 1000)} disabled={live}
            onChange={(event) => { setPlaybackMs(Number(event.currentTarget.value) / 1000 * REPLAY_DURATION_MS); setPlaying(false); }} />
          {live ? <span>같은 UTC 시각의 모든 관전자에게 같은 장면이 보입니다.</span> : <>
            <button type="button" onClick={() => { setPlaybackMs(0); setPlaying(true); }}>처음부터</button>
            <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "일시정지" : "계속"}</button>
            <button type="button" onClick={() => setSpeed((value) => value === 1 ? 2 : 1)}>{speed}×</button>
          </>}
        </div>
      </>}
    </section>
  </div>, document.body);
}

function MatchPairsReplayTable({ replay, frameIndex }: { replay: MatchPairsSideMarketReplay; frameIndex: number }): React.ReactElement {
  const frame = replay.game.frames[frameIndex] ?? replay.game.frames[0]!;
  const state = frame.state;
  const faceById = useMemo(() => new Map(replay.faces.map((face) => [face.id, face])), [replay.faces]);
  const opponentById = useMemo(() => new Map(replay.opponents.map((opponent) => [opponent.id, opponent])), [replay.opponents]);
  const name = (actor: MatchPairsActor) => opponentById.get(state.opponentIds[actor] ?? "")?.name ?? "NPC";
  return <div className="side-replay-table pairs-replay-table">
    <div className="side-replay-pairs-seats">{(["player", "npc"] as const).map((actor) => {
      const opponent = opponentById.get(state.opponentIds[actor] ?? ""), reaction = state.reactions[actor];
      const portrait = opponent ? reaction === "despair" ? opponent.despairPortrait : opponent.portraits[reaction] : undefined;
      return <article key={actor} className={`side-replay-seat is-${reaction}${state.currentTurn === actor && state.status !== "complete" ? " is-active" : ""}`}>
        {portrait && replay.assets[portrait] && <img src={replay.assets[portrait]} alt="" />}
        <div><strong>{name(actor)}</strong><span>{state.claims[actor].length}쌍 · {reactionLabel(reaction)}</span></div>
      </article>;
    })}</div>
    <div className="side-replay-pairs-board">{state.cards.map((card, index) => {
      const open = state.openIndexes.includes(index) || state.matchedPairIds.includes(card.pairId);
      const face = faceById.get(card.pairId), image = face ? replay.assets[face.assetId] : undefined;
      return <div key={card.cardId} className={`side-replay-pair-card${open ? " is-open" : ""}${state.matchedPairIds.includes(card.pairId) ? " is-matched" : ""}`}>
        <div className="side-replay-card-inner"><div className="side-replay-card-back">★</div><div className="side-replay-card-front">{image && <img src={image} alt="" />}</div></div>
      </div>;
    })}</div>
    <p className="side-replay-action" key={`${frameIndex}:${frame.action.type}`}>{matchPairsActionLabel(state, name)}</p>
  </div>;
}

function OldMaidReplayTable({ replay, frameIndex }: { replay: OldMaidSideMarketReplay; frameIndex: number }): React.ReactElement {
  const frame = replay.game.frames[frameIndex] ?? replay.game.frames[0]!;
  const state = frame.state;
  const characters = useMemo(() => new Map(replay.cartridge.characters.map((character) => [character.id, character])), [replay.cartridge.characters]);
  const faces = useMemo(() => new Map(replay.cartridge.faces.map((face) => [face.id, face])), [replay.cartridge.faces]);
  const seats = ["cpu-1", "cpu-2", "cpu-3", "player"] as const;
  return <div className="side-replay-table maid-replay-table">
    {seats.map((seat) => {
      const characterId = characterIdAt(state, seat), character = characterId ? characters.get(characterId) : undefined, reaction = state.reactions[seat];
      const portraitId = character ? character.portraits[reaction] : undefined;
      return <article key={seat} className={`side-replay-seat old-maid-seat seat-${seat} is-${reaction}${state.currentPlayerId === seat && state.status !== "complete" ? " is-active" : ""}`}>
        {portraitId && replay.assets[portraitId] && <img src={replay.assets[portraitId]} alt="" />}
        <div><strong>{character?.name ?? "NPC"}</strong><span>{state.hands[seat].length}장 · {reactionLabel(reaction)}</span></div>
        <div className="side-replay-hand" aria-label={`손패 ${state.hands[seat].length}장`}>{state.hands[seat].slice(0, 9).map((cardId) => <i key={cardId}>★</i>)}{state.hands[seat].length > 9 && <b>+{state.hands[seat].length - 9}</b>}</div>
      </article>;
    })}
    <div className="side-replay-maid-center">
      <span>버린 패 {state.discards.length}</span>
      <div>{state.discards.slice(-6).map((discard) => {
        const face = faces.get(discard.faceId), image = face?.assetId ? replay.assets[face.assetId] : undefined;
        return <i key={`${discard.turn}:${discard.ownerId}:${discard.faceId}`}>{image ? <img src={image} alt="" /> : "★"}</i>;
      })}</div>
    </div>
    <p className="side-replay-action" key={`${frameIndex}:${frame.action.type}`}>{oldMaidActionLabel(frame.action, state, characters)}</p>
  </div>;
}

function characterIdAt(state: OldMaidState, seat: OldMaidSeatId): string | null { return seat === "player" ? state.spectatorCharacterId : state.characters[seat]; }
function reactionLabel(reaction: string): string { return reaction === "pleased" ? "만족" : reaction === "tense" ? "긴장" : reaction === "despair" ? "절망" : "침착"; }
function matchPairsActionLabel(state: MatchPairsState, name: (actor: MatchPairsActor) => string): string {
  if (state.status === "complete") return state.outcome === "draw" ? "무승부로 대국이 끝났습니다." : `${name(state.outcome!)} 승리`;
  if (state.status === "checking" && state.revealActor) return `${name(state.revealActor)} · 두 번째 카드를 확인합니다.`;
  return `${name(state.currentTurn)} · 기억을 더듬는 중`;
}
function oldMaidActionLabel(action: OldMaidAction, state: OldMaidState, characters: ReadonlyMap<string, { name: string }>): string {
  const name = (seat: OldMaidSeatId) => characters.get(characterIdAt(state, seat) ?? "")?.name ?? "NPC";
  if (state.status === "complete" && state.loserId) return `${name(state.loserId)} · 마지막 조커를 피하지 못했습니다.`;
  if (action.type === "finish_deal") return "패를 나눴습니다. 첫 짝을 정리합니다.";
  if (action.type === "cpu_draw") return `${name(state.lastDraw?.actorId ?? state.currentPlayerId)} · 상대의 패를 골랐습니다.`;
  if (action.type === "discard_pair") return "같은 얼굴 두 장을 테이블에 버렸습니다.";
  if (action.type === "prepare_cpu_offer" || action.type === "finish_offer") return "뽑기 전에 손패의 위치를 정리합니다.";
  return `${name(state.currentPlayerId)} 차례`;
}
