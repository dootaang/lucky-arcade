import { NumberTicker } from "@lucky-arcade/ui/number-ticker";
import { HoloFoil } from "@lucky-arcade/ui/holo-card";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { casinoFullLeaderboard, casinoLeaderboard, casinoNpcLedgerReport, type CasinoLeaderboardEntry } from "../presentation.ts";
import { formatCasinoKstTime, formatCasinoKstTimestamp } from "../presentation-time.ts";
import { groupNpcRoundSettlements, npcMatchSettlementEntriesByNpc, type NpcMatchSettlementTone } from "../rounds.ts";
import type { CasinoLedgerSourceId, CasinoTableId, NpcMatchSettlement, NpcPlayEvent, NpcPlayEventCode, NpcPresence, NpcRoundSettlement } from "../contracts.ts";
import { TEMEROSA_NPC_GAMBLING_PROFILES } from "../temerosa-profiles.ts";
import "./casino-ledger-panel.css";

export interface CasinoLedgerPanelProps {
  npcBalances: Readonly<Record<string, number>>;
  npcSevenDayProfits: Readonly<Record<string, number>>;
  userBalance: number;
  userSevenDayProfit: number;
  houseBalance: number;
  profitPeriodDays: number;
  settlements: readonly NpcRoundSettlement[];
  playEvents: readonly NpcPlayEvent[];
  portraits: Readonly<Record<string, string>>;
  currentUtcSecond: number;
  nextArrivalAt: number | undefined;
  clockSource: "http-date" | "device";
  presences: readonly NpcPresence[];
  tables: readonly CasinoLiveTable[];
  onPlay(id: string): void;
  loadNpcHistory(npcId: string, days: number): readonly NpcRoundSettlement[];
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
  userSevenDayProfit,
  houseBalance,
  profitPeriodDays,
  settlements,
  playEvents,
  portraits,
  currentUtcSecond,
  nextArrivalAt,
  clockSource,
  presences,
  tables,
  onPlay,
  loadNpcHistory,
}: CasinoLedgerPanelProps): React.ReactElement {
  const [leaderboardMode, setLeaderboardMode] = useState<"profit" | "balance">("profit");
  const [recordRoomOpen,setRecordRoomOpen]=useState(false);
  const [selectedNpcId,setSelectedNpcId]=useState<string>();
  const [recordDays,setRecordDays]=useState<0|1|7|30>(0);
  const profitLabel = profitPeriodDays >= 7 ? "7일 손익" : profitPeriodDays <= 1 ? "최근 손익" : `최근 ${profitPeriodDays}일 손익`;
  const leaderboard = casinoLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES, npcBalances, userBalance, leaderboardMode === "profit" ? npcSevenDayProfits : undefined, userSevenDayProfit);
  const names = new Map<string,string>(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, profile.name]));
  names.set("player:local", "나");
  names.set("house:temerosa", "워어즈 · 하우스");
  const fullLeaderboard=casinoFullLeaderboard(TEMEROSA_NPC_GAMBLING_PROFILES,npcBalances,userBalance,leaderboardMode==="profit"?npcSevenDayProfits:undefined,userSevenDayProfit);
  const currentMinute=Math.floor(currentUtcSecond/60);
  const selectedHistory=useMemo(()=>selectedNpcId?loadNpcHistory(selectedNpcId,recordDays):Object.freeze([]),[currentMinute,loadNpcHistory,recordDays,selectedNpcId]);
  const previousBalances = useRef(npcBalances);
  const [balanceMoves, setBalanceMoves] = useState<Readonly<Record<string, "rising" | "falling">>>({});
  const settlementGroups = useMemo(() => groupNpcRoundSettlements(settlements), [settlements]);
  const allTape = useMemo(() => casinoTape(playEvents, settlementGroups, currentUtcSecond, names), [currentUtcSecond, playEvents, settlementGroups]);
  const tape = allTape.slice(0, 8);
  const lastMinuteCount = allTape.filter((event) => currentUtcSecond - event.utcSecond < 60).length;
  const recentSettlements = settlements.slice(0, 8);
  const boardRef = useRef<HTMLTableSectionElement>(null);
  const inviteCount = presences.filter((presence) => presence.phase === "idle").length;
  const seatedCount = presences.length - inviteCount;
  /** Highest shown balance is the full bar. No absolute ceiling is invented. */
  const topBalance = Math.max(1, ...leaderboard.map((entry) => Math.abs(leaderboardMode === "profit" ? entry.periodProfit ?? 0 : entry.balance)));
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
    <span className="ca-label">HOUSE {houseBalance.toLocaleString("ko-KR")} P</span>
    {seatedCount === 0 && nextArrivalAt !== undefined && <span className="ca-label">다음 입장 {formatCasinoKstTime(nextArrivalAt)}</span>}
  </div>
  <section className="casino-ledger-panel" aria-label="카지노 활동 원장" data-ledger-utc-second={currentUtcSecond}>
    <div className="casino-ledger-board">
      <span className="ca-brackets" aria-hidden="true" />
      <table>
        <caption className="ca-serif">명예의 전당 <span className="ledger-board-switch"><button aria-pressed={leaderboardMode === "profit"} onClick={() => setLeaderboardMode("profit")}>{profitLabel}</button><button aria-pressed={leaderboardMode === "balance"} onClick={() => setLeaderboardMode("balance")}>잔고</button><button onClick={()=>{setSelectedNpcId(undefined);setRecordRoomOpen(true);}}>전체 보기</button></span></caption>
        <thead><tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">{leaderboardMode === "profit" ? profitLabel : "잔고"}</th></tr></thead>
        <tbody ref={boardRef}>{leaderboard.map((entry) => <tr
          key={`${entry.kind}:${entry.id}`}
          {...(entry.kind === "npc" ? { "data-npc": entry.id } : {})}
          className={`${entry.kind === "user" ? "is-user" : ""}${entry.kind === "npc" && balanceMoves[entry.id] ? ` is-${balanceMoves[entry.id]}` : ""}`}
          style={{ "--ledger-depth": `${(Math.abs(leaderboardMode === "profit" ? entry.periodProfit ?? 0 : entry.balance) / topBalance * 100).toFixed(2)}%` } as React.CSSProperties}
        >
          <td className="ca-num">{entry.rank}</td>
          <th scope="row"><button className="ledger-person ledger-person-button" onClick={()=>{setSelectedNpcId(entry.kind==="user"?"player:local":entry.id);setRecordRoomOpen(true);}}>
            {entry.kind === "npc" && entry.rank <= 3 && <LedgerPortrait name={entry.name} src={portraits[entry.id]} crowned={entry.rank === 1} />}
            {entry.name}
          </button></th>
          <td className="ca-num">{leaderboardMode === "profit" ? <NumberTicker value={entry.periodProfit ?? 0} prefix={(entry.periodProfit ?? 0) > 0 ? "+" : ""} suffix=" P" durationMs={650} /> : <NumberTicker value={entry.balance} suffix=" P" durationMs={650} />}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <section className="casino-ledger-settlements" aria-labelledby="settlement-heading">
      <div className="ledger-heading"><span id="settlement-heading">최근 정산</span><small>실제 잔고 변동</small></div>
      <ol>{recentSettlements.map((settlement) => <li key={settlement.roundId}><SettlementLine settlement={settlement} names={names} currentUtcSecond={currentUtcSecond} /></li>)}</ol>
    </section>
    <div className="casino-ledger-activity">
      <div className="ledger-heading"><span><i className="ca-live" aria-hidden="true" /> LIVE PLAY TAPE</span><small>{lastMinuteCount} ACTIONS / 60s{clockSource === "device" ? " · 기기 시간" : ""}</small></div>
      <div className="ledger-tape-columns" aria-hidden="true"><span>PLAYER</span><span>AGE</span><span>TABLE · ACTION</span><span>STAKE / P&amp;L</span></div>
      <div className="ledger-motion" aria-hidden="true">{tape.map((event, index) => <TapeLine key={event.id} event={event} names={names} currentUtcSecond={currentUtcSecond} newest={index === 0} />)}</div>
      <ol className="ledger-static" aria-label="최근 카지노 활동 세 건">{tape.slice(0, 3).map((event) => <li key={event.id}><TapeLine event={event} names={names} currentUtcSecond={currentUtcSecond} /></li>)}</ol>
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
  {recordRoomOpen&&<CasinoRecordRoom
    leaderboard={fullLeaderboard} leaderboardMode={leaderboardMode} profitLabel={profitLabel} selectedNpcId={selectedNpcId}
    entries={selectedHistory} days={recordDays} names={names} portraits={portraits}
    onSelect={setSelectedNpcId} onDays={setRecordDays} onBack={()=>setSelectedNpcId(undefined)}
    onClose={()=>{setRecordRoomOpen(false);setSelectedNpcId(undefined);}}
  />}
  </>;
}

function CasinoRecordRoom({leaderboard,leaderboardMode,profitLabel,selectedNpcId,entries,days,names,portraits,onSelect,onDays,onBack,onClose}:{
  leaderboard:readonly CasinoLeaderboardEntry[];leaderboardMode:"profit"|"balance";profitLabel:string;selectedNpcId:string|undefined;
  entries:readonly NpcRoundSettlement[];days:0|1|7|30;names:ReadonlyMap<string,string>;portraits:Readonly<Record<string,string>>;
  onSelect(id:string):void;onDays(days:0|1|7|30):void;onBack():void;onClose():void;
}):React.ReactElement{
  const [tableFilter,setTableFilter]=useState<CasinoLedgerSourceId|"all">("all");
  const [visible,setVisible]=useState(50);
  useEffect(()=>{setTableFilter("all");setVisible(50);},[selectedNpcId,days]);
  useEffect(()=>{
    const body=document.body,root=document.documentElement,scrollY=window.scrollY;
    const previous={
      bodyPosition:body.style.position,bodyTop:body.style.top,bodyLeft:body.style.left,bodyRight:body.style.right,
      bodyWidth:body.style.width,bodyOverflow:body.style.overflow,bodyPaddingRight:body.style.paddingRight,
      rootOverflow:root.style.overflow,
    };
    const scrollbarGap=Math.max(0,window.innerWidth-root.clientWidth);
    body.style.position="fixed";
    body.style.top=`-${scrollY}px`;
    body.style.left="0";
    body.style.right="0";
    body.style.width="100%";
    body.style.overflow="hidden";
    if(scrollbarGap>0)body.style.paddingRight=`${Number.parseFloat(getComputedStyle(body).paddingRight||"0")+scrollbarGap}px`;
    root.style.overflow="hidden";
    return()=>{
      body.style.position=previous.bodyPosition;body.style.top=previous.bodyTop;body.style.left=previous.bodyLeft;
      body.style.right=previous.bodyRight;body.style.width=previous.bodyWidth;body.style.overflow=previous.bodyOverflow;
      body.style.paddingRight=previous.bodyPaddingRight;root.style.overflow=previous.rootOverflow;
      window.scrollTo(0,scrollY);
    };
  },[]);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[onClose]);
  const selected=selectedNpcId==="player:local"?leaderboard.find((entry)=>entry.kind==="user"):leaderboard.find((entry)=>entry.kind==="npc"&&entry.id===selectedNpcId);
  const filtered=tableFilter==="all"?entries:entries.filter((entry)=>entry.tableId===tableFilter);
  const report=selectedNpcId?casinoNpcLedgerReport(selectedNpcId,filtered):undefined;
  return <div className="casino-record-backdrop" onMouseDown={(event)=>{if(event.currentTarget===event.target)onClose();}}>
    <section className="casino-record-room" role="dialog" aria-modal="true" aria-labelledby="casino-record-title">
      <header><div>{selected?<button className="record-back" onClick={onBack}>← 전체 순위</button>:<span className="ca-label">CASINO ARCHIVE</span>}<h2 id="casino-record-title" className="ca-serif">{selected?`${selected.name}의 카지노 원장`:"명예의 전당 전체 순위"}</h2></div><button className="record-close" onClick={onClose} aria-label="기록실 닫기">×</button></header>
      {!selected?<div className="record-ranking-wrap"><table className="record-ranking"><caption>{leaderboardMode==="profit"?`${profitLabel} 순위`:"현재 잔고 순위"}</caption><thead><tr><th>순위</th><th>이름</th><th>{leaderboardMode==="profit"?profitLabel:"잔고"}</th></tr></thead><tbody>{leaderboard.map((entry)=><tr key={`${entry.kind}:${entry.id}`} className={entry.kind==="user"?"is-user":""}><td className="ca-num">{entry.rank}</td><th scope="row"><button onClick={()=>onSelect(entry.kind==="user"?"player:local":entry.id)}>{entry.kind==="npc"&&<LedgerPortrait name={entry.name} src={portraits[entry.id]} crowned={entry.rank===1}/>}<span>{entry.name}</span></button></th><td className="ca-num">{leaderboardMode==="profit"?signedPoints(entry.periodProfit??0):`${entry.balance} P`}</td></tr>)}</tbody></table></div>
      :report&&<div className="npc-ledger-detail">
        <div className="npc-ledger-hero">{selected.kind==="npc"&&<LedgerPortrait name={selected.name} src={portraits[selected.id]} crowned={selected.rank===1}/>}<div><span className="ca-label">{leaderboardMode==="profit"?profitLabel:"잔고"} {selected.rank}위</span><strong>{selected.balance.toLocaleString("ko-KR")} P</strong></div><div className="record-periods" aria-label="조회 기간">{([1,7,30,0] as const).map((value)=><button key={value} aria-pressed={days===value} onClick={()=>onDays(value)}>{value===0?"전체":value===1?"24시간":`${value}일`}</button>)}</div></div>
        <div className="npc-ledger-kpis"><article><span>순손익</span><strong className={report.net>0?"is-gain":report.net<0?"is-loss":""}>{signedPoints(report.net)}</strong></article><article><span>정산</span><strong>{report.settlements}건</strong><small>수익 {report.gains} · 손실 {report.losses}</small></article><article><span>최대 수익</span><strong className="is-gain">{signedPoints(report.largestGain)}</strong></article><article><span>최대 손실</span><strong className="is-loss">{signedPoints(report.largestLoss)}</strong></article></div>
        <LedgerTrend values={report.dailyNet}/>
        <section className="npc-table-breakdown"><h3>게임별 손익</h3><div>{report.byTable.map((item)=><button key={item.tableId} aria-pressed={tableFilter===item.tableId} onClick={()=>setTableFilter((current)=>current===item.tableId?"all":item.tableId)}><span>{tableName(item.tableId)}</span><small>{item.settlements}건 · 노출 {item.exposure.toLocaleString("ko-KR")} P</small><strong className={item.net>0?"is-gain":item.net<0?"is-loss":""}>{signedPoints(item.net)}</strong></button>)}</div></section>
        {report.opponents.length>0&&<section className="npc-opponent-summary"><h3>자주 만난 상대</h3><div>{report.opponents.slice(0,5).map((item)=><article key={item.npcId}><span>{names.get(item.npcId)??item.npcId}</span><small>{item.matches}대국</small><strong className={item.net>0?"is-gain":item.net<0?"is-loss":""}>{signedPoints(item.net)}</strong></article>)}</div></section>}
        <section className="npc-receipts"><div className="ledger-heading"><span>전체 정산 기록</span><small>{tableFilter==="all"?"모든 게임":tableName(tableFilter)}</small></div><ol>{filtered.slice(0,visible).map((entry)=><li key={entry.roundId}><div><strong>{tableName(entry.tableId)} · {settlementLabel(entry,names)}</strong><small>{formatCasinoKstTimestamp(entry.utcSecond)}{entry.participantIds.length>1?` · 상대 ${entry.participantIds.filter((id)=>id!==entry.npcId).map((id)=>names.get(id)??id).join(", ")}`:""}</small></div><span><small>{entry.stake===0?"무료":`${entry.stake} P ×${entry.reservedAmount/entry.stake}`}</small><strong className={entry.delta>0?"is-gain":entry.delta<0?"is-loss":""}>{signedPoints(entry.delta)}</strong></span></li>)}</ol>{filtered.length>visible&&<button className="record-more" onClick={()=>setVisible((value)=>value+50)}>50건 더 보기</button>}</section>
      </div>}
    </section>
  </div>;
}

