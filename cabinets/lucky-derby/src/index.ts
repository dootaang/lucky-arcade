import type { CabinetManifest } from "@lucky-arcade/cabinet-sdk";
import { resultHash, XorShift32 } from "@lucky-arcade/engine";

export const luckyDerbyManifest: CabinetManifest = {
  id: "lucky-derby-lab",
  version: "lucky-derby/0.1",
  title: "럭키★더비 엔진 실험장",
  description: "같은 8인 경주를 네 엔진으로 재생해 손맛과 성능을 직접 비교합니다.",
  requiredCapabilities: [],
  sessionKind: "repeat",
  launchKind: "built-in",
  resumeLabel: "엔진 비교 이어하기",
  estimatedMinutes: { min: 2, max: 5 },
};

export type DerbyStrategy = "front" | "stalker" | "closer";

export interface DerbyRacer {
  id: string;
  name: string;
  className: string;
  portraitAssetId: string;
  speed: number;
  acceleration: number;
  stamina: number;
  focus: number;
  strategy: DerbyStrategy;
}

export interface RaceFrameRacer {
  id: string;
  progress: number;
  energy: number;
  rank: number;
}

export interface RaceFrame {
  tick: number;
  racers: RaceFrameRacer[];
}

export interface RaceEvent {
  tick: number;
  racerId: string;
  kind: "surge" | "stumble" | "finish";
}

export interface RaceResult {
  racerId: string;
  rank: number;
  finishTick: number | null;
  progress: number;
}

export interface RaceTranscript {
  contract: "lucky-derby-transcript/0.1";
  seed: string;
  tickRate: 30;
  durationTicks: 900;
  trackLength: 100_000;
  racers: DerbyRacer[];
  frames: RaceFrame[];
  events: RaceEvent[];
  results: RaceResult[];
  resultHash: string;
}

export interface SimulateRaceInput {
  seed: string;
  racers: readonly DerbyRacer[];
}

export interface EngineBenchmarkSample {
  engineId: string;
  loadMs: number;
  firstFrameMs: number;
  longestFrameMs: number;
  slowFrameRatio: number;
  completed: boolean;
}

export interface RankedEngineBenchmark extends EngineBenchmarkSample { score: number; }

export function rankEngineBenchmarks(samples: readonly EngineBenchmarkSample[]): RankedEngineBenchmark[] {
  return samples.map((sample) => ({
    ...sample,
    score: Math.round((sample.completed ? 10_000 : 0) - sample.loadMs * 2 - sample.firstFrameMs * 3 - sample.longestFrameMs * 8 - sample.slowFrameRatio * 5_000),
  })).sort((left, right) => right.score - left.score || left.engineId.localeCompare(right.engineId));
}

interface MutableRacer {
  profile: DerbyRacer;
  progress: number;
  energy: number;
  finishTick: number | null;
  noise: number;
}

const TRACK_LENGTH = 100_000;
const DURATION_TICKS = 900;
const SAMPLE_EVERY = 10;

