import { IconArrowLeft, IconBolt, IconChevronRight, IconCrosshair, IconHeartRateMonitor, IconRefresh, IconShield, IconTargetArrow, IconTool } from "@tabler/icons-react";
import { Button } from "@lucky-arcade/ui";
import { useEffect, useRef, useState } from "react";
import { createTemerosaExpeditionRun, RECOMMENDED_FORMATIONS, reduceTemerosaExpeditionRun } from "../core.ts";
import type { ExpeditionRole, Intervention, RouteNode, Tactic, TemerosaExpeditionAction, TemerosaExpeditionContentPack, TemerosaExpeditionRunState } from "../contracts.ts";
import { LittleJsBattleAdapter } from "./runtime/littlejs-adapter.ts";

export interface TemerosaExpeditionScreenProps {
  pack: TemerosaExpeditionContentPack;
  initialState: TemerosaExpeditionRunState | null;
  onPersist(previous: TemerosaExpeditionRunState, next: TemerosaExpeditionRunState, action: TemerosaExpeditionAction): Promise<void>;
  onExit(): void;
}

export function TemerosaExpeditionScreen({ pack, initialState, onPersist, onExit }: TemerosaExpeditionScreenProps) {
  const [runNonce, setRunNonce] = useState(0);
  const [state, setState] = useState(() => initialState ?? createTemerosaExpeditionRun(pack, `${new Date().toISOString().slice(0, 10)}:0`));
  const dispatch = (action: TemerosaExpeditionAction) => {
    try {
      const next = reduceTemerosaExpeditionRun(pack, state, action);
      if (next === state) return;
      setState(next);
      void onPersist(state, next, action);
    } catch (error) { console.warn(error); }
  };
  const newRun = () => {
    const nonce = runNonce + 1;
    setRunNonce(nonce);
    setState(createTemerosaExpeditionRun(pack, `${new Date().toISOString().slice(0, 10)}:${nonce}`));
  };
  return <main className="temerosa-expedition-shell"><header className="temerosa-expedition-topbar"><button className="icon-button" onClick={onExit} aria-label="카지노로 돌아가기"><IconArrowLeft /></button><div><span>PEQUOD EXPEDITION · NO LLM</span><h1>테메로세: 피쿼드 원정</h1></div><div className="temerosa-expedition-run-status"><span>구간 <b>{Math.min(state.depth + 1, 7)}/7</b></span><span>보급 <b>{state.supplies}</b></span></div></header>
    {state.phase === "formation" && <Formation pack={pack} onConfirm={(companionIds) => dispatch({ type: "set_formation", companionIds })} />}
    {state.phase === "route" && <Route state={state} onChoose={(nodeId) => dispatch({ type: "choose_node", nodeId })} onRetreat={() => dispatch({ type: "retreat" })} />}
    {state.phase === "battle-ready" && <BattleReady state={state} pack={pack} onTactic={(tactic) => dispatch({ type: "choose_tactic", tactic })} onIntervention={(intervention, round) => dispatch({ type: "schedule_intervention", intervention, round })} onStart={() => dispatch({ type: "resolve_battle" })} />}
    {state.phase === "battle-report" && state.transcript && <BattlePlayback state={state} pack={pack} onContinue={() => dispatch({ type: "acknowledge_battle" })} />}
    {state.phase === "reward" && <Rewards state={state} onChoose={(rewardId) => dispatch({ type: "choose_reward", rewardId })} />}
    {state.phase === "finished" && <Ending state={state} onRetry={newRun} onExit={onExit} />}
  </main>;
}

