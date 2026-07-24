import type { RuntimeDiagnostics } from "@lucky-arcade/cabinet-sdk";
import type { RaceFrame, RaceTranscript } from "../../index.ts";
import { laneY, loadImages, raceX, replayFrames, runnerColors, RuntimeMeter, type DerbyPlayOptions } from "./shared.ts";
import type { DerbyRuntimeAdapter } from "./types.ts";

/** Current production-style LittleJS integration: engine utilities plus an owned disposable Canvas loop. */
export class LittleJsDerbyAdapter implements DerbyRuntimeAdapter {
  readonly #meter = new RuntimeMeter("LittleJS 1.18.24 baseline");
  readonly #assets: Readonly<Record<string, string>>;
  #canvas: HTMLCanvasElement | null = null;
  #context: CanvasRenderingContext2D | null = null;
  #images = new Map<string, HTMLImageElement>();
  #transcript: RaceTranscript | null = null;
  #frame: RaceFrame | null = null;
  #palette = { background: "#071119", laneA: "#0d1d28", laneB: "#102330" };
  #destroyed = false;
  #paused = false;
  constructor(assets: Readonly<Record<string, string>>) { this.#assets = assets; }
  async mount(host: HTMLElement): Promise<void> {
    const little = await import("littlejsengine");
    this.#palette = { background: new little.Color(.025, .065, .09).toString(), laneA: new little.Color(.05, .11, .15).toString(), laneB: new little.Color(.06, .14, .19).toString() };
    const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 540; canvas.className = "derby-engine-canvas"; host.replaceChildren(canvas);
    this.#canvas = canvas; this.#context = canvas.getContext("2d"); this.#meter.mounted(); this.#draw(); this.#meter.frame();
  }
  async preload(assetIds: readonly string[]): Promise<void> { this.#images = await loadImages(this.#assets, assetIds); }
  async play(transcript: RaceTranscript, options: DerbyPlayOptions): Promise<void> { this.#transcript = transcript; await replayFrames(transcript, options, () => this.#destroyed, (frame) => { const started = performance.now(); this.#frame = frame; this.#draw(); this.#meter.frame(performance.now() - started); }, () => this.#paused); }
  #draw(): void {
    const context = this.#context, transcript = this.#transcript, frame = this.#frame;
    if (!context) return; context.fillStyle = this.#palette.background; context.fillRect(0, 0, 960, 540);
    if (!transcript || !frame) return;
    transcript.racers.forEach((racer, index) => { const state = frame.racers[index]; if (!state) return; context.fillStyle = index % 2 ? this.#palette.laneB : this.#palette.laneA; context.fillRect(60, laneY(index) - 22, 880, 44); const x = raceX(state.progress); context.fillStyle = runnerColors[index]!; context.fillRect(x - 24, laneY(index) - 21, 48, 42); const image = this.#images.get(racer.portraitAssetId); if (image) context.drawImage(image, x - 22, laneY(index) - 20, 44, 40); });
  }
  pause(): void { this.#paused = true; }
  resume(): void { this.#paused = false; }
  resize(): void { /* CSS owns responsive scaling for the baseline canvas. */ }
  diagnostics(): RuntimeDiagnostics { return this.#meter.copy(); }
  destroy(): void { this.#destroyed = true; this.#images.clear(); this.#canvas?.remove(); this.#canvas = null; this.#context = null; this.#meter.destroyed(); }
}
