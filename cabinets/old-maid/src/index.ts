import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import { OLD_MAID_VERSION } from "./contracts.ts";

export * from "./contracts.ts";
export * from "./dialogue.ts";
export * from "./engine.ts";
export { temerosaOldMaidLines } from "./temerosa-lines.ts";
export { temerosaOldMaidCartridge } from "./cartridge.ts";

export const temerosaOldMaidManifest: CabinetManifest = {
  id: "temerosa-old-maid",
  version: OLD_MAID_VERSION,
  title: "테메로세 도둑잡기",
  description: "테메로세 인물들과 즐기는 도둑잡기.",
  requiredCapabilities: [],
  sessionKind: "repeat",
  launchKind: "built-in",
  resumeLabel: "도둑잡기 이어하기",
  estimatedMinutes: { min: 2, max: 4 },
};