function Formation({ pack, onConfirm }: { pack: TemerosaExpeditionContentPack; onConfirm(ids: string[]): void }) {
  const [selected, setSelected] = useState<string[]>([...RECOMMENDED_FORMATIONS.balanced]);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 2 ? [...current, id] : current);
  return <section className="temerosa-expedition-panel formation-panel"><div className="temerosa-expedition-section-title"><span>STEP 01</span><h2>함께 갈 두 사람</h2><p>페일·카노·네모는 같은 능력의 스킨이 아닙니다. 두 동료의 역할을 보고 항로를 정하세요.</p></div><div className="preset-row"><button onClick={() => setSelected([...RECOMMENDED_FORMATIONS.balanced])}>관계와 방어</button><button onClick={() => setSelected([...RECOMMENDED_FORMATIONS.focus])}>관계와 되돌림</button><button onClick={() => setSelected([...RECOMMENDED_FORMATIONS.defense])}>방어와 되돌림</button></div><div className="doll-grid">{pack.companions.map((companion) => <button key={companion.id} className={selected.includes(companion.id) ? "selected" : ""} onClick={() => toggle(companion.id)}><Portrait pack={pack} id={companion.id} /><span>{roleLabel(companion.role)}</span><strong>{companion.name}</strong><small>{companion.description}</small></button>)}</div><div className="temerosa-expedition-sticky-action"><span><b>{selected.length}</b>/2명 선택</span><Button disabled={selected.length !== 2} onClick={() => onConfirm(selected)}>원정 지도 진입 <IconChevronRight size={18} /></Button></div></section>;
}

function Route({ state, onChoose, onRetreat }: { state: TemerosaExpeditionRunState; onChoose(id: string): void; onRetreat(): void }) {
  return <section className="temerosa-expedition-panel route-panel"><div className="temerosa-expedition-section-title"><span>ROUTE {state.depth + 1}/7</span><h2>다음 항로를 선택하세요</h2><p>현재의 폐허와 과거 기록이 겹친 길입니다. 위험과 회수 가능 기록을 함께 보세요.</p></div><div className="route-history">{state.route.map((column, index) => <div key={index} className={index < state.depth ? "done" : index === state.depth ? "current" : "locked"}><b>{index + 1}</b>{index === state.depth && column.map((node) => <NodeButton key={node.id} node={node} onChoose={onChoose} />)}</div>)}</div><button className="text-button" onClick={onRetreat}>현재 기록을 보존하고 철수</button></section>;
}
function NodeButton({ node, onChoose }: { node: RouteNode; onChoose(id: string): void }) {
  const icon = node.type === "repair" ? <IconTool /> : node.type === "supply" ? <IconHeartRateMonitor /> : node.type === "scout" ? <IconTargetArrow /> : node.type === "boss" ? <IconCrosshair /> : <IconBolt />;
  return <button className={`route-node ${node.type}`} onClick={() => onChoose(node.id)}>{icon}<strong>{node.label}</strong><small>위험도 {"◆".repeat(node.danger)}</small></button>;
}

function BattleReady({ state, pack, onTactic, onIntervention, onStart }: { state: TemerosaExpeditionRunState; pack: TemerosaExpeditionContentPack; onTactic(tactic: Tactic): void; onIntervention(intervention: Intervention, round: number): void; onStart(): void }) {
  const node = state.route[state.depth]?.find((item) => item.id === state.currentNodeId);
  return <section className="temerosa-expedition-panel battle-ready"><div className="temerosa-expedition-section-title"><span>EXPEDITION BRIEFING</span><h2>{node?.label} 준비</h2><p>전술과 한 번뿐인 항해사 개입을 예약하면 순수 코어가 교전 기록을 먼저 확정합니다.</p></div><div className="tactic-grid">{([['focus', '집중', '공명↑ 압력↑'], ['balanced', '균형', '안정적인 대응'], ['cover', '엄폐', '압력↓ 공명↓']] as const).map(([id, label, detail]) => <button key={id} className={state.tactic === id ? "selected" : ""} onClick={() => onTactic(id)}><strong>{label}</strong><small>{detail}</small></button>)}</div><div className="intervention-row"><label>항해사 개입<select value={state.intervention?.type ?? "brace"} onChange={(event) => onIntervention(event.target.value as Intervention, state.intervention?.round ?? 3)}><option value="focus">이름 고정</option><option value="brace">기억 보존</option><option value="barrage">구조 신호</option></select></label><label>발동 라운드<input type="number" min="1" max="8" value={state.intervention?.round ?? 3} onChange={(event) => onIntervention(state.intervention?.type ?? "brace", Number(event.target.value))} /></label></div><div className="formation-strip">{state.formation.map((id) => <div key={id}><Portrait pack={pack} id={id} /><span>{pack.companions.find((companion) => companion.id === id)?.name}</span></div>)}</div><Button className="temerosa-expedition-launch" onClick={onStart}><IconCrosshair /> 교전 기록 확정</Button></section>;
}

