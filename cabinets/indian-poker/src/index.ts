import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import { INDIAN_POKER_VERSION } from "./contracts.ts";
export * from "./contracts.ts";
export * from "./deck.ts";
export * from "./engine.ts";
export * from "./read.ts";
export * from "./cartridge.ts";
export const indianPokerManifest: CabinetManifest = { id: "indian-poker", version: INDIAN_POKER_VERSION, title: "테메로세 인디언 포커", description: "내 카드를 본 상대의 표정을 읽고 콜·레이즈·폴드를 고르는 5라운드 승부.", requiredCapabilities: [], sessionKind: "repeat", launchKind: "built-in", resumeLabel: "인디언 포커 이어하기", estimatedMinutes: { min: 1, max: 2 }, entry: "wager", wagerTiers: [10, 50, 200] };
