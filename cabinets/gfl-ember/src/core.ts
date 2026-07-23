import { resultHash, XorShift32 } from "@lucky-arcade/engine";
import type { BattleTranscript, CombatExchange, GflAction, GflContentPack, GflRunState, Intervention, RewardOption, RouteNode, RouteNodeType, Tactic, UnitState } from "./contracts.ts";
import { GFL_EMBER_VERSION } from "./contracts.ts";

const NODE_LABELS: Record<RouteNodeType, string> = { battle:"교전",scout:"정찰",supply:"보급",mystery:"미확인",elite:"엘리트",repair:"수복",boss:"결전" };
const CLASS_PROFILE = {
  AR:{damage:1,hit:1,taken:1,aggro:1},SMG:{damage:.82,hit:2,taken:.82,aggro:1.35},SG:{damage:.72,hit:0,taken:.62,aggro:1.65},
  MG:{damage:1.28,hit:-1,taken:1.05,aggro:.85},RF:{damage:1.22,hit:0,taken:1.08,aggro:.72},HG:{damage:.68,hit:3,taken:.95,aggro:.8},
} as const;

export const RECOMMENDED_FORMATIONS = {
  balanced:["ro635","dp-12","m4a1","ar-15","wa2000","grizzly-mkv"],
  firepower:["ro635","m4a1","ar-15","m1918","mg5","wa2000"],
  defense:["dp-12","m500","ro635","m4a1","m14","m950a"],
} as const;

export function createGflRun(pack: GflContentPack, seed: string, sessionId = `gfl-${Date.now().toString(36)}`): GflRunState {
  const roster = Object.fromEntries(pack.dolls.map((doll): [string, UnitState] => [doll.id,{id:doll.id,hp:doll.maxHp,maxHp:doll.maxHp,mp:doll.maxMp,maxMp:doll.maxMp,power:doll.power,status:"ready"}]));
  return { contract:"gfl-run-state/0.1",version:GFL_EMBER_VERSION,packVersion:pack.version,sessionId,seed,sequence:0,phase:"formation",roster,
    formation:[],route:createRoute(pack,seed),depth:0,visited:[],currentNodeId:null,tactic:"balanced",intervention:null,transcript:null,rewards:[],inventory:[],supplies:3,outcome:null };
}

export function reduceGflRun(pack: GflContentPack, state: GflRunState, action: GflAction): GflRunState {
  if (state.phase === "finished") return state;
  const sequence = state.sequence + 1;
  switch (action.type) {
    case "set_formation": {
      assert(state.phase === "formation","formation_phase_required");
      const unique = [...new Set(action.dollIds)];
      assert(unique.length === 6 && unique.every((id) => state.roster[id]),"formation_invalid");
      return { ...state,sequence,formation:unique,phase:"route" };
    }
    case "choose_node": {
      assert(state.phase === "route","route_phase_required");
      const node = state.route[state.depth]?.find((candidate) => candidate.id === action.nodeId);
      assert(node,"route_node_invalid");
      const common = { ...state,sequence,currentNodeId:node.id,visited:[...state.visited,node.id] };
      if (["battle","elite","boss"].includes(node.type)) return { ...common,phase:"battle-ready",tactic:"balanced",intervention:{type:"brace",round:3},transcript:null,rewards:[] };
      const resolved = resolveUtilityNode(pack,common,node.type);
      return { ...resolved,phase:"reward",rewards:utilityRewards(pack,resolved,node.type) };
    }
    case "choose_tactic":
      assert(state.phase === "battle-ready","battle_ready_required");
      return { ...state,sequence,tactic:action.tactic };
    case "schedule_intervention":
      assert(state.phase === "battle-ready","battle_ready_required");
      assert(action.round >= 1 && action.round <= 8,"intervention_round_invalid");
      return { ...state,sequence,intervention:{type:action.intervention,round:action.round} };
    case "resolve_battle": {
      assert(state.phase === "battle-ready","battle_ready_required");
      const node = currentNode(state);
      const transcript = resolveBattle(pack,state,node);
      const roster = { ...state.roster };
      for (const result of transcript.alliesAfter) roster[result.id] = { ...roster[result.id]!,hp:result.hp,status:result.hp <= 0 ? "disabled" : result.hp < result.maxHp ? "damaged" : "ready" };
      return { ...state,sequence,phase:"battle-report",roster,transcript };
    }
    case "acknowledge_battle": {
      assert(state.phase === "battle-report" && state.transcript,"battle_report_required");
      if (state.transcript.outcome === "defeat") return { ...state,sequence,phase:"finished",outcome:"defeat" };
      return { ...state,sequence,phase:"reward",rewards:battleRewards(pack,state) };
    }
    case "choose_reward": {
      assert(state.phase === "reward","reward_phase_required");
      const reward = state.rewards.find((candidate) => candidate.id === action.rewardId);
      assert(reward,"reward_invalid");
      const rewarded = applyReward(pack,state,reward);
      const nextDepth = state.depth + 1, finished = nextDepth >= state.route.length;
      return { ...rewarded,sequence,depth:nextDepth,currentNodeId:null,rewards:[],transcript:null,phase:finished?"finished":"route",outcome:finished?"victory":state.outcome };
    }
    case "retreat": return { ...state,sequence,phase:"finished",outcome:"retreated" };
  }
}

