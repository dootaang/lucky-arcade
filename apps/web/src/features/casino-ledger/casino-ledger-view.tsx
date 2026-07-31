import {
  TEMEROSA_HOUSE_ACCOUNT_ID,
  casinoKstDayAtUtcMinute,
  casinoUtcSecondAtKstDay,
  casinoPresenceAt,
  casinoSpectatorMarketPresencesAt,
  casinoSpectatorMarketByIdAt,
  casinoSpectatorScheduleAt,
  npcLiveBalancesAt,
  npcSessionSettlements,
  recentNpcPlayEventsAt,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  type CasinoTransaction,
  type NpcRoundSettlement,
  type CasinoSpectatorMarket,
} from "@lucky-arcade/casino-ledger";
import type { WagerMultiplier } from "@lucky-arcade/engine";
import type { GameWagerReceipt, PredictionStake } from "@lucky-arcade/persistence";
import CasinoLedgerPanel, { type CasinoLiveTable } from "@lucky-arcade/casino-ledger/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { casinoClockFromSample, deviceCasinoClockSample, rememberCasinoClockSecond, stabilizeCasinoClockSample, type CasinoClockSample } from "../../lib/casino-clock.ts";
import { latestCasinoSettlementsAt, nextCasinoArrivalAt } from "../../lib/casino-feed.ts";
import { listCasinoTransactions, readPlayerCasinoProfitSince } from "../../lib/database.ts";
import { casinoJournalSettlements } from "../../lib/casino-journal.ts";
import { personalCasinoWorldlineAt } from "../../lib/casino-worldline.ts";
import { loadTemerosaCasinoManifest, temerosaContentUrl, type TemerosaManifest } from "../../lib/temerosa-content.ts";
import { reconcileSideMarketWagers, reserveSideMarketWager } from "../../lib/side-market.ts";
import CasinoSideMarket from "./casino-side-market.tsx";

const LEGACY_PORTRAITS: Readonly<Record<string, string>> = Object.freeze({
  pale: temerosaContentUrl("0.6.0", "assets/margin/gallery-finale-pale-neutral/sm.webp"),
  kano: temerosaContentUrl("0.6.0", "assets/margin/gallery-finale-kano-neutral/sm.webp"),
  bacikal: temerosaContentUrl("0.6.0", "assets/margin/gallery-bestiaization-bacikal-neutral/sm.webp"),
  riel: temerosaContentUrl("0.6.0", "assets/margin/gallery-bestiaization-riel-neutral/sm.webp"),
  wares: temerosaContentUrl("0.6.0", "assets/margin/gallery-finale-wares-neutral/sm.webp"),
});

