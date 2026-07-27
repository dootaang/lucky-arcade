import { NumberTicker } from "@lucky-arcade/ui/number-ticker";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { casinoLeaderboard } from "../presentation.ts";
import type { CasinoTableId, NpcPlayEvent, NpcPlayEventCode, NpcPresence, NpcRoundSettlement } from "../contracts.ts";
import { TEMEROSA_NPC_GAMBLING_PROFILES } from "../temerosa-profiles.ts";
import "./casino-ledger-panel.css";

export interface CasinoLedgerPanelProps {
  npcBalances: Readonly<Record<string, number>>;
  userBalance: number;
  settlements: readonly NpcRoundSettlement[];
  playEvents: readonly NpcPlayEvent[];
  portraits: Readonly<Record<string, string>>;
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
  settlements,
  playEvents,
  portraits,
  currentUtcSecond,
  clockSource,
  presences,
  tables,
  onPlay,
}: CasinoLedgerPanelProps): React.ReactElement {
  const leaderboard = casinoLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES, npcBalances, userBalance);
  const names = new Map(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.name]));
  const previousBalances = useRef(npcBalances);
  const [balanceMoves, setBalanceMoves] = useState<Readonly<Record<string, "rising" | "falling">>>({});
  const allTape = useMemo(() => casinoTape(playEvents, settlements, currentUtcSecond), [currentUtcSecond, playEvents, settlements]);
  const tape = allTape.slice(0, 12);
  const tapeKeys = tape.map((event) => event.id).join("|");
  const tapeRef = useFlipTape(tapeKeys);
  const lastMinuteCount = allTape.filter((event) => currentUtcSecond - event.utcSecond < 60).length;
  const recentSettlements = settlements.slice(0, 5);
  useEffect(() => {
    const changed = Object.fromEntries(Object.keys(npcBalances).flatMap((id) => {
      const previous = previousBalances.current[id];
      const next = npcBalances[id];
      return previous === undefined || next === undefined || previous === next ? [] : [[id, next > previous ? "rising" : "falling"]];
    })) as Record<string, "rising" | "falling">;
    previousBalances.current = npcBalances;
    if (Object.keys(changed).length === 0) return;
    setBalanceMoves(changed);
    const timer = window.setTimeout(() => setBalanceMoves({}), 1_600);
    return () => window.clearTimeout(timer);
  }, [npcBalances]);
  return <>
  <section className="casino-live-grid" aria-label="운영 중인 게임 테이블">
    {tables.map((table) => { const latest = settlements.find((settlement) => settlement.tableId === table.id); return <LiveTableCard key={table.id} table={table} presences={presences.filter((presence) => presence.tableId === table.id && presence.phase !== "idle")} portraits={portraits} names={names} currentUtcSecond={currentUtcSecond} {...(latest ? { latest } : {})} onPlay={() => onPlay(table.id)} />; })}
  </section>
  <section className="casino-ledger-panel" aria-label="카지노 활동 원장">
    <div className="casino-ledger-board ca-brackets">
      <table>
        <caption className="ca-serif">명예의 전당</caption>
        <thead><tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">잔고</th></tr></thead>
        <tbody>{leaderboard.map((entry) => <tr key={`${entry.kind}:${entry.id}`} className={`${entry.kind === "user" ? "is-user" : ""}${entry.kind === "npc" && balanceMoves[entry.id] ? ` is-changing is-${balanceMoves[entry.id]}` : ""}`}>
          <td className="ca-num">{entry.rank}</td>
          <th scope="row"><span className="ledger-person">
            {entry.kind === "npc" && entry.rank <= 3 && <span className="ledger-portrait"><span aria-hidden="true">{entry.name.slice(0, 1)}</span>{portraits[entry.id] && <img src={portraits[entry.id]} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}</span>}
            {entry.name}
          </span></th>
          <td className="ca-num"><NumberTicker value={entry.balance} suffix=" P" durationMs={650} /></td>
        </tr>)}</tbody>
      </table>
    </div>
    <section className="casino-ledger-settlements" aria-labelledby="settlement-heading">
      <div className="ledger-heading"><span id="settlement-heading">최근 정산</span><small>실제 잔고 변동</small></div>
      <ol>{recentSettlements.map((settlement) => <li key={settlement.roundId}><SettlementLine settlement={settlement} name={names.get(settlement.npcId) ?? settlement.npcId} currentUtcSecond={currentUtcSecond} /></li>)}</ol>
    </section>
    <div className="casino-ledger-activity">
      <div className="ledger-heading"><span><i className="ca-live" aria-hidden="true" /> LIVE PLAY TAPE</span><small>{lastMinuteCount} ACTIONS / 60s{clockSource === "device" ? " · 기기 시간" : ""}</small></div>
      <div className="ledger-tape-columns" aria-hidden="true"><span>PLAYER</span><span>AGE</span><span>TABLE · ACTION</span><span>STAKE / P&amp;L</span></div>
      <div className="ledger-motion" aria-hidden="true" ref={tapeRef}>{tape.map((event) => <TapeLine key={event.id} event={event} name={names.get(event.npcId) ?? event.npcId} currentUtcSecond={currentUtcSecond} />)}</div>
      <ol className="ledger-static" aria-label="최근 카지노 활동 세 건">{tape.slice(0, 3).map((event) => <li key={event.id}><TapeLine event={event} name={names.get(event.npcId) ?? event.npcId} currentUtcSecond={currentUtcSecond} /></li>)}</ol>
    </div>
  </section>
  </>;
}

