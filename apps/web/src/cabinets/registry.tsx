import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import type { AnyAnalyzedCard } from "@lucky-arcade/contracts";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { getVenueForCabinet, PUBLIC_CABINET_IDS } from "../venues/registry.ts";

export interface CabinetViewProps { analyzed: AnyAnalyzedCard; onExit(): void; }
export interface CabinetViewContext { analyzed?: AnyAnalyzedCard; onExit(): void; }
export interface CabinetHostProps extends CabinetViewContext { cabinetId: string; }
export interface WebCabinetRegistration {
  manifest: CabinetManifest;
  openingRank: number | null;
  badge: string;
  load(): Promise<{ default: ComponentType<CabinetViewContext> }>;
}

type CabinetView = LazyExoticComponent<ComponentType<CabinetViewContext>>;

const registrations: readonly WebCabinetRegistration[] = [
  {
    manifest: { id: "temerosa-high-low", version: "casino-cards/0.1", title: "하이로우", description: "다음 카드가 더 높을지 낮을지 맞히고 배당을 쌓는 빠른 게임.", requiredCapabilities: [], sessionKind: "instant", launchKind: "built-in", resumeLabel: "하이로우로 돌아가기", estimatedMinutes: { min: 1, max: 2 }, entry: "wager", wagerTiers: [10, 50, 200] },
    openingRank: null, badge: "빠른 테이블", load: async () => { const module = await import("../features/casino-cards/casino-card-view.tsx"); return { default: ({ onExit }) => <module.default gameId="high-low" onExit={onExit} /> }; },
  },
  {
    manifest: { id: "temerosa-blackjack", version: "casino-cards/0.1", title: "블랙잭", description: "21을 넘지 않게 카드를 받고 하우스보다 높은 수를 만든다.", requiredCapabilities: [], sessionKind: "instant", launchKind: "built-in", resumeLabel: "블랙잭으로 돌아가기", estimatedMinutes: { min: 1, max: 2 }, entry: "wager", wagerTiers: [10, 50, 200] },
    openingRank: null, badge: "빠른 테이블", load: async () => { const module = await import("../features/casino-cards/casino-card-view.tsx"); return { default: ({ onExit }) => <module.default gameId="blackjack" onExit={onExit} /> }; },
  },
  {
    manifest: { id: "temerosa-doubt", version: "casino-cards/0.1", title: "다우트", description: "상대의 선언과 표정을 읽고 진실인지 거짓인지 가려낸다.", requiredCapabilities: [], sessionKind: "repeat", launchKind: "built-in", resumeLabel: "다우트로 돌아가기", estimatedMinutes: { min: 1, max: 2 }, entry: "wager", wagerTiers: [10, 50, 200] },
    openingRank: null, badge: "심리 테이블", load: async () => { const module = await import("../features/casino-cards/casino-card-view.tsx"); return { default: ({ onExit }) => <module.default gameId="doubt" onExit={onExit} /> }; },
  },
  {
    manifest: { id: "temerosa-one-card", version: "casino-cards/0.1", title: "원카드", description: "같은 무늬나 숫자를 이어 내고 먼저 손을 비운다.", requiredCapabilities: [], sessionKind: "repeat", launchKind: "built-in", resumeLabel: "원카드로 돌아가기", estimatedMinutes: { min: 2, max: 5 }, entry: "wager", wagerTiers: [10, 50, 200] },
    openingRank: null, badge: "카드 테이블", load: async () => { const module = await import("../features/casino-cards/casino-card-view.tsx"); return { default: ({ onExit }) => <module.default gameId="one-card" onExit={onExit} /> }; },
  },
  {
    manifest: { id: "temerosa-texas-holdem", version: "casino-cards/0.1", title: "텍사스 홀덤", description: "공용 카드와 두 장의 패로 족보를 만들고 네 거리에서 판돈을 결정한다.", requiredCapabilities: [], sessionKind: "repeat", launchKind: "built-in", resumeLabel: "홀덤으로 돌아가기", estimatedMinutes: { min: 3, max: 7 }, entry: "wager", wagerTiers: [10, 50, 200] },
    openingRank: null, badge: "메인 테이블", load: async () => { const module = await import("../features/casino-cards/casino-card-view.tsx"); return { default: ({ onExit }) => <module.default gameId="texas-holdem" onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "temerosa-slot", version: "slot-machine/0.2", title: "슬롯 777",
      description: "테메로세 네 시리즈의 인물과 감정 스프라이트로 다섯 당첨선을 맞추는 슬롯머신.", requiredCapabilities: [],
      sessionKind: "instant", launchKind: "built-in", resumeLabel: "슬롯으로 돌아가기", estimatedMinutes: { min: 1, max: 1 },
      entry: "wager", wagerTiers: [10, 50, 200],
    },
    openingRank: null, badge: "기계 구역",
    load: async () => { const module = await import("../features/slot-machine/temerosa-slot-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: { id: "indian-poker", version: "indian-poker/0.3", title: "테메로세 인디언 포커", description: "보이지 않는 내 카드와 상대의 표정·베팅을 함께 읽는 1대1 5라운드 승부.", requiredCapabilities: [], sessionKind: "repeat", launchKind: "built-in", resumeLabel: "인디언 포커 이어하기", estimatedMinutes: { min: 2, max: 4 }, entry: "wager", wagerTiers: [10, 50, 200] },
    openingRank: null, badge: "심리 테이블",
    load: async () => { const module = await import("../features/indian-poker/indian-poker-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "temerosa-old-maid", version: "old-maid/0.9", title: "테메로세 도둑잡기",
      description: "즐거운 도둑잡기", requiredCapabilities: [],
      sessionKind: "repeat", launchKind: "built-in", resumeLabel: "도둑잡기 이어하기", estimatedMinutes: { min: 2, max: 4 },
    },
    openingRank: null, badge: "바로 한 판",
    load: async () => { const module = await import("../features/temerosa-old-maid/temerosa-old-maid-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "temerosa-match-pairs", version: "match-pairs/0.4", title: "짝맞추기",
      description: "이름 없이 그림만 보고 같은 얼굴 두 장을 찾는 기억 게임.", requiredCapabilities: [],
      sessionKind: "repeat", launchKind: "built-in", resumeLabel: "짝맞추기 이어하기", estimatedMinutes: { min: 1, max: 3 }, entry: "wager", wagerTiers: [10, 50, 200],
    },
    openingRank: null, badge: "기억 테이블",
    load: async () => { const module = await import("../features/match-pairs/match-pairs-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "temerosa-margin", version: "temerosa-margin/0.2", title: "테메로세: 여백 — 첫 항로",
      description: "죽은 단말기를 깨우고 임시 항해사가 되어, 함께 갈 두 사람과 첫 계약을 맺습니다.", requiredCapabilities: [],
      sessionKind: "deep", launchKind: "built-in", resumeLabel: "첫 항로 이어하기", estimatedMinutes: { min: 5, max: 10 },
    },
    openingRank: null, badge: "감정 항해 JRPG",
    load: async () => { const module = await import("../features/temerosa-margin/temerosa-margin-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "lucky-derby-lab", version: "lucky-derby/0.1", title: "럭키★더비 엔진 실험장",
      description: "같은 8인 경주를 네 게임 엔진으로 달려 보고 손맛과 속도를 직접 비교합니다.", requiredCapabilities: [],
      sessionKind: "repeat", launchKind: "built-in", resumeLabel: "엔진 비교 이어하기", estimatedMinutes: { min: 2, max: 5 },
    },
    openingRank: null, badge: "엔진 실험",
    load: async () => { const module = await import("../features/built-in/lucky-derby-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "gfl-favorite-cup", version: "gfl-favorite-cup/0.1", title: "소녀전선 최애 월드컵",
      description: "잔불 작전의 12명 중 오늘의 최애를 고릅니다.", requiredCapabilities: [],
      sessionKind: "instant", launchKind: "built-in", resumeLabel: "새 대진 시작", estimatedMinutes: { min: 1, max: 3 },
    },
    openingRank: null, badge: "바로 한 판",
    load: async () => { const module = await import("../features/built-in/gfl-favorite-cup-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "gfl-sprite-memory", version: "gfl-sprite-memory/0.1", title: "작전 암호 기억",
      description: "차례로 나타난 인물을 기억해 같은 순서로 선택합니다.", requiredCapabilities: [],
      sessionKind: "repeat", launchKind: "built-in", resumeLabel: "기억 훈련 시작", estimatedMinutes: { min: 1, max: 2 },
    },
    openingRank: null, badge: "반복 플레이",
    load: async () => { const module = await import("../features/built-in/gfl-sprite-memory-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "gfl-ember", version: "gfl-ember/0.1", title: "소녀전선: 잔불 작전",
      description: "6명을 편성하고 7개 구간을 돌파하는 전술 오토배틀 로그라이트입니다.", requiredCapabilities: [],
      sessionKind: "deep", launchKind: "built-in", resumeLabel: "잔불 작전 이어하기", estimatedMinutes: { min: 10, max: 20 },
    },
    openingRank: null, badge: "긴 게임",
    load: async () => { const module = await import("../features/gfl-ember/gfl-ember-view.tsx"); return { default: ({ onExit }) => <module.default onExit={onExit} /> }; },
  },
  {
    manifest: {
      id: "favorite-cup", version: "favorite-cup/0.1", title: "최애 월드컵",
      description: "내 카드 속 인물들로 오늘의 최애를 정합니다.", requiredCapabilities: ["distinct-npc-portraits>=8"],
      sessionKind: "instant", launchKind: "card", resumeLabel: "새 대진 시작", estimatedMinutes: { min: 1, max: 3 },
    },
    openingRank: 1, badge: "개봉식",
    load: async () => { const module = await import("../features/favorite-cup/favorite-cup-view.tsx"); return { default: (props) => props.analyzed ? <module.default analyzed={props.analyzed} onExit={props.onExit} /> : <MissingCard onExit={props.onExit} /> }; },
  },
  {
    manifest: {
      id: "old-maid-card", version: "old-maid/0.9", title: "내 카드 도둑잡기",
      description: "내 카드의 인물과 표정으로 즐기는 도둑잡기.", requiredCapabilities: ["expressive-npcs>=4"],
      sessionKind: "repeat", launchKind: "card", resumeLabel: "도둑잡기 이어하기", estimatedMinutes: { min: 2, max: 4 },
    },
    openingRank: 2, badge: "바로 한 판",
    load: async () => { const module = await import("../features/card-old-maid/card-old-maid-view.tsx"); return { default: (props) => props.analyzed ? <module.default analyzed={props.analyzed} onExit={props.onExit} /> : <MissingCard onExit={props.onExit} /> }; },
  },
  {
    manifest: {
      id: "restoration-crew", version: "restoration-crew/0.1", title: "카드 복구반",
      description: "내 카드의 이름과 그림 사이에 생긴 이상을 찾습니다.", requiredCapabilities: ["distinct-npc-portraits>=4"],
      sessionKind: "instant", launchKind: "card", resumeLabel: "새 복구 시작", estimatedMinutes: { min: 2, max: 5 },
    },
    openingRank: 2, badge: "기술 실험",
    load: async () => { const module = await import("../features/restoration-crew/restoration-view.tsx"); return { default: (props) => props.analyzed ? <module.default analyzed={props.analyzed} onExit={props.onExit} /> : <MissingCard onExit={props.onExit} /> }; },
  },
  {
    manifest: {
      id: "lore-circuit", version: "lore-circuit/0.1", title: "로어 회로",
      description: "내 카드 원문의 단어를 따라 숨은 기록을 발굴합니다.", requiredCapabilities: ["verified-lore-puzzles>=3"],
      sessionKind: "repeat", launchKind: "card", resumeLabel: "발굴 이어하기", estimatedMinutes: { min: 3, max: 8 },
    },
    openingRank: null, badge: "실험실",
    load: async () => { const module = await import("../features/lore-circuit/lore-circuit-screen.tsx"); return { default: ({ analyzed, onExit }) => analyzed ? <module.LoreCircuitScreen cartridge={analyzed.loreCircuit} onExit={onExit} /> : <MissingCard onExit={onExit} /> }; },
  },
] as const;

const views: Readonly<Record<string, CabinetView>> = Object.fromEntries(registrations.map((entry) => [entry.manifest.id, lazy(entry.load)]));

export function listBuiltInCabinets(includePrivate = false): readonly WebCabinetRegistration[] { return registrations.filter((entry) => (includePrivate || PUBLIC_CABINET_IDS.has(entry.manifest.id)) && (entry.manifest.launchKind === "built-in" || entry.manifest.launchKind === "both")); }
export function getCabinetRegistration(id: string, includePrivate = false): WebCabinetRegistration | undefined { return includePrivate || PUBLIC_CABINET_IDS.has(id) ? registrations.find((entry) => entry.manifest.id === id) : undefined; }
export function getCabinetWorld(id: string): string { return getVenueForCabinet(id)?.title ?? "개발 보관함"; }

export function selectOpeningCabinet(report: { cabinets: Array<{ cabinetId: string; available: boolean }> }, includePrivate = false): string | null {
  const available = new Set(report.cabinets.filter((item) => item.available).map((item) => item.cabinetId));
  return registrations.filter((entry) => (includePrivate || PUBLIC_CABINET_IDS.has(entry.manifest.id)) && entry.openingRank !== null && available.has(entry.manifest.id)).sort((left, right) => (left.openingRank ?? Infinity) - (right.openingRank ?? Infinity))[0]?.manifest.id ?? null;
}

export function CabinetHost({ cabinetId, ...props }: CabinetHostProps) {
  const View = views[cabinetId];
  if (!View) return <main className="game-shell"><p>이 게임 화면을 찾지 못했습니다.</p><button onClick={props.onExit}>돌아가기</button></main>;
  return <Suspense fallback={<main className="game-shell"><div className="game-loading">게임을 준비하고 있어요…</div></main>}><View {...props} /></Suspense>;
}

function MissingCard({ onExit }: { onExit(): void }) { return <main className="game-shell"><div className="game-loading">이 게임은 카드가 필요합니다.<button onClick={onExit}>돌아가기</button></div></main>; }
