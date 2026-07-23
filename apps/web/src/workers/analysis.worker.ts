/// <reference lib="webworker" />
import { BlobBinarySource, parseCardSource } from "@lucky-arcade/card-io";
import { createAnalyzedCard } from "@lucky-arcade/extract";

export type AnalysisRequest = { id: number; file: File };
export type AnalysisResponse =
  | { id: number; ok: true; analyzed: ReturnType<typeof createAnalyzedCard> }
  | { id: number; ok: false; error: string };

self.onmessage = async (event: MessageEvent<AnalysisRequest>) => {
  const { id, file } = event.data;
  try {
    const parsed = await parseCardSource(new BlobBinarySource(file.name, file));
    const analyzed = createAnalyzedCard(parsed);
    self.postMessage({ id, ok: true, analyzed } satisfies AnalysisResponse);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : "card_analysis_failed" } satisfies AnalysisResponse);
  }
};
