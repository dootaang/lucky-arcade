import { FavoriteCupScreen } from "@lucky-arcade/favorite-cup/react";
import { useCallback, useEffect, useState } from "react";
import { builtInAsset, loadTemerosaContentBundle, toFavoriteCupCartridge, type TemerosaContentBundle } from "../../lib/built-in-content.ts";

export default function TemerosaFavoriteCupView({ onExit }: { onExit(): void }) {
  const [bundle, setBundle] = useState<TemerosaContentBundle | null>(null), [error, setError] = useState(false);
  useEffect(() => { let alive = true; void loadTemerosaContentBundle().then((value) => { if (alive) setBundle(value); }).catch(() => { if (alive) setError(true); }); return () => { alive = false; }; }, []);
  const loadAsset = useCallback((assetId: string) => bundle ? Promise.resolve(builtInAsset(bundle.arcade, assetId)) : Promise.reject(new Error("content_not_ready")), [bundle]);
  if (error) return <main className="game-shell"><div className="game-loading">테메로세 인물팩을 불러오지 못했습니다.<button onClick={onExit}>돌아가기</button></div></main>;
  if (!bundle) return <main className="game-shell"><div className="game-loading">테메로세 월드컵 대진을 준비하고 있어요…</div></main>;
  const cartridge = toFavoriteCupCartridge(bundle.arcade);
  return <FavoriteCupScreen title="테메로세 최애 월드컵" cartridge={cartridge} candidates={cartridge.candidates} loadAsset={loadAsset} onExit={onExit} />;
}
