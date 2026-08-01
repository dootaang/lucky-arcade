import { IconCards, IconClockPlay, IconDeviceGamepad2, IconHome, IconMenu2, IconMoon, IconPlayerPlay, IconSun, IconX } from "@tabler/icons-react";
import type { RecentPlay } from "@lucky-arcade/persistence";
import { lazy, Suspense, useCallback, useEffect, useState, type ComponentProps } from "react";
import { useNavigate, useParams } from "react-router";
import { CabinetHost, getCabinetRegistration, getCabinetWorld, listBuiltInCabinets, selectOpeningCabinet, type WebCabinetRegistration } from "../cabinets/registry.tsx";
import { CardImporter } from "../features/cards/card-importer.tsx";
import { ReportView } from "../features/cards/report-view.tsx";
import { analyzeCardFile } from "../lib/card-analysis.ts";
import { listCards, listRecentPlays, loadCardSource, readWallet, replaceAnalyzedCard, type StoredCard } from "../lib/database.ts";
import { NumberTicker } from "@lucky-arcade/ui/number-ticker";
import { VenueMarquee } from "@lucky-arcade/ui/venue-marquee";
import type { CasinoTableId } from "@lucky-arcade/casino-ledger";
import { getPublicVenue, getVenueForCabinet, listPublicVenues, type VenueManifest } from "../venues/registry.ts";

const CasinoLedgerView = lazy(async () => {
  const [{ default: View }, { CasinoLedgerPortraitProvider }, { resolveTemerosaSeriesNpcPortrait }] = await Promise.all([
    import("../features/casino-ledger/casino-ledger-view.tsx"),
    import("@lucky-arcade/casino-ledger/react"),
    import("../lib/temerosa-content.ts"),
  ]);
  function LedgerViewWithSeriesPortraits(props: ComponentProps<typeof View>): React.ReactElement {
    return <CasinoLedgerPortraitProvider resolve={resolveTemerosaSeriesNpcPortrait}><View {...props} /></CasinoLedgerPortraitProvider>;
  }
  return { default: LedgerViewWithSeriesPortraits };
});

