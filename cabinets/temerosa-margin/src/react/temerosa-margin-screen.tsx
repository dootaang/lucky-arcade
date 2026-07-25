import { IconArrowLeft, IconBook2, IconCheck, IconChevronRight, IconEye, IconRefresh, IconRoute, IconUsers } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { createTemerosaRun, reduceTemerosaRun, selectTemerosaView } from "../core.ts";
import { temerosaStoryContent } from "../content.ts";
import type { CompanionId, TemerosaAction, TemerosaRunState } from "../contracts.ts";
import "./temerosa-margin.css";

export interface TemerosaMarginScreenProps {
  assets: Readonly<Record<string, string>>;
  initialState: TemerosaRunState | null;
  onPersist(previous: TemerosaRunState, next: TemerosaRunState, action: TemerosaAction): Promise<void>;
  onExit(): void;
}

export function TemerosaMarginScreen({ assets, initialState, onPersist, onExit }: TemerosaMarginScreenProps) {
  const [state, setState] = useState(() => initialState ?? createTemerosaRun(temerosaStoryContent, dailySeed()));
  const stateRef = useRef(state);
  const [observationOpen, setObservationOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const view = selectTemerosaView(temerosaStoryContent, state);

  useEffect(() => { setObservationOpen(false); }, [state.nodeId, state.lineIndex]);

  function dispatch(action: TemerosaAction) {
    const previous = stateRef.current;
    const next = reduceTemerosaRun(temerosaStoryContent, previous, action);
    stateRef.current = next;
    setState(next);
    setSaveState("saving");
    void onPersist(previous, next, action).then(() => setSaveState("saved")).catch(() => setSaveState("error"));
  }

  const background = assets["pequod-ruins"];
  const line = view.kind === "dialogue" ? view.line : null;
  const portrait = line?.assetId ? assets[line.assetId] : null;
  const showResourceDelta = Boolean(line?.id.endsWith("-result"));

  return (
    <main className="temerosa-game" style={background ? { "--temerosa-background": `url(${JSON.stringify(background)})` } as React.CSSProperties : undefined}>
      <header className="temerosa-game-header">
        <button className="temerosa-icon-button" onClick={onExit} aria-label="오락실로 돌아가기"><IconArrowLeft /></button>
        <div className="temerosa-game-title">
          <span>TEMEROSA · THE MARGIN</span>
          <h1>테메로세: 여백</h1>
        </div>
        <div className="temerosa-chapter-status">
          <span>장면 {view.scene} / 2</span>
          <small aria-live="polite">{saveState === "saving" ? "저장 중…" : saveState === "error" ? "저장 재시도 필요" : "자동 저장됨"}</small>
        </div>
      </header>

      <div className="temerosa-progress" aria-label={`파일럿 진행도 ${Math.round(view.progress * 100)}%`}><i style={{ width: `${Math.max(3, view.progress * 100)}%` }} /></div>

      {view.kind === "dialogue" && (
        <section className={`temerosa-vn-stage frame-${view.line.frame}`} aria-label={view.title}>
          <div className="temerosa-location"><IconRoute size={16} /><span>{view.scene === 0 ? "피쿼드 폐허 · 보급 통로" : view.scene === 1 ? "피쿼드 폐허 · 마지막 인사부" : "피쿼드 폐허 · 폐쇄 항로 입구"}</span></div>
          {portrait && view.line.frame === "communication" && (
            <div className="temerosa-communication-frame">
              <span>REMOTE CHANNEL · EVENT HORIZON</span>
              <img src={portrait} alt={`${view.line.speakerName}의 현재 모습`} decoding="async" fetchPriority="high" />
              <i aria-hidden="true" />
            </div>
          )}
          {portrait && view.line.frame === "stage" && (
            <div className="temerosa-stage-portrait">
              <img src={portrait} alt={`${view.line.speakerName}의 표정`} decoding="async" fetchPriority="high" />
            </div>
          )}
          <div className={`temerosa-dialogue-box ${view.line.speakerId === "system" ? "system" : ""}`}>
            <div className="temerosa-dialogue-meta"><span>{view.line.speakerName}</span><small>{view.title}</small></div>
            <p>{view.line.text}</p>
            {showResourceDelta && (
              <dl className="temerosa-resource-delta" aria-label="첫 선택의 결과">
                <div><dt>지켜낸 것</dt><dd>{resourceName(state.memory.preservedResourceId)}</dd></div>
                <div><dt>잃은 것</dt><dd>{resourceName(state.memory.lostResourceId)}</dd></div>
              </dl>
            )}
            <div className="temerosa-dialogue-actions">
              {view.line.observationFact ? <button className={observationOpen ? "active" : ""} onClick={() => setObservationOpen((open) => !open)}><IconEye size={17} /> 관찰</button> : <span />}
              <button className="temerosa-next" onClick={() => dispatch({ type: "advance" })}>계속 <IconChevronRight size={19} /></button>
            </div>
            {observationOpen && view.line.observationFact && <aside className="temerosa-observation"><IconEye size={16} /><span>{view.line.observationFact}</span></aside>}
          </div>
        </section>
      )}

      {view.kind === "choice" && (
        <section className="temerosa-choice-screen">
          <div className="temerosa-choice-heading"><span>SCENE {view.scene}</span><h2>{view.title}</h2><p>{view.prompt}</p></div>
          <div className="temerosa-choice-list">
            {view.options.map((choice, index) => (
              <button key={choice.id} onClick={() => dispatch({ type: "choose", choiceId: choice.id })}>
                <b>{String(index + 1).padStart(2, "0")}</b><span><strong>{choice.label}</strong><small>{choice.detail}</small></span><IconChevronRight />
              </button>
            ))}
          </div>
        </section>
      )}

      {view.kind === "companions" && (
        <section className="temerosa-companion-screen">
          <div className="temerosa-choice-heading"><span>PARTY CONTRACT</span><h2>함께 갈 두 사람</h2><p>능력보다 동행 조건과 거부권을 먼저 읽으십시오. 선택하지 않은 사람도 귀환을 지원합니다.</p></div>
          <div className="temerosa-companion-grid">
            {view.companions.map((companion) => <CompanionCard key={companion.id} companion={companion} src={assets[companion.assetId]} selected={view.selected.includes(companion.id)} onToggle={() => dispatch({ type: "toggle_companion", companionId: companion.id })} />)}
          </div>
          <div className="temerosa-party-confirm"><span><IconUsers /> <b>{view.selected.length}</b> / 2명 선택</span><button disabled={!view.canConfirm} onClick={() => dispatch({ type: "confirm_companions" })}>동행 조건 확인 <IconChevronRight /></button></div>
        </section>
      )}

      {view.kind === "complete" && (
        <section className="temerosa-pilot-complete">
          <span className="temerosa-complete-mark"><IconCheck /></span>
          <p className="eyebrow">D1 · SCENE 0—2 COMPLETE</p>
          <h2>임시 항해사의 첫 편성이 끝났습니다.</h2>
          <p>강해서 받은 직책이 아닙니다. 죽은 계약을 깨웠고, 잃을 것을 알고도 두 사람의 조건을 직접 받아들였기 때문에 항로가 열렸습니다.</p>
          <div className="temerosa-selected-party">
            {view.companions.map((companion) => <article key={companion.id}><img src={assets[companion.assetId]} alt={companion.name} /><strong>{companion.name}</strong><small>{companion.condition}</small></article>)}
          </div>
          <dl className="temerosa-memory-summary">
            <div><dt>등록 기록</dt><dd>{registrationName(view.memory.registrationChoiceId)}</dd></div>
            <div><dt>보존한 것</dt><dd>{resourceName(view.memory.preservedResourceId)}</dd></div>
            <div><dt>잃은 것</dt><dd>{resourceName(view.memory.lostResourceId)}</dd></div>
            <div><dt>현재 직책</dt><dd>피쿼드 임시 항해사</dd></div>
          </dl>
          <div className="temerosa-complete-actions"><button onClick={() => dispatch({ type: "restart" })}><IconRefresh /> 다른 선택으로 다시 보기</button><button className="primary" onClick={onExit}><IconBook2 /> 오락실로 돌아가기</button></div>
        </section>
      )}
    </main>
  );
}

function CompanionCard({ companion, src, selected, onToggle }: { companion: { id: CompanionId; name: string; summary: string; condition: string; refusal: string }; src: string | undefined; selected: boolean; onToggle(): void }) {
  return <button className={`temerosa-companion-card ${selected ? "selected" : ""}`} onClick={onToggle} aria-pressed={selected}>
    <div>{src && <img src={src} alt="" decoding="async" />}<span>{selected ? <IconCheck /> : "선택"}</span></div>
    <h3>{companion.name}</h3><p>{companion.summary}</p>
    <dl><div><dt>동행 조건</dt><dd>{companion.condition}</dd></div><div><dt>거부권</dt><dd>{companion.refusal}</dd></div></dl>
  </button>;
}

function dailySeed(): string { return new Date().toISOString().slice(0, 10); }
function resourceName(value: string | null): string {
  return ({ "living-signal-segment": "구조 신호의 생체 구간", "old-transmission-fragment": "오래된 발신 기록 한 조각", "at272-transmission-record": "A.T.272 발신 기록", "reserve-power-cell": "예비 전력 한 칸", "return-coordinate-power": "귀환 좌표용 전력", "first-eight-seconds": "구조 신호의 첫 8초", "two-way-rescue-channel": "양방향 구조 채널", "locked-cache-power": "잠긴 보급함 전력" } as Record<string, string>)[value ?? ""] ?? "—";
}

function registrationName(value: TemerosaRunState["memory"]["registrationChoiceId"]): string {
  const labels: Record<NonNullable<TemerosaRunState["memory"]["registrationChoiceId"]>, string> = {
    "register-sign": "직접 서명",
    "register-terms": "조건 확인",
    "register-people": "생존자 확인",
  };
  return labels[value ?? "register-sign"];
}

export default TemerosaMarginScreen;
