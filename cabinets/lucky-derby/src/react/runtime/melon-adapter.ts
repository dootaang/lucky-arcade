import type { RuntimeDiagnostics } from "@lucky-arcade/cabinet-sdk";
import type { RaceFrame, RaceTranscript } from "../../index.ts";
import { laneY, loadImages, raceX, replayFrames, runnerColors, RuntimeMeter, type DerbyPlayOptions } from "./shared.ts";
import type { DerbyRuntimeAdapter } from "./types.ts";

export class MelonDerbyAdapter implements DerbyRuntimeAdapter {
  readonly #meter = new RuntimeMeter("melonJS 19.9.0");
  readonly #assets: Readonly<Record<string, string>>;
  #app: import("melonjs").Application | null = null;
  #layer: import("melonjs").Renderable | null = null;
  #images = new Map<string, HTMLImageElement>();
  #frame: RaceFrame | null = null;
  #transcript: RaceTranscript | null = null;
  #destroyed = false;
  #paused = false;
  constructor(assets: Readonly<Record<string, string>>) { this.#assets = assets; }
  async mount(host: HTMLElement): Promise<void> {
    const me = await import("melonjs");
    const owner = this;
    class RaceLayer extends me.Renderable {
      constructor() { super(0, 0, 960, 540); this.anchorPoint.set(0, 0); this.alwaysUpdate = true; }
      override update(): boolean { return true; }
      override draw(renderer: import("melonjs").CanvasRenderer | import("melonjs").WebGLRenderer): void { owner.#draw(renderer); }
    }
    this.#app = new me.Application(960, 540, { parent: host, renderer: me.video.AUTO, scale: "auto", scaleMethod: "fit", physic: "none", antiAlias: true });
    this.#layer = new RaceLayer(); this.#app.world.addChild(this.#layer);
    this.#meter.mounted(); this.#meter.frame();
  }
  async preload(assetIds: readonly string[]): Promise<void> { this.#images = await loadImages(this.#assets, assetIds); }
  async play(transcript: RaceTranscript, options: DerbyPlayOptions): Promise<void> { this.#transcript = transcript; await replayFrames(transcript, options, () => this.#destroyed, (frame) => { const started = performance.now(); this.#frame = frame; this.#layer?.update(0); this.#meter.frame(performance.now() - started); }, () => this.#paused); }
  #draw(renderer: import("melonjs").CanvasRenderer | import("melonjs").WebGLRenderer): void {
    const transcript = this.#transcript, frame = this.#frame;
    renderer.setColor("#071119"); renderer.fillRect(0, 0, 960, 540);
    if (!transcript || !frame) return;
    transcript.racers.forEach((racer, index) => {
      renderer.setColor(index % 2 ? "#102330" : "#0d1d28"); renderer.fillRect(60, laneY(index) - 22, 880, 44);
      renderer.setColor(runnerColors[index]!); renderer.fillRect(raceX(frame.racers[index]?.progress ?? 0) - 24, laneY(index) - 21, 48, 42);
      const image = this.#images.get(racer.portraitAssetId);
      if (image) renderer.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, raceX(frame.racers[index]?.progress ?? 0) - 22, laneY(index) - 20, 44, 40);
    });
  }
  pause(): void { this.#paused = true; this.#app?.pause(true); }
  resume(): void { this.#paused = false; this.#app?.resume(true); }
  resize(): void { this.#app?.resize(); }
  diagnostics(): RuntimeDiagnostics { return this.#meter.copy(); }
  destroy(): void { this.#destroyed = true; this.#app?.destroy(true); this.#app = null; this.#layer = null; this.#images.clear(); this.#meter.destroyed(); }
}