function LedgerTrend({values}:{values:readonly Readonly<{kstDay:number;net:number}>[]}):React.ReactElement{
  if(values.length===0)return <section className="ledger-trend is-empty"><span>이 기간에는 정산 기록이 없습니다.</span></section>;
  let cursor=0;const points=values.map((entry)=>{cursor+=entry.net;return cursor;});
  const minimum=Math.min(0,...points),maximum=Math.max(0,...points),span=Math.max(1,maximum-minimum);
  const coordinates=points.map((value,index)=>`${points.length===1?50:index/(points.length-1)*100},${46-(value-minimum)/span*42}`).join(" ");
  return <section className="ledger-trend" aria-label={`기간 누적 손익 ${signedPoints(cursor)}`}><div><span>잔고 흐름</span><strong className={cursor>0?"is-gain":cursor<0?"is-loss":""}>{signedPoints(cursor)}</strong></div><svg viewBox="0 0 100 50" preserveAspectRatio="none" role="img"><polyline points={coordinates}/></svg></section>;
}


/** The leader alone gets real foil. It is the only holo layer on this screen. */
function LedgerPortrait({ name, src, crowned }: { name: string; src: string | undefined; crowned: boolean }): React.ReactElement {
  const face = <span className="ledger-portrait">
    <span aria-hidden="true">{name.slice(0, 1)}</span>
    {src && <img src={src} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}
  </span>;
  return crowned ? <HoloFoil className="ledger-crown" tilt={false}>{face}</HoloFoil> : face;
}