export function replayGflRun(pack: GflContentPack, initial: GflRunState, actions: readonly GflAction[]): GflRunState {
  return actions.reduce((state, action) => reduceGflRun(pack,state,action),initial);
}

function createRoute(pack: GflContentPack, seed: string): RouteNode[][] {
  const rng = new XorShift32(`${seed}:route`), pools: RouteNodeType[][] = [
    ["battle","scout","supply"],["battle","mystery","repair"],["battle","elite","scout"],["battle","supply","mystery"],["elite","battle","repair"],["elite","supply","battle"],["boss"],
  ];
  return pools.map((pool,depth) => {
    const count = depth === 6 ? 1 : 2, shuffled = [...pool].sort(() => (rng.next() < .5 ? -1 : 1)).slice(0,count);
    return shuffled.map((type,index): RouteNode => ({id:`n${depth}-${index}-${type}`,depth,type,label:NODE_LABELS[type],danger:Math.min(5,1+Math.floor(depth/2)+(type==="elite"?1:type==="boss"?2:0)),missionId:pack.missions[Math.min(depth,pack.missions.length-1)]!.id}));
  });
}

function resolveBattle(pack: GflContentPack, state: GflRunState, node: RouteNode): BattleTranscript {
  const mission = pack.missions.find((entry) => entry.id === node.missionId) ?? pack.missions[0]!;
  const rng = new XorShift32(`${state.seed}:battle:${node.id}`);
  const allies = state.formation.map((id,index) => {
    const definition = pack.dolls.find((doll) => doll.id === id)!, unit = state.roster[id]!;
    return {id,name:definition.name,class:definition.class,grade:definition.grade,power:unit.power,hp:unit.hp,maxHp:unit.maxHp,row:Math.floor(index/2)};
  });
  const enemyCount = node.type === "boss" ? 3 : node.type === "elite" ? 4 : 3;
    const totalPower = mission.power * (node.type === "elite"?1.18:node.type === "boss"?1.32:1);
  const enemies = Array.from({length:enemyCount},(_,index) => {
    const boss = node.type === "boss" && index === 0, power = boss ? pack.boss.power : Math.round(totalPower/(boss?2.2:enemyCount));
    const maxHp = boss ? Math.round(pack.boss.maxHp*1.5) : Math.max(650,Math.round(totalPower*3/enemyCount));
    return {id:boss?pack.boss.id:`${node.id}-enemy-${index+1}`,name:boss?pack.boss.name:`${mission.enemy} ${index+1}`,power,hp:maxHp,maxHp};
  });
  const rounds: BattleTranscript["rounds"] = [], tactic = TACTICS[state.tactic];
  for (let round=1;round<=8;round++) {
    const exchanges: CombatExchange[] = [], morale: Array<{dollId:string;success:boolean}> = [];
    for (const ally of allies.filter((unit)=>unit.hp>0)) {
      const target = enemies.filter((enemy)=>enemy.hp>0).sort((a,b)=> state.intervention?.type==="focus"&&state.intervention.round===round ? a.hp-b.hp : 0)[0];
      if (!target) break;
      const profile = CLASS_PROFILE[ally.class], roll = 1+(rng.nextUint32()%20), critical = roll===20;
      const hit = critical || roll+ally.grade+profile.hit+tactic.hit >= 8;
      const intervention = state.intervention?.round===round ? state.intervention.type : null;
      const damage = hit ? Math.max(1,Math.round(ally.power*.18*profile.damage*tactic.damage*(critical?1.6:1)*(intervention==="focus"?1.2:1)-target.power*.025)) : 0;
      target.hp=Math.max(0,target.hp-damage); exchanges.push({side:"ally",actorId:ally.id,targetId:target.id,hit,critical,damage,hpAfter:target.hp});
    }
    for (const enemy of enemies.filter((unit)=>unit.hp>0)) {
      const living=allies.filter((unit)=>unit.hp>0); if(!living.length)break;
      const weights=living.map((unit)=>Math.round(CLASS_PROFILE[unit.class].aggro*(unit.row===0?1.3:unit.row===1?1:.75)*100));
      let pick=rng.nextUint32()%weights.reduce((sum,value)=>sum+value,0),target=living[0]!; for(let i=0;i<living.length;i++){pick-=weights[i]!;if(pick<0){target=living[i]!;break;}}
      const roll=1+(rng.nextUint32()%20),critical=roll===20,hit=critical||roll+(state.intervention?.type==="barrage"&&state.intervention.round===round?-3:0)>=8;
      const brace=state.intervention?.type==="brace"&&state.intervention.round===round?.5:1;
      const damage=hit?Math.max(1,Math.round((enemy.power*.8-target.power*.012)*CLASS_PROFILE[target.class].taken*tactic.incoming*brace*(critical?1.5:1))):0;
      target.hp=Math.max(0,target.hp-damage);exchanges.push({side:"enemy",actorId:enemy.id,targetId:target.id,hit,critical,damage,hpAfter:target.hp});
    }
    for(const ally of allies.filter((unit)=>unit.hp>0&&unit.hp/unit.maxHp<.25)){const success=(1+(rng.nextUint32()%20))+Math.floor((pack.dolls.find((d)=>d.id===ally.id)?.mood??50)/20)>=8;morale.push({dollId:ally.id,success});}
    rounds.push({round,exchanges,morale}); if(!allies.some((unit)=>unit.hp>0)||!enemies.some((unit)=>unit.hp>0))break;
  }
  const draft = {battleId:`${state.sessionId}:${node.id}`,seed:`${state.seed}:battle:${node.id}`,rulesVersion:GFL_EMBER_VERSION,tactic:state.tactic,intervention:state.intervention,rounds,
    alliesAfter:allies.map(({id,hp,maxHp})=>({id,hp,maxHp})),enemiesAfter:enemies.map(({id,name,hp,maxHp})=>({id,name,hp,maxHp})),outcome:enemies.every((unit)=>unit.hp<=0)?"victory" as const:"defeat" as const};
  return {...draft,resultHash:resultHash(draft)};
}

