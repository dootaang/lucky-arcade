import type { RuntimeDiagnostics } from "@lucky-arcade/cabinet-sdk";
import { IconArrowLeft, IconBolt, IconPlayerPlay, IconRefresh, IconTrophy } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gflDerbyRoster, rankEngineBenchmarks, simulateRace, type EngineBenchmarkSample } from "../index.ts";
import { createDerbyRuntime } from "./runtime/factory.ts";
import type { DerbyEngineId } from "./runtime/shared.ts";
import type { DerbyRuntimeAdapter } from "./runtime/types.ts";

const engines: readonly { id: DerbyEngineId; label: string; role: string }[] = [
  { id: "phaser", label: "Phaser 4", role: "대형 2D 게임" },
  { id: "melonjs", label: "melonJS", role: "경량 2D 게임" },
  { id: "excalibur", label: "Excalibur", role: "TypeScript 게임" },
  { id: "littlejs", label: "LittleJS", role: "현재 기준선" },
];

export interface DerbyBakeoffScreenProps { assets: Readonly<Record<string, string>>; onExit(): void; }

export function DerbyBakeoffScreen({ assets, onExit }: DerbyBakeoffScreenProps) {
  const [seed, setSeed] = useState(() => dailySeed());
  const transcript = useMemo(() => simulateRace({ seed, racers: gflDerbyRoster }), [seed]);
  const [active, setActive] = useState<DerbyEngineId>("phaser");
  const [status, setStatus] = useState("출발 준비");
  const [samples, setSamples] = useState<EngineBenchmarkSample[]>(() => readSamples());
  const [autoRunning, setAutoRunning] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<DerbyRuntimeAdapter | null>(null);
  const runToken = useRef(0);

  const stopRuntime = useCallback(() => {
    runToken.current += 1;
    runtimeRef.current?.destroy();
    runtimeRef.current = null;
    hostRef.current?.replaceChildren();
  }, []);

  const run = useCallback(async (engineId: DerbyEngineId): Promise<EngineBenchmarkSample | null> => {
    const host = hostRef.current;
    if (!host) return null;
    stopRuntime();
    const token = runToken.current;
    setActive(engineId);
    setStatus(`${engines.find((item) => item.id === engineId)?.label ?? engineId} 불러오는 중`);
    const started = performance.now();
    try {
      const runtime = await createDerbyRuntime(engineId, assets);
      if (token !== runToken.current) { runtime.destroy(); return null; }
      runtimeRef.current = runtime;
      await runtime.mount(host);
      await runtime.preload?.(transcript.racers.map((racer) => racer.portraitAssetId));
      setStatus("경주 중");
      await runtime.play(transcript, { speed: 8 });
      if (token !== runToken.current) return null;
      const diagnostic = runtime.diagnostics();
      const sample = toSample(engineId, started, diagnostic, true);
      setSamples((current) => saveSample(current, sample));
      setStatus("완주 · 결과가 모든 엔진에서 동일합니다");
      return sample;
    } catch (error) {
      const diagnostic = runtimeRef.current?.diagnostics();
      const sample = toSample(engineId, started, diagnostic, false);
      setSamples((current) => saveSample(current, sample));
      setStatus(`실행 실패 · ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
      return sample;
    }
  }, [assets, stopRuntime, transcript]);

  useEffect(() => {
    void run("phaser");
    return stopRuntime;
  }, [run, stopRuntime]);

  useEffect(() => {
    const onVisibility = (): void => { if (document.hidden) runtimeRef.current?.pause(); else runtimeRef.current?.resume(); };
    const observer = new ResizeObserver(() => runtimeRef.current?.resize?.({ width: hostRef.current?.clientWidth ?? 960, height: hostRef.current?.clientHeight ?? 540, devicePixelRatio: window.devicePixelRatio }));
    document.addEventListener("visibilitychange", onVisibility);
    if (hostRef.current) observer.observe(hostRef.current);
    return () => { document.removeEventListener("visibilitychange", onVisibility); observer.disconnect(); };
  }, []);

  const compareAll = async (): Promise<void> => {
    if (autoRunning) return;
    setAutoRunning(true);
    setSamples([]);
    for (const engine of engines) await run(engine.id);
    setAutoRunning(false);
  };
  const ranking = rankEngineBenchmarks(samples);
  const winner = ranking[0];

  return <main className="derby-shell">
    <header className="derby-topbar">
      <button className="icon-button" onClick={onExit} aria-label="오락실로 돌아가기"><IconArrowLeft /></button>
      <div><span>ENGINE BAKE-OFF · SAME RACE, FOUR ENGINES</span><h1>럭키★더비 엔진 실험장</h1></div>
      <button className="derby-compare" onClick={() => void compareAll()} disabled={autoRunning}><IconBolt />{autoRunning ? "비교 중…" : "4엔진 자동 비교"}</button>
    </header>
    <section className="derby-dashboard">
      <div className="derby-engine-tabs" role="tablist" aria-label="경주 엔진">
        {engines.map((engine) => <button key={engine.id} role="tab" aria-selected={active === engine.id} className={active === engine.id ? "active" : ""} onClick={() => void run(engine.id)} disabled={autoRunning}><strong>{engine.label}</strong><small>{engine.role}</small></button>)}
      </div>
      <div className="derby-stage-wrap">
        <div className="derby-status"><IconPlayerPlay /><strong>{status}</strong><span>SEED {seed}</span><span>HASH {transcript.resultHash.slice(0, 10)}</span></div>
        <div ref={hostRef} className="derby-stage" aria-label="8인 경주 화면" />
      </div>
      <aside className="derby-scoreboard">
        <div className="derby-score-title"><IconTrophy /><div><span>확정 순위</span><strong>{transcript.results[0] ? transcript.racers.find((racer) => racer.id === transcript.results[0]!.racerId)?.name : "-"} 우승</strong></div></div>
        <ol>{transcript.results.map((result) => { const racer = transcript.racers.find((entry) => entry.id === result.racerId)!; return <li key={result.racerId}><b>{result.rank}</b><span>{racer.name}<small>{racer.className} · {racer.strategy}</small></span></li>; })}</ol>
        <button onClick={() => { setSeed(randomSeed()); setSamples([]); }} disabled={autoRunning}><IconRefresh />새 경주 만들기</button>
      </aside>
      <section className="derby-report">
        <div><span>자동 측정 보고서</span><h2>{winner ? `${engines.find((item) => item.id === winner.engineId)?.label ?? winner.engineId} 현재 1위` : "아직 측정 전"}</h2><p>승부 결과는 동일하고, 엔진을 불러오는 시간과 한 프레임 처리 비용만 비교합니다.</p></div>
        <div className="derby-metrics">{engines.map((engine) => { const item = ranking.find((sample) => sample.engineId === engine.id); return <article key={engine.id} className={winner?.engineId === engine.id ? "winner" : ""}><strong>{engine.label}</strong>{item ? <><span>로드 {item.loadMs.toFixed(0)}ms</span><span>첫 화면 {item.firstFrameMs.toFixed(0)}ms</span><span>최장 프레임 {item.longestFrameMs.toFixed(1)}ms</span><small>{item.completed ? "완주 검증" : "실행 실패"}</small></> : <small>실행해서 측정</small>}</article>; })}</div>
      </section>
    </section>
  </main>;
}

function toSample(engineId: DerbyEngineId, started: number, diagnostic: RuntimeDiagnostics | undefined, completed: boolean): EngineBenchmarkSample {
  const mountedAt = diagnostic?.mountedAt ?? performance.now();
  return { engineId, loadMs: Math.max(0, mountedAt - started), firstFrameMs: Math.max(0, (diagnostic?.firstFrameAt ?? mountedAt) - started), longestFrameMs: diagnostic?.longestFrameMs ?? 0, slowFrameRatio: diagnostic?.frames ? diagnostic.slowFrames / diagnostic.frames : 1, completed };
}
function saveSample(current: EngineBenchmarkSample[], sample: EngineBenchmarkSample): EngineBenchmarkSample[] { const next = [...current.filter((entry) => entry.engineId !== sample.engineId), sample]; localStorage.setItem("lucky-derby:engine-bakeoff", JSON.stringify(next)); return next; }
function readSamples(): EngineBenchmarkSample[] { try { const value = JSON.parse(localStorage.getItem("lucky-derby:engine-bakeoff") ?? "[]") as unknown; return Array.isArray(value) ? value as EngineBenchmarkSample[] : []; } catch { return []; } }
function dailySeed(): string { return new Date().toISOString().slice(0, 10); }
function randomSeed(): string { return `${dailySeed()}-${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}`; }

export default DerbyBakeoffScreen;
