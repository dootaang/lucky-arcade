import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import { OLD_MAID_VERSION } from "./contracts.ts";

export * from "./contracts.ts";
export * from "./engine.ts";
export { temerosaOldMaidCartridge } from "./cartridge.ts";

export const temerosaOldMaidManifest: CabinetManifest = {
  id: "temerosa-old-maid",
  version: OLD_MAID_VERSION,
  title: "테메로세 도둑잡기",
  description: "매 판 달라지는 테메로세 인물들의 표정을 읽고 마지막 조커를 피하는 4인 도둑잡기입니다.",
  requiredCapabilities: [],
  sessionKind: "repeat",
  launchKind: "built-in",
  resumeLabel: "도둑잡기 이어하기",
  estimatedMinutes: { min: 2, max: 4 },
};
