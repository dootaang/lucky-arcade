import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import type { AnyAnalyzedCard } from "@lucky-arcade/contracts";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";

export interface CabinetViewProps { analyzed: AnyAnalyzedCard; onExit(): void; }
export interface CabinetViewContext { analyzed?: AnyAnalyzedCard; onExit(): void; }
export interface CabinetHostProps extends CabinetViewContext { cabinetId: string; }
export interface WebCabinetRegistration {
  manifest: CabinetManifest;
  openingRank: number | null;
  world: string;
  badge: string;
  load(): Promise<{ default: ComponentType<CabinetViewContext> }>;
}

type CabinetView = LazyExoticComponent<ComponentType<CabinetViewContext>>;

const registrations: readonly WebCabinetRegistration[] = [
  {
    manifest: {
      id: "gfl-favorite-cup", version: "gfl-favorite-cup/0.1", title: "소녀전선 최애 월드컵",
      description: "잔불 작전의 12명 중 오늘의 최애를 고릅니다.", requiredCapabilities: [],
      sessionKind: "instant", launchKind: "built-in", resumeLabel: "새 대진 시작", estimatedMinutes: { min: 1, max: 3 },
    },
    openingRank: null, world: "소녀전선: 잔불", badge: "바로 한 판",
    load: async () => { const module = await import("../features/built-in/gfl-favorite-cup-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "gfl-sprite-memory", version: "gfl-sprite-memory/0.1", title: "작전 암호 기억",
      description: "차례로 나타난 인물을 기억해 같은 순서로 선택합니다.", requiredCapabilities: [],
      sessionKind: "repeat", launchKind: "built-in", resumeLabel: "기억 훈련 시작", estimatedMinutes: { min: 1, max: 2 },
    },
    openingRank: null, world: "소녀전선: 잔불", badge: "반복 플레이",
    load: async () => { const module = await import("../features/built-in/gfl-sprite-memory-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "gfl-ember", version: "gfl-ember/0.1", title: "소녀전선: 잔불 작전",
      description: "6명을 편성하고 7개 구간을 돌파하는 전술 오토배틀 로그라이트입니다.", requiredCapabilities: [],
      sessionKind: "deep", launchKind: "built-in", resumeLabel: "잔불 작전 이어하기", estimatedMinutes: { min: 10, max: 20 },
    },
    openingRank: null, world: "소녀전선: 잔불", badge: "긴 게임",
    load: async () => { const module = await import("../features/gfl-ember/gfl-ember-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "favorite-cup", version: "favorite-cup/0.1", title: "최애 월드컵",
      description: "내 카드 속 인물들로 오늘의 최애를 정합니다.", requiredCapabilities: ["distinct-npc-portraits>=8"],
      sessionKind: "instant", launchKind: "card", resumeLabel: "새 대진 시작", estimatedMinutes: { min: 1, max: 3 },
    },
    openingRank: 1, world: "내 카드", badge: "개봉식",
    load: async () => { const module = await import("../features/favorite-cup/favorite-cup-view.tsx"); return { default: (props) => props.analyzed ? <module.default analyzed={props.analyzed} onExit={props.onExit} /> : <MissingCard onExit={props.onExit} /> }; },
  },
  {
    manifest: {
      id: "restoration-crew", version: "restoration-crew/0.1", title: "카드 복구반",
      description: "내 카드의 이름과 그림 사이에 생긴 이상을 찾습니다.", requiredCapabilities: ["distinct-npc-portraits>=4"],
      sessionKind: "instant", launchKind: "card", resumeLabel: "새 복구 시작", estimatedMinutes: { min: 2, max: 5 },
    },
    openingRank: 2, world: "내 카드", badge: "기술 실험",
    load: async () => { const module = await import("../features/restoration-crew/restoration-view.tsx"); return { default: (props) => props.analyzed ? <module.default analyzed={props.analyzed} onExit={props.onExit} /> : <MissingCard onExit={props.onExit} /> }; },
  },
  {
    manifest: {
      id: "lore-circuit", version: "lore-circuit/0.1", title: "로어 회로",
      description: "내 카드 원문의 단어를 따라 숨은 기록을 발굴합니다.", requiredCapabilities: ["verified-lore-puzzles>=3"],
      sessionKind: "repeat", launchKind: "card", resumeLabel: "발굴 이어하기", estimatedMinutes: { min: 3, max: 8 },
    },
    openingRank: null, world: "내 카드", badge: "실험실",
    load: async () => { const module = await import("../features/lore-circuit/lore-circuit-screen.tsx"); return { default: ({ analyzed, onExit }) => analyzed ? <module.LoreCircuitScreen cartridge={analyzed.loreCircuit} onExit={onExit} /> : <MissingCard onExit={onExit} /> }; },
  },
] as const;

const views: Readonly<Record<string, CabinetView>> = Object.fromEntries(registrations.map((entry) => [entry.manifest.id, lazy(entry.load)]));

export function listBuiltInCabinets(): readonly WebCabinetRegistration[] { return registrations.filter((entry) => entry.manifest.launchKind === "built-in" || entry.manifest.launchKind === "both"); }
export function getCabinetRegistration(id: string): WebCabinetRegistration | undefined { return registrations.find((entry) => entry.manifest.id === id); }

export function selectOpeningCabinet(report: { cabinets: Array<{ cabinetId: string; available: boolean }> }): string | null {
  const available = new Set(report.cabinets.filter((item) => item.available).map((item) => item.cabinetId));
  return registrations.filter((entry) => entry.openingRank !== null && available.has(entry.manifest.id)).sort((left, right) => (left.openingRank ?? Infinity) - (right.openingRank ?? Infinity))[0]?.manifest.id ?? null;
}

export function CabinetHost({ cabinetId, ...props }: CabinetHostProps) {
  const View = views[cabinetId];
  if (!View) return <main className="game-shell"><p>이 게임 화면을 찾지 못했습니다.</p><button onClick={props.onExit}>돌아가기</button></main>;
  return <Suspense fallback={<main className="game-shell"><div className="game-loading">게임을 준비하고 있어요…</div></main>}><View {...props} /></Suspense>;
}

function MissingCard({ onExit }: { onExit(): void }) { return <main className="game-shell"><div className="game-loading">이 게임은 카드가 필요합니다.<button onClick={onExit}>돌아가기</button></div></main>; }
