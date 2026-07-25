import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import { INDIAN_POKER_VERSION } from "./contracts.ts";
export * from "./contracts.ts";
export * from "./deck.ts";
export * from "./engine.ts";
export * from "./read.ts";
export * from "./cartridge.ts";
export const indianPokerManifest: CabinetManifest = { id: "indian-poker", version: INDIAN_POKER_VERSION, title: "테메로세 인디언 포커", description: "상대의 표정을 읽고 계속할지 기권할지 고르는 5라운드 카드 게임.", requiredCapabilities: [], sessionKind: "repeat", launchKind: "built-in", resumeLabel: "인디언 포커 이어하기", estimatedMinutes: { min: 1, max: 2 } };
