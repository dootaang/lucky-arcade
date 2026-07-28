/**
 * 대사 발주 프롬프트 조립기.
 *
 *   node scripts/build-dialogue-prompt.mjs <worksheet.md> <out.txt> <id> [<id> ...]
 *
 * 집필 모델에게 파일 읽기 권한을 주는 대신, 필요한 원문을 프롬프트에 직접 실어 보낸다.
 * 하위 CLI가 도구를 한 번도 쓰지 않으므로 승인 관문을 건드릴 이유가 없어진다.
 *
 * 싣는 것: 규율 · 사건표 · 인물별 화법 계약 행 · CHARX 추출 원문 · 코덱스 인물 해석 · 기존 문안.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = resolve(ROOT, "reports/temerosa-casino-npc-dossier.local.md");
const CONTRACT = resolve(ROOT, "docs/TEMEROSA-SPEECH-CONTRACT.md");
const PRIOR = ["docs/TEMEROSA-OLD-MAID-DIALOGUE.md", "docs/TEMEROSA-CASINO-NPC-DIALOGUE.md"];

const [worksheetArg, outArg, ...ids] = process.argv.slice(2);
if (!worksheetArg || !outArg || ids.length === 0) {
  process.stderr.write("usage: node scripts/build-dialogue-prompt.mjs <worksheet.md> <out.txt> <id>...\n");
  process.exit(2);
}

/** 카드 시트에서 집필에 쓰이지 않는 절을 덜어낸다. 외형·잡학·능력치는 화법을 만들지 않는다. */
const DROP_SUBSECTIONS = /^####\s+(Appearance|Trivia|Abilities|외형|능력)/i;

