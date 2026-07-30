import { IconArrowLeft, IconCrown, IconPlayerPlay, IconRefresh } from "@tabler/icons-react";
import type { FavoriteCupCandidate, FavoriteCupCartridge } from "@lucky-arcade/contracts";
import { createFavoriteCupState, favoriteCupResultHash, reduceFavoriteCup, selectFavoriteCup, type FavoriteCupState } from "@lucky-arcade/favorite-cup";
import { Button } from "@lucky-arcade/ui";
import { useEffect, useMemo, useState } from "react";
import { loadTemerosaContentBundle, toFavoriteCupCartridge, type TemerosaContentBundle } from "../../lib/built-in-content.ts";
import { appendTemerosaFavoriteVote, listTemerosaFavoriteVotes, loadSnapshot, saveSnapshot, type TemerosaFavoriteVoteReceipt } from "../../lib/database.ts";
import {
  TEMEROSA_FAVORITE_PACK_VERSION,
  assetsForMode,
  favoriteAssetUrl,
  loadTemerosaFavoriteManifest,
  selectBalancedFavoriteAssets,
  type TemerosaFavoriteAsset,
  type TemerosaFavoriteManifest,
  type TemerosaFavoriteMode,
} from "../../lib/temerosa-favorite-content.ts";

const SESSION_ID = "temerosa-favorite-cup:marathon";
const CABINET_VERSION = "temerosa-favorite-cup/0.2";
const SEASON_ID = "local-preseason-0";
const SIZE_OPTIONS = [16, 32, 64, 128, 256, 500, 1_000, "all"] as const;
type TournamentSize = (typeof SIZE_OPTIONS)[number];
type SessionEnvelope = {
  contract: "temerosa-favorite-session/0.1";
  packVersion: typeof TEMEROSA_FAVORITE_PACK_VERSION;
  tournamentId: string;
  mode: TemerosaFavoriteMode;
  requestedSize: TournamentSize;
  candidateIds: string[];
  state: FavoriteCupState;
};

const MODE_LABELS: Record<TemerosaFavoriteMode, string> = { character: "인물전", portrait: "세로 일러스트전", square: "아이콘·유물전", landscape: "장소·장면전", all: "전체 이미지전" };
const SOURCE_LABELS = { overture: "오버추어√2", root2: "테메로세√2", bestiaization: "베스티아화", finale: "피날레" } as const;

export default function TemerosaFavoriteCupView({ onExit }: { onExit(): void }) {
  const [bundle, setBundle] = useState<TemerosaContentBundle | null>(null), [manifest, setManifest] = useState<TemerosaFavoriteManifest | null>(null);
  const [session, setSession] = useState<SessionEnvelope | null>(null), [votes, setVotes] = useState<TemerosaFavoriteVoteReceipt[]>([]), [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaContentBundle(), loadTemerosaFavoriteManifest(), loadSnapshot<SessionEnvelope>(SESSION_ID), listTemerosaFavoriteVotes()])
      .then(([loadedBundle, loadedManifest, snapshot, loadedVotes]) => {
        if (!alive) return;
        setBundle(loadedBundle); setManifest(loadedManifest); setVotes(loadedVotes);
        const restored = snapshot?.state;
        if (restored?.contract === "temerosa-favorite-session/0.1" && restored.packVersion === TEMEROSA_FAVORITE_PACK_VERSION && restored.candidateIds.every((id) => candidateExists(id, restored.mode, loadedBundle, loadedManifest))) setSession(restored);
      }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);
  if (error) return <main className="game-shell"><div className="game-loading">테메로세 이미지 대진을 불러오지 못했습니다.<button onClick={onExit}>돌아가기</button></div></main>;
  if (!bundle || !manifest) return <main className="game-shell"><div className="game-loading">1,551개 이미지 대진을 준비하고 있어요…</div></main>;
  if (!session) return <MarathonSetup bundle={bundle} manifest={manifest} votes={votes} onStart={setSession} onExit={onExit} />;
  return <MarathonTournament bundle={bundle} manifest={manifest} session={session} votes={votes} onSession={setSession} onVote={(vote) => setVotes((current) => [...current, vote])} onSetup={() => setSession(null)} onExit={onExit} />;
}

