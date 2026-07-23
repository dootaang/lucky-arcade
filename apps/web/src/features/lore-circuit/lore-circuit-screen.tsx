import { IconArrowLeft, IconBulb, IconFlag, IconRefresh, IconRoute } from "@tabler/icons-react";
import type { LoreCircuitCartridge } from "@lucky-arcade/contracts";
import { selectLoreCircuit } from "@lucky-arcade/lore-circuit";
import { Button } from "@lucky-arcade/ui";
import { useLoreSession } from "./use-lore-session.ts";

export function LoreCircuitScreen({ cartridge, onExit }: { cartridge: LoreCircuitCartridge; onExit(): void }) {
  const { runtime, busy, dispatch } = useLoreSession(cartridge);
  if (!runtime) return <main className="game-shell"><div className="game-loading">회로를 준비하고 있어요…</div></main>;
  const view = selectLoreCircuit(runtime.state, cartridge);
  return <main className="game-shell">
    <header className="game-header"><button className="icon-button" onClick={onExit} aria-label="분석 화면으로 돌아가기"><IconArrowLeft /></button><div><span>LUCKY CABINET 01</span><h1>로어 회로</h1></div><div className="game-meters"><span>이동 <b>{view.moves}</b> / 최단 {view.optimalHops}</span><span>실수 <b>{view.mistakes}</b> / 3</span></div></header>
    {view.status === "ready" ? <section className="mission-card"><IconRoute size={48} /><span className="eyebrow">오늘의 발굴 경로</span><h2>“{view.startKeyword}”에서<br />“{view.targetName}”까지</h2><p>열린 기록의 실제 단어를 골라 다음 기록을 한 층씩 깨우세요.</p><Button className="neon-button" onClick={() => dispatch({ type: "start" })} disabled={busy}>회로 가동</Button></section> : <>
      <section className="objective"><IconFlag size={20} /><span>목표 기록</span><strong>{view.targetName}</strong><small>최단 {view.optimalHops}번</small></section>
      <section className="record-grid" aria-live="polite">{view.records.map((record, index) => <article className="lore-record" key={record.id}><span className="record-number">{String(index + 1).padStart(2, "0")}</span><h2>{record.name}</h2><p>{record.content}</p></article>)}</section>
      {view.status === "playing" && <section className="clue-dock"><div><IconBulb size={20} /><span>다음 단서</span><small>원문에서 발견된 연결어만 표시됩니다.</small></div><div className="clue-list">{view.clues.map((clue) => <button key={clue.keyword} disabled={busy} onClick={() => dispatch({ type: "dig", keyword: clue.keyword })}>{clue.keyword}</button>)}</div></section>}
      {(view.status === "won" || view.status === "lost") && <section className={`result-card ${view.status}`}><span className="eyebrow">{view.status === "won" ? "회로 연결 완료" : "탐사 종료"}</span><h2>{view.status === "won" ? `${view.score}점` : "단서를 세 번 놓쳤습니다"}</h2><p>{view.status === "won" ? `최단 ${view.optimalHops}번 경로를 ${view.moves}번 만에 발굴했습니다.` : "같은 시드로 다시 시작하면 같은 경로가 나옵니다."}</p><Button onClick={() => dispatch({ type: "restart" })}><IconRefresh size={18} /> 다시 도전</Button></section>}
    </>}
  </main>;
}