function trimSheet(block) {
  const out = [];
  let dropping = false;
  for (const line of block.split(/\r?\n/)) {
    if (/^####\s/.test(line)) dropping = DROP_SUBSECTIONS.test(line);
    if (!dropping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 인물의 CHARX 추출 절. 자료집은 같은 항목을 시점별로 중복 수록하므로 내용 기준으로 접는다. */
function dossierFor(id) {
  if (!existsSync(DOSSIER)) return null;
  const section = readFileSync(DOSSIER, "utf8")
    .split(/^## /m)
    .slice(1)
    .find((s) => new RegExp(`^.+ \\(\`${id}\`\\)`).test(s));
  if (!section) return null;

  const entries = section.split(/^### /m);
  const head = entries.shift().trim();
  const seen = new Set();
  const kept = [];
  for (const entry of entries) {
    const trimmed = trimSheet(entry);
    const fingerprint = trimmed.replace(/\s/g, "").slice(0, 400);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    kept.push(`### ${trimmed}`);
  }
  return [head, ...kept].join("\n\n");
}

/** 화법 계약서 35인 표의 해당 행. 머리행을 함께 실어야 열 의미가 전달된다. */
function contractRowsFor(idSet) {
  const lines = readFileSync(CONTRACT, "utf8").split(/\r?\n/);
  const header = lines.filter((l) => /^\|\s*인물\s*\|/.test(l) || /^\|\s*---/.test(l)).slice(0, 2);
  const rows = lines.filter((l) => {
    const m = /^\|\s*[^|]+\|\s*`([^`]+)`\s*\|/.exec(l);
    return m && idSet.has(m[1]);
  });
  return [...header, ...rows].join("\n");
}

/** 워크시트에 적힌 코덱스의 인물 해석 단락. 이번 게임에서의 연기 지시다. */
function directionFor(worksheet, id) {
  const section = worksheet.split(/^### /m).find((s) => new RegExp(`^.+ \\(\`${id}\`\\)`).test(s));
  if (!section) return null;
  const lines = section.split(/\r?\n/).slice(1);
  const stop = lines.findIndex((l) => l.startsWith("|"));
  return lines.slice(0, stop === -1 ? undefined : stop).join("\n").trim();
}

/** 같은 인물의 기존 문안. 베끼라고 싣는 게 아니라 겹치지 말라고 싣는다. */
function priorLinesFor(name) {
  const out = [];
  for (const rel of PRIOR) {
    const path = resolve(ROOT, rel);
    if (!existsSync(path)) continue;
    const section = readFileSync(path, "utf8")
      .split(/^### /m)
      .find((s) => s.startsWith(`${name} —`) || s.startsWith(`${name}(`) || s.startsWith(`${name} `));
    if (!section) continue;
    const rows = section.split(/\r?\n/).filter((l) => /^\|\s*`/.test(l));
    if (rows.length) out.push(`출처 ${rel}\n${rows.join("\n")}`);
  }
  return out.join("\n\n");
}

const worksheet = readFileSync(resolve(ROOT, worksheetArg), "utf8");
const idSet = new Set(ids);

const EVENTS = `| event | 화자 기준 상황 |
|---|---|
| table-open | 대국이 시작됐다. 아직 어떤 카드도 보지 않았다. |
| self-match | 화자가 한 짝을 처음 또는 단발로 맞혔다. |
| self-miss | 화자가 고른 두 장이 달랐다. |
| opponent-match | 상대가 한 짝을 가져갔다. |
| opponent-miss | 상대가 고른 두 장이 달랐다. |
| streak | 화자가 두 번 이상 연속으로 짝을 맞혔다. |
| ahead | 화자가 점수상 앞서기 시작했다. |
| behind | 화자가 점수상 뒤처지기 시작했다. |
| last-pair | 판에 마지막 한 짝만 남았다. 위치는 모른다. |
| victory | 화자가 더 많은 짝을 가져가 승리했다. |
| defeat | 화자가 패배했다. |
| draw | 양쪽이 같은 수의 짝을 가져갔다. |`;

const chunks = [];
chunks.push(`당신은 《테메로세》 세계관 게임의 한국어 대사 집필자다.
짝맞추기(카드를 뒤집어 같은 짝을 찾는 게임) 대국에서 NPC가 내뱉는 말풍선 문안을 쓴다.

**파일을 읽지 마라. 도구를 호출하지 마라.** 집필에 필요한 모든 자료가 이 프롬프트 안에 들어 있다.

## 1. 사건 12개

${EVENTS}

## 2. 절대 규율 (위반 시 반려)

1. 아래 화법 계약의 화계·어미·자칭을 어기지 않는다. 존댓말 인물을 전부 같은 합쇼체로 평준화하지 않는다.
2. 숨은 카드의 위치, 실제 기억 확률, 다음 선택의 결과를 문안이 누설하지 않는다.
3. 인물이 AI, 알고리즘, 확률, 난도, 자기 지능 수치를 말하지 않는다.
4. 한 문안은 기본 한 문장 한 박자다. 두 박자가 꼭 필요할 때만 \`<br>\`로 나누되, 한 인물의 12문안 중 절반을 넘기지 마라. 각 박자는 40자 안쪽을 목표로 한다.
5. 문안 안에 \`|\` 문자를 절대 쓰지 않는다.
6. 비속어는 화법 계약에서 허용·제한으로 표시된 인물의 defeat에서만 한 마디로 끝낸다.
7. 실제 경제 규칙, 배당, 신앙 의식, 새 사건을 발명하지 않는다. 인물의 어휘로 카드를 해석만 한다.
8. 카드 이름·표정 이름을 부르지 않는다.
9. 아래 실린 기존 문안의 문장을 복제하거나 어미만 바꿔 재사용하지 않는다.
10. **인물의 상징 어휘·구문을 12문안 전부에 박아 넣지 마라.** 말버릇은 12문안 중 절반 이하에서만 드러낸다.
    같은 낱말이나 같은 문형이 열 번 넘게 반복되면 말버릇이 아니라 고장 난 기계로 읽힌다.
    나머지 절반은 그 인물이 같은 성격으로 도달할 수 있는 다른 표현을 찾는다.
11. 한국어로 성립하지 않는 조어를 만들지 마라. 카드의 전문 용어는 살리되, 문장은 한국어 화자가 읽어서
    뜻이 통해야 한다. 뜻이 불분명한 한자어를 지어내느니 쉬운 말로 쓴다.

## 3. 좋은 문안의 조건

- 이름만 바꾸면 다른 인물에게도 붙는 문장은 실패작이다. 그 인물의 직업·상처·집착이 어휘 층위에 드러나야 한다.
- self-miss와 defeat가 같은 감정이면 안 된다. self-match와 victory도 마찬가지다. 실수는 순간의 감정이고 패배는 대국의 결론이다.
- opponent-match와 opponent-miss는 상대를 향한 말이다. 혼잣말로 처리하지 않는다.
- 인물은 농담하고 있지 않다. 진심으로 자기 세계의 어휘를 쓰는데 대상이 카드 두 장일 뿐이다. 이 낙차가 유머다.

## 4. 담당 인물의 화법 계약

${contractRowsFor(idSet)}`);

for (const id of ids) {
  const section = worksheet.split(/^### /m).find((s) => new RegExp(`^.+ \\(\`${id}\`\\)`).test(s));
  const name = section ? /^(.+?) \(/.exec(section)[1] : id;
  const parts = [`\n---\n\n# 담당 인물: ${name} (\`${id}\`)`];

  const direction = directionFor(worksheet, id);
  if (direction) parts.push(`## 이번 게임에서의 연기 지시\n\n${direction}`);

  const dossier = dossierFor(id);
  if (dossier) parts.push(`## CHARX 카드 원문 (집필의 1차 근거)\n\n${dossier}`);

  const prior = priorLinesFor(name);
  if (prior) parts.push(`## 같은 인물의 기존 문안 (겹치지 말 것 — 베끼지 말 것)\n\n${prior}`);

  if (!dossier && !prior) parts.push("## 근거\n\n위 화법 계약 행과 연기 지시가 이 인물의 전부다. 그 밖의 설정을 발명하지 마라.");
  chunks.push(parts.join("\n\n"));
}

chunks.push(`\n---\n\n## 5. 출력 형식 (이 형식이 그대로 파싱된다)

담당 인물마다 아래를 정확히 반복한다. 설명·머리말·맺음말·코드펜스를 붙이지 않는다.

\`\`\`
### 이름 (\`id\`)

| event | 검수 문안 |
|---|---|
| table-open | 문안 |
| self-match | 문안 |
| self-miss | 문안 |
| opponent-match | 문안 |
| opponent-miss | 문안 |
| streak | 문안 |
| ahead | 문안 |
| behind | 문안 |
| last-pair | 문안 |
| victory | 문안 |
| defeat | 문안 |
| draw | 문안 |
\`\`\`

헤딩은 위에 적힌 \`이름 (\`id\`)\` 그대로 쓴다. event 키 12개를 이 순서대로 빠짐없이 채운다.
담당 인물 ${ids.length}명 × 12사건 = ${ids.length * 12}개 문안을 출력하라.`);

const prompt = chunks.join("\n\n");
writeFileSync(resolve(ROOT, outArg), prompt, "utf8");
process.stdout.write(`${outArg}: ${ids.length}인 · ${prompt.length}자\n`);
