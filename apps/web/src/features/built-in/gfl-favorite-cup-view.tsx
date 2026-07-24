import { FavoriteCupScreen } from "@lucky-arcade/favorite-cup/react";
import { useCallback, useEffect, useState } from "react";
import { builtInAsset, loadGflContentBundle, toFavoriteCupCartridge, type GflContentBundle } from "../../lib/built-in-content.ts";

export default function GflFavoriteCupView({ onExit }: { onExit(): void }) {
  const [bundle, setBundle] = useState<GflContentBundle | null>(null), [error, setError] = useState(false);
  useEffect(() => { let alive = true; void loadGflContentBundle().then((value) => { if (alive) setBundle(value); }).catch(() => { if (alive) setError(true); }); return () => { alive = false; }; }, []);
  const loadAsset = useCallback((assetId: string) => bundle ? Promise.resolve(builtInAsset(bundle.arcade, assetId)) : Promise.reject(new Error("content_not_ready")), [bundle]);
  if (error) return <main className="game-shell"><div className="game-loading">내장 인물팩을 불러오지 못했습니다.<button onClick={onExit}>돌아가기</button></div></main>;
  if (!bundle) return <main className="game-shell"><div className="game-loading">월드컵 대진을 준비하고 있어요…</div></main>;
  const cartridge = toFavoriteCupCartridge(bundle.arcade);
  return <FavoriteCupScreen cartridge={cartridge} candidates={cartridge.candidates} loadAsset={loadAsset} onExit={onExit} />;
}
