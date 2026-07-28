import { NumberTicker } from "@lucky-arcade/ui/number-ticker";
import { HoloFoil } from "@lucky-arcade/ui/holo-card";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { casinoLeaderboard } from "../presentation.ts";
import { groupNpcRoundSettlements } from "../rounds.ts";
import type { CasinoTableId, NpcMatchSettlement, NpcPlayEvent, NpcPlayEventCode, NpcPresence, NpcRoundSettlement } from "../contracts.ts";
import { TEMEROSA_NPC_GAMBLING_PROFILES } from "../temerosa-profiles.ts";
import "./casino-ledger-panel.css";

export interface CasinoLedgerPanelProps {
  npcBalances: Readonly<Record<string, number>>;
  npcSevenDayProfits: Readonly<Record<string, number>>;
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
  suit: string;
  entryLabel: string;
  meta: string;
}

export default function CasinoLedgerPanel({
  npcBalances,
  npcSevenDayProfits,
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
  const [leaderboardMode, setLeaderboardMode] = useState<"profit" | "balance">("profit");
  const leaderboard = casinoLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES, npcBalances, userBalance, leaderboardMode === "profit" ? npcSevenDayProfits : undefined);
  const names = new Map(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.name]));
  const previousBalances = useRef(npcBalances);
  const [balanceMoves, setBalanceMoves] = useState<Readonly<Record<string, "rising" | "falling">>>({});
  const settlementGroups = useMemo(() => groupNpcRoundSettlements(settlements), [settlements]);
  const allTape = useMemo(() => casinoTape(playEvents, settlementGroups, currentUtcSecond), [currentUtcSecond, playEvents, settlementGroups]);
  const tape = allTape.slice(0, 8);
  const lastMinuteCount = allTape.filter((event) => currentUtcSecond - event.utcSecond < 60).length;
  const recentSettlements = settlementGroups.slice(0, 8);
  const boardRef = useRef<HTMLTableSectionElement>(null);
  const inviteCount = presences.filter((presence) => presence.phase === "idle").length;
  const seatedCount = presences.length - inviteCount;
  /** Highest shown balance is the full bar. No absolute ceiling is invented. */
  const topBalance = Math.max(1, ...leaderboard.map((entry) => Math.abs(leaderboardMode === "profit" && entry.kind === "npc" ? entry.periodProfit ?? 0 : entry.balance)));
  /** One backlit portrait per screen, picked by name so every client agrees. */
  const backlitNpcId = presences.filter((presence) => presence.phase === "settling")
    .map((presence) => presence.npcId).sort(compareText)[0];
  /** -1 the floor is losing, +1 the floor is winning. Presentation only. */
  const mood = useMemo(() => {
    const recent = settlements.filter((settlement) => currentUtcSecond - settlement.utcSecond < 120);
    const scale = recent.reduce((sum, settlement) => sum + Math.abs(settlement.delta), 0);
    if (scale === 0) return 0;
    return Number((recent.reduce((sum, settlement) => sum + settlement.delta, 0) / scale).toFixed(2));
  }, [currentUtcSecond, settlements]);
  /* Quantised on purpose. --ca-busy drives an animation-duration, and changing
     that mid-run makes the dust jump, so it may only move in steps of ten. */
  const busy = Math.round(lastMinuteCount / 10) * 10;
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--ca-busy", String(busy));
    root.style.setProperty("--ca-mood", String(mood));
    root.style.setProperty("--ca-drift-duration", `${150 - Math.min(90, Math.max(0, busy)) * 1.4}s`);
    root.style.setProperty("--ca-gold-mood-opacity", String(0.66 + Math.max(0, mood) * 0.34));
    root.style.setProperty("--ca-crimson-mood-opacity", String(0.66 + Math.max(0, -mood) * 0.34));
    return () => {
      root.style.removeProperty("--ca-busy");
      root.style.removeProperty("--ca-mood");
      root.style.removeProperty("--ca-drift-duration");
      root.style.removeProperty("--ca-gold-mood-opacity");
      root.style.removeProperty("--ca-crimson-mood-opacity");
    };
  }, [busy, mood]);
  /* The leaderboard rows are reused across renders, so React leaving the same
     class in place would swallow a second move in the same direction. Own the
     animation class here and force a reflow between removing and adding it. */
  useLayoutEffect(() => {
    const body = boardRef.current;
    if (!body) return;
    for (const row of [...body.querySelectorAll<HTMLTableRowElement>("tr[data-npc]")]) {
      row.classList.remove("is-changing");
      if (!balanceMoves[row.dataset.npc ?? ""]) continue;
      void row.offsetWidth;
      row.classList.add("is-changing");
    }
  }, [balanceMoves]);
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
  <div className="casino-floor-status">
    <span className="ca-label"><i className={inviteCount > 0 ? "ca-live" : "ca-idle"} aria-hidden="true" /> 지금 초대 가능 {inviteCount}명</span>
    <span className="ca-label">테이블 착석 {seatedCount}명</span>
  </div>
  <section className="casino-ledger-panel" aria-label="카지노 활동 원장">
    <div className="casino-ledger-board">
      <span className="ca-brackets" aria-hidden="true" />
      <table>
        <caption className="ca-serif">명예의 전당 <span className="ledger-board-switch"><button aria-pressed={leaderboardMode === "profit"} onClick={() => setLeaderboardMode("profit")}>7일 손익</button><button aria-pressed={leaderboardMode === "balance"} onClick={() => setLeaderboardMode("balance")}>잔고</button></span></caption>
        <thead><tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">{leaderboardMode === "profit" ? "7일 손익" : "잔고"}</th></tr></thead>
        <tbody ref={boardRef}>{leaderboard.map((entry) => <tr
          key={`${entry.kind}:${entry.id}`}
          {...(entry.kind === "npc" ? { "data-npc": entry.id } : {})}
          className={`${entry.kind === "user" ? "is-user" : ""}${entry.kind === "npc" && balanceMoves[entry.id] ? ` is-${balanceMoves[entry.id]}` : ""}`}
          style={{ "--ledger-depth": `${(Math.abs(leaderboardMode === "profit" && entry.kind === "npc" ? entry.periodProfit ?? 0 : entry.balance) / topBalance * 100).toFixed(2)}%` } as React.CSSProperties}
        >
          <td className="ca-num">{entry.rank}</td>
          <th scope="row"><div className="ledger-person">
            {entry.kind === "npc" && entry.rank <= 3 && <LedgerPortrait name={entry.name} src={portraits[entry.id]} crowned={entry.rank === 1} />}
            {entry.name}
          </div></th>
          <td className="ca-num">{leaderboardMode === "profit" && entry.kind === "npc" ? <NumberTicker value={entry.periodProfit ?? 0} prefix={(entry.periodProfit ?? 0) > 0 ? "+" : ""} suffix=" P" durationMs={650} /> : <NumberTicker value={entry.balance} suffix=" P" durationMs={650} />}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <section className="casino-ledger-settlements" aria-labelledby="settlement-heading">
      <div className="ledger-heading"><span id="settlement-heading">최근 정산</span><small>실제 잔고 변동</small></div>
      <ol>{recentSettlements.map((settlement) => <li key={settlement.matchId}><SettlementLine settlement={settlement} names={names} currentUtcSecond={currentUtcSecond} /></li>)}</ol>
    </section>
    <div className="casino-ledger-activity">
      <div className="ledger-heading"><span><i className="ca-live" aria-hidden="true" /> LIVE PLAY TAPE</span><small>{lastMinuteCount} ACTIONS / 60s{clockSource === "device" ? " · 기기 시간" : ""}</small></div>
      <div className="ledger-tape-columns" aria-hidden="true"><span>PLAYER</span><span>AGE</span><span>TABLE · ACTION</span><span>STAKE / P&amp;L</span></div>
      <div className="ledger-motion" aria-hidden="true">{tape.map((event, index) => <TapeLine key={event.id} event={event} name={names.get(event.npcId) ?? event.npcId} currentUtcSecond={currentUtcSecond} newest={index === 0} />)}</div>
      <ol className="ledger-static" aria-label="최근 카지노 활동 세 건">{tape.slice(0, 3).map((event) => <li key={event.id}><TapeLine event={event} name={names.get(event.npcId) ?? event.npcId} currentUtcSecond={currentUtcSecond} /></li>)}</ol>
    </div>
  </section>
  <section className="casino-live-grid" aria-label="운영 중인 게임 테이블">
    {tables.map((table) => {
      const latest = settlements.find((settlement) => settlement.tableId === table.id);
      const pulseKey = playEvents.find((event) => event.tableId === table.id)?.eventId;
      return <LiveTableCard
        key={table.id}
        table={table}
        presences={presences.filter((presence) => presence.tableId === table.id && presence.phase !== "idle")}
        portraits={portraits}
        names={names}
        npcBalances={npcBalances}
        currentUtcSecond={currentUtcSecond}
        {...(latest ? { latest } : {})}
        {...(pulseKey ? { pulseKey } : {})}
        {...(backlitNpcId ? { backlitNpcId } : {})}
        onPlay={() => onPlay(table.id)}
      />;
    })}
  </section>
  </>;
}

/** The leader alone gets real foil. It is the only holo layer on this screen. */
function LedgerPortrait({ name, src, crowned }: { name: string; src: string | undefined; crowned: boolean }): React.ReactElement {
  const face = <span className="ledger-portrait">
    <span aria-hidden="true">{name.slice(0, 1)}</span>
    {src && <img src={src} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}
  </span>;
  return crowned ? <HoloFoil className="ledger-crown" tilt={false}>{face}</HoloFoil> : face;
}

function TapeLine({ event, name, currentUtcSecond, newest = false }: { event: CasinoTapeEvent; name: string; currentUtcSecond: number; newest?: boolean }): React.ReactElement {
  const age = Math.max(0, currentUtcSecond - event.utcSecond);
  return <span data-tape-key={event.id} className={`ledger-activity-line is-${event.kind}${event.delta === undefined ? "" : event.delta >= 0 ? " is-rising" : " is-falling"}${newest ? " is-newest" : ""}`}>
    <b>{name}</b><small>{ageLabel(age)}</small><span><i>{tableName(event.tableId)}</i> · {event.label}</span><strong className="ca-num">{event.delta === undefined ? event.stake === 0 ? "FREE" : `${event.stake} P` : `${event.delta > 0 ? "▲ +" : event.delta < 0 ? "▼ −" : "— "}${Math.abs(event.delta)} P`}</strong>
  </span>;
}

function SettlementLine({ settlement, names, currentUtcSecond }: { settlement: NpcMatchSettlement; names: ReadonlyMap<string,string>; currentUtcSecond: number }): React.ReactElement {
  const primary = settlement.entries[0]!;
  const name = names.get(primary.npcId) ?? primary.npcId;
  const delta = primary.delta;
  const direction = delta > 0 ? "gain" : delta < 0 ? "loss" : "flat";
  const directionLabel = delta > 0 ? "획득" : delta < 0 ? "손실" : "변동 없음";
  const symbol = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  const age = Math.max(0, currentUtcSecond - settlement.utcSecond);
  const fresh = age < 15;
  const leverage = primary.stake === 0 ? null : primary.reservedAmount / primary.stake;
  const counterpart = settlement.entries.slice(1)
    .map((entry) => `${names.get(entry.npcId) ?? entry.npcId} ${entry.delta > 0 ? "+" : ""}${entry.delta} P`)
    .join(" · ");
  return <article
    className={`ledger-settlement-line is-${direction}${fresh ? " is-fresh" : ""}`}
    data-direction={direction}
    aria-label={`${name}, ${tableName(settlement.tableId)}, ${ageLabel(age)}, ${directionLabel} ${Math.abs(delta)} 포인트`}
  >
    <div><b>{name}</b><small>{ageLabel(age)}</small></div>
    <span>{tableName(settlement.tableId)} · {settlementLabel(primary)}{leverage === null ? "" : ` · ${leverage}배`}{counterpart ? ` · ${counterpart}` : ""}</span>
    <strong><i aria-hidden="true">{symbol}</i> {directionLabel}</strong>
    <NumberTicker value={Math.abs(delta)} prefix={delta > 0 ? "+" : delta < 0 ? "−" : ""} suffix=" P" durationMs={650} className="ca-num ledger-settlement-amount" />
  </article>;
}

function LiveTableCard({ table, presences, portraits, names, npcBalances, currentUtcSecond, latest, pulseKey, backlitNpcId, onPlay }: { table: CasinoLiveTable; presences: readonly NpcPresence[]; portraits: Readonly<Record<string, string>>; names: ReadonlyMap<string, string>; npcBalances: Readonly<Record<string, number>>; currentUtcSecond: number; latest?: NpcRoundSettlement; pulseKey?: string; backlitNpcId?: string; onPlay(): void }): React.ReactElement {
  const active = presences.filter((presence) => presence.phase !== "leaving");
  /* A visit runs 45~120 minutes, so `playing` is almost the whole clock and the
     three transitions are seconds each. The card shows whichever transition is
     happening; a table nobody has left yet is still emptying, not open. */
  const representative = active.toSorted((left, right) => phasePriority(left.phase) - phasePriority(right.phase)
    || (left.availableAtUtcSecond ?? Infinity) - (right.availableAtUtcSecond ?? Infinity))[0]
    ?? presences.toSorted((left, right) => (left.availableAtUtcSecond ?? Infinity) - (right.availableAtUtcSecond ?? Infinity))[0];
  const state = representative?.phase ?? "open";
  const displayed = (active.length > 0 ? active : presences).toSorted((left, right) => {
    if (left.npcId === backlitNpcId) return -1;
    if (right.npcId === backlitNpcId) return 1;
    return phasePriority(left.phase) - phasePriority(right.phase) || compareText(left.npcId, right.npcId);
  });
  const started = state === "playing" ? representative?.startedAtUtcSecond : undefined;
  const settles = state === "playing" ? representative?.settlesAtUtcSecond : undefined;
  const progress = started === undefined || settles === undefined
    ? null
    : Math.min(1, Math.max(0, (currentUtcSecond - started) / Math.max(1, settles - started)));
  return <article
    className={`table-card playable live-table-card is-${table.id} is-${state} ${state === "open" ? "is-idle ca-shine" : "is-active"}${state === "settling" ? " ca-glare" : ""}`}
    {...(progress === null ? {} : { style: { "--progress": progress.toFixed(3) } as React.CSSProperties })}
  >
    <span className="table-suit" aria-hidden="true">{table.suit}</span>
    <h3 className="ca-serif">{table.title}</h3>
    <div className="live-table-stage" aria-hidden="true">
      <TableLoop tableId={table.id} active={active.length > 0} />
      {pulseKey && active.length > 0 && <span className="live-table-pulse" key={pulseKey} />}
    </div>
    <div className="live-table-players" aria-label={displayed.length > 0 ? `테이블에 있는 NPC ${displayed.length}명` : "테이블에 있는 NPC 없음"}>
      {displayed.slice(0, 3).map((presence) => {
        const portrait = portraits[presence.npcId];
        const visit = presence.openingBalance === undefined ? 0 : (npcBalances[presence.npcId] ?? presence.openingBalance) - presence.openingBalance;
        const backlit = portrait !== undefined && presence.npcId === backlitNpcId;
        return <span
          className={`live-player is-${presence.phase}${backlit ? " ca-backlight" : ""}`}
          key={presence.npcId}
          {...(visit === 0 ? {} : { "data-visit": visit > 0 ? "rising" : "falling" })}
          {...(backlit ? { style: { "--ca-backlight": `url("${portrait}")` } as React.CSSProperties } : {})}
        >
          {portrait ? <img src={portrait} alt="" loading="lazy" /> : <i aria-hidden="true">{(names.get(presence.npcId) ?? presence.npcId).slice(0, 1)}</i>}
          <b>{names.get(presence.npcId) ?? presence.npcId}</b>
        </span>;
      })}
      {displayed.length > 3 && <span className="live-player-more">+{displayed.length - 3}</span>}
      {displayed.length === 0 && <span className="live-table-empty">빈 테이블</span>}
    </div>
    {latest && <small className="live-table-result">최근 · {names.get(latest.npcId) ?? latest.npcId} {latest.delta > 0 ? "+" : ""}{latest.delta} P</small>}
    <small className="ca-num">{table.meta}</small>
    <button className={`ca-gold-btn ca-press ca-reflect${state === "open" ? " ca-floorlight ca-pulse" : ""}`} onClick={onPlay}>{table.entryLabel}<span aria-hidden="true">▶</span></button>
    <span className="ca-brackets" aria-hidden="true" />
    {state === "approaching" && <span className="ca-scan" aria-hidden="true" />}
    {progress !== null && <span className="live-table-progress" aria-hidden="true" />}
  </article>;
}

function TableLoop({ tableId, active }: { tableId: CasinoTableId; active: boolean }): React.ReactElement {
  if (tableId === "temerosa-slot") return <span className={`mini-slot ${active ? "is-running" : ""}`}><i>7</i><i>★</i><i>7</i></span>;
  if (tableId === "temerosa-match-pairs") return <span className={`mini-pairs ${active ? "is-running" : ""}`}><i /><i /></span>;
  if (tableId === "indian-poker") return <span className={`mini-poker ${active ? "is-running" : ""}`}><i /><b>●</b><b>●</b><b>●</b></span>;
  return <span className={`mini-old-maid ${active ? "is-running" : ""}`}><i /><i /><i /><i /></span>;
}

function phasePriority(phase: NpcPresence["phase"]): number {
  if (phase === "settling") return 0;
  if (phase === "approaching") return 1;
  if (phase === "playing") return 2;
  if (phase === "leaving") return 3;
  return 4;
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

function casinoTape(playEvents: readonly NpcPlayEvent[], settlements: readonly NpcMatchSettlement[], currentUtcSecond: number): readonly CasinoTapeEvent[] {
  const play: CasinoTapeEvent[] = playEvents.map((event) => ({
    id: event.eventId, npcId: event.npcId, tableId: event.tableId, utcSecond: event.utcSecond,
    kind: "play", label: playEventLabel(event.code, event.stake), stake: event.stake,
  }));
  const settlementEvents: CasinoTapeEvent[] = settlements.map((settlement) => {
    const primary=settlement.entries[0]!;
    return {
      id:settlement.matchId,
      npcId:primary.npcId,tableId:settlement.tableId,utcSecond:settlement.utcSecond,
      kind:"settlement",label:`${settlementLabel(primary)}${primary.stake===0?"":` · ${primary.reservedAmount/primary.stake}배`} · ${primary.delta>0?"획득":primary.delta<0?"손실":"변동 없음"}`,
      stake:primary.stake,delta:primary.delta,
    };
  });
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
