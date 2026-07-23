import type { BattleTranscript } from "../../contracts.ts";

export interface ArcadeRuntimeAdapter {
  mount(host: HTMLElement): Promise<void>;
  preload(assetIds: readonly string[]): Promise<void>;
  play(transcript: BattleTranscript, options: { speed: 1|2|4 }): Promise<void>;
  pause(): void; resume(): void; destroy(): void;
}

export class LittleJsBattleAdapter implements ArcadeRuntimeAdapter {
  #canvas:HTMLCanvasElement|null=null;#context:CanvasRenderingContext2D|null=null;#images=new Map<string,HTMLImageElement>();#destroyed=false;#paused=false;#timers=new Set<number>();
  #palette={background:"#071119",ally:"#5de0b2",enemy:"#ff6f6f",text:"#e9f0f5",muted:"#83919d"};
  constructor(private readonly assets:Readonly<Record<string,string>>){ }
  async mount(host:HTMLElement){
    const little=await import("littlejsengine");
    this.#palette={background:new little.Color(.025,.065,.09).toString(),ally:new little.Color(.36,.88,.7).toString(),enemy:new little.Color(1,.43,.43).toString(),text:new little.Color(.91,.95,.97).toString(),muted:new little.Color(.51,.57,.62).toString()};
    if(this.#destroyed)return; const canvas=document.createElement("canvas");canvas.width=960;canvas.height=540;canvas.className="gfl-battle-canvas";canvas.setAttribute("aria-label","전투 재생 화면");host.replaceChildren(canvas);this.#canvas=canvas;this.#context=canvas.getContext("2d");this.#drawFrame(null,0);
  }
  async preload(assetIds:readonly string[]){await Promise.all(assetIds.map(async(id)=>{if(this.#images.has(id)||!this.assets[id])return;const image=new Image();image.decoding="async";image.src=this.assets[id]!;await image.decode().catch(()=>undefined);if(!this.#destroyed)this.#images.set(id,image);}));}
  async play(transcript:BattleTranscript,{speed}:{speed:1|2|4}){
    const events=transcript.rounds.flatMap((round)=>round.exchanges.map((exchange)=>({round:round.round,exchange})));this.#drawFrame(transcript,0);
    for(let index=0;index<events.length&&!this.#destroyed;index++){while(this.#paused&&!this.#destroyed)await this.#wait(50);if(this.#destroyed)return;this.#drawFrame(transcript,index+1);await this.#wait(Math.max(45,230/speed));}
  }
  pause(){this.#paused=true;} resume(){this.#paused=false;}
  destroy(){this.#destroyed=true;for(const timer of this.#timers)window.clearTimeout(timer);this.#timers.clear();this.#images.clear();this.#canvas?.remove();this.#canvas=null;this.#context=null;}
  #wait(ms:number){return new Promise<void>((resolve)=>{const timer=window.setTimeout(()=>{this.#timers.delete(timer);resolve();},ms);this.#timers.add(timer);});}
  #drawFrame(transcript:BattleTranscript|null,count:number){
    const context=this.#context,canvas=this.#canvas;if(!context||!canvas)return;context.fillStyle=this.#palette.background;context.fillRect(0,0,canvas.width,canvas.height);
    context.fillStyle=this.#palette.text;context.font="700 22px system-ui";context.fillText(transcript?`전투 영수증 · ${transcript.tactic.toUpperCase()}`:"작전 데이터를 준비합니다",28,38);
    if(!transcript)return;const events=transcript.rounds.flatMap((round)=>round.exchanges.map((exchange)=>({round:round.round,exchange}))),shown=events.slice(0,count),last=shown.at(-1);
    const allyIds=transcript.alliesAfter.map((unit)=>unit.id),enemyIds=transcript.enemiesAfter.map((unit)=>unit.id);
    allyIds.forEach((id,index)=>this.#drawActor(id,80+index*135,410,true,last?.exchange.targetId===id));enemyIds.forEach((id,index)=>this.#drawActor(id,170+index*220,140,false,last?.exchange.targetId===id));
    if(last){context.fillStyle=last.exchange.side==="ally"?this.#palette.ally:this.#palette.enemy;context.font="800 30px system-ui";context.textAlign="center";context.fillText(last.exchange.hit?`${last.exchange.critical?"CRITICAL · ":""}${last.exchange.damage}`:"MISS",480,275);context.textAlign="left";context.fillStyle=this.#palette.muted;context.font="600 16px system-ui";context.fillText(`ROUND ${last.round} · ${count}/${events.length}`,28,510);}
  }
  #drawActor(id:string,x:number,y:number,ally:boolean,hit:boolean){const context=this.#context;if(!context)return;const image=this.#images.get(`portrait:${id}:${hit?"angry":"natural"}`)??this.#images.get(`portrait:${id}:default`);context.save();if(hit){context.shadowColor=this.#palette.enemy;context.shadowBlur=24;}context.fillStyle=ally?this.#palette.ally:this.#palette.enemy;context.fillRect(x-46,y-108,92,128);if(image)context.drawImage(image,x-44,y-106,88,124);context.restore();context.fillStyle=this.#palette.text;context.font="700 12px system-ui";context.textAlign="center";context.fillText(id,x,y+38);context.textAlign="left";}
}
