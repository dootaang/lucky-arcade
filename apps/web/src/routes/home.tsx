import { IconBrain, IconCards, IconClockPlay, IconDeviceGamepad2, IconHelpCircle, IconHome, IconMenu2, IconMoon, IconPlayerPlay, IconSettings, IconSparkles, IconSun, IconTrophy, IconX } from "@tabler/icons-react";
import type { RecentPlay } from "@lucky-arcade/persistence";
import { useCallback, useEffect, useState } from "react";
import { CabinetHost, getCabinetRegistration, listBuiltInCabinets, selectOpeningCabinet, type WebCabinetRegistration } from "../cabinets/registry.tsx";
import { CardImporter } from "../features/cards/card-importer.tsx";
import { ReportView } from "../features/cards/report-view.tsx";
import { analyzeCardFile } from "../lib/card-analysis.ts";
import { listCards, listRecentPlays, loadCardSource, replaceAnalyzedCard, type StoredCard } from "../lib/database.ts";
import { readWallet } from "../lib/wallet.ts";

export function Home() {
  const privatePreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("privateCabinets") === "1";
  const [cards, setCards] = useState<StoredCard[]>([]);
  const [selected, setSelected] = useState<StoredCard | null>(null);
  const [recent, setRecent] = useState<RecentPlay[]>([]);
  const [balance, setBalance] = useState(100);
  const [activeCabinet, setActiveCabinet] = useState<string | null>(null);
  const [menu, setMenu] = useState(false), [light, setLight] = useState(false);
  const refreshRecent = useCallback(() => { void listRecentPlays().then(setRecent); }, []);

  useEffect(() => {
    let alive = true;
    refreshRecent();
    void readWallet().then((wallet) => { if (alive) setBalance(wallet.balance); }).catch(() => undefined);
    void listCards().then(async (items) => {
      if (!alive) return;
      setCards(items); setSelected(items[0] ?? null);
      for (const item of items) {
        if (item.analyzed.contract === "analyzed-card/0.3") continue;
        const source = await loadCardSource(item.fingerprint);
        if (!source || !alive) continue;
        try {
          const upgraded = await replaceAnalyzedCard(item, await analyzeCardFile(source));
          if (!alive) return;
          setCards((current) => current.map((card) => card.fingerprint === upgraded.fingerprint ? upgraded : card));
          setSelected((current) => current?.fingerprint === upgraded.fingerprint ? upgraded : current);
        } catch { /* 기존 분석 결과는 그대로 사용할 수 있다. */ }
      }
    });
    return () => { alive = false; };
  }, [refreshRecent]);
  useEffect(() => { document.documentElement.dataset.theme = light ? "light" : "dark"; }, [light]);

  if (activeCabinet) return <CabinetHost cabinetId={activeCabinet} {...(selected ? { analyzed: selected.analyzed } : {})} onExit={() => { setActiveCabinet(null); refreshRecent(); void readWallet().then((wallet) => setBalance(wallet.balance)).catch(() => undefined); }} />;
  const imported = (card: StoredCard) => {
    setCards((current) => [card, ...current.filter((item) => item.fingerprint !== card.fingerprint)]);
    setSelected(card);
    setActiveCabinet(selectOpeningCabinet(card.analyzed.report, privatePreview));
  };
  const recentPlay = recent.find((item) => getCabinetRegistration(item.cabinetId, privatePreview) && (!item.cardFingerprint || cards.some((card) => card.fingerprint === item.cardFingerprint)));
  const recentCabinet = recentPlay ? getCabinetRegistration(recentPlay.cabinetId, privatePreview) : undefined;
  const builtIns = listBuiltInCabinets(privatePreview);

  return <div className="app-layout">
    <button className="mobile-menu" onClick={() => setMenu(true)} aria-label="메뉴 열기"><IconMenu2 /></button>
    {menu && <button className="sidebar-scrim" onClick={() => setMenu(false)} aria-label="메뉴 닫기" />}
    <aside className={`sidebar ${menu ? "open" : ""}`}>
      <div className="brand"><span>★</span><div><strong>럭키 오락실</strong><small>BOT CARD ARCADE</small></div><button className="close-menu" onClick={() => setMenu(false)} aria-label="메뉴 닫기"><IconX /></button></div>
      <nav aria-label="주 메뉴"><Nav icon={<IconHome />} active label="로비" /><Nav icon={<IconDeviceGamepad2 />} label="바로 놀기" /><Nav icon={<IconCards />} label="내 카드" /><Nav icon={<IconTrophy />} label="기록" /></nav>
      <div className="sidebar-bottom"><Nav icon={<IconSettings />} label="설정" /><Nav icon={<IconHelpCircle />} label="도움말" />
        {selected && <div className="selected-card"><span>현재 카드</span><strong>{selected.analyzed.report.card.name}</strong><small>{selected.analyzed.report.card.fingerprintShort}</small></div>}
      </div>
    </aside>
    <main className="dashboard">
      <header className="topbar"><div><h1>기다리는 동안, 바로 한 판</h1></div><strong className="lobby-wallet">{balance.toLocaleString("ko-KR")} P</strong><button className="icon-button" onClick={() => setLight((value) => !value)} aria-label={light ? "어두운 테마" : "밝은 테마"}>{light ? <IconMoon /> : <IconSun />}</button></header>

      {recentPlay && recentCabinet && <section className="resume-hero" aria-label="이어하기"><div className="resume-icon"><IconClockPlay /></div><div><span className="eyebrow">최근 플레이 · {timeAgo(recentPlay.updatedAt)}</span><h2>{recentPlay.title}</h2><p>{recentPlay.progressLabel}에서 안전하게 저장되어 있습니다.</p></div><button onClick={() => { const card = recentPlay.cardFingerprint ? cards.find((item) => item.fingerprint === recentPlay.cardFingerprint) : undefined; if (card) setSelected(card); setActiveCabinet(recentPlay.cabinetId); }}><IconPlayerPlay /> {recentCabinet.manifest.resumeLabel}</button></section>}

      <section className="arcade-section"><div className="section-heading"><div><h2>공개 미니게임</h2></div></div><div className="arcade-grid">{builtIns.map((entry) => <ArcadeCard key={entry.manifest.id} entry={entry} onPlay={() => setActiveCabinet(entry.manifest.id)} />)}</div></section>

      <section className="personal-arcade"><div className="section-heading"><div><span className="eyebrow">선택 기능</span><h2>내 카드로 놀기</h2><p>개인 봇카드를 넣으면 재료가 충분한 게임만 열어드립니다.</p></div></div><CardImporter onImported={imported} />
        {cards.length > 0 && <section className="library-strip"><div><span className="eyebrow">내 카드 보관함</span><h2>{cards.length}장의 카트리지</h2></div><div className="card-pills">{cards.map((card) => <button className={selected?.fingerprint === card.fingerprint ? "active" : ""} key={card.fingerprint} onClick={() => setSelected(card)}><strong>{card.analyzed.report.card.name}</strong><small>{card.analyzed.report.lore.verifiedPuzzleCount}개 퍼즐</small></button>)}</div></section>}
        {selected && <ReportView card={selected} onPlay={setActiveCabinet} includePrivate={privatePreview} />}
      </section>
    </main>
  </div>;
}

function ArcadeCard({ entry, onPlay }: { entry: WebCabinetRegistration; onPlay(): void }) {
  const { manifest } = entry;
  const icon = manifest.sessionKind === "instant" ? <IconSparkles /> : manifest.sessionKind === "repeat" ? <IconBrain /> : <IconDeviceGamepad2 />;
  return <article className={`arcade-entry ${manifest.sessionKind}`}><div className="arcade-entry-icon">{icon}</div><div><span className="eyebrow">{entry.badge}</span><h3>{manifest.title}</h3><p>{manifest.description}</p><small>{manifest.estimatedMinutes.min}~{manifest.estimatedMinutes.max}분 · {entry.world}</small></div><button onClick={onPlay}>{manifest.sessionKind === "deep" ? "작전 시작" : "바로 시작"}<IconPlayerPlay size={17} /></button></article>;
}

function Nav({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) { return <button className={active ? "active" : ""}>{icon}<span>{label}</span></button>; }
function timeAgo(value: string): string { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000)); return minutes < 1 ? "방금 전" : minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전` : `${Math.floor(minutes / 1440)}일 전`; }