const TACTICS: Record<Tactic,{hit:number;damage:number;incoming:number}> = {focus:{hit:2,damage:1.15,incoming:1.15},balanced:{hit:0,damage:1,incoming:1},cover:{hit:-2,damage:.86,incoming:.7}};

function currentNode(state:GflRunState):RouteNode { const node=state.route[state.depth]?.find((candidate)=>candidate.id===state.currentNodeId); assert(node,"current_node_missing"); return node; }
function resolveUtilityNode(_pack:GflContentPack,state:GflRunState,type:RouteNodeType):GflRunState {
  if(type==="repair"){const roster=Object.fromEntries(Object.entries(state.roster).map(([id,unit])=>[id,{...unit,hp:Math.min(unit.maxHp,unit.hp+Math.ceil(unit.maxHp*.25)),status:"ready" as const}]));return{...state,roster};}
  return type==="supply"?{...state,supplies:state.supplies+2}:state;
}
function utilityRewards(pack:GflContentPack,state:GflRunState,type:RouteNodeType):RewardOption[]{return type==="repair"?[{id:"field-repair",kind:"repair",label:"긴급 수복",detail:"손상이 큰 2명 추가 수복"}]:type==="supply"?[{id:"supply-box",kind:"supply",label:"보급 상자",detail:"보급품 3개 획득"}]:battleRewards(pack,state).slice(0,2);}
function battleRewards(pack:GflContentPack,state:GflRunState):RewardOption[]{const rng=new XorShift32(`${state.seed}:loot:${state.currentNodeId}`),equipment=pack.equipment[rng.nextUint32()%pack.equipment.length]!;return[
  {id:"repair",kind:"repair",label:"현장 수복",detail:"손상이 큰 2명 체력 35% 회복"},{id:"supply",kind:"supply",label:"보급 회수",detail:"보급품 2개 획득"},{id:`equipment:${equipment.id}`,kind:"equipment",label:equipment.name,detail:`전투력 +${equipment.power}`},
];}
function applyReward(_pack:GflContentPack,state:GflRunState,reward:RewardOption):GflRunState {
  if(reward.kind==="repair"){
    const roster={...state.roster},targets=state.formation.map((id)=>roster[id]!).filter(Boolean).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp).slice(0,2);
    for(const unit of targets)roster[unit.id]={...unit,hp:Math.min(unit.maxHp,unit.hp+Math.ceil(unit.maxHp*.35)),status:"ready"};
    return{...state,roster};
  }
  if(reward.kind==="supply")return{...state,supplies:state.supplies+(reward.id==="supply-box"?3:2)};
  if(reward.kind==="equipment"){const bonus=Number(reward.detail.match(/\d+/)?.[0]??0),roster={...state.roster};for(const id of state.formation)roster[id]={...roster[id]!,power:roster[id]!.power+Math.round(bonus/6)};return{...state,roster,inventory:[...state.inventory,reward.label]};}
  return state;
}
function assert(condition:unknown,code:string):asserts condition{if(!condition)throw new Error(code);}
