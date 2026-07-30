import { SpriteMemoryScreen } from "@lucky-arcade/sprite-memory/react";
import { useEffect, useState } from "react";
import { loadTemerosaContentBundle, type TemerosaContentBundle } from "../../lib/built-in-content.ts";

export default function TemerosaEchoMemoryView({ onExit }: { onExit(): void }) {
  const [bundle, setBundle] = useState<TemerosaContentBundle | null>(null), [error, setError] = useState(false);
  useEffect(() => { let alive = true; void loadTemerosaContentBundle().then((value) => { if (alive) setBundle(value); }).catch(() => { if (alive) setError(true); }); return () => { alive = false; }; }, []);
  if (error) return <main className="game-shell"><div className="game-loading">테메로세 인물팩을 불러오지 못했습니다.<button onClick={onExit}>돌아가기</button></div></main>;
  if (!bundle) return <main className="game-shell"><div className="game-loading">잔향 순서를 준비하고 있어요…</div></main>;
  return <SpriteMemoryScreen title="잔향 기억" pack={bundle.arcade} onExit={onExit} />;
}
