import type { RuntimeDiagnostics } from "@lucky-arcade/cabinet-sdk";
import type { RaceFrame, RaceTranscript } from "../../index.ts";
import { laneY, loadImages, raceX, replayFrames, runnerColors, RuntimeMeter, type DerbyPlayOptions } from "./shared.ts";
import type { DerbyRuntimeAdapter } from "./types.ts";

export class PhaserDerbyAdapter implements DerbyRuntimeAdapter {
  readonly #meter = new RuntimeMeter("Phaser 4.2.1");
  readonly #assets: Readonly<Record<string, string>>;
  #game: import("phaser").Game | null = null;
  #scene: import("phaser").Scene | null = null;
  #images = new Map<string, HTMLImageElement>();
  #runners = new Map<string, import("phaser").GameObjects.Container>();
  #paused = false;
  #destroyed = false;

  constructor(assets: Readonly<Record<string, string>>) { this.#assets = assets; }

  async mount(host: HTMLElement): Promise<void> {
    const Phaser = await import("phaser");
    const owner = this;
    class DerbyScene extends Phaser.Scene {
      constructor() { super("derby"); }
      create(): void { owner.#scene = this; owner.#meter.frame(); }
    }
    this.#game = new Phaser.Game({ type: Phaser.AUTO, width: 960, height: 540, parent: host, backgroundColor: "#071119", transparent: false, scene: DerbyScene, render: { antialias: true } });
    await new Promise<void>((resolve) => {
      const check = (): void => { if (this.#scene || this.#destroyed) resolve(); else window.requestAnimationFrame(check); };
      check();
    });
    this.#meter.mounted();
  }

  async preload(assetIds: readonly string[]): Promise<void> { this.#images = await loadImages(this.#assets, assetIds); }

  async play(transcript: RaceTranscript, options: DerbyPlayOptions): Promise<void> {
    const scene = this.#scene;
    if (!scene) return;
    this.#runners.clear();
    transcript.racers.forEach((racer, index) => {
      const color = Number.parseInt(runnerColors[index]!.slice(1), 16);
      scene.add.rectangle(480, laneY(index), 840, 44, index % 2 ? 0x102330 : 0x0d1d28, 1);
      const children: import("phaser").GameObjects.GameObject[] = [scene.add.rectangle(0, 0, 48, 42, color, 1), scene.add.text(30, -12, racer.name, { color: "#f5fbff", fontFamily: "system-ui", fontSize: "15px", fontStyle: "bold" })];
      const image = this.#images.get(racer.portraitAssetId);
      if (image) {
        const key = `derby-${racer.id}`;
        if (!scene.textures.exists(key)) scene.textures.addImage(key, image);
        const portrait = scene.add.image(0, 0, key).setDisplaySize(44, 40);
        children.unshift(portrait);
      }
      const container = scene.add.container(120, laneY(index), children);
      this.#runners.set(racer.id, container);
    });
    await replayFrames(transcript, options, () => this.#destroyed, (frame) => this.#present(frame), () => this.#paused);
  }

  #present(frame: RaceFrame): void {
    const started = performance.now();
    frame.racers.forEach((racer) => this.#runners.get(racer.id)?.setX(raceX(racer.progress)));
    this.#meter.frame(performance.now() - started);
  }
  pause(): void { this.#paused = true; this.#scene?.scene.pause(); }
  resume(): void { this.#paused = false; this.#scene?.scene.resume(); }
  resize(): void { this.#game?.scale.refresh(); }
  diagnostics(): RuntimeDiagnostics { return this.#meter.copy(); }
  destroy(): void { this.#destroyed = true; this.#runners.clear(); this.#images.clear(); this.#game?.destroy(true); this.#game = null; this.#scene = null; this.#meter.destroyed(); }
}
