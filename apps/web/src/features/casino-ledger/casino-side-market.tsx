import { casinoMarketCredit, type CasinoSpectatorMarket, type CasinoSpectatorSchedule } from "@lucky-arcade/casino-ledger";
import { CasinoPersonName, casinoLedgerEmotionForProfit, useCasinoLedgerPortrait } from "@lucky-arcade/casino-ledger/react";
import type { WagerMultiplier } from "@lucky-arcade/engine";
import type { GameWagerReceipt, PredictionStake } from "@lucky-arcade/persistence";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseSideMarketChoice } from "../../lib/side-market.ts";
import "./casino-side-market.css";
import "./casino-side-market-replay.css";

const STAKES = [10, 50, 200] as const satisfies readonly PredictionStake[];
const MULTIPLIERS = [2, 3, 4, 5] as const satisfies readonly WagerMultiplier[];
const KST_TIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
const CasinoSideMarketReplayView = lazy(() => import("./casino-side-market-replay-view.tsx"));

export default function CasinoSideMarket({
  schedule, ticketMarkets, wagers, balance, npcPeriodProfits, currentUtcSecond, busy, error, onBet,
}: {
  schedule: CasinoSpectatorSchedule;
  ticketMarkets: readonly CasinoSpectatorMarket[];
  wagers: readonly GameWagerReceipt[];
  balance: number;
  npcPeriodProfits: Readonly<Record<string,number>>;
  currentUtcSecond: number;
  busy: boolean;
  error?: string;
  onBet(market: CasinoSpectatorMarket, outcomeId: string, stake: PredictionStake, multiplier: WagerMultiplier): Promise<void>;
}): React.ReactElement | null {
  const liveSchedule = useMemo(() => Object.freeze([...(schedule.current ? [schedule.current] : []), ...schedule.upcoming]), [schedule.current, schedule.upcoming]);
  const listedMarkets = useMemo(() => Object.freeze([...liveSchedule, ...schedule.recent]), [liveSchedule, schedule.recent]);
  const preferred = schedule.current ?? schedule.upcoming[0] ?? schedule.recent[0];
  const [marketId, setMarketId] = useState(preferred?.marketId ?? "");
  const manualSelection = useRef(false);
  const rawMarket = listedMarkets.find((candidate) => candidate.marketId === marketId) ?? preferred;
  const [outcomeId, setOutcomeId] = useState("");
  const [stake, setStake] = useState<PredictionStake>(10);
  const [multiplier, setMultiplier] = useState<WagerMultiplier>(2);
  const [replayMarket, setReplayMarket] = useState<CasinoSpectatorMarket>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [offeredMarket, setOfferedMarket] = useState<CasinoSpectatorMarket>();
  const [settlementNotice, setSettlementNotice] = useState("");
  const previousWagerStatuses = useRef<ReadonlyMap<string, GameWagerReceipt["status"]> | undefined>(undefined);
  const market = offeredMarket?.marketId === rawMarket?.marketId ? offeredMarket : rawMarket;
  const pricingReady = Boolean(rawMarket && offeredMarket?.marketId === rawMarket.marketId);

  useEffect(() => {
    if (!preferred) return;
    const selectedStillListed = listedMarkets.some((candidate) => candidate.marketId === marketId);
    if (!manualSelection.current || !selectedStillListed) {
      setMarketId(preferred.marketId);
      if (!selectedStillListed) manualSelection.current = false;
    }
  }, [listedMarkets, marketId, preferred?.marketId]);
  useEffect(() => { setOutcomeId(rawMarket?.outcomes[0]?.outcomeId ?? ""); }, [rawMarket?.marketId]);
  useEffect(() => {
    setOfferedMarket(undefined);
    if (!rawMarket) return;
    let alive = true;
    void import("../../lib/casino-side-market-replay-client.ts").then(({ resolveCasinoSideMarketOffer }) => resolveCasinoSideMarketOffer(rawMarket))
      .then((offer) => { if (alive) setOfferedMarket(offer); }).catch(() => undefined);
    return () => { alive = false; };
  }, [rawMarket?.marketId, rawMarket?.phase]);
  useEffect(() => {
    const previous = previousWagerStatuses.current;
    previousWagerStatuses.current = new Map(wagers.map((wager) => [wager.wagerId, wager.status]));
    if (!previous) return;
    const settled = wagers.find((wager) => previous.get(wager.wagerId) === "reserved" && wager.status !== "reserved");
    if (!settled) return;
    setSettlementNotice(historyStatus(settled));
    const timer = window.setTimeout(() => setSettlementNotice(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [wagers]);

  const wager = market ? wagers.find((candidate) => candidate.outcomeKey === market.marketId) : undefined;
  const choice = wager ? parseSideMarketChoice(wager) : null;
  const selected = market?.outcomes.find((outcome) => outcome.outcomeId === outcomeId);
  const exposure = stake * multiplier;
  const projectedCredit = selected && exposure <= selected.quote.maxExposure ? casinoMarketCredit(exposure, selected.quote) : 0;
  const canBet = Boolean(pricingReady && market?.phase === "open" && selected && !wager && exposure <= selected.quote.maxExposure && balance >= exposure && !busy);
  const marketLabel = market?.kind === "joker-holder" ? "마지막 조커" : "승자";
  if (!market) return null;

  const selectMarket = (next: CasinoSpectatorMarket) => { manualSelection.current = true; setMarketId(next.marketId); };
  return <section className={`casino-side-market phase-${market.phase} ca-glare`} aria-labelledby="side-market-heading">
    <header>
      <div><span className="ca-label">INTEGRATED SPECTATOR MARKET</span><h3 id="side-market-heading" className="ca-serif">통합 관전 사이드 베팅</h3></div>
      <div className="side-market-header-actions"><strong>{phaseLabel(market, currentUtcSecond)}</strong><button type="button" className="ca-ghost-btn" onClick={() => setHistoryOpen(true)}>내 베팅 {wagers.length}</button></div>
    </header>

    <div className="side-market-programme" aria-label="관전 편성표">
      <div className="side-market-tabs" aria-label="현재와 다음 편성">
        {liveSchedule.map((candidate) => <button key={candidate.marketId} aria-pressed={candidate.marketId === market.marketId} onClick={() => selectMarket(candidate)}>
          <span>{candidate === schedule.current ? candidate.phase === "open" ? "접수 중" : "LIVE" : kstTime(candidate.startsAtUtcSecond)}</span>
          <strong>{candidate.title}</strong><small>{shortPhase(candidate, currentUtcSecond)}</small>
        </button>)}
      </div>
      {schedule.recent.length > 0 && <div className="side-market-recent"><span>최근 결과 · 15분</span><div>{schedule.recent.map((candidate) => <button key={candidate.marketId} aria-pressed={candidate.marketId === market.marketId} onClick={() => selectMarket(candidate)}><b>{kstTime(candidate.startsAtUtcSecond)}</b> {candidate.title}<small>완료 · 다시 보기</small></button>)}</div></div>}
    </div>

    <div className="side-market-body">
      <div className="side-market-matchup">
        <span>{kstTime(market.startsAtUtcSecond)} · {market.rulesLabel}</span>
        <h4 className="side-market-matchup-names">{market.outcomes.filter((outcome) => outcome.npcId).map((outcome,index) => <span key={outcome.outcomeId}>{index>0&&<i>VS</i>}<CasinoPersonName qualifiedName={outcome.label}/></span>)}</h4>
        <small>카지노 원장이 만든 결정론 대진입니다. 대진을 고쳐 만들거나 같은 시장을 다시 걸 수 없습니다.</small>
      </div>
      <div className="side-market-outcomes" aria-label={`${marketLabel} 선택`}>
        {market.outcomes.map((outcome) => {
          const won = market.winningOutcomeId === outcome.outcomeId;
          const resultClass = market.phase === "settled" && market.winningOutcomeId ? won ? "is-winner" : "is-loser" : "";
          return <button key={outcome.outcomeId} aria-pressed={(choice?.outcomeId ?? outcomeId) === outcome.outcomeId} disabled={!pricingReady || Boolean(wager) || market.phase !== "open" || busy} className={resultClass} onClick={() => setOutcomeId(outcome.outcomeId)}>
            <strong className="side-market-outcome-person">
              {outcome.npcId&&<SideMarketPortrait npcId={outcome.npcId} name={outcome.label} periodProfit={npcPeriodProfits[outcome.npcId]??0}/>}
              <CasinoPersonName qualifiedName={outcome.label}/>
            </strong>
            <span className="side-market-odds">{pricingReady ? `${decimalOdds(outcome.quote.payoutBps)}배` : "계산 중"}</span><small>{pricingReady ? `실전 표본 ${(outcome.quote.probabilityBps / 100).toFixed(1)}%` : "실제 CPU 대국 분석"}</small>
          </button>;
        })}
      </div>
      {wager ? <SideMarketReceipt wager={wager} market={market} /> : <>
        <div className="side-market-controls">
          <fieldset><legend>판돈</legend>{STAKES.map((value) => <button key={value} aria-pressed={stake === value} disabled={busy} onClick={() => setStake(value)}>{value} P</button>)}</fieldset>
          <fieldset><legend>강도</legend>{MULTIPLIERS.map((value) => <button key={value} aria-pressed={multiplier === value} disabled={busy || stake * value > (selected?.quote.maxExposure ?? 0)} onClick={() => setMultiplier(value)}>{value}×</button>)}</fieldset>
        </div>
        <div className="side-market-ticket">
          <span>최대 손실 <b>{exposure.toLocaleString("ko-KR")} P</b></span>
          <span>적중 반환 <b>{projectedCredit.toLocaleString("ko-KR")} P</b></span>
          <button className="ca-gold-btn ca-press" disabled={!canBet} onClick={() => { if (selected) void onBet(market, selected.outcomeId, stake, multiplier); }}>{!pricingReady ? "배당 계산 중…" : market.phase === "upcoming" ? "접수 대기" : market.phase === "open" ? balance < exposure ? "포인트 부족" : exposure > (selected?.quote.maxExposure ?? 0) ? "노출 한도 초과" : busy ? "처리 중…" : "베팅 확정" : "접수 마감"}</button>
        </div>
      </>}
      <div className="side-market-watch">
        <button type="button" className="ca-gold-btn" disabled={currentUtcSecond < market.startsAtUtcSecond} onClick={() => setReplayMarket(market)}>
          {currentUtcSecond < market.startsAtUtcSecond ? `${duration(market.startsAtUtcSecond - currentUtcSecond)} 뒤 관전석 개방` : market.phase === "settled" ? "처음부터 다시 보기" : "관전석 입장"}
        </button>
        <small>예측 결과와 같은 실제 게임 리듀서 기록을 원본 게임 화면으로 재생합니다.</small>
      </div>
    </div>
    {settlementNotice && <p className="side-market-settlement-notice" role="status">관전 베팅 정산 · {settlementNotice}</p>}
    {error && <p className="side-market-error" role="alert">{error}</p>}
    {historyOpen && <SideMarketHistory wagers={wagers.slice(0, 20)} markets={ticketMarkets} onClose={() => setHistoryOpen(false)} onReplay={(ticketMarket) => { setHistoryOpen(false); setReplayMarket(ticketMarket); }} />}
    {replayMarket && <Suspense fallback={null}><CasinoSideMarketReplayView market={replayMarket} currentUtcSecond={currentUtcSecond} onClose={() => setReplayMarket(undefined)} /></Suspense>}
  </section>;
}

function SideMarketPortrait({npcId,name,periodProfit}:{npcId:string;name:string;periodProfit:number}):React.ReactElement{
  const resolved=useCasinoLedgerPortrait(npcId,{emotion:casinoLedgerEmotionForProfit(periodProfit)},undefined);
  return <span className="side-market-portrait" aria-hidden="true"><i>{name.slice(0,1)}</i>{resolved&&<SideMarketPortraitImage key={resolved} src={resolved}/>}</span>;
}

function SideMarketPortraitImage({src}:{src:string}):React.ReactElement|null{
  const [loaded,setLoaded]=useState(false);
  const [failed,setFailed]=useState(false);
  if(failed)return null;
  return <img className={loaded?"is-loaded":""} src={src} alt="" width={411} height={600} loading="lazy" decoding="async" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>;
}

function SideMarketHistory({ wagers, markets, onClose, onReplay }: { wagers: readonly GameWagerReceipt[]; markets: readonly CasinoSpectatorMarket[]; onClose(): void; onReplay(market: CasinoSpectatorMarket): void }): React.ReactElement {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);
  const byId = new Map(markets.map((market) => [market.marketId, market]));
  return createPortal(<div className="side-market-history-backdrop" role="dialog" aria-modal="true" aria-labelledby="side-market-history-heading" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="side-market-history">
      <header><div><span className="ca-label">LOCAL BETTING LEDGER</span><h3 id="side-market-history-heading">내 베팅 기록</h3></div><button type="button" className="ca-ghost-btn" onClick={onClose}>닫기</button></header>
      {wagers.length === 0 ? <p className="side-market-history-empty">아직 관전 베팅 기록이 없습니다.</p> : <ol>{wagers.map((wager) => {
        const market = byId.get(wager.outcomeKey);
        const choice = parseSideMarketChoice(wager);
        const outcome = market?.outcomes.find((candidate) => candidate.outcomeId === choice?.outcomeId);
        return <li key={wager.wagerId}>
          <div><span>{market ? `${kstTime(market.startsAtUtcSecond)} · ${market.title}` : "지난 관전 대국"}</span><strong>{outcome?.label ?? "선택 결과"} · {choice?.multiplier ?? "?"}×</strong><small>{historyStatus(wager)}</small></div>
          <div><b>{wager.reservedAmount.toLocaleString("ko-KR")} P</b>{market && market.phase === "settled" && <button type="button" onClick={() => onReplay(market)}>다시 보기</button>}</div>
        </li>;
      })}</ol>}
      {wagers.length >= 20 && <small className="side-market-history-limit">최근 20건을 표시합니다.</small>}
    </section>
  </div>, document.body);
}

function SideMarketReceipt({ wager, market }: { wager: GameWagerReceipt; market: CasinoSpectatorMarket }): React.ReactElement {
  const choice = parseSideMarketChoice(wager);
  const label = market.outcomes.find((outcome) => outcome.outcomeId === choice?.outcomeId)?.label ?? "선택 결과";
  const net = wager.settlementCredit - wager.reservedAmount;
  return <div className={`side-market-receipt status-${wager.status}`}>
    <div><span>내 베팅</span><strong>{label} · {choice?.multiplier ?? "?"}×</strong></div>
    <div><span>예약</span><strong>{wager.reservedAmount.toLocaleString("ko-KR")} P</strong></div>
    <div><span>상태</span><strong>{wager.status === "reserved" ? "마감 대기" : wager.status === "settled" ? net > 0 ? `적중 +${net.toLocaleString("ko-KR")} P` : `실패 −${wager.reservedAmount.toLocaleString("ko-KR")} P` : wager.status === "refunded" ? "무효 · 전액 반환" : "정산 완료"}</strong></div>
  </div>;
}

function historyStatus(wager: GameWagerReceipt): string {
  const net = wager.settlementCredit - wager.reservedAmount;
  if (wager.status === "reserved") return "정산 대기";
  if (wager.status === "refunded") return "무효 · 전액 반환";
  if (wager.status === "settled") return net > 0 ? `적중 · 순이익 +${net.toLocaleString("ko-KR")} P` : `실패 · 손실 −${wager.reservedAmount.toLocaleString("ko-KR")} P`;
  return "정산 완료";
}
function phaseLabel(market: CasinoSpectatorMarket, now: number): string {
  if (market.phase === "upcoming") return `${duration(market.opensAtUtcSecond - now)} 뒤 접수`;
  if (market.phase === "open") return `${duration(market.closesAtUtcSecond - now)} 뒤 마감`;
  if (market.phase === "locked") return `대국 중 · ${duration(market.settlesAtUtcSecond - now)} 뒤 정산`;
  return "정산 완료 · 다시 보기 가능";
}
function shortPhase(market: CasinoSpectatorMarket, now: number): string { return market.phase === "settled" ? "완료" : market.phase === "locked" ? "대국 중" : market.phase === "open" ? `${duration(market.closesAtUtcSecond - now)} 남음` : `${duration(market.opensAtUtcSecond - now)} 뒤`; }
function duration(seconds: number): string { const value = Math.max(0, seconds); return value < 60 ? `${value}초` : `${Math.ceil(value / 60)}분`; }
function decimalOdds(payoutBps: number): string { return (payoutBps / 10_000).toFixed(2); }
function kstTime(utcSecond: number): string { return KST_TIME.format(new Date(utcSecond * 1_000)); }
