import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import { OLD_MAID_VERSION } from "./contracts.ts";

export * from "./contracts.ts";
export * from "./dialogue.ts";
export * from "./engine.ts";
export * from "./outcome.ts";
export * from "./read.ts";
export * from "./tells.ts";
export { temerosaOldMaidLines } from "./temerosa-lines.ts";
export { temerosaCasinoOldMaidLines } from "./temerosa-casino-lines.ts";
export { temerosaOutcomeOldMaidLines } from "./temerosa-outcome-lines.ts";
export { TEMEROSA_CASINO_BEHAVIOR_PROFILES, TEMEROSA_CASINO_TELL_STYLES } from "./temerosa-casino-personas.ts";
export { createTemerosaCasinoOldMaidCartridge, temerosaOldMaidCartridge, type TemerosaCasinoPortraitAsset } from "./cartridge.ts";

export const temerosaOldMaidManifest: CabinetManifest = {
  id: "temerosa-old-maid",
  version: OLD_MAID_VERSION,
  title: "테메로세 도둑잡기",
  description: "즐거운 도둑잡기",
  requiredCapabilities: [],
  sessionKind: "repeat",
  launchKind: "built-in",
  resumeLabel: "도둑잡기 이어하기",
  estimatedMinutes: { min: 2, max: 4 },
};
