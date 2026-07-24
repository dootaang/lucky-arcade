import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
export * from "./contracts.ts";
export * from "./core.ts";
export * from "./dialogue-director.ts";
export { temerosaStoryContent } from "./content.ts";

export const temerosaMarginManifest: CabinetManifest = {
  id: "temerosa-margin", version: "temerosa-margin/0.1", title: "테메로세: 여백 — 첫 항로",
  description: "죽은 단말기를 깨우고 임시 항해사가 되어, 함께 갈 두 사람과 첫 계약을 맺습니다.",
  requiredCapabilities: [], sessionKind: "deep", launchKind: "built-in", resumeLabel: "첫 항로 이어하기", estimatedMinutes: { min: 5, max: 10 },
};
