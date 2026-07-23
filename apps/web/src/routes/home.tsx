import { IconCards, IconDeviceGamepad2, IconHelpCircle, IconHome, IconMenu2, IconMoon, IconSettings, IconSun, IconTrophy, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { CardImporter } from "../features/cards/card-importer.tsx";
import { ReportView } from "../features/cards/report-view.tsx";
import { LoreCircuitScreen } from "../features/lore-circuit/lore-circuit-screen.tsx";
import { listCards, type StoredCard } from "../lib/database.ts";

export function Home() {
  const [cards, setCards] = useState<StoredCard[]>([]), [selected, setSelected] = useState<StoredCard | null>(null), [playing, setPlaying] = useState(false), [menu, setMenu] = useState(false), [light, setLight] = useState(false);
  useEffect(() => { void listCards().then((items) => { setCards(items); setSelected(items[0] ?? null); }); }, []);
  useEffect(() => { document.documentElement.dataset.theme = light ? "light" : "dark"; }, [light]);
  if (playing && selected) return <LoreCircuitScreen cartridge={selected.analyzed.loreCircuit} onExit={() => setPlaying(false)} />;
  const imported = (card: StoredCard) => { setCards((current) => [card, ...current.filter((item) => item.fingerprint !== card.fingerprint)]); setSelected(card); };
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
      {cards.length > 0 && <section className="library-strip"><div><span className="eyebrow">내 카드 보관함</span><h2>{cards.length}장의 카트리지</h2></div><div className="card-pills">{cards.map((card) => <button className={selected?.fingerprint === card.fingerprint ? "active" : ""} key={card.fingerprint} onClick={() => setSelected(card)}><strong>{card.analyzed.report.card.name}</strong><small>{card.analyzed.report.lore.verifiedPuzzleCount}개 퍼즐</small></button>)}</div></section>}
      {selected ? <ReportView card={selected} onPlay={() => setPlaying(true)} /> : <EmptyState />}
    </main>
  </div>;
}

function Nav({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) { return <button className={active ? "active" : ""}>{icon}<span>{label}</span></button>; }
function EmptyState() { return <section className="empty-state"><div className="empty-orbit"><IconDeviceGamepad2 size={42} /></div><h2>첫 카트리지를 꽂아보세요</h2><p>카드가 가진 로어 연결망, NPC와 에셋을 검사해<br />플레이 가능한 미니게임만 열어드립니다.</p></section>; }