function TapeLine({ event, name, currentUtcSecond }: { event: CasinoTapeEvent; name: string; currentUtcSecond: number }): React.ReactElement {
  const age = Math.max(0, currentUtcSecond - event.utcSecond);
  return <span data-tape-key={event.id} className={`ledger-activity-line is-${event.kind}${event.delta === undefined ? "" : event.delta >= 0 ? " is-rising" : " is-falling"}`}>
    <b>{name}</b><small>{ageLabel(age)}</small><span><i>{tableName(event.tableId)}</i> · {event.label}</span><strong className="ca-num">{event.delta === undefined ? event.stake === 0 ? "FREE" : `${event.stake} P` : `${event.delta > 0 ? "▲ +" : event.delta < 0 ? "▼ −" : "— "}${Math.abs(event.delta)} P`}</strong>
  </span>;
}

function SettlementLine({ settlement, name, currentUtcSecond }: { settlement: NpcRoundSettlement; name: string; currentUtcSecond: number }): React.ReactElement {
  const delta = settlement.delta;
  const direction = delta > 0 ? "gain" : delta < 0 ? "loss" : "flat";
  const directionLabel = delta > 0 ? "획득" : delta < 0 ? "손실" : "변동 없음";
  const symbol = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  const age = Math.max(0, currentUtcSecond - settlement.utcSecond);
  const fresh = age < 15;
  return <article
    className={`ledger-settlement-line is-${direction}${fresh ? " is-fresh" : ""}`}
    data-direction={direction}
    aria-label={`${name}, ${tableName(settlement.tableId)}, ${ageLabel(age)}, ${directionLabel} ${Math.abs(delta)} 포인트`}
  >
    <div><b>{name}</b><small>{ageLabel(age)}</small></div>
    <span>{tableName(settlement.tableId)} · {settlementLabel(settlement)}</span>
    <strong><i aria-hidden="true">{symbol}</i> {directionLabel}</strong>
    <NumberTicker value={Math.abs(delta)} prefix={delta > 0 ? "+" : delta < 0 ? "−" : ""} suffix=" P" durationMs={650} className="ca-num ledger-settlement-amount" />
  </article>;
}