function BattlePlayback({ state, pack, onContinue }: { state: TemerosaExpeditionRunState; pack: TemerosaExpeditionContentPack; onContinue(): void }) {
  const host = useRef<HTMLDivElement>(null), [done, setDone] = useState(false), [speed, setSpeed] = useState<1 | 2 | 4>(2);
  useEffect(() => {
    if (!host.current || !state.transcript) return;
    let alive = true;
    const adapter = new LittleJsBattleAdapter(pack.assets);
    void adapter.mount(host.current).then(async () => { await adapter.preload(state.formation.flatMap((id) => [`portrait:${id}:natural`, `portrait:${id}:angry`, `portrait:${id}:default`])); if (alive) { await adapter.play(state.transcript!, { speed }); if (alive) setDone(true); } });
    const visibility = () => document.hidden ? adapter.pause() : adapter.resume();
    document.addEventListener("visibilitychange", visibility);
    return () => { alive = false; document.removeEventListener("visibilitychange", visibility); adapter.destroy(); };
  }, [state.transcript, state.formation, pack.assets, speed]);
  const transcript = state.transcript!;
  return <section className="temerosa-expedition-battle-stage"><div ref={host} /><div className="battle-controls"><div><button onClick={() => { setDone(false); setSpeed(1); }} className={speed === 1 ? "active" : ""}>1×</button><button onClick={() => { setDone(false); setSpeed(2); }} className={speed === 2 ? "active" : ""}>2×</button><button onClick={() => { setDone(false); setSpeed(4); }} className={speed === 4 ? "active" : ""}>4×</button></div><span>{transcript.outcome === "victory" ? "항로 확보" : "동료 전투 불능"} · {transcript.rounds.length}라운드</span><Button disabled={!done} onClick={onContinue}>{done ? "교전 기록 확인" : "재생 중…"}</Button></div></section>;
}

function Rewards({ state, onChoose }: { state: TemerosaExpeditionRunState; onChoose(id: string): void }) { return <section className="temerosa-expedition-panel reward-panel"><div className="temerosa-expedition-section-title"><span>SALVAGE</span><h2>하나를 회수하세요</h2><p>동료의 상태와 남은 항로를 보고 다음 기록을 고르세요.</p></div><div className="reward-grid">{state.rewards.map((reward) => <button key={reward.id} onClick={() => onChoose(reward.id)}><IconShield /><strong>{reward.label}</strong><small>{reward.detail}</small></button>)}</div></section>; }
function Ending({ state, onRetry, onExit }: { state: TemerosaExpeditionRunState; onRetry(): void; onExit(): void }) { const won = state.outcome === "victory"; return <section className={`temerosa-expedition-panel ending ${won ? "won" : ""}`}><span className="eyebrow">EXPEDITION COMPLETE</span><h2>{won ? "피쿼드 원정 완료" : state.outcome === "retreated" ? "기록을 보존하고 철수" : "원정 실패"}</h2><p>{state.visited.length}개 구간 통과 · 기록 {state.inventory.length}개 회수</p><div><Button onClick={onRetry}><IconRefresh size={18} /> 새 원정</Button><Button onClick={onExit}>카지노로 돌아가기</Button></div></section>; }
function Portrait({ pack, id }: { pack: TemerosaExpeditionContentPack; id: string }) { const definition = pack.companions.find((companion) => companion.id === id) ?? (pack.boss.id === id ? pack.boss : null), src = pack.assets[`portrait:${id}:natural`] ?? pack.assets[`portrait:${id}:default`]; return <div className="temerosa-expedition-portrait">{src ? <img src={src} alt={definition?.name ?? id} loading="lazy" decoding="async" /> : <span>{definition?.name ?? id}</span>}</div>; }
function roleLabel(role: ExpeditionRole): string { return role === "bond" ? "결속" : role === "ward" ? "화답" : "되돌림의 기억"; }