export default function CasinoLedgerView({ userBalance, tables, onPlay, onBalanceChange }: { userBalance: number; tables: readonly CasinoLiveTable[]; onPlay(id: string): void; onBalanceChange(balance: number): void }): React.ReactElement | null {
  const [loaded, setLoaded] = useState<{ sample: CasinoClockSample; manifest?: TemerosaManifest }>();
  const [userPeriodProfit, setUserPeriodProfit] = useState(0);
  const [journal, setJournal] = useState<readonly CasinoTransaction[]>([]);
  const [sideWagers, setSideWagers] = useState<readonly GameWagerReceipt[]>([]);
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketError, setMarketError] = useState<string>();
  const [, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadTemerosaCasinoManifest().then(({ manifest, clockSample }) => {
      if (alive) setLoaded({ sample: clockSample, manifest });
    }).catch(() => {
      if (alive) setLoaded({ sample: deviceCasinoClockSample() });
    });
    return () => { alive = false; };
  }, []);

  const clock = useMemo(() => loaded ? casinoClockFromSample(stabilizeCasinoClockSample(loaded.sample)) : undefined, [loaded]);
  const absoluteKstDay = clock ? casinoKstDayAtUtcMinute(clock.utcMinute()) : undefined;
  const currentUtcSecond = clock?.utcSecond();
  const settlementTick = currentUtcSecond === undefined ? undefined : Math.floor(currentUtcSecond / 10);
  const earliestProfitDay = TEMEROSA_NPC_LEDGER_CONTRACT.profitHistory[0]?.kstDay ?? TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay;
  const profitStartKstDay = absoluteKstDay === undefined ? undefined : Math.max(earliestProfitDay, absoluteKstDay - 6);
  const journalSettlements = useMemo(() => casinoJournalSettlements(journal), [journal]);
  const loadNpcHistory=useCallback((npcId:string,days:number):readonly NpcRoundSettlement[]=>{
    if(!clock)return Object.freeze([]);
    const startSecond=days===0?0:clock.utcSecond()-days*86_400;
    const local=journalSettlements.filter((entry)=>entry.npcId===npcId&&entry.utcSecond>=startSecond);
    if(npcId==="player:local"||npcId===TEMEROSA_HOUSE_ACCOUNT_ID)return local;
    const worldline=personalCasinoWorldlineAt(TEMEROSA_NPC_GAMBLING_PROFILES,clock,TEMEROSA_NPC_LEDGER_CONTRACT,journal);
    const autonomous=worldline.activities.filter((entry)=>entry.npcId===npcId&&entry.utcSecond>=startSecond).flatMap((entry)=>npcSessionSettlements(entry.npcId,entry.utcSecond,entry.session));
    return Object.freeze([...autonomous,...local].toSorted((left,right)=>right.utcSecond-left.utcSecond||left.roundId.localeCompare(right.roundId)));
  },[clock,journal,journalSettlements]);
  useEffect(() => {
    if (profitStartKstDay === undefined) return;
    let alive = true;
    void readPlayerCasinoProfitSince(casinoUtcSecondAtKstDay(profitStartKstDay)).then((profit) => { if (alive) setUserPeriodProfit(profit); }).catch(() => { if (alive) setUserPeriodProfit(0); });
    return () => { alive = false; };
  }, [profitStartKstDay, userBalance]);
  useEffect(() => {
    let alive = true;
    void listCasinoTransactions().then((transactions) => { if (alive) setJournal(transactions); }).catch(() => { if (alive) setJournal([]); });
    return () => { alive = false; };
  }, [userBalance]);
  useEffect(() => {
    if (currentUtcSecond === undefined) return;
    let alive = true;
    void reconcileSideMarketWagers(currentUtcSecond).then(async (result) => {
      if (!alive) return;
      setSideWagers(result.wagers);
      onBalanceChange(result.walletBalance);
      const transactions = await listCasinoTransactions();
      if (alive) setJournal(transactions);
    }).catch(() => { if (alive) setMarketError("예약된 관전 베팅을 정산하지 못했습니다. 잠시 뒤 다시 확인합니다."); });
    return () => { alive = false; };
  }, [settlementTick, currentUtcSecond === undefined, onBalanceChange]);
  useEffect(() => {
    if (!clock) return;
    let previousSecond = clock.utcSecond();
    rememberCasinoClockSecond(previousSecond);
    const refresh = () => {
      const nextSecond = clock.utcSecond();
      if (nextSecond !== previousSecond) {
        previousSecond = nextSecond;
        rememberCasinoClockSecond(nextSecond);
        setRevision((value) => value + 1);
      }
    };
    const interval = window.setInterval(refresh, 1_000);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [clock]);
  const ticketMarkets = useMemo(() => {
    if (!clock) return Object.freeze([]) as readonly CasinoSpectatorMarket[];
    return Object.freeze(sideWagers.slice(0, 20).flatMap((wager) => {
      const market = casinoSpectatorMarketByIdAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, wager.outcomeKey);
      return market ? [market] : [];
    }));
  }, [clock, sideWagers]);

  if (!loaded || !clock) return <section className="casino-ledger-loading ca-label" aria-label="카지노 원장 불러오는 중">원장 정리 중…</section>;
  try {
    const currentUtcSecond = clock.utcSecond();
    const worldline = personalCasinoWorldlineAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, journal);
    const periodStartDay = profitStartKstDay ?? absoluteKstDay ?? TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay;
    const periodStartSecond = casinoUtcSecondAtKstDay(periodStartDay);
    const carriedProfits = TEMEROSA_NPC_LEDGER_CONTRACT.profitHistory.filter((entry)=>entry.kstDay>=periodStartDay);
    const profitPeriod = { coveredDays: Math.max(1,Math.min(7,(absoluteKstDay??TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay)-periodStartDay+1)), profits: Object.freeze(Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [profile.id, worldline.activities.filter((entry)=>entry.npcId===profile.id&&entry.utcSecond>=periodStartSecond).reduce((sum,entry)=>sum+entry.session.delta,0)+journalSettlements.filter((entry) => entry.npcId === profile.id && entry.utcSecond >= periodStartSecond).reduce((sum, entry) => sum + entry.delta, 0)+carriedProfits.reduce((sum,entry)=>sum+(entry.profits[profile.id]??0),0)]))) };
    const sideMarketSchedule = casinoSpectatorScheduleAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT);
    const sideMarkets = Object.freeze([...(sideMarketSchedule.current ? [sideMarketSchedule.current] : []), ...sideMarketSchedule.upcoming, ...sideMarketSchedule.recent]);
    const basePresences = casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT);
    const marketPresences = casinoSpectatorMarketPresencesAt(sideMarkets, currentUtcSecond);
    const marketIds = new Set(marketPresences.map((presence) => presence.npcId));
    const presences = Object.freeze([...basePresences.filter((presence) => !marketIds.has(presence.npcId)), ...marketPresences]);
    const settlements = latestCasinoSettlementsAt(worldline.activities, journalSettlements, currentUtcSecond);
    const liveBalances = npcLiveBalancesAt(worldline.npcBalances, TEMEROSA_NPC_GAMBLING_PROFILES, presences, clock);
    const houseBalance = worldline.houseBalance;
    const playEvents = recentNpcPlayEventsAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, 512);
    const placeSideBet = async (market: CasinoSpectatorMarket, outcomeId: string, stake: PredictionStake, multiplier: WagerMultiplier) => {
      setMarketBusy(true); setMarketError(undefined);
      try {
        const result = await reserveSideMarketWager({ market, outcomeId, stake, multiplier });
        const reconciled = await reconcileSideMarketWagers(currentUtcSecond);
        setSideWagers(reconciled.wagers); onBalanceChange(result.walletBalance);
        setJournal(await listCasinoTransactions());
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : "";
        setMarketError(code === "game_outcome_already_wagered" ? "이 대국에는 이미 베팅했습니다." : code === "insufficient_points" ? "예약할 포인트가 부족합니다." : code === "side_market_closed" ? "방금 베팅 접수가 마감됐습니다." : code === "casino_counterparty_insufficient_points" ? "하우스 노출 한도에 도달해 이 베팅을 받을 수 없습니다." : "베팅을 예약하지 못했습니다.");
      } finally { setMarketBusy(false); }
    };
    return <><CasinoSideMarket schedule={sideMarketSchedule} ticketMarkets={ticketMarkets} wagers={sideWagers} balance={userBalance} currentUtcSecond={currentUtcSecond} busy={marketBusy} {...(marketError ? { error: marketError } : {})} onBet={placeSideBet} /><CasinoLedgerPanel
      npcBalances={liveBalances}
      npcSevenDayProfits={profitPeriod.profits}
      userBalance={userBalance}
      userSevenDayProfit={userPeriodProfit}
      houseBalance={houseBalance}
      profitPeriodDays={profitPeriod.coveredDays}
      settlements={settlements}
      playEvents={playEvents}
      portraits={portraitMap(loaded.manifest)}
      currentUtcSecond={currentUtcSecond}
      nextArrivalAt={nextCasinoArrivalAt(presences, currentUtcSecond)}
      clockSource={loaded.sample.source}
      presences={presences}
      tables={tables}
      onPlay={onPlay}
      loadNpcHistory={loadNpcHistory}
    /></>;
  } catch {
    return <section className="casino-ledger-loading ca-label">원장을 정리하지 못했습니다. 게임 테이블은 그대로 이용할 수 있습니다.</section>;
  }
}

function portraitMap(manifest?: TemerosaManifest): Readonly<Record<string, string>> {
  const portraits: Record<string, string> = { ...LEGACY_PORTRAITS };
  if (!manifest) return Object.freeze(portraits);
  for (const profile of TEMEROSA_NPC_GAMBLING_PROFILES) {
    if (portraits[profile.id]) continue;
    const candidates = manifest.assets.filter((asset) => asset.characterId === profile.id);
    const asset = candidates.find((candidate) => candidate.expression === "neutral") ?? candidates[0];
    const variant = asset?.variants.find((candidate) => candidate.size === "sm") ?? asset?.variants[0];
    if (variant) portraits[profile.id] = temerosaContentUrl(manifest.version, variant.path);
  }
  return Object.freeze(portraits);
}
