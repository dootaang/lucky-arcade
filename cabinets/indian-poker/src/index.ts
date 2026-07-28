import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import { INDIAN_POKER_VERSION } from "./contracts.ts";

export * from "./contracts.ts";
export * from "./deck.ts";
export * from "./engine.ts";
export * from "./read.ts";
export * from "./cartridge.ts";

export const indianPokerManifest: CabinetManifest = {
  id: "indian-poker",
  version: INDIAN_POKER_VERSION,
  title: "테메로세 인디언 포커",
  description: "보이지 않는 내 카드와 상대의 표정·베팅을 함께 읽는 1대1 5·7라운드 승부.",
  requiredCapabilities: [],
  sessionKind: "repeat",
  launchKind: "built-in",
  resumeLabel: "인디언 포커 이어하기",
  estimatedMinutes: { min: 2, max: 5 },
  entry: "wager",
  wagerTiers: [10, 50, 200],
};
