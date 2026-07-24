import type { RuntimeDiagnostics } from "@lucky-arcade/cabinet-sdk";
import type { RaceFrame, RaceTranscript } from "../../index.ts";
import { laneY, raceX, replayFrames, runnerColors, RuntimeMeter, type DerbyPlayOptions } from "./shared.ts";
import type { DerbyRuntimeAdapter } from "./types.ts";

export class ExcaliburDerbyAdapter implements DerbyRuntimeAdapter {
  readonly #meter = new RuntimeMeter("Excalibur 0.32.0");
  readonly #assets: Readonly<Record<string, string>>;
  #engine: import("excalibur").Engine | null = null;
  #module: typeof import("excalibur") | null = null;
  #actors = new Map<string, import("excalibur").Actor>();
  #sources = new Map<string, import("excalibur").ImageSource>();
  #assetIds: readonly string[] = [];
  #destroyed = false;
  #paused = false;

  constructor(assets: Readonly<Record<string, string>>) { this.#assets = assets; }
  async mount(host: HTMLElement): Promise<void> {
    const ex = await import("excalibur");
    this.#module = ex;
    const canvas = document.createElement("canvas");
    host.replaceChildren(canvas);
    this.#engine = new ex.Engine({ width: 960, height: 540, canvasElement: canvas, displayMode: ex.DisplayMode.FitContainer, backgroundColor: ex.Color.fromHex("#071119"), suppressPlayButton: true, suppressConsoleBootMessage: true, pointerScope: ex.PointerScope.Canvas });
    await this.#engine.start();
    this.#meter.mounted(); this.#meter.frame();
  }
  async preload(assetIds: readonly string[]): Promise<void> {
    this.#assetIds = assetIds;
    const ex = this.#module;
    if (!ex) return;
    await Promise.all(assetIds.map(async (id) => { const url = this.#assets[id]; if (!url) return; const source = new ex.ImageSource(url); await source.load().catch(() => undefined); if (source.isLoaded()) this.#sources.set(id, source); }));
  }
  async play(transcript: RaceTranscript, options: DerbyPlayOptions): Promise<void> {
    const ex = this.#module, engine = this.#engine;
    if (!ex || !engine) return;
    this.#actors.clear();
    transcript.racers.forEach((racer, index) => {
      const lane = new ex.Actor({ x: 480, y: laneY(index), width: 840, height: 44, color: ex.Color.fromHex(index % 2 ? "#102330" : "#0d1d28") });
      engine.add(lane);
      const actor = new ex.Actor({ x: 120, y: laneY(index), width: 48, height: 42, color: ex.Color.fromHex(runnerColors[index]!) });
      const source = this.#sources.get(racer.portraitAssetId);
      if (source) { const sprite = source.toSprite(); sprite.width = 44; sprite.height = 40; actor.graphics.use(sprite); }
      engine.add(actor); this.#actors.set(racer.id, actor);
    });
    await replayFrames(transcript, options, () => this.#destroyed, (frame) => this.#present(frame), () => this.#paused);
  }
  #present(frame: RaceFrame): void { const started = performance.now(); frame.racers.forEach((racer) => { const actor = this.#actors.get(racer.id); if (actor) actor.pos.x = raceX(racer.progress); }); this.#meter.frame(performance.now() - started); }
  pause(): void { this.#paused = true; this.#engine?.stop(); }
  resume(): void { this.#paused = false; if (this.#engine && !this.#engine.isRunning()) void this.#engine.start(); }
  resize(): void { this.#engine?.screen.applyResolutionAndViewport(); }
  diagnostics(): RuntimeDiagnostics { return this.#meter.copy(); }
  destroy(): void { this.#destroyed = true; this.#engine?.stop(); this.#engine?.canvas.remove(); this.#actors.clear(); this.#sources.clear(); this.#engine = null; this.#module = null; this.#meter.destroyed(); }
}