function MarathonSetup({ bundle, manifest, votes, onStart, onExit }: { bundle: TemerosaContentBundle; manifest: TemerosaFavoriteManifest; votes: TemerosaFavoriteVoteReceipt[]; onStart(session: SessionEnvelope): void; onExit(): void }) {
  const [mode, setMode] = useState<TemerosaFavoriteMode>("character"), [size, setSize] = useState<TournamentSize>(16);
  const count = poolCount(mode, bundle, manifest), availableSizes = SIZE_OPTIONS.filter((option) => option === "all" || option <= count);
  useEffect(() => { if (size !== "all" && size > count) setSize(availableSizes.at(-1) ?? 16); }, [availableSizes, count, size]);
  const seen = new Set(votes.flatMap((vote) => [vote.leftAssetId, vote.rightAssetId])).size;
  const start = () => {
    const seed = `${new Date().toISOString()}:${mode}:${size}`, tournamentId = `favorite:${seed}`;
    const built = buildTournament(bundle, manifest, mode, size, seed, tournamentId);
    void persistSession(built); onStart(built);
  };
  return <main className="game-shell favorite-cup-shell favorite-marathon-shell">
    <header className="game-header"><button className="icon-button" onClick={onExit} aria-label="카지노로 돌아가기"><IconArrowLeft /></button><div><span>TEMEROSA FAVORITE MARATHON</span><h1>테메로세 최애 월드컵</h1></div></header>
    <section className="favorite-marathon-setup">
      <div className="favorite-marathon-intro"><span className="eyebrow">4 SERIES · 1,551 IMAGES</span><h2>끝까지 고르면, 하나가 남습니다.</h2><p>정확 중복을 걷어낸 네 시리즈의 유효 이미지 전체가 대진에 들어옵니다. 장기 대진은 선택할 때마다 자동 저장됩니다.</p></div>
      <div className="favorite-mode-grid" aria-label="월드컵 부문">{(["character", "portrait", "square", "landscape", "all"] as const).map((value) => <button key={value} className={mode === value ? "selected" : ""} onClick={() => setMode(value)}><strong>{MODE_LABELS[value]}</strong><span>{poolCount(value, bundle, manifest).toLocaleString()}개 후보</span></button>)}</div>
      <div className="favorite-size-panel"><h3>대진 규모</h3><div className="favorite-size-grid">{availableSizes.map((value) => <button key={String(value)} className={size === value ? "selected" : ""} onClick={() => setSize(value)}>{value === "all" ? `전체 ${count.toLocaleString()}장` : value === 500 || value === 1_000 ? `${value.toLocaleString()}장 끝장전` : `${value}강`}</button>)}</div><p>{choiceCount(size, count).toLocaleString()}번 선택 · 언제든 이어하기 가능</p></div>
      <div className="favorite-local-stats"><span>이 기기에서 누적 선택 <b>{votes.length.toLocaleString()}</b>회</span><span>직접 본 이미지 <b>{seen.toLocaleString()}</b>장</span><span>서버 전송 <b>없음</b></span></div>
      <Button className="favorite-marathon-start" onClick={start}><IconPlayerPlay size={19} /> {size === 500 || size === 1_000 || size === "all" ? "끝장 대진 시작" : "대진 시작"}</Button>
    </section>
  </main>;
}

