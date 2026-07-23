import { GflEmberScreen } from "@lucky-arcade/gfl-ember/react";
import { bundledPack,contentPackSchema,createGflRun,type GflAction,type GflRunState } from "@lucky-arcade/gfl-ember";
import { makeReceipt,resultHash } from "@lucky-arcade/engine";
import { useEffect,useState } from "react";
import { appendAction,loadSnapshot,saveSnapshot } from "../../lib/database.ts";

interface Manifest{contract:"gfl-content-manifest/0.1";version:string;assets:Record<string,string>}
const SESSION="gfl-ember:current";
export default function GflEmberView({onExit}:{onExit():void}){
  const [ready,setReady]=useState<{pack:typeof bundledPack;state:GflRunState|null}|null>(null),[error,setError]=useState<string|null>(null);
  useEffect(()=>{let alive=true;void Promise.all([fetch(`/content/gfl-ember/${bundledPack.version}/manifest.json`).then((response)=>{if(!response.ok)throw new Error("content_manifest_missing");return response.json() as Promise<Manifest>;}),loadSnapshot<GflRunState>(SESSION)]).then(([manifest,snapshot])=>{if(!alive)return;const pack=contentPackSchema.parse({...bundledPack,assets:manifest.assets});const state=snapshot?.state?.version===createGflRun(pack,"probe").version&&snapshot.packVersion===pack.version?snapshot.state:null;setReady({pack,state});}).catch(()=>{if(alive)setError("내장 콘텐츠팩을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");});return()=>{alive=false}},[]);
  const persist=async(previous:GflRunState,next:GflRunState,action:GflAction)=>{const receipt=makeReceipt(next.sequence,action,next.sequence,resultHash(previous),next);await appendAction(SESSION,receipt);await saveSnapshot({contract:"snapshot-record/0.1",sessionId:SESSION,sequence:next.sequence,state:next,stateHash:receipt.resultHash,engineVersion:"arcade-engine/0.1",cabinetVersion:next.version,packVersion:next.packVersion});};
  if(error)return <main className="game-shell"><div className="game-loading">{error}<button onClick={onExit}>돌아가기</button></div></main>;
  if(!ready)return <main className="game-shell"><div className="game-loading">잔불 작전 콘텐츠를 준비하고 있습니다…</div></main>;
  return <GflEmberScreen pack={ready.pack} initialState={ready.state} onPersist={persist} onExit={onExit}/>;
}
