import type { RuntimeDiagnostics } from "@lucky-arcade/cabinet-sdk";
import type { RaceFrame, RaceTranscript } from "../../index.ts";

export type DerbyEngineId = "phaser" | "melonjs" | "excalibur" | "littlejs";
export interface DerbyPlayOptions { speed: 1 | 2 | 4 | 8; }

export class RuntimeMeter {
  readonly diagnostics: RuntimeDiagnostics;
  constructor(engine: string) {
    this.diagnostics = { engine, mountedAt: null, firstFrameAt: null, frames: 0, slowFrames: 0, longestFrameMs: 0, destroyed: false };
  }

  mounted(): void { this.diagnostics.mountedAt = performance.now(); }
  frame(renderCostMs = 0): void {
    const now = performance.now();
    if (this.diagnostics.firstFrameAt === null) this.diagnostics.firstFrameAt = now;
    this.diagnostics.longestFrameMs = Math.max(this.diagnostics.longestFrameMs, renderCostMs);
    if (renderCostMs > 16.7) this.diagnostics.slowFrames += 1;
    this.diagnostics.frames += 1;
  }
  destroyed(): void { this.diagnostics.destroyed = true; }
  copy(): RuntimeDiagnostics { return { ...this.diagnostics }; }
}

export async function loadImages(assetUrls: Readonly<Record<string, string>>, assetIds: readonly string[]): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(assetIds.map(async (id) => {
    const source = assetUrls[id];
    if (!source) return;
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    await image.decode().catch(() => undefined);
    if (image.complete) images.set(id, image);
  }));
  return images;
}

export async function replayFrames(
  transcript: RaceTranscript,
  options: DerbyPlayOptions,
  isStopped: () => boolean,
  present: (frame: RaceFrame) => void,
  isPaused: () => boolean = () => false,
): Promise<void> {
  const delay = Math.max(16, (1_000 / transcript.tickRate) * 10 / options.speed);
  for (const frame of transcript.frames) {
    if (isStopped()) return;
    while (isPaused() && !isStopped()) await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    if (isStopped()) return;
    present(frame);
    await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
  }
}

export function raceX(progress: number): number { return 120 + Math.round(780 * progress / 100_000); }
export function laneY(index: number): number { return 72 + index * 56; }
export const runnerColors = ["#5de0b2", "#ffcb6b", "#82aaff", "#f78cda", "#c3e88d", "#ff757f", "#89ddff", "#c099ff"] as const;