function MarathonTournament({ bundle, manifest, session, votes, onSession, onVote, onSetup, onExit }: { bundle: TemerosaContentBundle; manifest: TemerosaFavoriteManifest; session: SessionEnvelope; votes: TemerosaFavoriteVoteReceipt[]; onSession(session: SessionEnvelope): void; onVote(vote: TemerosaFavoriteVoteReceipt): void; onSetup(): void; onExit(): void }) {
  const { cartridge, assetByCandidate, groupById } = useMemo(() => restoreCartridge(session, bundle, manifest), [bundle, manifest, session]);
  const view = selectFavoriteCup(session.state, cartridge), remaining = Math.max(0, view.progress.total - view.progress.completed);
  const choose = async (winnerId: string) => {
    const pair = view.match; if (!pair) return;
    const loser = pair[0].npcId === winnerId ? pair[1] : pair[0], winner = pair[0].npcId === winnerId ? pair[0] : pair[1];
    const next = { ...session, state: reduceFavoriteCup(session.state, winnerId) } satisfies SessionEnvelope;
    const vote: TemerosaFavoriteVoteReceipt = {
      contract: "temerosa-favorite-vote/0.1", voteId: `${session.tournamentId}:${session.state.picks.length}`, seasonId: SEASON_ID, tournamentId: session.tournamentId,
      mode: session.mode, leftAssetId: pair[0].representativeAssetId, rightAssetId: pair[1].representativeAssetId,
      winnerAssetId: winner.representativeAssetId, loserAssetId: loser.representativeAssetId, round: session.state.round, seed: session.state.seed, pickedAt: new Date().toISOString(),
    };
    onSession(next); onVote(vote);
    await Promise.all([appendTemerosaFavoriteVote(vote), persistSession(next)]);
  };
  if (view.status === "won" && view.champion) return <main className="game-shell favorite-cup-shell favorite-marathon-shell"><header className="game-header"><button className="icon-button" onClick={onExit} aria-label="카지노로 돌아가기"><IconArrowLeft /></button><div><span>{MODE_LABELS[session.mode]}</span><h1>테메로세 최애 월드컵</h1></div></header><section className="favorite-result"><span className="eyebrow">최종 우승</span><IconCrown className="winner-crown" size={48} /><MarathonPortrait candidate={view.champion} asset={assetByCandidate.get(view.champion.npcId)} bundle={bundle} featured /><h2>{view.champion.displayName}</h2><div className="favorite-lineup" aria-label="최애 4강">{view.topFour.map((candidate) => <MarathonPortrait key={candidate.npcId} candidate={candidate} asset={assetByCandidate.get(candidate.npcId)} bundle={bundle} />)}</div><p>{session.state.entrants.length.toLocaleString()}개 후보 · {session.state.picks.length.toLocaleString()}번 선택 완료</p><div className="result-actions"><Button onClick={onSetup}><IconRefresh size={18} /> 새 대진</Button><Button onClick={onExit}>카지노로 돌아가기</Button></div></section></main>;
  if (!view.match) return <main className="game-shell"><div className="game-loading">다음 대결을 정리하고 있어요…</div></main>;
  const localRates = voteRates(votes);
  return <main className="game-shell favorite-cup-shell favorite-marathon-shell">
    <header className="game-header"><button className="icon-button" onClick={onExit} aria-label="카지노로 돌아가기"><IconArrowLeft /></button><div><span>{MODE_LABELS[session.mode]} · 자동 저장</span><h1>테메로세 최애 월드컵</h1></div><div className="game-meters"><span>{view.roundLabel}</span><span><b>{view.progress.completed + 1}</b> / {view.progress.total}</span></div></header>
    <div className="favorite-marathon-progress"><div style={{ width: `${view.progress.total ? view.progress.completed / view.progress.total * 100 : 100}%` }} /><span>남은 선택 {remaining.toLocaleString()}회</span></div>
    <section className="favorite-versus" aria-label={`${view.match[0].displayName} 대 ${view.match[1].displayName}`}>{view.match.map((candidate, index) => <div className="favorite-marathon-choice-wrap" key={candidate.npcId}><button className="favorite-choice" onClick={() => void choose(candidate.npcId)}><MarathonPortrait candidate={candidate} asset={assetByCandidate.get(candidate.npcId)} bundle={bundle} featured /><strong>{candidate.displayName}</strong><small>{assetByCandidate.get(candidate.npcId) ? SOURCE_LABELS[assetByCandidate.get(candidate.npcId)!.source] : "정본 인물"} · 이 기기 선택률 {formatRate(localRates.get(candidate.representativeAssetId))}</small></button>{index === 0 && <span className="versus-mark">VS</span>}</div>)}</section>
    <div className="favorite-marathon-footer"><button onClick={onSetup}>새 대진 설정</button><span>결과 해시 {favoriteCupResultHash(session.state).slice(0, 10)}</span><span>{Object.keys(groupById).length.toLocaleString()}개 주체 분산</span></div>
  </main>;
}

function buildTournament(bundle: TemerosaContentBundle, manifest: TemerosaFavoriteManifest, mode: TemerosaFavoriteMode, requestedSize: TournamentSize, seed: string, tournamentId: string): SessionEnvelope {
  if (mode === "character") {
    const base = toFavoriteCupCartridge(bundle.arcade), count = requestedSize === "all" ? base.candidates.length : Math.min(requestedSize, base.candidates.length);
    const state = createFavoriteCupState(base, seed, base.candidates, { entrantCount: count });
    return { contract: "temerosa-favorite-session/0.1", packVersion: TEMEROSA_FAVORITE_PACK_VERSION, tournamentId, mode, requestedSize, candidateIds: state.entrants, state };
  }
  const pool = assetsForMode(manifest, mode), count = requestedSize === "all" ? pool.length : requestedSize;
  const selected = selectBalancedFavoriteAssets(pool, count, seed), cartridge = assetCartridge(manifest, selected), groupById = Object.fromEntries(selected.map((asset) => [asset.id, asset.subject.value]));
  const state = createFavoriteCupState(cartridge, seed, cartridge.candidates, { entrantCount: selected.length, groupById });
  return { contract: "temerosa-favorite-session/0.1", packVersion: TEMEROSA_FAVORITE_PACK_VERSION, tournamentId, mode, requestedSize, candidateIds: state.entrants, state };
}

