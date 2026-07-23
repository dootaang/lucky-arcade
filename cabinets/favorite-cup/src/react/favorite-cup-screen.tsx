import { IconArrowLeft, IconCrown, IconRefresh } from "@tabler/icons-react";
import type { FavoriteCupCandidate, FavoriteCupCartridge } from "@lucky-arcade/contracts";
import { Button } from "@lucky-arcade/ui";
import { useEffect, useMemo, useState } from "react";
import { createFavoriteCupState, reduceFavoriteCup, selectFavoriteCup } from "../index.ts";

export interface FavoriteCupScreenProps {
  cartridge: FavoriteCupCartridge;
  candidates: FavoriteCupCandidate[];
  loadAsset(assetId: string): Promise<string>;
  onExit(): void;
}

export function FavoriteCupScreen({ cartridge, candidates, loadAsset, onExit }: FavoriteCupScreenProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [attempt, setAttempt] = useState(0);
  const seed = `${today}:${attempt}`;
  const initial = useMemo(() => createFavoriteCupState(cartridge, seed, candidates), [cartridge, candidates, seed]);
  const [state, setState] = useState(initial);
  useEffect(() => setState(initial), [initial]);
  const view = selectFavoriteCup(state, cartridge);
  if (view.status === "won" && view.champion) return <main className="game-shell favorite-cup-shell">
    <header className="game-header"><button className="icon-button" onClick={onExit} aria-label="분석 화면으로 돌아가기"><IconArrowLeft /></button><div><span>LUCKY OPENING</span><h1>최애 월드컵</h1></div></header>
    <section className="favorite-result">
      <span className="eyebrow">오늘의 최애</span><IconCrown className="winner-crown" size={48} />
      <Portrait candidate={view.champion} loadAsset={loadAsset} featured />
      <h2>{view.champion.displayName}</h2>
      <div className="favorite-lineup" aria-label="최애 4강">{view.topFour.map((candidate) => <Portrait key={candidate.npcId} candidate={candidate} loadAsset={loadAsset} />)}</div>
      <p>화면을 캡처해 자랑해 보세요. 공유 전 카드 이용 규정을 확인하세요.</p>
      <div className="result-actions"><Button onClick={() => setAttempt((value) => value + 1)}><IconRefresh size={18} /> 새 대진</Button><Button onClick={onExit}>다른 놀이 보기</Button></div>
    </section>
  </main>;
  if (!view.match) return <main className="game-shell"><div className="game-loading">대진을 준비하고 있어요…</div></main>;
  return <main className="game-shell favorite-cup-shell">
    <header className="game-header"><button className="icon-button" onClick={onExit} aria-label="분석 화면으로 돌아가기"><IconArrowLeft /></button><div><span>LUCKY OPENING</span><h1>최애 월드컵</h1></div><div className="game-meters"><span>{view.roundLabel}</span><span><b>{view.progress.completed + 1}</b> / {view.progress.total}</span></div></header>
    {view.todaySelection && <p className="today-selection">인물이 많아 카드 지문과 오늘 날짜로 ‘오늘의 16명’을 골랐습니다.</p>}
    <section className="favorite-versus" aria-label={`${view.match[0].displayName} 대 ${view.match[1].displayName}`}>
      <Choice key={view.match[0].npcId} candidate={view.match[0]} loadAsset={loadAsset} onChoose={() => setState((current) => reduceFavoriteCup(current, view.match?.[0].npcId ?? ""))} />
      <span className="versus-mark">VS</span>
      <Choice key={view.match[1].npcId} candidate={view.match[1]} loadAsset={loadAsset} onChoose={() => setState((current) => reduceFavoriteCup(current, view.match?.[1].npcId ?? ""))} />
    </section>
  </main>;
}

function Choice({ candidate, loadAsset, onChoose }: { candidate: FavoriteCupCandidate; loadAsset(id: string): Promise<string>; onChoose(): void }) {
  return <button className="favorite-choice" onClick={(event) => { event.currentTarget.blur(); onChoose(); }}><Portrait candidate={candidate} loadAsset={loadAsset} featured /><strong>{candidate.displayName}</strong><small>이 인물 선택</small></button>;
}
function Portrait({ candidate, loadAsset, featured = false }: { candidate: FavoriteCupCandidate; loadAsset(id: string): Promise<string>; featured?: boolean }) {
  const [url, setUrl] = useState<string | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => { let alive = true; setUrl(null); setFailed(false); void loadAsset(candidate.representativeAssetId).then((value) => { if (alive) setUrl(value); }).catch(() => { if (alive) setFailed(true); }); return () => { alive = false; }; }, [candidate.representativeAssetId, loadAsset]);
  return <div className={`favorite-portrait ${featured ? "featured" : ""}`}>{url ? <img src={url} alt={candidate.displayName} decoding="async" /> : <span>{failed ? "이미지를 열 수 없어요" : "초상화 준비 중…"}</span>}</div>;
}
