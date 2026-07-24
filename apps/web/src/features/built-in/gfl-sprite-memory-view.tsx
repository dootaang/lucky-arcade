import { SpriteMemoryScreen } from "@lucky-arcade/sprite-memory/react";
import { useEffect, useState } from "react";
import { loadGflContentBundle, type GflContentBundle } from "../../lib/built-in-content.ts";

export default function GflSpriteMemoryView({ onExit }: { onExit(): void }) {
  const [bundle, setBundle] = useState<GflContentBundle | null>(null), [error, setError] = useState(false);
  useEffect(() => { let alive = true; void loadGflContentBundle().then((value) => { if (alive) setBundle(value); }).catch(() => { if (alive) setError(true); }); return () => { alive = false; }; }, []);
  if (error) return <main className="game-shell"><div className="game-loading">내장 인물팩을 불러오지 못했습니다.<button onClick={onExit}>돌아가기</button></div></main>;
  if (!bundle) return <main className="game-shell"><div className="game-loading">기억 훈련을 준비하고 있어요…</div></main>;
  return <SpriteMemoryScreen pack={bundle.arcade} onExit={onExit} />;
}
