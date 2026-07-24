import type { ArcadeRuntimeAdapter } from "@lucky-arcade/cabinet-sdk";
import type { RaceTranscript } from "../../index.ts";
import type { DerbyPlayOptions } from "./shared.ts";

export type DerbyRuntimeAdapter = ArcadeRuntimeAdapter<HTMLElement, RaceTranscript, DerbyPlayOptions>;
