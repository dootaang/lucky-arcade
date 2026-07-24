import { IconArrowLeft, IconBrain, IconPlayerPlay, IconRefresh } from "@tabler/icons-react";
import type { BuiltInCharacter, BuiltInContentPack } from "@lucky-arcade/contracts";
import { Button } from "@lucky-arcade/ui";
import { useEffect, useMemo, useState } from "react";
import { createSpriteMemoryState, reduceSpriteMemory } from "../index.ts";

export interface SpriteMemoryScreenProps { pack: BuiltInContentPack; onExit(): void; }

export function SpriteMemoryScreen({ pack, onExit }: SpriteMemoryScreenProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [attempt, setAttempt] = useState(0);
  const initial = useMemo(() => createSpriteMemoryState(pack, `${today}:${attempt}`), [attempt, pack, today]);
  const [state, setState] = useState(initial), [previewIndex, setPreviewIndex] = useState(0);
  useEffect(() => { setState(initial); setPreviewIndex(0); }, [initial]);
  useEffect(() => {
    if (state.status !== "preview") return;
    setPreviewIndex(0);
    const timer = window.setInterval(() => setPreviewIndex((current) => {
      if (current + 1 < state.sequence.length) return current + 1;
      window.clearInterval(timer);
      window.setTimeout(() => setState((value) => reduceSpriteMemory(value, { type: "preview_complete" })), 280);
      return current;
    }), 650);
    return () => window.clearInterval(timer);
  }, [state.round, state.sequence, state.status]);
  const byId = new Map(pack.characters.map((character) => [character.id, character]));
  const preview = state.status === "preview" ? byId.get(state.sequence[previewIndex] ?? "") : null;
  const retry = () => setAttempt((value) => value + 1);
  return <main className="game-shell sprite-memory-shell">
    <header className="game-header"><button className="icon-button" onClick={onExit} aria-label="오락실로 돌아가기"><IconArrowLeft /></button><div><span>QUICK CABINET · {pack.title}</span><h1>작전 암호 기억</h1></div><div className="game-meters"><span>{state.round}/5 라운드</span><span>{state.score}점</span></div></header>
    <section className="memory-stage">
      {state.status === "ready" && <><IconBrain size={64} /><h2>나타나는 인물의 순서를 기억하세요</h2><p>2명부터 시작해 마지막에는 6명을 기억합니다.</p><Button onClick={() => setState((value) => reduceSpriteMemory(value, { type: "start" }))}><IconPlayerPlay size={18} /> 시작</Button></>}
      {state.status === "preview" && preview && <><span className="memory-callout">순서 {previewIndex + 1} / {state.sequence.length}</span><MemoryPortrait character={preview} expression={expressionAt(preview, previewIndex)} /><h2>{preview.name}</h2></>}
      {state.status === "input" && <><span className="memory-callout">{state.inputIndex + 1}번째 인물은?</span><div className="memory-grid">{state.roster.map((id) => { const character = byId.get(id); return character ? <button key={id} onClick={() => setState((value) => reduceSpriteMemory(value, { type: "choose", characterId: id }))}><MemoryPortrait character={character} expression="natural" /><strong>{character.name}</strong></button> : null; })}</div></>}
      {state.status === "won" && <><IconBrain size={64} /><span className="eyebrow">기억 동기화 완료</span><h2>{state.score}점</h2><p>5개 작전 암호를 모두 정확히 복원했습니다.</p><div className="result-actions"><Button onClick={retry}><IconRefresh size={18} /> 새 순서</Button><Button onClick={onExit}>다른 게임</Button></div></>}
      {state.status === "lost" && <><span className="memory-fail">!</span><h2>순서가 어긋났습니다</h2><p>{state.round}라운드 · {state.inputIndex}개까지 기억했습니다.</p><div className="result-actions"><Button onClick={retry}><IconRefresh size={18} /> 다시 도전</Button><Button onClick={onExit}>다른 게임</Button></div></>}
    </section>
  </main>;
}

function MemoryPortrait({ character, expression }: { character: BuiltInCharacter; expression: string }) {
  const source = character.assets[expression] ?? character.assets.natural ?? Object.values(character.assets)[0];
  return <div className="memory-portrait">{source ? <img src={source} alt={character.name} decoding="async" /> : <span>{character.name}</span>}</div>;
}

function expressionAt(character: BuiltInCharacter, index: number): string {
  const expressions = Object.keys(character.assets).filter((key) => key !== "default");
  return expressions[index % expressions.length] ?? "natural";
}
