import type { AnalyzedCard } from "@lucky-arcade/contracts";
import type { AnalysisRequest, AnalysisResponse } from "../workers/analysis.worker.ts";

let active: { worker: Worker; reject(reason: Error): void } | null = null;
let requestId = 0;

export function analyzeCardFile(file: File): Promise<AnalyzedCard> {
  if (active) { active.worker.terminate(); active.reject(new Error("analysis_superseded")); active = null; }
  const worker = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), { type: "module" });
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    active = { worker, reject };
    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (active?.worker === worker) active = null;
      if (event.data.ok) resolve(event.data.analyzed);
      else reject(new Error(event.data.error));
    };
    worker.onerror = () => { worker.terminate(); if (active?.worker === worker) active = null; reject(new Error("analysis_worker_failed")); };
    worker.postMessage({ id, file } satisfies AnalysisRequest);
  });
}