export function simulateRace({ seed, racers }: SimulateRaceInput): RaceTranscript {
  if (racers.length < 4 || racers.length > 12) throw new Error("derby_racer_count");
  if (new Set(racers.map((racer) => racer.id)).size !== racers.length) throw new Error("derby_racer_duplicate");
  const rng = new XorShift32(`lucky-derby:${seed}`);
  const mutable: MutableRacer[] = racers.map((profile) => ({
    profile: validateRacer(profile), progress: 0, energy: profile.stamina * 100, finishTick: null, noise: 0,
  }));
  const frames: RaceFrame[] = [];
  const events: RaceEvent[] = [];

  for (let tick = 0; tick <= DURATION_TICKS; tick += 1) {
    if (tick > 0) {
      for (const racer of mutable) {
        if (racer.finishTick !== null) continue;
        if (tick % 15 === 0) racer.noise = Number(rng.nextUint32() % 9) - 4;
        let pace = 66 + Math.floor(racer.profile.speed / 2) + racer.noise;
        pace += Math.floor(racer.profile.acceleration * Math.max(0, 120 - tick) / 600);
        pace += strategyBonus(racer.profile.strategy, tick);
        if (racer.energy < 2_500) pace -= Math.floor((2_500 - racer.energy) / 180);
        if (tick % 90 === 0 && rng.nextUint32() % 1_000 < 115 - racer.profile.focus) {
          pace = Math.max(30, pace - 28);
          events.push({ tick, racerId: racer.profile.id, kind: "stumble" });
        }
        if (tick === 630 && racer.profile.strategy === "closer") events.push({ tick, racerId: racer.profile.id, kind: "surge" });
        racer.progress += Math.max(25, pace);
        racer.energy = Math.max(0, racer.energy - 7 - Math.floor(pace / 35));
        if (racer.progress >= TRACK_LENGTH) {
          racer.progress = TRACK_LENGTH;
          racer.finishTick = tick;
          events.push({ tick, racerId: racer.profile.id, kind: "finish" });
        }
      }
    }
    if (tick % SAMPLE_EVERY === 0 || tick === DURATION_TICKS) frames.push(frameAt(tick, mutable));
  }

  const ordered = [...mutable].sort((left, right) => {
    if (left.finishTick !== null && right.finishTick !== null) return left.finishTick - right.finishTick || right.progress - left.progress;
    if (left.finishTick !== null) return -1;
    if (right.finishTick !== null) return 1;
    return right.progress - left.progress || left.profile.id.localeCompare(right.profile.id);
  });
  const results = ordered.map((racer, index): RaceResult => ({ racerId: racer.profile.id, rank: index + 1, finishTick: racer.finishTick, progress: racer.progress }));
  const unsigned = { contract: "lucky-derby-transcript/0.1" as const, seed, tickRate: 30 as const, durationTicks: DURATION_TICKS as 900, trackLength: TRACK_LENGTH as 100_000, racers: racers.map((racer) => ({ ...racer })), frames, events, results };
  return { ...unsigned, resultHash: resultHash(unsigned) };
}

function validateRacer(racer: DerbyRacer): DerbyRacer {
  for (const stat of [racer.speed, racer.acceleration, racer.stamina, racer.focus]) if (!Number.isInteger(stat) || stat < 1 || stat > 100) throw new Error(`derby_stat:${racer.id}`);
  return racer;
}

function strategyBonus(strategy: DerbyStrategy, tick: number): number {
  if (strategy === "front") return tick < 360 ? 10 : tick > 690 ? -7 : 1;
  if (strategy === "stalker") return tick < 240 ? -2 : tick < 690 ? 7 : 3;
  return tick < 420 ? -7 : tick < 630 ? 2 : 16;
}

function frameAt(tick: number, racers: readonly MutableRacer[]): RaceFrame {
  const rank = new Map([...racers].sort((left, right) => right.progress - left.progress || left.profile.id.localeCompare(right.profile.id)).map((racer, index) => [racer.profile.id, index + 1]));
  return { tick, racers: racers.map((racer) => ({ id: racer.profile.id, progress: racer.progress, energy: racer.energy, rank: rank.get(racer.profile.id) ?? racers.length })) };
}

export const temerosaDerbyRoster: readonly DerbyRacer[] = [
  { id: "yul", name: "율", className: "선행", portraitAssetId: "npc-yul-pleased", speed: 91, acceleration: 87, stamina: 70, focus: 84, strategy: "front" },
  { id: "levillotte", name: "레빌로트", className: "변칙", portraitAssetId: "npc-levillotte-pleased", speed: 88, acceleration: 94, stamina: 69, focus: 76, strategy: "front" },
  { id: "traver", name: "트레버", className: "균형", portraitAssetId: "npc-traver-neutral", speed: 82, acceleration: 81, stamina: 84, focus: 90, strategy: "stalker" },
  { id: "lyla", name: "라일라", className: "통제", portraitAssetId: "npc-lyla-neutral", speed: 83, acceleration: 78, stamina: 88, focus: 96, strategy: "stalker" },
  { id: "katrinka", name: "카트린카", className: "지구", portraitAssetId: "npc-katrinka-pleased", speed: 75, acceleration: 72, stamina: 98, focus: 88, strategy: "closer" },
  { id: "raven", name: "레이븐", className: "계산", portraitAssetId: "npc-raven-neutral", speed: 80, acceleration: 76, stamina: 91, focus: 95, strategy: "closer" },
  { id: "adesha", name: "아데샤", className: "잠행", portraitAssetId: "npc-adesha-neutral", speed: 89, acceleration: 84, stamina: 72, focus: 92, strategy: "stalker" },
  { id: "ttaengchil", name: "땡칠이", className: "돌파", portraitAssetId: "npc-ttaengchil-pleased", speed: 87, acceleration: 96, stamina: 74, focus: 80, strategy: "front" },
] as const;