function restoreCartridge(session: SessionEnvelope, bundle: TemerosaContentBundle, manifest: TemerosaFavoriteManifest) {
  if (session.mode === "character") {
    const base = toFavoriteCupCartridge(bundle.arcade), candidates = session.candidateIds.map((id) => base.candidates.find((candidate) => candidate.npcId === id)!).filter(Boolean);
    return { cartridge: { ...base, candidates }, assetByCandidate: new Map<string, TemerosaFavoriteAsset>(), groupById: {} as Record<string, string> };
  }
  const byId = new Map(manifest.assets.map((asset) => [asset.id, asset])), assets = session.candidateIds.map((id) => byId.get(id)!).filter(Boolean);
  return { cartridge: assetCartridge(manifest, assets), assetByCandidate: new Map(assets.map((asset) => [asset.id, asset])), groupById: Object.fromEntries(assets.map((asset) => [asset.id, asset.subject.value])) };
}

function assetCartridge(manifest: TemerosaFavoriteManifest, assets: readonly TemerosaFavoriteAsset[]): FavoriteCupCartridge {
  return { contract: "favorite-cup-cartridge/0.1", cardFingerprint: manifestFingerprint(manifest), cardName: "테메로세", candidates: assets.map((asset) => ({ npcId: asset.id, displayName: asset.sourceName, displayNameSource: "asset-filename", representativeAssetId: asset.id, variantAssetIds: [asset.id], confidence: asset.subject.confidence, evidence: asset.subject.evidence })) };
}

function MarathonPortrait({ candidate, asset, bundle, featured = false }: { candidate: FavoriteCupCandidate; asset: TemerosaFavoriteAsset | undefined; bundle: TemerosaContentBundle; featured?: boolean }) {
  const src = asset ? favoriteAssetUrl(asset) : characterAsset(bundle, candidate);
  return <div className={`favorite-portrait ${featured ? "featured" : ""}`}>{src ? <img src={src} alt={candidate.displayName} decoding="async" /> : <span>이미지를 불러올 수 없어요</span>}</div>;
}

function characterAsset(bundle: TemerosaContentBundle, candidate: FavoriteCupCandidate): string | undefined {
  const split = candidate.representativeAssetId.indexOf(":"), character = bundle.arcade.characters.find((item) => item.id === candidate.representativeAssetId.slice(0, split)), expression = candidate.representativeAssetId.slice(split + 1);
  return character?.assets[expression] ?? character?.assets.natural;
}

async function persistSession(session: SessionEnvelope): Promise<void> {
  await saveSnapshot({ contract: "snapshot-record/0.1", sessionId: SESSION_ID, sequence: session.state.picks.length, state: session, stateHash: favoriteCupResultHash(session.state), engineVersion: "arcade-engine/0.1", cabinetVersion: CABINET_VERSION, packVersion: TEMEROSA_FAVORITE_PACK_VERSION }, { contract: "recent-play/0.1", cabinetId: "temerosa-favorite-cup", sessionId: SESSION_ID, title: "테메로세 최애 월드컵", progressLabel: session.state.status === "won" ? "대진 완료" : `${session.state.picks.length}/${session.state.entrants.length - 1} 선택`, updatedAt: new Date().toISOString() });
}

function candidateExists(id: string, mode: TemerosaFavoriteMode, bundle: TemerosaContentBundle, manifest: TemerosaFavoriteManifest): boolean { return mode === "character" ? bundle.arcade.characters.some((character) => character.id === id) : manifest.assets.some((asset) => asset.id === id); }
function poolCount(mode: TemerosaFavoriteMode, bundle: TemerosaContentBundle, manifest: TemerosaFavoriteManifest): number { return mode === "character" ? bundle.arcade.characters.length : assetsForMode(manifest, mode).length; }
function choiceCount(size: TournamentSize, pool: number): number { return (size === "all" ? pool : Math.min(size, pool)) - 1; }
function manifestFingerprint(manifest: TemerosaFavoriteManifest): string { const block = manifest.assets.slice(0, 8).map((asset) => asset.sourceSha256.slice(0, 8)).join("").padEnd(64, "0"); return block.slice(0, 64); }
function voteRates(votes: readonly TemerosaFavoriteVoteReceipt[]): Map<string, { wins: number; views: number }> { const output = new Map<string, { wins: number; views: number }>(); for (const vote of votes) { for (const id of [vote.leftAssetId, vote.rightAssetId]) { const value = output.get(id) ?? { wins: 0, views: 0 }; value.views += 1; output.set(id, value); } output.get(vote.winnerAssetId)!.wins += 1; } return output; }
function formatRate(value?: { wins: number; views: number }): string { return value?.views ? `${Math.round(value.wins / value.views * 100)}%` : "첫 등장"; }
