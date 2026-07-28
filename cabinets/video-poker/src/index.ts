import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import { VIDEO_POKER_STAKES, VIDEO_POKER_VERSION } from "./contracts.ts";

export * from "./contracts.ts";
export * from "./engine.ts";
export * from "./hand.ts";

export const videoPokerManifest: CabinetManifest = {
  id: "video-poker",
  version: VIDEO_POKER_VERSION,
  title: "테메로세 비디오 포커",
  description: "카드 다섯 장에서 홀드를 고르고 한 번 교환하는 Jacks or Better.",
  requiredCapabilities: [],
  sessionKind: "instant",
  launchKind: "built-in",
  resumeLabel: "비디오 포커 이어하기",
  estimatedMinutes: { min: 1, max: 2 },
  entry: "wager",
  wagerTiers: VIDEO_POKER_STAKES,
};