function TapeLine({ event, names, currentUtcSecond, newest = false }: { event: CasinoTapeEvent; names: ReadonlyMap<string,string>; currentUtcSecond: number; newest?: boolean }): React.ReactElement {
  const age = Math.max(0, currentUtcSecond - event.utcSecond);
  const name = names.get(event.npcId) ?? event.npcId;
  const actionLabel = event.predictedNpcId
    ? `${names.get(event.predictedNpcId)??event.predictedNpcId} ${event.predictionMarket==="joker-holder"?"꼴찌":"우승"} 예측`
    : event.label;
  const directionClass = event.tone === "gain" ? " is-rising" : event.tone === "loss" ? " is-falling" : event.tone ? " is-balanced" : "";
  return <span data-tape-key={event.id} className={`ledger-activity-line is-${event.kind}${event.tone ? ` is-tone-${event.tone}` : ""}${directionClass}${newest ? " is-newest" : ""}`}>
    <b>{name}</b><small>{ageLabel(age)}</small><span><i>{tableName(event.tableId)}</i> · {actionLabel}</span><strong className="ca-num">{event.delta !== undefined
      ? signedPoints(event.delta)
      : event.stake === 0 ? "FREE" : `${event.stake} P${event.multiplier?` ×${event.multiplier}`:""}`}</strong>
  </span>;
}