function LiveTableCard({ table, presences, portraits, names, currentUtcSecond, latest, onPlay }: { table: CasinoLiveTable; presences: readonly NpcPresence[]; portraits: Readonly<Record<string, string>>; names: ReadonlyMap<string, string>; currentUtcSecond: number; latest?: NpcRoundSettlement; onPlay(): void }): React.ReactElement {
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
    {latest && <small className="live-table-result">최근 · {names.get(latest.npcId) ?? latest.npcId} {latest.delta > 0 ? "+" : ""}{latest.delta} P</small>}
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

function tableName(tableId: CasinoTableId): string {
  if (tableId === "temerosa-old-maid") return "도둑잡기";
  if (tableId === "temerosa-match-pairs") return "짝맞추기";
  if (tableId === "temerosa-slot") return "슬롯";
  return "인디언 포커";
}

function ageLabel(seconds: number): string {
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분`;
}

interface CasinoTapeEvent {
  id: string;
  npcId: string;
  tableId: CasinoTableId;
  utcSecond: number;
  kind: "play" | "settlement";
  label: string;
  stake: number;
  delta?: number;
}

function casinoTape(playEvents: readonly NpcPlayEvent[], settlements: readonly NpcRoundSettlement[], currentUtcSecond: number): readonly CasinoTapeEvent[] {
  const play: CasinoTapeEvent[] = playEvents.map((event) => ({
    id: event.eventId, npcId: event.npcId, tableId: event.tableId, utcSecond: event.utcSecond,
    kind: "play", label: playEventLabel(event.code, event.stake), stake: event.stake,
  }));
  const settlementEvents: CasinoTapeEvent[] = settlements.map((settlement) => ({
    id: settlement.roundId,
    npcId: settlement.npcId, tableId: settlement.tableId, utcSecond: settlement.utcSecond,
    kind: "settlement", label: `${settlementLabel(settlement)} · ${settlement.delta > 0 ? "획득" : settlement.delta < 0 ? "손실" : "변동 없음"}`, stake: settlement.stake, delta: settlement.delta,
  }));
  return [...play, ...settlementEvents]
    .filter((event) => event.utcSecond <= currentUtcSecond)
    .sort((left, right) => right.utcSecond - left.utcSecond || compareText(left.id, right.id));
}

function playEventLabel(code: NpcPlayEventCode, stake: number): string {
  if (code === "table-enter") return "테이블 입장";
  if (code === "wager-placed") return stake === 0 ? "무료 대국 시작" : "판돈 투입";
  if (code === "old-maid-draw") return "카드 선택";
  if (code === "old-maid-discard") return "짝 버리기";
  if (code === "old-maid-reorder") return "손패 재배열";
  if (code === "old-maid-watch") return "조커 추적";
  if (code === "pairs-open-first") return "첫 카드 공개";
  if (code === "pairs-open-second") return "두 번째 카드 공개";
  if (code === "pairs-match") return "짝 판정";
  if (code === "pairs-turn") return "턴 교대";
  if (code === "slot-spin") return "릴 회전";
  if (code === "slot-reel-stop") return "릴 정지";
  if (code === "slot-line-check") return "당첨선 확인";
  if (code === "slot-reach") return "리치";
  if (code === "poker-check") return "체크";
  if (code === "poker-call") return "콜";
  if (code === "poker-raise") return "레이즈";
  return "표정 읽기";
}

function settlementLabel(settlement: NpcRoundSettlement): string {
  if (settlement.tableId === "temerosa-slot") {
    const lines = Number(settlement.resultKind.replace("lines-", ""));
    return lines > 0 ? `${lines}줄 적중` : "당첨 없음";
  }
  if (settlement.tableId === "indian-poker") return "칩 정산";
  if (settlement.tableId === "temerosa-match-pairs") return "대국 정산";
  return "순위 보상";
}

function useFlipTape(keySignature: string): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousPositions = useRef<ReadonlyMap<string, number>>(new Map());
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rows = [...container.querySelectorAll<HTMLElement>("[data-tape-key]")];
    const nextPositions = new Map(rows.map((row) => [row.dataset.tapeKey ?? "", row.getBoundingClientRect().top]));
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      for (const row of rows) {
        const key = row.dataset.tapeKey ?? "";
        const previous = previousPositions.current.get(key);
        const current = nextPositions.get(key);
        if (previous === undefined || current === undefined || previous === current || typeof row.animate !== "function") continue;
        row.animate([{ transform: `translateY(${previous - current}px)` }, { transform: "translateY(0)" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    }
    previousPositions.current = nextPositions;
  }, [keySignature]);
  return containerRef;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
