import type { AnalyzedCard } from "@lucky-arcade/contracts";
import type { AnalysisRequest, AnalysisResponse } from "../workers/analysis.worker.ts";

const ANALYSIS_TIMEOUT_MS = 15_000;
let active: { worker: Worker; reject(reason: Error): void; timeout: number } | null = null;
let requestId = 0;

export function analyzeCardFile(file: File): Promise<AnalyzedCard> {
  cancelActive("analysis_superseded");
  const worker = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), { type: "module" });
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      if (active?.worker !== worker) return;
      worker.terminate();
      active = null;
      reject(new Error("analysis_timeout"));
    }, ANALYSIS_TIMEOUT_MS);
    active = { worker, reject, timeout };
    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      window.clearTimeout(timeout);
      if (active?.worker === worker) active = null;
      if (event.data.ok) resolve(event.data.analyzed);
      else reject(new Error(event.data.error));
    };
    worker.onerror = () => {
      worker.terminate();
      window.clearTimeout(timeout);
      if (active?.worker === worker) active = null;
      reject(new Error("analysis_worker_failed"));
    };
    worker.postMessage({ id, file } satisfies AnalysisRequest);
  });
}

export function cancelCardAnalysis(): void { cancelActive("analysis_cancelled"); }

function cancelActive(code: string): void {
  if (!active) return;
  const current = active;
  active = null;
  window.clearTimeout(current.timeout);
  current.worker.terminate();
  current.reject(new Error(code));
}
