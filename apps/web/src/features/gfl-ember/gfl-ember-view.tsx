import { GflEmberScreen } from "@lucky-arcade/gfl-ember/react";
import { createGflRun,type GflAction,type GflContentPack,type GflRunState } from "@lucky-arcade/gfl-ember";
import { makeReceipt,resultHash } from "@lucky-arcade/engine";
import { useEffect,useState } from "react";
import { appendAction,loadSnapshot,saveSnapshot } from "../../lib/database.ts";
import { loadGflContentBundle } from "../../lib/built-in-content.ts";

const SESSION="gfl-ember:current";
export default function GflEmberView({onExit}:{onExit():void}){
  const [ready,setReady]=useState<{pack:GflContentPack;state:GflRunState|null}|null>(null),[error,setError]=useState<string|null>(null);
  useEffect(()=>{let alive=true;void Promise.all([loadGflContentBundle(),loadSnapshot<GflRunState>(SESSION)]).then(([bundle,snapshot])=>{if(!alive)return;const pack=bundle.game;const state=snapshot?.state?.version===createGflRun(pack,"probe").version&&snapshot.packVersion===pack.version?snapshot.state:null;setReady({pack,state});}).catch(()=>{if(alive)setError("내장 콘텐츠팩을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");});return()=>{alive=false}},[]);
  const persist=async(previous:GflRunState,next:GflRunState,action:GflAction)=>{const receipt=makeReceipt(next.sequence,action,next.sequence,resultHash(previous),next);await appendAction(SESSION,receipt);await saveSnapshot({contract:"snapshot-record/0.1",sessionId:SESSION,sequence:next.sequence,state:next,stateHash:receipt.resultHash,engineVersion:"arcade-engine/0.1",cabinetVersion:next.version,packVersion:next.packVersion},{contract:"recent-play/0.1",cabinetId:"gfl-ember",sessionId:SESSION,title:"소녀전선: 잔불 작전",progressLabel:progressLabel(next),updatedAt:new Date().toISOString()});};
  if(error)return <main className="game-shell"><div className="game-loading">{error}<button onClick={onExit}>돌아가기</button></div></main>;
  if(!ready)return <main className="game-shell"><div className="game-loading">잔불 작전 콘텐츠를 준비하고 있습니다…</div></main>;
  return <GflEmberScreen pack={ready.pack} initialState={ready.state} onPersist={persist} onExit={onExit}/>;
}

function progressLabel(state:GflRunState):string{if(state.phase==="formation")return "제대 편성";if(state.phase==="finished")return state.outcome==="victory"?"작전 완료":"작전 종료";return `${Math.min(state.depth+1,7)}/7 구간 · ${state.phase==="route"?"경로 선택":state.phase==="reward"?"보상 선택":state.phase==="battle-report"?"전투 보고":"교전 준비"}`;}
