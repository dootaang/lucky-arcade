import { IconCards, IconDeviceGamepad2, IconHelpCircle, IconHome, IconMenu2, IconMoon, IconSettings, IconSun, IconTrophy, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { CardImporter } from "../features/cards/card-importer.tsx";
import { ReportView } from "../features/cards/report-view.tsx";
import { CabinetHost, selectOpeningCabinet } from "../cabinets/registry.tsx";
import { analyzeCardFile } from "../lib/card-analysis.ts";
import { listCards, loadCardSource, replaceAnalyzedCard, type StoredCard } from "../lib/database.ts";

export function Home() {
  const [cards, setCards] = useState<StoredCard[]>([]), [selected, setSelected] = useState<StoredCard | null>(null), [activeCabinet, setActiveCabinet] = useState<string | null>(null), [menu, setMenu] = useState(false), [light, setLight] = useState(false);
  useEffect(() => {
    let alive = true;
    void listCards().then(async (items) => {
      if (!alive) return;
      setCards(items); setSelected(items[0] ?? null);
      for (const item of items) {
        if (item.analyzed.contract !== "analyzed-card/0.1") continue;
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
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = light ? "light" : "dark"; }, [light]);
  if (activeCabinet) return <CabinetHost cabinetId={activeCabinet} {...(selected?{analyzed:selected.analyzed}:{})} onExit={() => setActiveCabinet(null)} />;
  const imported = (card: StoredCard) => {
    setCards((current) => [card, ...current.filter((item) => item.fingerprint !== card.fingerprint)]);
    setSelected(card);
    setActiveCabinet(selectOpeningCabinet(card.analyzed.report));
  };
  return <div className="app-layout">
    <button className="mobile-menu" onClick={() => setMenu(true)} aria-label="메뉴 열기"><IconMenu2 /></button>
    {menu && <button className="sidebar-scrim" onClick={() => setMenu(false)} aria-label="메뉴 닫기" />}
    <aside className={`sidebar ${menu ? "open" : ""}`}>
      <div className="brand"><span>★</span><div><strong>럭키 오락실</strong><small>BOT CARD ARCADE</small></div><button className="close-menu" onClick={() => setMenu(false)} aria-label="메뉴 닫기"><IconX /></button></div>
      <nav aria-label="주 메뉴"><Nav icon={<IconHome />} active label="로비" /><Nav icon={<IconCards />} label="카드 보관함" /><Nav icon={<IconDeviceGamepad2 />} label="캐비닛" /><Nav icon={<IconTrophy />} label="기록" /></nav>
      <div className="sidebar-bottom"><Nav icon={<IconSettings />} label="설정" /><Nav icon={<IconHelpCircle />} label="도움말" />
        {selected && <div className="selected-card"><span>현재 카드</span><strong>{selected.analyzed.report.card.name}</strong><small>{selected.analyzed.report.card.fingerprintShort}</small></div>}
      </div>
    </aside>
    <main className="dashboard">
      <header className="topbar"><div><span className="eyebrow">100% 로컬 · 무LLM</span><h1>카드 한 장, 새로운 오락실</h1></div><button className="icon-button" onClick={() => setLight((value) => !value)} aria-label={light ? "어두운 테마" : "밝은 테마"}>{light ? <IconMoon /> : <IconSun />}</button></header>
      <CardImporter onImported={imported} />
      <section className="built-in-hero"><div><span className="eyebrow">FEATURED OPERATION</span><h2>소녀전선: 잔불 작전</h2><p>카드 업로드 없이 바로 편성하고, 7개 구간을 돌파하는 전술 오토배틀 로그라이트입니다.</p><ul><li>12명 제대 편성</li><li>결정론 8라운드 전투</li><li>10~20분 런</li></ul></div><button onClick={() => setActiveCabinet("gfl-ember")}><IconDeviceGamepad2/> 작전 시작</button></section>
      {cards.length > 0 && <section className="library-strip"><div><span className="eyebrow">내 카드 보관함</span><h2>{cards.length}장의 카트리지</h2></div><div className="card-pills">{cards.map((card) => <button className={selected?.fingerprint === card.fingerprint ? "active" : ""} key={card.fingerprint} onClick={() => setSelected(card)}><strong>{card.analyzed.report.card.name}</strong><small>{card.analyzed.report.lore.verifiedPuzzleCount}개 퍼즐</small></button>)}</div></section>}
      {selected ? <ReportView card={selected} onPlay={setActiveCabinet} /> : <EmptyState />}
    </main>
  </div>;
}

function Nav({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) { return <button className={active ? "active" : ""}>{icon}<span>{label}</span></button>; }
function EmptyState() { return <section className="empty-state"><div className="empty-orbit"><IconDeviceGamepad2 size={42} /></div><h2>첫 카트리지를 꽂아보세요</h2><p>카드가 가진 로어 연결망, NPC와 에셋을 검사해<br />플레이 가능한 미니게임만 열어드립니다.</p></section>; }