function SettlementLine({ settlement, names, currentUtcSecond }: { settlement: NpcRoundSettlement; names: ReadonlyMap<string,string>; currentUtcSecond: number }): React.ReactElement {
  const name = names.get(settlement.npcId) ?? settlement.npcId;
  const delta = settlement.delta;
  const direction = delta > 0 ? "gain" : delta < 0 ? "loss" : "flat";
  const directionLabel = delta > 0 ? "획득" : delta < 0 ? "손실" : "변동 없음";
  const symbol = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  const age = Math.max(0, currentUtcSecond - settlement.utcSecond);
  const fresh = age < 15;
  const leverage = settlement.stake === 0 ? null : settlement.reservedAmount / settlement.stake;
  return <article
    className={`ledger-settlement-line is-${direction}${fresh ? " is-fresh" : ""}`}
    data-direction={direction}
    aria-label={`${name}, ${tableName(settlement.tableId)}, ${ageLabel(age)}, ${directionLabel} ${Math.abs(delta)} 포인트`}
  >
    <div><b>{name}</b><small>{ageLabel(age)}</small></div>
    <span>{tableName(settlement.tableId)} · {settlementLabel(settlement,names)}{leverage === null ? "" : ` · ${leverage}배`}</span>
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
          {presence.phase === "spectating" && <small>관전</small>}
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
  if (tableId === "temerosa-high-low") return <span className={`mini-poker ${active ? "is-running" : ""}`}><i /><b>↑</b><b>?</b><b>↓</b></span>;
  if (tableId === "temerosa-five-card-draw") return <span className={`mini-poker ${active ? "is-running" : ""}`}><i /><b>♣</b><b>♦</b><b>♠</b></span>;
  return <span className={`mini-old-maid ${active ? "is-running" : ""}`}><i /><i /><i /><i /></span>;
}

