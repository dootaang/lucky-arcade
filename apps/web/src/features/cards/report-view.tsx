import { IconArrowRight, IconCheck, IconCircuitSwitchOpen, IconHeart, IconInfoCircle, IconShieldCheck, IconX } from "@tabler/icons-react";
import { Button } from "@lucky-arcade/ui";
import type { StoredCard } from "../../lib/database.ts";

export function ReportView({ card, onPlay }: { card: StoredCard; onPlay(cabinetId: string): void }) {
  const { report } = card.analyzed;
  const favorite = report.cabinets.find((item) => item.cabinetId === "favorite-cup");
  const restoration = report.cabinets.find((item) => item.cabinetId === "restoration-crew");
  const lore = report.cabinets.find((item) => item.cabinetId === "lore-circuit");
  return <div className="report-grid">
    <section className="hero-panel"><div><span className="eyebrow">선택한 카트리지</span><h1>{report.card.name}</h1><p>카드에서 실제로 확인한 재료만 놀이에 사용합니다.</p></div><div className="fingerprint" title={report.card.fingerprint}>지문 {report.card.fingerprintShort}</div></section>
    <section className="stat-grid" aria-label="카드 분석 요약"><Stat label="로어 기록" value={report.lore.entryCount} detail={`${report.lore.metrics.edges}개 연결`} /><Stat label="검증 퍼즐" value={report.lore.verifiedPuzzleCount} detail="실행 판정 재검증" /><Stat label="NPC 후보" value={report.npcs.groupCount} detail={`${report.card.assetCount}개 에셋`} /><Stat label="도달 가능성" value={`${Math.round(report.lore.metrics.reachableRatio * 100)}%`} detail="로어 연결망" /></section>
    {favorite && <CabinetCard icon={<IconHeart size={32} />} eyebrow="개봉식" title="최애 월드컵" description="카드 속 인물 두 명 중 더 마음에 드는 쪽을 골라 오늘의 최애를 정합니다." assessment={favorite} onPlay={() => onPlay("favorite-cup")} />}
    {restoration && <CabinetCard icon={<IconShieldCheck size={32} />} eyebrow="첫 게임" title="카드 복구반" description="이름과 초상화 사이에 생긴 이상한 부분을 눌러 원래 기록으로 되돌립니다." assessment={restoration} onPlay={() => onPlay("restoration-crew")} />}
    <section><span className="eyebrow">실험실</span><CabinetCard icon={<IconCircuitSwitchOpen size={32} />} eyebrow="실험 캐비닛" title="로어 회로" description="본문 속 단어를 단서로 다음 기록을 찾아갑니다." assessment={lore} onPlay={() => onPlay("lore-circuit")} /></section>
    <section className="detail-panel"><h2>분석 세부사항</h2><dl><div><dt>그래프 깊이</dt><dd>{report.lore.metrics.dagDepth}</dd></div><div><dt>최단거리 지름</dt><dd>{report.lore.metrics.shortestPathDiameter}</dd></div><div><dt>고립 기록</dt><dd>{Math.round(report.lore.metrics.isolatedRatio * 100)}%</dd></div><div><dt>순환 기록</dt><dd>{Math.round(report.lore.metrics.cyclicRatio * 100)}%</dd></div></dl></section>
  </div>;
}

function CabinetCard({ icon, eyebrow, title, description, assessment, onPlay }: { icon: React.ReactNode; eyebrow: string; title: string; description: string; assessment: { available: boolean; reasons: string[] } | undefined; onPlay(): void }) {
  return <section className="cabinet-card featured"><div className="cabinet-symbol">{icon}</div><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p><ul>{assessment?.reasons.map((reason) => <li key={reason}><IconInfoCircle size={16} /> {reason}</li>)}</ul></div><div className="cabinet-action"><span className={assessment?.available ? "status ok" : "status no"}>{assessment?.available ? <IconCheck size={16} /> : <IconX size={16} />}{assessment?.available ? "플레이 가능" : "재료 부족"}</span><Button disabled={!assessment?.available} onClick={onPlay}>게임 시작 <IconArrowRight size={18} /></Button></div></section>;
}
function Stat({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <article className="stat-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
