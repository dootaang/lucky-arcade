import type { AnyAnalyzedCard } from "@lucky-arcade/contracts";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";

export interface CabinetViewProps {
  analyzed: AnyAnalyzedCard;
  onExit(): void;
}

export interface CabinetViewContext { analyzed?: AnyAnalyzedCard; onExit(): void; }
export interface CabinetHostProps extends CabinetViewContext { cabinetId: string; }

type CabinetView = LazyExoticComponent<ComponentType<CabinetViewContext>>;

const registrations = [
  { id: "gfl-ember", openingRank: null, load: async () => { const module=await import("../features/gfl-ember/gfl-ember-view.tsx"); return {default:({onExit}:CabinetViewContext)=><module.default onExit={onExit}/>}; } },
  { id: "favorite-cup", openingRank: 1, load: async () => { const module=await import("../features/favorite-cup/favorite-cup-view.tsx"); return {default:(props:CabinetViewContext)=>props.analyzed?<module.default analyzed={props.analyzed} onExit={props.onExit}/>:<MissingCard onExit={props.onExit}/>}; } },
  { id: "restoration-crew", openingRank: 2, load: async () => { const module=await import("../features/restoration-crew/restoration-view.tsx"); return {default:(props:CabinetViewContext)=>props.analyzed?<module.default analyzed={props.analyzed} onExit={props.onExit}/>:<MissingCard onExit={props.onExit}/>}; } },
  { id: "lore-circuit", openingRank: null, load: async () => {
    const module = await import("../features/lore-circuit/lore-circuit-screen.tsx");
    return { default: ({ analyzed, onExit }: CabinetViewContext) => analyzed?<module.LoreCircuitScreen cartridge={analyzed.loreCircuit} onExit={onExit} />:<MissingCard onExit={onExit}/> };
  } },
] as const;
const views: Readonly<Record<string, CabinetView>> = Object.fromEntries(registrations.map((entry) => [entry.id, lazy(entry.load)]));

export function selectOpeningCabinet(report: { cabinets: Array<{ cabinetId: string; available: boolean }> }): string | null {
  const available = new Set(report.cabinets.filter((item) => item.available).map((item) => item.cabinetId));
  return [...registrations].filter((entry) => entry.openingRank !== null && available.has(entry.id)).sort((left, right) => (left.openingRank ?? Infinity) - (right.openingRank ?? Infinity))[0]?.id ?? null;
}

export function CabinetHost({ cabinetId, ...props }: CabinetHostProps) {
  const View = views[cabinetId];
  if (!View) return <main className="game-shell"><p>이 게임 화면을 찾지 못했습니다.</p><button onClick={props.onExit}>돌아가기</button></main>;
  return <Suspense fallback={<main className="game-shell"><div className="game-loading">게임을 준비하고 있어요…</div></main>}><View {...props} /></Suspense>;
}

function MissingCard({onExit}:{onExit():void}){return <main className="game-shell"><div className="game-loading">이 게임은 카드가 필요합니다.<button onClick={onExit}>돌아가기</button></div></main>}