export function Home({ privatePreview = false }: { privatePreview?: boolean }) {
  const navigate = useNavigate();
  const { venueId } = useParams<{ venueId: string }>();
  const venue = venueId ? getPublicVenue(venueId) : undefined;
  const [cards, setCards] = useState<StoredCard[]>([]);
  const [selected, setSelected] = useState<StoredCard | null>(null);
  const [recent, setRecent] = useState<RecentPlay[]>([]);
  const [balance, setBalance] = useState(0);
  const [activeCabinet, setActiveCabinet] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [light, setLight] = useState(false);
  const refreshRecent = useCallback(() => { void listRecentPlays().then(setRecent); }, []);

  useEffect(() => {
    let alive = true;
    refreshRecent();
    void readWallet().then((wallet) => { if (alive) setBalance(wallet.balance); }).catch(() => undefined);
    if (!privatePreview) return () => { alive = false; };
    void listCards().then(async (items) => {
      if (!alive) return;
      setCards(items);
      setSelected(items[0] ?? null);
      for (const item of items) {
        if (item.analyzed.contract === "analyzed-card/0.3") continue;
        const source = await loadCardSource(item.fingerprint);
        if (!source || !alive) continue;
        try {
          const upgraded = await replaceAnalyzedCard(item, await analyzeCardFile(source));
          if (!alive) return;
          setCards((current) => current.map((card) => card.fingerprint === upgraded.fingerprint ? upgraded : card));
          setSelected((current) => current?.fingerprint === upgraded.fingerprint ? upgraded : current);
        } catch { /* 개발 점검에서는 기존 분석 결과를 보존한다. */ }
      }
    });
    return () => { alive = false; };
  }, [privatePreview, refreshRecent]);

  useEffect(() => { document.documentElement.dataset.theme = light ? "light" : "dark"; }, [light]);

  const openCabinet = (cabinetId: string) => {
    if (privatePreview) setActiveCabinet(cabinetId);
    else navigate(`/play/${encodeURIComponent(cabinetId)}`);
  };
  const exitCabinet = () => {
    setActiveCabinet(null);
    refreshRecent();
    void readWallet().then((wallet) => setBalance(wallet.balance)).catch(() => undefined);
  };

  if (activeCabinet) return <CabinetHost cabinetId={activeCabinet} {...(selected ? { analyzed: selected.analyzed } : {})} onExit={exitCabinet} />;

  const imported = (card: StoredCard) => {
    setCards((current) => [card, ...current.filter((item) => item.fingerprint !== card.fingerprint)]);
    setSelected(card);
    setActiveCabinet(selectOpeningCabinet(card.analyzed.report, true));
  };
  const recentPlay = recent.find((item) => getCabinetRegistration(item.cabinetId, privatePreview) && (!item.cardFingerprint || cards.some((card) => card.fingerprint === item.cardFingerprint)));
  const recentCabinet = recentPlay ? getCabinetRegistration(recentPlay.cabinetId, privatePreview) : undefined;
  const recentVenue = recentPlay ? getVenueForCabinet(recentPlay.cabinetId) : undefined;

  return <div className={`app-layout ${venue ? "venue-active" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
    <button className="mobile-menu" onClick={() => setMenu(true)} aria-label="메뉴 열기"><IconMenu2 /></button>
    {sidebarCollapsed && <button className="desktop-sidebar-open" onClick={() => setSidebarCollapsed(false)} aria-label="사이드바 열기"><IconMenu2 /></button>}
    {menu && <button className="sidebar-scrim" onClick={() => setMenu(false)} aria-label="메뉴 닫기" />}
    <aside className={`sidebar ${menu ? "open" : ""}`}>
      <div className="brand"><span><IconDeviceGamepad2 aria-hidden="true" /></span><div><strong>럭키 오락실</strong><small>BOT CARD ARCADE</small></div><button className="desktop-sidebar-close" onClick={() => setSidebarCollapsed(true)} aria-label="사이드바 닫기"><IconX /></button><button className="close-menu" onClick={() => setMenu(false)} aria-label="메뉴 닫기"><IconX /></button></div>
      <nav aria-label="주 메뉴">
        <Nav icon={<IconHome />} active={!venueId} label="로비" onClick={() => { setMenu(false); navigate(privatePreview ? "/dev" : "/"); }} />
        {!privatePreview && <Nav icon={<IconDeviceGamepad2 />} active={Boolean(venue)} label="카지노" onClick={() => { setMenu(false); navigate("/venues/temerosa-casino"); }} />}
        {privatePreview && <Nav icon={<IconCards />} label="개발 보관함" />}
      </nav>
      <div className="sidebar-bottom">{privatePreview && selected && <div className="selected-card"><span>현재 카드</span><strong>{selected.analyzed.report.card.name}</strong><small>{selected.analyzed.report.card.fingerprintShort}</small></div>}</div>
    </aside>
    <main className="dashboard">
      <header className="topbar">{venue?.marquee
        ? <VenueMarquee title={venue.title} word={venue.marquee.word} sub={venue.marquee.sub} />
        : <div><span className="eyebrow">{privatePreview ? "개발 전용 점검" : venue ? "Venue" : "Lucky Arcade Lobby"}</span><h1>{venue?.title ?? (privatePreview ? "보존 기능 점검" : "오늘은 어디서 놀까요?")}</h1></div>}<strong className="lobby-wallet"><NumberTicker value={balance} suffix=" P" /></strong><button className="icon-button" onClick={() => setLight((value) => !value)} aria-label={light ? "어두운 테마" : "밝은 테마"}>{light ? <IconMoon /> : <IconSun />}</button></header>

      {recentPlay && recentCabinet && <section className="resume-hero" aria-label="이어하기"><div className="resume-icon"><IconClockPlay /></div><div><span className="eyebrow">최근 플레이 · {timeAgo(recentPlay.updatedAt)}</span><h2>{recentVenue ? `${recentVenue.title} · ${recentCabinet.manifest.title.replace("테메로세 ", "")}` : recentPlay.title}</h2><p>{recentPlay.progressLabel} · 저장된 자리로 바로 돌아갑니다.</p></div><button onClick={() => { const card = recentPlay.cardFingerprint ? cards.find((item) => item.fingerprint === recentPlay.cardFingerprint) : undefined; if (card) setSelected(card); openCabinet(recentPlay.cabinetId); }}><IconPlayerPlay /> {recentCabinet.manifest.resumeLabel}</button></section>}

      {privatePreview ? <DeveloperLobby cards={cards} selected={selected} onImported={imported} onSelect={setSelected} onPlay={openCabinet} /> : venueId ? venue ? <VenueFloor venue={venue} balance={balance} onBalanceChange={setBalance} onPlay={openCabinet} onPreview={(id) => navigate(`/preview/${encodeURIComponent(id)}`)} /> : <NotFound onLobby={() => navigate("/")} /> : <VenueLobby onEnter={(id) => navigate(`/venues/${id}`)} />}
    </main>
  </div>;
}

function VenueLobby({ onEnter }: { onEnter(id: string): void }) {
  return <section className="venue-list" aria-labelledby="venue-heading"><div className="section-heading"><div><span className="eyebrow">Venues</span><h2 id="venue-heading">열려 있는 장소</h2><p>럭키★오락실 안에서 운영 중인 공간을 골라 입장하세요.</p></div></div>{listPublicVenues().map((venue, index) => <VenueCard key={venue.id} venue={venue} eager={index === 0} onEnter={() => onEnter(venue.id)} />)}</section>;
}

function VenueCard({ venue, eager, onEnter }: { venue: VenueManifest; eager: boolean; onEnter(): void }) {
  return <article className="venue-card"><picture className="venue-art"><source media="(max-width: 600px)" srcSet={venue.heroImage.sm.src} width={venue.heroImage.sm.width} height={venue.heroImage.sm.height} /><img src={venue.heroImage.md.src} width={venue.heroImage.md.width} height={venue.heroImage.md.height} alt={venue.heroImage.alt} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} onError={(event) => { event.currentTarget.hidden = true; }} /></picture><div className="venue-card-copy"><span className="eyebrow">Open Venue</span><h3>{venue.title}</h3><p>{venue.tagline}</p><button onClick={onEnter}>{venue.entryLabel}<IconPlayerPlay size={18} /></button></div></article>;
}

const plannedTables = [{ group: "교환소", title: "알제의 교환소" }] as const;

const FLOOR_HERO_ART = "/content/temerosa-casino-floor/0.1.0/assets/floor-mist-basin/md.webp";

/** A suit stamped on each table, so a bare card still reads as a casino table. */
const TABLE_SUITS: Record<string, string> = { "temerosa-old-maid": "♠", "temerosa-match-pairs": "♥", "temerosa-slot": "♦", "indian-poker": "♦", "temerosa-high-low": "♠", "temerosa-blackjack": "♣", "temerosa-doubt": "♦", "temerosa-one-card": "♥", "temerosa-texas-holdem": "♠", "temerosa-five-card-draw": "♣", "temerosa-video-poker": "♦", "lucky-derby-lab": "♠", "temerosa-margin": "♥", "temerosa-favorite-cup": "♥", "temerosa-echo-memory": "♣", "temerosa-pequod-expedition": "♠", "관전석": "♠", "알제의 교환소": "♦" };

function VenueFloor({ venue, balance, onPlay, onPreview, onBalanceChange }: { venue: VenueManifest; balance: number; onPlay(id: string): void; onPreview(id: string): void; onBalanceChange(balance: number): void }) {
  const tables = venue.tables.flatMap((table) => {
    const entry = getCabinetRegistration(table.cabinetId, true);
    return entry ? [{ entry, status: table.status }] : [];
  });
  const playable = tables.filter((table) => table.status === "open");
  const preparing = tables.filter((table) => table.status !== "open");
  return <section className="casino-floor" aria-labelledby="floor-heading">
    <span className="floor-backdrop ca-tableau" aria-hidden="true" />
    <span className="ca-spotlight" aria-hidden="true" />
    <header>
      {/* temerosa-casino-floor/0.1.0 ships four 960x540 plates marked
          `use: "table-art"` that nothing rendered. A landscape belongs behind
          the heading, not under a table card whose state signals it would fight. */}
      <img className="floor-hero-art" src={FLOOR_HERO_ART} alt="" width={960} height={540} loading="eager" fetchPriority="high" aria-hidden="true" onError={(event) => { event.currentTarget.hidden = true; }} />
      <span className="eyebrow">여백의 카지노 플로어</span><h2 id="floor-heading" className="ca-serif">테이블을 골라주세요</h2><p>현재 실제로 운영 중인 테이블만 입장할 수 있습니다.</p>
    </header>
    <Suspense fallback={<section className="casino-ledger-loading ca-label">원장 정리 중…</section>}><CasinoLedgerView userBalance={balance} onBalanceChange={onBalanceChange} onPlay={onPlay} tables={playable.map(({ entry }) => ({
      id: entry.manifest.id as CasinoTableId,
      title: entry.manifest.title.replace("테메로세 ", ""),
      suit: TABLE_SUITS[entry.manifest.id] ?? "♠",
      entryLabel: "시작",
      meta: `${entry.manifest.estimatedMinutes.min}~${entry.manifest.estimatedMinutes.max}분 · ${entry.manifest.entry === "wager" ? `${entry.manifest.wagerTiers?.[0] ?? 0} P부터` : "포인트 없이 시작"}`,
    }))} /></Suspense>
    <div className="table-grid">
      <p className="table-locked-divider ca-label" aria-hidden="true">개장 준비 중</p>
      {preparing.map(({ entry }) => <article className="table-card coming-soon" key={entry.manifest.id}>
        <span className="table-suit" aria-hidden="true">{TABLE_SUITS[entry.manifest.id] ?? "♠"}</span>
        <span className="table-group ca-label">{entry.badge}</span>
        <h3 className="ca-serif">{entry.manifest.title.replace("테메로세 ", "")}</h3>
        <strong>개장 준비 중</strong>
        <button className="admin-preview-entry" onClick={() => onPreview(entry.manifest.id)}>관리자 시험 입장</button>
      </article>)}
      {plannedTables.map((table) => <article className="table-card coming-soon" key={table.group}>
        <span className="table-suit" aria-hidden="true">{TABLE_SUITS[table.title] ?? "♣"}</span>
        <span className="table-group ca-label">{table.group}</span>
        <h3 className="ca-serif">{table.title}</h3>
        <strong>준비 중</strong>
      </article>)}
    </div>
  </section>;
}

function DeveloperLobby({ cards, selected, onImported, onSelect, onPlay }: { cards: StoredCard[]; selected: StoredCard | null; onImported(card: StoredCard): void; onSelect(card: StoredCard): void; onPlay(id: string): void }) {
  const builtIns = listBuiltInCabinets(true);
  return <><section className="arcade-section"><div className="section-heading"><div><h2>보존 캐비닛</h2><p>개발 빌드에서만 열리는 회귀 점검 통로입니다.</p></div></div><div className="arcade-grid">{builtIns.map((entry) => <ArcadeCard key={entry.manifest.id} entry={entry} onPlay={() => onPlay(entry.manifest.id)} />)}</div></section><section className="personal-arcade"><div className="section-heading"><div><span className="eyebrow">개발 전용</span><h2>내 카드로 놀기</h2></div></div><CardImporter onImported={onImported} />{cards.length > 0 && <section className="library-strip"><div><span className="eyebrow">내 카드 보관함</span><h2>{cards.length}장의 카트리지</h2></div><div className="card-pills">{cards.map((card) => <button className={selected?.fingerprint === card.fingerprint ? "active" : ""} key={card.fingerprint} onClick={() => onSelect(card)}><strong>{card.analyzed.report.card.name}</strong><small>{card.analyzed.report.lore.verifiedPuzzleCount}개 퍼즐</small></button>)}</div></section>}{selected && <ReportView card={selected} onPlay={onPlay} includePrivate />}</section></>;
}

function ArcadeCard({ entry, onPlay }: { entry: WebCabinetRegistration; onPlay(): void }) {
  return <article className={`arcade-entry ${entry.manifest.sessionKind}`}><div className="arcade-entry-icon"><IconDeviceGamepad2 /></div><div><span className="eyebrow">{entry.badge}</span><h3>{entry.manifest.title}</h3><p>{entry.manifest.description}</p><small>{entry.manifest.estimatedMinutes.min}~{entry.manifest.estimatedMinutes.max}분 · {getCabinetWorld(entry.manifest.id)}</small></div><button onClick={onPlay}>{entry.manifest.sessionKind === "deep" ? "작전 시작" : "바로 시작"}<IconPlayerPlay size={17} /></button></article>;
}

function NotFound({ onLobby }: { onLobby(): void }) { return <section className="empty-state"><IconDeviceGamepad2 size={42} /><h2>이 장소는 열려 있지 않습니다.</h2><p>공개 로비에서 운영 중인 Venue를 확인해 주세요.</p><button className="primary-action" onClick={onLobby}>로비로 돌아가기</button></section>; }
function Nav({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) { return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span></button>; }
function timeAgo(value: string): string { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000)); return minutes < 1 ? "방금 전" : minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전` : `${Math.floor(minutes / 1440)}일 전`; }
