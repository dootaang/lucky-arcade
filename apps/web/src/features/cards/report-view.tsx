import { IconArrowRight, IconCheck, IconCircuitSwitchOpen, IconInfoCircle, IconX } from "@tabler/icons-react";
import type { StoredCard } from "../../lib/database.ts";
import { Button } from "@lucky-arcade/ui";

export function ReportView({ card, onPlay }: { card: StoredCard; onPlay(): void }) {
  const { report } = card.analyzed, lore = report.cabinets.find((item) => item.cabinetId === "lore-circuit");
  return <div className="report-grid">
    <section className="hero-panel">
      <div><span className="eyebrow">선택한 카트리지</span><h1>{report.card.name}</h1><p>실제 카드 데이터에서 찾은 놀이 재료만 보여줍니다.</p></div>
      <div className="fingerprint" title={report.card.fingerprint}>지문 {report.card.fingerprintShort}</div>
    </section>
    <section className="stat-grid" aria-label="카드 분석 요약">
      <Stat label="로어 기록" value={report.lore.entryCount} detail={`${report.lore.metrics.edges}개 연결`} />
      <Stat label="검증 퍼즐" value={report.lore.verifiedPuzzleCount} detail="실행 판정 재검증" />
      <Stat label="NPC 후보" value={report.npcs.groupCount} detail={`${report.card.assetCount}개 에셋`} />
      <Stat label="도달 가능성" value={`${Math.round(report.lore.metrics.reachableRatio * 100)}%`} detail="로어 연결망" />
    </section>
    <section className="cabinet-card featured">
      <div className="cabinet-symbol"><IconCircuitSwitchOpen size={32} /></div>
      <div><span className="eyebrow">1호 캐비닛</span><h2>로어 회로</h2><p>원문 속 단어를 단서로 삼아 목표 기록까지 이어지는 길을 발굴합니다.</p>
        <ul>{lore?.reasons.map((reason) => <li key={reason}><IconInfoCircle size={16} /> {reason}</li>)}</ul>
      </div>
      <div className="cabinet-action">
        <span className={lore?.available ? "status ok" : "status no"}>{lore?.available ? <IconCheck size={16} /> : <IconX size={16} />}{lore?.available ? "플레이 가능" : "재료 부족"}</span>
        <Button disabled={!lore?.available} onClick={onPlay}>게임 시작 <IconArrowRight size={18} /></Button>
      </div>
    </section>
    <section className="detail-panel"><h2>분석 세부사항</h2><dl>
      <div><dt>그래프 깊이</dt><dd>{report.lore.metrics.dagDepth}</dd></div><div><dt>최단거리 지름</dt><dd>{report.lore.metrics.shortestPathDiameter}</dd></div>
      <div><dt>고립 기록</dt><dd>{Math.round(report.lore.metrics.isolatedRatio * 100)}%</dd></div><div><dt>순환 기록</dt><dd>{Math.round(report.lore.metrics.cyclicRatio * 100)}%</dd></div>
    </dl></section>
  </div>;
}
function Stat({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <article className="stat-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
