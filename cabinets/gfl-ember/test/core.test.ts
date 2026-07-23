import { describe,expect,it } from "vitest";
import { bundledPack,createGflRun,reduceGflRun,replayGflRun,RECOMMENDED_FORMATIONS } from "../src/index.ts";

function winningActions(seed:string){
  let state=createGflRun(bundledPack,seed,"test-session");
  const actions:any[]=[{type:"set_formation",dollIds:[...RECOMMENDED_FORMATIONS.firepower]}]; state=reduceGflRun(bundledPack,state,actions[0]);
  while(state.phase!=="finished"){
    if(state.phase==="route"){const node=state.route[state.depth]![0]!;actions.push({type:"choose_node",nodeId:node.id});}
    else if(state.phase==="battle-ready")actions.push({type:"resolve_battle"});
    else if(state.phase==="battle-report")actions.push({type:"acknowledge_battle"});
    else if(state.phase==="reward")actions.push({type:"choose_reward",rewardId:state.rewards[0]!.id});
    else break;
    state=reduceGflRun(bundledPack,state,actions.at(-1));
  }
  return {state,actions};
}
describe("gfl ember core",()=>{
  it("builds a seven-depth route and requires six unique dolls",()=>{const state=createGflRun(bundledPack,"route");expect(state.route).toHaveLength(7);expect(()=>reduceGflRun(bundledPack,state,{type:"set_formation",dollIds:["m4a1"]})).toThrow("formation_invalid");});
  it("replays the same actions into the same deterministic result",()=>{const {state,actions}=winningActions("deterministic");const replay=replayGflRun(bundledPack,createGflRun(bundledPack,"deterministic","test-session"),actions);expect(replay).toEqual(state);});
  it("records a result hash before presentation",()=>{let state=createGflRun(bundledPack,"receipt");state=reduceGflRun(bundledPack,state,{type:"set_formation",dollIds:[...RECOMMENDED_FORMATIONS.balanced]});const node=state.route[0]!.find((entry)=>["battle","elite","boss"].includes(entry.type));if(!node)return;state=reduceGflRun(bundledPack,state,{type:"choose_node",nodeId:node.id});state=reduceGflRun(bundledPack,state,{type:"resolve_battle"});expect(state.transcript?.resultHash).toMatch(/^[a-f0-9]{64}$/);});
  it("keeps the standard safe-route policy winnable across 100 fixed seeds",()=>{let wins=0;for(let seed=0;seed<100;seed++){let state=createGflRun(bundledPack,`balance-${seed}`,"balance");state=reduceGflRun(bundledPack,state,{type:"set_formation",dollIds:[...RECOMMENDED_FORMATIONS.balanced]});while(state.phase!=="finished"){if(state.phase==="route"){const node=state.route[state.depth]!.find((entry)=>!["battle","elite"].includes(entry.type))??state.route[state.depth]![0]!;state=reduceGflRun(bundledPack,state,{type:"choose_node",nodeId:node.id});}else if(state.phase==="battle-ready")state=reduceGflRun(bundledPack,state,{type:"resolve_battle"});else if(state.phase==="battle-report")state=reduceGflRun(bundledPack,state,{type:"acknowledge_battle"});else if(state.phase==="reward"){const reward=state.rewards.find((entry)=>entry.kind==="repair")??state.rewards[0]!;state=reduceGflRun(bundledPack,state,{type:"choose_reward",rewardId:reward.id});}}if(state.outcome==="victory")wins++;}expect(wins).toBeGreaterThanOrEqual(75);expect(wins).toBeLessThanOrEqual(100);});
});
