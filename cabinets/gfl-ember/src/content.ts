import type { BuiltInContentPack } from "@lucky-arcade/contracts";
import type { GflContentPack } from "./contracts.ts";

const dolls: GflContentPack["dolls"] = [
  { id:"m4a1",name:"M4A1",class:"AR",grade:5,maxHp:1500,maxMp:1600,power:1250,mood:90,description:"AR소대의 마음 약한 리더. 동료들의 신뢰를 받으며 자신의 운명과 맞서 성장하고 있습니다.",asset:"M4A1" },
  { id:"ar-15",name:"AR-15",class:"AR",grade:4,maxHp:1600,maxMp:1500,power:1200,mood:90,description:"독립적이길 원하는 노력파이지만 동료를 향한 마음은 진심입니다.",asset:"AR-15" },
  { id:"ro635",name:"RO635",class:"SMG",grade:5,maxHp:2900,maxMp:1800,power:1000,mood:89,description:"이성적이고 고지식하며 주어진 임무를 완벽하게 수행하려 합니다.",asset:"RO635" },
  { id:"ump45",name:"UMP45",class:"SMG",grade:4,maxHp:2700,maxMp:1600,power:1000,mood:92,description:"404 소대를 이끄는 지휘관. 미소 뒤에 날카로운 계산을 숨기고 있습니다.",asset:"UMP45",squad:"404" },
  { id:"dp-12",name:"DP-12",class:"SG",grade:5,maxHp:3100,maxMp:2000,power:1100,mood:93,description:"성숙하고 포용력 있는 산탄총이자 든든한 방패입니다.",asset:"DP-12" },
  { id:"m500",name:"M500",class:"SG",grade:3,maxHp:2600,maxMp:2000,power:850,mood:85,description:"자유분방하고 명랑한 산탄총. 잘 가르쳐주면 잘 따릅니다.",asset:"M500" },
  { id:"m1918",name:"M1918",class:"MG",grade:4,maxHp:1500,maxMp:1600,power:1100,mood:90,description:"전쟁을 거치며 단련된 따뜻하고도 냉철한 기관총입니다.",asset:"M1918" },
  { id:"mg5",name:"MG5",class:"MG",grade:5,maxHp:1500,maxMp:1400,power:1200,mood:93,description:"철저한 성격의 독일 기관총이자 밴드 보컬 인형입니다.",asset:"MG5" },
  { id:"wa2000",name:"WA2000",class:"RF",grade:5,maxHp:1250,maxMp:1200,power:1400,mood:90,description:"자신의 가치를 의심하지 않는 초일류 저격수입니다.",asset:"WA2000" },
  { id:"m14",name:"M14",class:"RF",grade:3,maxHp:1200,maxMp:1200,power:800,mood:92,description:"밝고 소박하며 동료를 따뜻하게 품는 소총입니다.",asset:"M14" },
  { id:"grizzly-mkv",name:"Grizzly_MkV",class:"HG",grade:5,maxHp:1200,maxMp:1300,power:1100,mood:96,description:"온화하지만 일할 때는 엄격하고 신속한 권총입니다.",asset:"Grizzly_MkV" },
  { id:"m950a",name:"M950A",class:"HG",grade:5,maxHp:1300,maxMp:1800,power:1000,mood:100,description:"화려한 외모와 달리 내성적인 면을 지닌 권총입니다.",asset:"M950A" },
];

export const bundledPack: GflContentPack = {
  contract:"gfl-content-pack/0.1",packId:"gfl-ember",version:"1.0.0",dolls,
  boss:{id:"scarecrow",name:"Scarecrow",class:"BOSS",grade:6,maxHp:1800,maxMp:1600,power:1000,mood:90,description:"철혈의 전술 지휘 개체.",asset:"Scarecrow"},
  missions:[
    {id:"alpha",name:"ALPHA ZONE",enemy:"잔존 바랴그단·철혈",factions:["바랴그단","철혈"],power:800,description:"S09 주변의 소규모 적대 세력을 소탕합니다.",rewards:{parts:120}},
    {id:"pegasus",name:"PEGASUS",enemy:"잔존 철혈",factions:["철혈"],power:900,description:"폐허가 된 보급로를 정찰합니다.",rewards:{parts:200}},
    {id:"oryx",name:"ORYX",enemy:"E.L.I.D·철혈",factions:["E.L.I.D","철혈"],power:1000,description:"감염체가 배회하는 지역을 돌파합니다.",rewards:{supplies:2}},
    {id:"dnester",name:"DNESTER",enemy:"바랴그단",factions:["바랴그단"],power:1150,description:"해안 거점의 대치선을 통과합니다.",rewards:{supplies:2}},
    {id:"uragan",name:"URAGAN",enemy:"철혈 보병",factions:["철혈"],power:1300,description:"국경 장벽 주변의 철혈 병력을 격파합니다.",rewards:{parts:350}},
    {id:"saebyeok",name:"SAEBYEOK",enemy:"철혈·바랴그단",factions:["철혈","바랴그단"],power:1450,description:"황폐화된 중요 거점을 회수합니다.",rewards:{supplies:3}},
    {id:"taurus-s",name:"TAURUS SOUTH",enemy:"철혈 지휘 개체",factions:["철혈"],power:1500,description:"국지전 지대에서 Scarecrow와 결전합니다.",boss:"Scarecrow",rewards:{parts:500}},
  ],
  items:[
    {id:"large-ram",name:"대용량 RAM",description:"정신력을 회복합니다."},{id:"strawberry-cake",name:"딸기치즈케익",description:"체력과 기분을 회복합니다."},
    {id:"lollipop",name:"막대사탕",description:"기분을 조금 회복합니다."},{id:"teddy",name:"테디베어",description:"포근한 인형입니다."},
  ],
  equipment:[
    {id:"pso-1",name:"PSO-1",power:200,description:"치명타 확률이 증가하는 군용 조준경입니다."},
    {id:"eot-518",name:"EOT 518",power:200,description:"명중률과 화력을 높이는 조준기입니다."},
    {id:"ac4",name:"AC4 소음기",power:250,description:"은폐성과 회피를 높이는 소음기입니다."},
  ],assets:{},
};

export function toBuiltInContentPack(pack: GflContentPack): BuiltInContentPack {
  return {
    contract: "built-in-content-pack/0.1",
    packId: pack.packId,
    version: pack.version,
    title: "소녀전선: 잔불",
    loreEntryCount: pack.missions.length,
    characters: pack.dolls.map((doll) => ({
      id: doll.id,
      name: doll.name,
      description: doll.description,
      assets: Object.fromEntries(Object.entries(pack.assets)
        .filter(([key]) => key.startsWith(`portrait:${doll.id}:`))
        .map(([key, value]) => [key.slice(`portrait:${doll.id}:`.length), value])),
    })),
  };
}
