import { NumberTicker } from "@lucky-arcade/ui/number-ticker";
import { casinoLeaderboard } from "../presentation.ts";
import type { NpcActivity } from "../contracts.ts";
import { TEMEROSA_NPC_GAMBLING_PROFILES } from "../temerosa-profiles.ts";
import "./casino-ledger-panel.css";

export interface CasinoLedgerPanelProps {
  npcBalances: Readonly<Record<string, number>>;
  userBalance: number;
  activities: readonly NpcActivity[];
  portraits: Readonly<Record<string, string>>;
  currentUtcMinute: number;
  clockSource: "http-date" | "device";
}

export default function CasinoLedgerPanel({
  npcBalances,
  userBalance,
  activities,
  portraits,
  currentUtcMinute,
  clockSource,
}: CasinoLedgerPanelProps): React.ReactElement {
  const leaderboard = casinoLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES, npcBalances, userBalance);
  const names = new Map(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.name]));
  return <section className="casino-ledger-panel" aria-label="카지노 활동 원장">
    <div className="casino-ledger-board ca-brackets">
      <table>
        <caption className="ca-serif">명예의 전당</caption>
        <thead><tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">잔고</th></tr></thead>
        <tbody>{leaderboard.map((entry) => <tr key={`${entry.kind}:${entry.id}`} className={entry.kind === "user" ? "is-user" : undefined}>
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
  </section>;
}

function ActivityLine({ activity, name, currentUtcMinute }: { activity: NpcActivity; name: string; currentUtcMinute: number }): React.ReactElement {
  const delta = activity.session.delta;
  return <span className={`ledger-activity-line ${delta > 0 ? "is-rising" : "is-falling"}`}>
    <b>{name}</b><small>{Math.max(0, currentUtcMinute - activity.utcMinute)}분 전</small><span>{tableName(activity.session.tableId)}</span><strong className="ca-num">{delta > 0 ? "+" : ""}{delta} P</strong>
  </span>;
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
