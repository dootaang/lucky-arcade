import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSHEET = resolve(ROOT, "docs/TEMEROSA-FIVE-CARD-DRAW-DIALOGUE.md");
const CONTRACT = resolve(ROOT, "docs/TEMEROSA-SPEECH-CONTRACT.md");
const DOSSIER = resolve(ROOT, "reports/temerosa-casino-npc-dossier.local.md");
const PRIOR = resolve(ROOT, "docs/TEMEROSA-MATCH-PAIRS-DIALOGUE.md");
const [outArg,...ids] = process.argv.slice(2);
if(!outArg||ids.length===0)throw new Error("usage: build-five-card-draw-dialogue-prompt <out> <id>...");

function sectionFor(text,id){return text.split(/^### /m).slice(1).find((section)=>section.split(/\r?\n/,1)[0]?.includes(`(\`${id}\`)`))??"";}
const worksheet=readFileSync(WORKSHEET,"utf8"),contract=readFileSync(CONTRACT,"utf8"),prior=readFileSync(PRIOR,"utf8"),dossier=existsSync(DOSSIER)?readFileSync(DOSSIER,"utf8"):"";
const contractHeader=contract.split(/\r?\n/).filter((line)=>/^\|\s*인물\s*\|/.test(line)||/^\|\s*---/.test(line)).slice(0,2);
const contractRows=contract.split(/\r?\n/).filter((line)=>ids.some((id)=>line.includes(`\`${id}\``)));
const eventTable=worksheet.split("## 2. 사건 의미")[1]?.split("## 3.")[0]?.trim()??"";
const blocks=ids.map((id)=>{
  const target=sectionFor(worksheet,id),old=sectionFor(prior,id),raw=sectionFor(dossier,id);
  const heading=target.split(/\r?\n/)[0];
  const direction=target.split(/\r?\n/).slice(1).filter((line)=>!line.startsWith("|")).join("\n").trim();
  return `# 담당 인물 ${heading}\n\n## 연기 지시\n${direction}\n\n## CHARX 추출 근거\n${raw||"화법 계약과 연기 지시만 사용한다."}\n\n## 기존 짝맞추기 문안 — 말투 참고용이며 문장 재사용 금지\n${old}`;
});
const prompt=`당신은 《테메로세》 파이브 카드 드로 포커의 한국어 NPC 대사 검수자다. 아래 ${ids.length}명의 12개 사건 문안을 작성한다. 도구를 호출하거나 파일을 읽지 마라.\n
절대 규율: 화법 계약을 지킨다. 숨은 패·족보·다음 행동을 누설하지 않는다. 이름만 바꾸면 누구나 할 말은 실패다. 포커 용어는 자연스럽게 쓰되 캐릭터가 AI·알고리즘·확률을 말하지 않는다. 폴드한 패를 봤다고 말하지 않는다. 한 박자 40자 안쪽, 꼭 필요할 때만 <br> 두 박자. 문안에 | 문자를 쓰지 않는다. 기존 문장을 재사용하지 않는다.\n
사건:\n${eventTable}\n\n화법 계약:\n${[...contractHeader,...contractRows].join("\n")}\n\n${blocks.join("\n\n---\n\n")}\n
출력은 각 인물마다 정확히 다음 형식만 쓴다. 설명·코드펜스 금지.\n### 이름 (\`id\`)\n\n| event | 검수 문안 |\n|---|---|\n그리고 사건 12개를 위 사건표 순서로 빠짐없이 출력한다. 총 ${ids.length*12}문안이다.`;
writeFileSync(resolve(ROOT,outArg),prompt,"utf8");
process.stdout.write(`${outArg}: ${ids.length}명 · ${prompt.length}자\n`);
