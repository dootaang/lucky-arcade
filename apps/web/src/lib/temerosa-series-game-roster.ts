import { TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES, type NpcGamblingProfile } from "@lucky-arcade/casino-ledger";
import { resolveTemerosaSeriesNpcPortrait } from "./temerosa-content.ts";

export interface SeriesGameNpcPresentation {
  readonly id:string;
  readonly name:string;
  readonly profile:NpcGamblingProfile;
  readonly assetIds:Readonly<{neutral:string;pleased:string;tense:string;despair:string}>;
  readonly assets:Readonly<Record<string,string>>;
}

let rosterPromise:Promise<readonly SeriesGameNpcPresentation[]>|null=null;

/** The 1.3 ledger roster is the single participation roster for every public table. */
export function loadTemerosaSeriesGameRoster(fallbackUrl:string):Promise<readonly SeriesGameNpcPresentation[]>{
  rosterPromise??=Promise.all(TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES.map(async(profile)=>{
    const prefix=`series-game:${profile.id}`;
    const neutral=await resolveTemerosaSeriesNpcPortrait(profile.id,{emotion:"neutral"})??fallbackUrl;
    const pleased=await resolveTemerosaSeriesNpcPortrait(profile.id,{emotion:"pleased"})??neutral;
    const tense=await resolveTemerosaSeriesNpcPortrait(profile.id,{emotion:"tense"})??neutral;
    const despair=await resolveTemerosaSeriesNpcPortrait(profile.id,{emotion:"despair"})??tense;
    const assetIds=Object.freeze({neutral:`${prefix}:neutral`,pleased:`${prefix}:pleased`,tense:`${prefix}:tense`,despair:`${prefix}:despair`});
    return Object.freeze({id:profile.id,name:profile.name,profile,assetIds,assets:Object.freeze({
      [assetIds.neutral]:neutral,[assetIds.pleased]:pleased,[assetIds.tense]:tense,[assetIds.despair]:despair,
    })});
  })).then((items)=>Object.freeze(items));
  return rosterPromise;
}

export function seriesGameAssetMap(items:readonly SeriesGameNpcPresentation[]):Readonly<Record<string,string>>{
  return Object.freeze(Object.assign({},...items.map((item)=>item.assets)) as Record<string,string>);
}

export function unit(value:number):number{return Math.max(0,Math.min(1,value));}
