import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
export * from "./contracts.ts";
export * from "./content.ts";
export * from "./core.ts";

export const temerosaPequodExpeditionManifest: CabinetManifest = {
  id: "temerosa-pequod-expedition", version: "temerosa-pequod-expedition/0.1", title: "테메로세: 피쿼드 원정",
  description: "두 동료를 골라 피쿼드 폐허의 일곱 구간과 트레인헤드를 통과하는 결정론 원정.", requiredCapabilities: [],
  sessionKind: "deep", launchKind: "built-in", resumeLabel: "피쿼드 원정 이어하기", estimatedMinutes: { min: 8, max: 15 },
};