function phasePriority(phase: NpcPresence["phase"]): number {
  if (phase === "settling") return 0;
  if (phase === "approaching") return 1;
  if (phase === "playing") return 2;
  if (phase === "spectating") return 3;
  if (phase === "leaving") return 4;
  return 5;
}

function tableName(tableId: CasinoLedgerSourceId): string {
  if (tableId === "npc-income") return "본업 수입";
  if (tableId === "temerosa-old-maid") return "도둑잡기";
  if (tableId === "temerosa-match-pairs") return "짝맞추기";
  if (tableId === "temerosa-slot") return "슬롯";
  if (tableId === "temerosa-high-low") return "하이로우";
  if (tableId === "temerosa-five-card-draw") return "파이브 카드 드로";
  if (tableId === "temerosa-side-market") return "관전 사이드 베팅";
  if (tableId === "temerosa-blackjack") return "블랙잭";
  if (tableId === "temerosa-doubt") return "다우트";
  if (tableId === "temerosa-one-card") return "원카드";
  if (tableId === "temerosa-texas-holdem") return "텍사스 홀덤";
  return "인디언 포커";
}

function ageLabel(seconds: number): string {
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분`;
}

interface CasinoTapeEvent {
  id: string;
  npcId: string;
  tableId: CasinoLedgerSourceId;
  utcSecond: number;
  kind: "play" | "settlement";
  label: string;
  stake: number;
  delta?: number;
  tone?: NpcMatchSettlementTone;
  predictedNpcId?: string;
  predictionMarket?: "first-place" | "joker-holder";
  multiplier?: number;
}

function casinoTape(playEvents: readonly NpcPlayEvent[], settlements: readonly NpcMatchSettlement[], currentUtcSecond: number, names: ReadonlyMap<string,string>): readonly CasinoTapeEvent[] {
  const play: CasinoTapeEvent[] = playEvents.map((event) => ({
    id: event.eventId, npcId: event.npcId, tableId: event.tableId, utcSecond: event.utcSecond,
    kind: "play", label: playEventLabel(event.code, event.stake), stake: event.stake,
    ...(event.predictedNpcId?{predictedNpcId:event.predictedNpcId}:{}),
    ...(event.predictionMarket?{predictionMarket:event.predictionMarket}:{}),
    ...(event.multiplier?{multiplier:event.multiplier}:{}),
  }));
  const settlementEvents: CasinoTapeEvent[] = settlements.flatMap((settlement) => {
    return npcMatchSettlementEntriesByNpc(settlement).map((entries) => {
      const npcId = entries[0]!.npcId;
      const delta = entries.reduce((sum, entry) => sum + entry.delta, 0);
      const wager = entries.find((entry) => entry.stake > 0) ?? entries[0]!;
      const labels = [...new Set(entries.map((entry) => settlementLabel(entry, names)))];
      const leverage = wager.stake === 0 ? "" : ` · ${wager.reservedAmount / wager.stake}배`;
      return {
        id:`settlement:${settlement.matchId}:${npcId}`,
        npcId,tableId:settlement.tableId,utcSecond:settlement.utcSecond,
        kind:"settlement",label:`${labels.join(" + ")}${leverage}`,
        stake:wager.stake,delta,tone:delta>0?"gain":delta<0?"loss":"flat",
      };
    });
  });
  return [...play, ...settlementEvents]
    .filter((event) => event.utcSecond <= currentUtcSecond)
    .sort((left, right) => right.utcSecond - left.utcSecond || compareText(left.id, right.id));
}

function signedPoints(delta: number): string {
  return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)} P`;
}

