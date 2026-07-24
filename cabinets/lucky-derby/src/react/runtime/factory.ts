import type { DerbyEngineId } from "./shared.ts";
import type { DerbyRuntimeAdapter } from "./types.ts";

export async function createDerbyRuntime(engine: DerbyEngineId, assets: Readonly<Record<string, string>>): Promise<DerbyRuntimeAdapter> {
  if (engine === "phaser") return new (await import("./phaser-adapter.ts")).PhaserDerbyAdapter(assets);
  if (engine === "melonjs") return new (await import("./melon-adapter.ts")).MelonDerbyAdapter(assets);
  if (engine === "excalibur") return new (await import("./excalibur-adapter.ts")).ExcaliburDerbyAdapter(assets);
  return new (await import("./littlejs-adapter.ts")).LittleJsDerbyAdapter(assets);
}
