import { standardCardById, standardRankValue, type StandardCardId } from "@lucky-arcade/card-table";
import type { FiveCardDrawGuide } from "./contracts.ts";
import { evaluatePokerHand } from "./hand.ts";
import { basicDrawDecision } from "./npc.ts";

export function analyzeFiveCardDrawGuide(hand:readonly StandardCardId[]):FiveCardDrawGuide {
  const value=evaluatePokerHand(hand),decision=basicDrawDecision(hand),discard=new Set(decision.discardCardIds),keep=hand.filter((card)=>!discard.has(card));
  const strength=value.categoryRank>=6?"매우 강함":value.categoryRank>=3?"강함":value.categoryRank>=1?"보통":"약함";
  return {
    handLabel:describedLabel(hand,value.label),strength,
    summary:summaryFor(value.category,hand),recommendation:recommendationFor(decision.reason,decision.discardCardIds.length),
    keepCardIds:keep,discardCardIds:decision.discardCardIds,
  };
}

export function exchangeCountGuide(count:number):string {
  if(count===0)return "카드를 바꾸지 않았습니다. 완성된 강한 패일 수도, 강한 척하는 허세일 수도 있습니다.";
  if(count===1)return "한 장을 교환했습니다. 투 페어·트리플을 유지했거나 스트레이트·플러시를 노리는 행동일 수 있습니다.";
  if(count===2)return "두 장을 교환했습니다. 트리플을 유지했을 가능성이 있지만 확정할 수는 없습니다.";
  return "세 장을 교환했습니다. 원 페어를 남겼을 가능성이 있지만 허세나 변칙 선택일 수도 있습니다.";
}

export function betActionGuide(action:"check"|"bet"|"call"|"raise"|"fold",amount:number):string {
  if(action==="check")return "체크 · 추가 판돈 없이 차례를 넘깁니다.";
  if(action==="call")return `콜 ${amount} P · 상대가 건 금액에 맞추고 계속합니다.`;
  if(action==="bet")return `베팅 ${amount} P · 먼저 판돈을 걸어 상대의 반응을 봅니다.`;
  if(action==="raise")return `레이즈 ${amount} P · 판돈을 더 올립니다. 상대를 압박하지만 손실도 커집니다.`;
  return "폴드 · 이번 판을 포기하고 추가 손실을 막습니다.";
}

function describedLabel(hand:readonly StandardCardId[],label:string):string {
  const counts=new Map<number,number>();for(const card of hand){const value=standardRankValue(card);counts.set(value,(counts.get(value)??0)+1);}
  const primary=[...counts].toSorted((a,b)=>b[1]-a[1]||b[0]-a[0])[0];
  if(label==="원 페어"&&primary)return `${rankName(primary[0])} 원 페어`;
  if(label==="트리플"&&primary)return `${rankName(primary[0])} 트리플`;
  return label;
}
function summaryFor(category:string,hand:readonly StandardCardId[]):string {
  if(category==="high-card")return `${rankName(Math.max(...hand.map(standardRankValue)))}가 가장 높은 카드이며 아직 완성된 족보는 없습니다.`;
  if(category==="one-pair")return "같은 숫자 두 장을 가지고 있습니다. 1대1에서는 승부할 만하지만 인원이 많을수록 위험합니다.";
  if(category==="two-pair")return "두 쌍이 완성된 강한 패입니다. 남은 한 장으로 풀 하우스를 노릴 수 있습니다.";
  if(category==="three-of-a-kind")return "같은 숫자 세 장이 완성됐습니다. 나머지 두 장으로 포카드나 풀 하우스를 노릴 수 있습니다.";
  if(category==="straight"||category==="flush")return "이미 강한 완성패입니다. 교환하지 않는 것이 기본 선택입니다.";
  return "매우 강한 완성패입니다. 그대로 승부하는 것을 권합니다.";
}
function recommendationFor(reason:string,count:number):string {
  if(reason==="stand-pat")return "카드를 교환하지 않고 그대로 승부하는 것이 기본 선택입니다.";
  if(reason==="draw-to-flush")return "같은 무늬 네 장을 유지하고 다른 무늬 한 장을 교환해 플러시를 노려보세요.";
  if(reason==="draw-to-straight")return "이어지는 숫자 네 장을 유지하고 한 장을 교환해 스트레이트를 노려보세요.";
  if(reason==="keep-pair")return "같은 숫자 두 장을 유지하고 나머지 세 장을 교환하면 트리플이나 투 페어를 노릴 수 있습니다.";
  if(reason==="keep-two-pair")return "두 쌍을 유지하고 남은 한 장을 교환하면 풀 하우스를 노릴 수 있습니다.";
  if(reason==="keep-trips")return "트리플을 유지하고 나머지 두 장을 교환하면 포카드나 풀 하우스를 노릴 수 있습니다.";
  return `${count}장을 교환하는 것이 기본 선택입니다. 일부 카드를 더 남겨 교환 장수를 속일 수도 있습니다.`;
}
function rankName(value:number):string{return value===14?"A":value===13?"K":value===12?"Q":value===11?"J":String(value);}
