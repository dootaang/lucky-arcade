import { RestorationScreen } from "@lucky-arcade/restoration-crew/react";
import { generateRestorationDeck } from "@lucky-arcade/extract";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CabinetViewProps } from "../../cabinets/registry.tsx";
import { CardAssetService } from "../../lib/asset-service.ts";
import { loadCardSource } from "../../lib/database.ts";

export default function RestorationView({ analyzed, onExit }: CabinetViewProps) {
  const cartridge = analyzed.contract === "analyzed-card/0.2" ? analyzed.favoriteCup : null;
  const [service,setService]=useState<CardAssetService|null>(null),[attempt,setAttempt]=useState(0);
  const seed = `${new Date().toISOString().slice(0,10)}:${attempt}`;
  const deck = useMemo(()=>cartridge?generateRestorationDeck(cartridge,seed):null,[cartridge,seed]);
  useEffect(()=>{if(!cartridge)return; let current:CardAssetService|null=null,alive=true; void loadCardSource(cartridge.cardFingerprint).then((file)=>{if(file&&alive){current=new CardAssetService(file);setService(current)}}); return()=>{alive=false;current?.dispose()}},[cartridge]);
  const loadAsset=useCallback((id:string)=>service?service.thumbnailUrl(id,512):Promise.reject(new Error("asset_service_not_ready")),[service]);
  if(!deck||deck.problems.length<3)return <main className="game-shell"><div className="game-loading">확실한 복구 문제를 만들 재료가 부족합니다.<button onClick={onExit}>돌아가기</button></div></main>;
  if(!service)return <main className="game-shell"><div className="game-loading">복구 도구를 준비하고 있어요…</div></main>;
  return <RestorationScreen deck={deck} loadAsset={loadAsset} onExit={onExit} onRetry={()=>setAttempt((value)=>value+1)}/>;
}
