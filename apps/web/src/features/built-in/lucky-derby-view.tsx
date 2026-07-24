import { DerbyBakeoffScreen } from "@lucky-arcade/lucky-derby/react";
import { useEffect, useState } from "react";
import { loadGflContentBundle } from "../../lib/built-in-content.ts";

export default function LuckyDerbyView({ onExit }: { onExit(): void }) {
  const [assets, setAssets] = useState<Readonly<Record<string, string>> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { let alive = true; void loadGflContentBundle().then((bundle) => { if (alive) setAssets(bundle.game.assets); }).catch(() => { if (alive) setError(true); }); return () => { alive = false; }; }, []);
  if (error) return <main className="game-shell"><div className="game-loading">경주용 캐릭터 그림을 불러오지 못했습니다.<button onClick={onExit}>돌아가기</button></div></main>;
  if (!assets) return <main className="game-shell"><div className="game-loading">럭키★더비 출전 명단을 준비하고 있습니다…</div></main>;
  return <DerbyBakeoffScreen assets={assets} onExit={onExit} />;
}
