import { casinoMarketCredit, type CasinoSpectatorMarket } from "@lucky-arcade/casino-ledger";
import type { WagerMultiplier } from "@lucky-arcade/engine";
import type { GameWagerReceipt, PredictionStake } from "@lucky-arcade/persistence";
import { useEffect, useMemo, useState } from "react";
import { parseSideMarketChoice } from "../../lib/side-market.ts";
import "./casino-side-market.css";

const STAKES = [10, 50, 200] as const satisfies readonly PredictionStake[];
const MULTIPLIERS = [2, 3, 4, 5] as const satisfies readonly WagerMultiplier[];

export default function CasinoSideMarket({
  markets, wagers, balance, currentUtcSecond, busy, error, onBet,
}: {
  markets: readonly CasinoSpectatorMarket[];
  wagers: readonly GameWagerReceipt[];
  balance: number;
  currentUtcSecond: number;
  busy: boolean;
  error?: string;
  onBet(market: CasinoSpectatorMarket, outcomeId: string, stake: PredictionStake, multiplier: WagerMultiplier): Promise<void>;
}): React.ReactElement | null {
  const wagerMarket = markets.find((market) => wagers.some((wager) => wager.outcomeKey === market.marketId));
  const preferred = wagerMarket
    ?? markets.find((market) => market.phase === "open")
    ?? markets.find((market) => market.phase === "locked")
    ?? markets.find((market) => market.phase === "upcoming")
    ?? markets[0];
  const [marketId, setMarketId] = useState(preferred?.marketId ?? "");
  const [manualSelection, setManualSelection] = useState(false);
  const market = markets.find((candidate) => candidate.marketId === marketId) ?? preferred;
  const [outcomeId, setOutcomeId] = useState("");
  const [stake, setStake] = useState<PredictionStake>(10);
  const [multiplier, setMultiplier] = useState<WagerMultiplier>(2);
  useEffect(() => { if (preferred && !markets.some((candidate) => candidate.marketId === marketId)) setMarketId(preferred.marketId); }, [marketId, markets, preferred]);
  useEffect(() => { if (wagerMarket && !manualSelection) setMarketId(wagerMarket.marketId); }, [manualSelection, wagerMarket?.marketId]);
  useEffect(() => { setOutcomeId(market?.outcomes[0]?.outcomeId ?? ""); }, [market?.marketId]);
  const wager = market ? wagers.find((candidate) => candidate.outcomeKey === market.marketId) : undefined;
  const choice = wager ? parseSideMarketChoice(wager) : null;
  const selected = market?.outcomes.find((outcome) => outcome.outcomeId === outcomeId);
  const exposure = stake * multiplier;
  const projectedCredit = selected && exposure <= selected.quote.maxExposure ? casinoMarketCredit(exposure, selected.quote) : 0;
  const canBet = Boolean(market?.phase === "open" && selected && !wager && exposure <= selected.quote.maxExposure && balance >= exposure && !busy);
  const marketLabel = market?.kind === "joker-holder" ? "마지막 조커" : "승자";
  if (!market) return null;
  return <section className={`casino-side-market phase-${market.phase} ca-glare`} aria-labelledby="side-market-heading">
    <header>
      <div><span className="ca-label">INTEGRATED SPECTATOR MARKET</span><h3 id="side-market-heading" className="ca-serif">통합 관전 사이드 베팅</h3></div>
      <strong>{phaseLabel(market, currentUtcSecond)}</strong>
    </header>
    {markets.length > 1 && <div className="side-market-tabs" aria-label="예정 대국 선택">{markets.map((candidate) => <button key={candidate.marketId} aria-pressed={candidate.marketId === market.marketId} onClick={() => { setManualSelection(true); setMarketId(candidate.marketId); }}>{candidate.title}<small>{shortPhase(candidate, currentUtcSecond)}</small></button>)}</div>}
    <div className="side-market-body">
      <div className="side-market-matchup">
        <span>{market.rulesLabel}</span>
        <h4>{market.outcomes.filter((outcome) => outcome.npcId).map((outcome) => outcome.label).join("  VS  ")}</h4>
        <small>카지노 일정이 만든 대진입니다. 대진을 고쳐 만들거나 같은 시장에 다시 걸 수 없습니다.</small>
      </div>
      <div className="side-market-outcomes" aria-label={`${marketLabel} 선택`}>
        {market.outcomes.map((outcome) => {
          const won = market.winningOutcomeId === outcome.outcomeId;
          return <button key={outcome.outcomeId} aria-pressed={(choice?.outcomeId ?? outcomeId) === outcome.outcomeId} disabled={Boolean(wager) || market.phase !== "open" || busy} className={market.phase === "settled" ? won ? "is-winner" : "is-loser" : ""} onClick={() => setOutcomeId(outcome.outcomeId)}>
            <strong>{outcome.label}</strong><span>{decimalOdds(outcome.quote.payoutBps)}배</span><small>추정 {(outcome.quote.probabilityBps / 100).toFixed(1)}%</small>
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
          <button className="ca-gold-btn ca-press" disabled={!canBet} onClick={() => { if (selected) void onBet(market, selected.outcomeId, stake, multiplier); }}>{market.phase === "upcoming" ? "접수 대기" : market.phase === "open" ? balance < exposure ? "포인트 부족" : exposure > (selected?.quote.maxExposure ?? 0) ? "노출 한도 초과" : busy ? "처리 중…" : "베팅 확정" : "접수 마감"}</button>
        </div>
      </>}
    </div>
    {error && <p className="side-market-error" role="alert">{error}</p>}
  </section>;
}

function SideMarketReceipt({ wager, market }: { wager: GameWagerReceipt; market: CasinoSpectatorMarket }): React.ReactElement {
  const choice = parseSideMarketChoice(wager);
  const label = market.outcomes.find((outcome) => outcome.outcomeId === choice?.outcomeId)?.label ?? "선택 결과";
  const net = wager.settlementCredit - wager.reservedAmount;
  return <div className={`side-market-receipt status-${wager.status}`}>
    <div><span>내 베팅</span><strong>{label} · {choice?.multiplier ?? "?"}×</strong></div>
    <div><span>예약</span><strong>{wager.reservedAmount.toLocaleString("ko-KR")} P</strong></div>
    <div><span>상태</span><strong>{wager.status === "reserved" ? "마감 대기" : wager.status === "settled" ? net > 0 ? `적중 +${net.toLocaleString("ko-KR")} P` : `실패 −${wager.reservedAmount.toLocaleString("ko-KR")} P` : wager.status === "refunded" ? "무효 · 전액 환불" : "정산 완료"}</strong></div>
  </div>;
}

function phaseLabel(market: CasinoSpectatorMarket, now: number): string {
  if (market.phase === "upcoming") return `${duration(market.opensAtUtcSecond - now)} 후 접수`;
  if (market.phase === "open") return `${duration(market.closesAtUtcSecond - now)} 후 마감`;
  if (market.phase === "locked") return `마감 · ${duration(market.settlesAtUtcSecond - now)} 후 정산`;
  return `정산 완료 · ${market.winningOutcomeId ? market.outcomes.find((outcome) => outcome.outcomeId === market.winningOutcomeId)?.label ?? "결과 확정" : "결과 확정"}`;
}
function shortPhase(market: CasinoSpectatorMarket, now: number): string { return market.phase === "settled" ? "완료" : market.phase === "locked" ? "대국 중" : market.phase === "open" ? `${duration(market.closesAtUtcSecond - now)} 남음` : `${duration(market.opensAtUtcSecond - now)} 뒤`; }
function duration(seconds: number): string { const value = Math.max(0, seconds); return value < 60 ? `${value}초` : `${Math.ceil(value / 60)}분`; }
function decimalOdds(payoutBps: number): string { return (payoutBps / 10_000).toFixed(2); }
