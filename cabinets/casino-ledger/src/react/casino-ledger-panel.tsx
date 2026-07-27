import { NumberTicker } from "@lucky-arcade/ui/number-ticker";
import { useEffect, useRef, useState } from "react";
import { casinoLeaderboard } from "../presentation.ts";
import type { CasinoTableId, NpcActivity, NpcPresence } from "../contracts.ts";
import { TEMEROSA_NPC_GAMBLING_PROFILES } from "../temerosa-profiles.ts";
import "./casino-ledger-panel.css";

export interface CasinoLedgerPanelProps {
  npcBalances: Readonly<Record<string, number>>;
  userBalance: number;
  activities: readonly NpcActivity[];
  portraits: Readonly<Record<string, string>>;
  currentUtcMinute: number;
  currentUtcSecond: number;
  clockSource: "http-date" | "device";
  presences: readonly NpcPresence[];
  tables: readonly CasinoLiveTable[];
  onPlay(id: string): void;
}

export interface CasinoLiveTable {
  id: CasinoTableId;
  title: string;
  description: string;
  suit: string;
  entryLabel: string;
  meta: string;
}

export default function CasinoLedgerPanel({
  npcBalances,
  userBalance,
  activities,
  portraits,
  currentUtcMinute,
  currentUtcSecond,
  clockSource,
  presences,
  tables,
  onPlay,
}: CasinoLedgerPanelProps): React.ReactElement {
  const leaderboard = casinoLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES, npcBalances, userBalance);
  const names = new Map(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.name]));
  const previousBalances = useRef(npcBalances);
  const [changedIds, setChangedIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const changed = new Set(Object.keys(npcBalances).filter((id) => previousBalances.current[id] !== npcBalances[id]));
    previousBalances.current = npcBalances;
    if (changed.size === 0) return;
    setChangedIds(changed);
    const timer = window.setTimeout(() => setChangedIds(new Set()), 1_600);
    return () => window.clearTimeout(timer);
  }, [npcBalances]);
  return <>
  <section className="casino-live-grid" aria-label="운영 중인 게임 테이블">
    {tables.map((table) => { const latest = activities.find((activity) => activity.session.tableId === table.id); return <LiveTableCard key={table.id} table={table} presences={presences.filter((presence) => presence.tableId === table.id && presence.phase !== "idle")} portraits={portraits} names={names} currentUtcSecond={currentUtcSecond} {...(latest ? { latest } : {})} onPlay={() => onPlay(table.id)} />; })}
  </section>
  <section className="casino-ledger-panel" aria-label="카지노 활동 원장">
    <div className="casino-ledger-board ca-brackets">
      <table>
        <caption className="ca-serif">명예의 전당</caption>
        <thead><tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">잔고</th></tr></thead>
        <tbody>{leaderboard.map((entry) => <tr key={`${entry.kind}:${entry.id}`} className={`${entry.kind === "user" ? "is-user" : ""}${entry.kind === "npc" && changedIds.has(entry.id) ? " is-changing" : ""}`}>
          <td className="ca-num">{entry.rank}</td>
          <th scope="row"><span className="ledger-person">
            {entry.kind === "npc" && entry.rank <= 3 && <span className="ledger-portrait"><span aria-hidden="true">{entry.name.slice(0, 1)}</span>{portraits[entry.id] && <img src={portraits[entry.id]} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}</span>}
            {entry.name}
          </span></th>
          <td className="ca-num"><NumberTicker value={entry.balance} suffix=" P" /></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="casino-ledger-activity">
      <div className="ledger-heading"><span><i className="ca-live" aria-hidden="true" /> 최근 활동</span>{clockSource === "device" && <small>기기 시간 기준</small>}</div>
      <div className="ledger-motion" aria-hidden="true">{activities.slice(0, 6).map((activity) => <ActivityLine key={activityKey(activity)} activity={activity} name={names.get(activity.npcId) ?? activity.npcId} currentUtcMinute={currentUtcMinute} />)}</div>
      <ol className="ledger-static" aria-label="최근 활동 세 건">{activities.slice(0, 3).map((activity) => <li key={activityKey(activity)}><ActivityLine activity={activity} name={names.get(activity.npcId) ?? activity.npcId} currentUtcMinute={currentUtcMinute} /></li>)}</ol>
    </div>
  </section>
  </>;
}

function ActivityLine({ activity, name, currentUtcMinute }: { activity: NpcActivity; name: string; currentUtcMinute: number }): React.ReactElement {
  const delta = activity.session.delta;
  return <span className={`ledger-activity-line ${delta > 0 ? "is-rising" : "is-falling"}`}>
    <b>{name}</b><small>{Math.max(0, currentUtcMinute - activity.utcMinute)}분 전</small><span>{tableName(activity.session.tableId)} · {activity.session.stake === 0 ? "무료" : `${activity.session.stake} P`}</span><strong className="ca-num">{delta > 0 ? "+" : ""}{delta} P</strong>
  </span>;
}

function LiveTableCard({ table, presences, portraits, names, currentUtcSecond, latest, onPlay }: { table: CasinoLiveTable; presences: readonly NpcPresence[]; portraits: Readonly<Record<string, string>>; names: ReadonlyMap<string, string>; currentUtcSecond: number; latest?: NpcActivity; onPlay(): void }): React.ReactElement {
  const active = presences.filter((presence) => presence.phase !== "leaving");
  const nearest = active.toSorted((left, right) => (left.availableAtUtcSecond ?? Infinity) - (right.availableAtUtcSecond ?? Infinity))[0];
  const remaining = nearest?.availableAtUtcSecond === undefined ? null : Math.max(0, nearest.availableAtUtcSecond - currentUtcSecond);
  return <article className={`table-card playable live-table-card is-${table.id} ${active.length > 0 ? "is-active" : "is-idle"}`}>
    <span className="table-suit" aria-hidden="true">{table.suit}</span>
    <span className="table-group"><i className={active.length > 0 ? "ca-live" : "ca-idle"} aria-hidden="true" /><span className="ca-label">{active.length > 0 ? `${phaseLabel(nearest?.phase)} · ${remainingLabel(remaining)}` : "지금 입장 가능"}</span></span>
    <h3 className="ca-serif">{table.title}</h3>
    <p>{table.description}</p>
    <div className="live-table-stage" aria-hidden="true"><TableLoop tableId={table.id} active={active.length > 0} /></div>
    <div className="live-table-players" aria-label={active.length > 0 ? `게임 중인 NPC ${active.length}명` : "게임 중인 NPC 없음"}>
      {active.slice(0, 3).map((presence) => <span className={`live-player is-${presence.phase}`} key={presence.npcId}>{portraits[presence.npcId] ? <img src={portraits[presence.npcId]} alt="" loading="lazy" /> : <i aria-hidden="true">{(names.get(presence.npcId) ?? presence.npcId).slice(0, 1)}</i>}<b>{names.get(presence.npcId) ?? presence.npcId}</b><small>{phaseLabel(presence.phase)}</small></span>)}
      {active.length > 3 && <span className="live-player-more">+{active.length - 3}</span>}
      {active.length === 0 && <span className="live-table-empty">빈 테이블 · 바로 시작할 수 있습니다</span>}
    </div>
    {latest && <small className="live-table-result">최근 · {names.get(latest.npcId) ?? latest.npcId} {latest.session.delta > 0 ? "+" : ""}{latest.session.delta} P</small>}
    <small className="ca-num">{table.meta}</small>
    <button className="ca-gold-btn ca-press ca-floorlight" onClick={onPlay}>{table.entryLabel}<span aria-hidden="true">▶</span></button>
    <span className="ca-brackets" aria-hidden="true" />
  </article>;
}

function TableLoop({ tableId, active }: { tableId: CasinoTableId; active: boolean }): React.ReactElement {
  if (tableId === "temerosa-slot") return <span className={`mini-slot ${active ? "is-running" : ""}`}><i>7</i><i>★</i><i>7</i></span>;
  if (tableId === "temerosa-match-pairs") return <span className={`mini-pairs ${active ? "is-running" : ""}`}><i /><i /></span>;
  if (tableId === "indian-poker") return <span className={`mini-poker ${active ? "is-running" : ""}`}><i /><b>●</b><b>●</b><b>●</b></span>;
  return <span className={`mini-old-maid ${active ? "is-running" : ""}`}><i /><i /><i /><i /></span>;
}

function phaseLabel(phase?: NpcPresence["phase"]): string {
  if (phase === "approaching") return "입장 중";
  if (phase === "settling") return "정산 중";
  if (phase === "leaving") return "퇴장 중";
  return phase === "playing" ? "게임 중" : "대기 중";
}

function remainingLabel(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 60) return `${seconds}초 남음`;
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초 남음`;
}

function tableName(tableId: NpcActivity["session"]["tableId"]): string {
  if (tableId === "temerosa-old-maid") return "도둑잡기";
  if (tableId === "temerosa-match-pairs") return "짝맞추기";
  if (tableId === "temerosa-slot") return "슬롯";
  return "인디언 포커";
}

function activityKey(activity: NpcActivity): string {
  return `${activity.utcMinute}:${activity.npcId}:${activity.session.tableId}`;
}