function playEventLabel(code: NpcPlayEventCode, stake: number): string {
  if (code === "table-enter") return "테이블 입장";
  if (code === "wager-placed") return stake === 0 ? "무료 대국 시작" : "판돈 투입";
  if (code === "prediction-wager-placed") return "예측 베팅 잠금";
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
  if (code === "high-low-guess") return "높고 낮음 예측";
  if (code === "high-low-hit") return "연속 적중";
  if (code === "high-low-cashout") return "수익 확정";
  return "표정 읽기";
}

function settlementLabel(settlement: NpcRoundSettlement, names?: ReadonlyMap<string,string>): string {
  if (settlement.tableId === "temerosa-slot") {
    const lines = Number(settlement.resultKind.replace("lines-", ""));
    return lines > 0 ? `${lines}줄 적중` : "당첨 없음";
  }
  if (settlement.tableId === "indian-poker") return "칩 정산";
  if (settlement.tableId === "temerosa-five-card-draw") return settlement.resultKind === "draw" ? "팟 분할" : settlement.resultKind === "win" ? "팟 획득" : "대국 패배";
  if (settlement.tableId === "temerosa-high-low") {
    const [kind,count]=settlement.resultKind.split("-");
    return kind==="cashout"?`${count}연속 수익 확정`:`${count}번째 예측 실패`;
  }
  if (settlement.tableId === "temerosa-match-pairs") return "대국 정산";
  if(settlement.prediction){
    const target=names?.get(settlement.prediction.predictedNpcId)??settlement.prediction.predictedNpcId;
    const market=settlement.prediction.market==="first-place"?"우승":"꼴찌";
    const outcome=settlement.prediction.won?"적중":"실패";
    if(settlement.rankReward)return `${settlement.rankReward.rank}위 보상 · 자기 우승 ${outcome}`;
    return `${target} ${market} 예측 ${outcome}`;
  }
  return settlement.rankReward?`${settlement.rankReward.rank}위 보상`:"순위 보상";
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
