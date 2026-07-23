import { FavoriteCupScreen } from "@lucky-arcade/favorite-cup/react";
import { favoriteCupEligibility } from "@lucky-arcade/extract";
import { useCallback, useEffect, useState } from "react";
import type { CabinetViewProps } from "../../cabinets/registry.tsx";
import { CardAssetService } from "../../lib/asset-service.ts";
import { loadCardSource } from "../../lib/database.ts";

export default function FavoriteCupView({ analyzed, onExit }: CabinetViewProps) {
  const [service, setService] = useState<CardAssetService | null>(null), [error, setError] = useState<string | null>(null);
  const cartridge = analyzed.contract === "analyzed-card/0.2" ? analyzed.favoriteCup : null;
  const eligible = cartridge ? favoriteCupEligibility(cartridge) : null;
  useEffect(() => {
    if (!cartridge) return;
    let current: CardAssetService | null = null, alive = true;
    void loadCardSource(cartridge.cardFingerprint).then((file) => {
      if (!alive) return;
      if (!file) { setError("원본 카드 파일을 찾지 못했습니다. 카드를 다시 넣어 주세요."); return; }
      current = new CardAssetService(file); setService(current);
    });
    return () => { alive = false; current?.dispose(); };
  }, [cartridge]);
  const loadAsset = useCallback((assetId: string) => {
    if (!service) return Promise.reject(new Error("asset_service_not_ready"));
    return service.thumbnailUrl(assetId, 512);
  }, [service]);
  if (!cartridge || !eligible || eligible.value.length < 8) return <main className="game-shell"><div className="game-loading">이 카드에는 월드컵에 필요한 인물이 부족합니다.<button onClick={onExit}>돌아가기</button></div></main>;
  if (error) return <main className="game-shell"><div className="game-loading">{error}<button onClick={onExit}>돌아가기</button></div></main>;
  if (!service) return <main className="game-shell"><div className="game-loading">초상화 보관함을 준비하고 있어요…</div></main>;
  return <FavoriteCupScreen cartridge={cartridge} candidates={eligible.value} loadAsset={loadAsset} onExit={onExit} />;
}
