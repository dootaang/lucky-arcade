import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import { openAssetResolver, parseCardSource } from "@lucky-arcade/card-io";
import { bundledPack } from "@lucky-arcade/gfl-ember";

const EXPRESSIONS = ["default","natural","serious","motivated","angry","worry","exhausted","joy","defeat"] as const;
type AssetRecord = { id:string; path:string; bytes:number; mime:string };

async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.card||!args.out||!args.modules.length)throw new Error("usage: --card <png> --module <charx>... --out <directory>");
  const parsed=await parseCardSource(await NodeFileSource.open(args.card));
  if(!/소녀전선|girls.?frontline/i.test(JSON.stringify(parsed.card)))throw new Error("gfl_card_expected");
  const output=resolve(args.out); await rm(output,{recursive:true,force:true}); await mkdir(`${output}/portraits`,{recursive:true});
  const wanted=new Map<string,{id:string;dollId:string;emotion:string}>();
  for(const doll of [...bundledPack.dolls,bundledPack.boss])for(const emotion of EXPRESSIONS){
    const name=emotion==="default"?doll.asset:`${doll.asset}_${emotion}`;
    wanted.set(name,{id:`portrait:${doll.id}:${emotion}`,dollId:doll.id,emotion});
  }
  const records:AssetRecord[]=[],assets:Record<string,string>={};
  for(const modulePath of args.modules){
    const source=await NodeFileSource.open(modulePath),resolver=await openAssetResolver(source);
    try{
      for(const asset of resolver.assets){
        const target=wanted.get(asset.name); if(!target||assets[target.id])continue;
        const resolvedAsset=await resolver.read(asset.id),extension=resolvedAsset.mime==="image/webp"?"webp":resolvedAsset.mime==="image/png"?"png":"jpg";
        const relative=`portraits/${target.dollId}/${target.emotion}.${extension}`; await mkdir(`${output}/portraits/${target.dollId}`,{recursive:true});
        await writeFile(`${output}/${relative}`,resolvedAsset.bytes);
        assets[target.id]=`/content/gfl-ember/${bundledPack.version}/${relative}`; records.push({id:target.id,path:relative,bytes:resolvedAsset.bytes.byteLength,mime:resolvedAsset.mime});
      }
    } finally {resolver.dispose();}
  }
  const missing=[...wanted.values()].filter((entry)=>!assets[entry.id]).map((entry)=>entry.id);
  if(missing.length)throw new Error(`selected_assets_missing:${missing.join(",")}`);
  const manifest={contract:"gfl-content-manifest/0.1",packId:"gfl-ember",version:bundledPack.version,assets,files:records.sort((a,b)=>a.id.localeCompare(b.id)),totalBytes:records.reduce((sum,item)=>sum+item.bytes,0)};
  await writeFile(`${output}/manifest.json`,`${JSON.stringify(manifest,null,2)}\n`,`utf8`);
  console.log(JSON.stringify({output,files:records.length,totalBytes:manifest.totalBytes},null,2));
}
function parseArgs(values:string[]){const output={card:"",out:"",modules:[] as string[]};for(let index=0;index<values.length;index++){const key=values[index],value=values[index+1];if(!value)continue;if(key==="--card"){output.card=value;index++;}else if(key==="--out"){output.out=value;index++;}else if(key==="--module"){output.modules.push(value);index++;}}return output;}
void main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
