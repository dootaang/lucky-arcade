/**
 * 대사 워크시트 기계 검수 게이트.
 *
 *   node scripts/check-dialogue.mjs docs/TEMEROSA-MATCH-PAIRS-DIALOGUE.md
 *
 * 제미나이 반환본을 코덱스 배선 전에 자동으로 거른다. 정본 판단은 사람이 하되,
 * 사람이 360셀을 눈으로 훑으며 놓치는 것들 — 화계 이탈, 존댓말 평준화, 금칙어,
 * 다른 게임 문안 재탕, 인물 간 복제 — 을 기계가 먼저 잡는다.
 *
 * ERROR 는 배선 차단, WARN 은 사람 판단 대상이다.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEECH_CONTRACT = resolve(ROOT, "docs/TEMEROSA-SPEECH-CONTRACT.md");
const PRIOR_WORKS = [
  "docs/TEMEROSA-OLD-MAID-DIALOGUE.md",
  "docs/TEMEROSA-OLD-MAID-CEREMONY-DIALOGUE.md",
  "docs/TEMEROSA-CASINO-NPC-DIALOGUE.md",
];

const BANNED = [
  [/\bAI\b/i, "메타 어휘 AI"],
  [/알고리즘/, "메타 어휘 알고리즘"],
  [/확률/, "메타 어휘 확률"],
  [/난도|난이도/, "메타 어휘 난도"],
  [/tellStyle|파라미터|시드/, "구현 어휘 누설"],
];

const BEAT_WARN = 46;
const BEAT_ERROR = 70;
const SHINGLE = 8;

const target = process.argv[2];
if (!target) {
  process.stderr.write("usage: node scripts/check-dialogue.mjs <worksheet.md>\n");
  process.exit(2);
}

const findings = [];
const report = (level, code, where, detail) => findings.push({ level, code, where, detail });

/** `### 이름 (`id`)` 아래의 `| event | 문안 |` 행을 전부 긁는다. */
function parseWorksheet(path) {
  const cells = [];
  let characterId = null;
  let characterName = null;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const heading = /^###\s+(.+?)\s+\(`([^`]+)`\)\s*$/.exec(line);
    if (heading) {
      characterName = heading[1];
      characterId = heading[2];
      continue;
    }
    const row = /^\|\s*([a-z][a-z-]*)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (!characterId || !row) continue;
    if (row[1] === "event" || /^-+$/.test(row[2])) continue;
    cells.push({ characterId, characterName, event: row[1], text: row[2] });
  }
  return cells;
}

/**
 * 기존 대사집 수확기. 정본 문서마다 헤딩·키 표기가 조금씩 달라서
 * (`### 이름 — `tellStyle``, event 키가 백틱에 싸인 형태 등) 느슨하게 훑는다.
 * 재탕 검사에는 출처 라벨만 있으면 충분하므로 id 정확도는 요구하지 않는다.
 */
function harvestDialogue(path) {
  const cells = [];
  let label = "?";
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      label = heading[1].replace(/\s*[—-]\s*`[^`]+`\s*$/, "").replace(/\s*\(`[^`]+`\)\s*$/, "");
      continue;
    }
    const row = /^\|\s*`?([a-z][a-z-]*)`?\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (!row || /^-+$/.test(row[2]) || row[1] === "event") continue;
    cells.push({ characterId: label, event: row[1], text: row[2] });
  }
  return cells;
}

/** 화법 계약서 35인 표에서 인물별 화계를 읽는다. */
function parseSpeechContract() {
  const registers = new Map();
  if (!existsSync(SPEECH_CONTRACT)) return registers;
  for (const line of readFileSync(SPEECH_CONTRACT, "utf8").split(/\r?\n/)) {
    const row = /^\|\s*[^|]+\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (row) registers.set(row[1], row[2]);
  }
  return registers;
}

const HONORIFIC_TAIL = /(습니다|읍니다|십시오|ㅂ니다|합니다)[.!?…]*$/;
const POLITE_TAIL = /(요|죠|쇼)[.!?…~]*$/;

/** 화계 이탈 검사. 혼용 인물은 판정하지 않는다. */
function checkRegister(register, beat) {
  if (!register || register.startsWith("혼용")) return null;
  const honorific = HONORIFIC_TAIL.test(beat);
  const polite = POLITE_TAIL.test(beat);
  if (register.startsWith("합쇼체")) {
    if (polite && !honorific) return "합쇼체 인물인데 해요체 어미";
    return null;
  }
  if (register.startsWith("해요체")) {
    if (honorific) return "해요체 인물인데 합쇼체 어미 (존댓말 평준화)";
    return null;
  }
  // 해체 · 해라체 · 명사종결 — 존댓말이 새면 안 된다.
  if (honorific) return `${register} 인물인데 합쇼체 어미`;
  if (polite && !/[가-힣]요일|중요|필요|주요|고요|조용/.test(beat)) {
    return `${register} 인물인데 존댓말 어미`;
  }
  return null;
}

const normalize = (s) => s.replace(/<br>/g, " ").replace(/[\s.,!?…~"'·—-]/g, "");

function shingles(s) {
  const n = normalize(s);
  const out = new Set();
  for (let i = 0; i + SHINGLE <= n.length; i += 1) out.add(n.slice(i, i + SHINGLE));
  return out;
}

// ---- 실행 ----
const cells = parseWorksheet(resolve(ROOT, target));
if (cells.length === 0) {
  report("ERROR", "empty", target, "파싱된 문안 셀이 없다. 헤딩 또는 표 형식을 확인하라.");
}

const registers = parseSpeechContract();
const byCharacter = new Map();
const seenText = new Map();

for (const cell of cells) {
  const where = `${cell.characterId}/${cell.event}`;
  const { text } = cell;

  if (/TODO/i.test(text)) {
    report("ERROR", "todo", where, "미교체 자리표시자");
    continue;
  }
  if (text.includes("|")) report("ERROR", "pipe", where, "문안에 표 구분자 | 포함");

  const beats = text.split("<br>").map((b) => b.trim());
  if (beats.length > 2) report("ERROR", "beats", where, `${beats.length}박자 — 최대 2박자`);
  for (const beat of beats) {
    if (!beat) report("ERROR", "beats", where, "빈 박자");
    if (beat.length > BEAT_ERROR) report("ERROR", "length", where, `${beat.length}자 — 말풍선 초과`);
    else if (beat.length > BEAT_WARN) report("WARN", "length", where, `${beat.length}자 — 말풍선에 길다`);

    const violation = checkRegister(registers.get(cell.characterId), beat);
    if (violation) report("WARN", "register", where, `${violation}: ${beat}`);
  }

  for (const [pattern, label] of BANNED) {
    if (pattern.test(text)) report("ERROR", "banned", where, `${label}: ${text}`);
  }

  const key = normalize(text);
  if (seenText.has(key)) {
    const prior = seenText.get(key);
    const level = prior.characterId === cell.characterId ? "ERROR" : "ERROR";
    report(level, "duplicate", where, `${prior.characterId}/${prior.event} 와 동일 문안`);
  } else {
    seenText.set(key, cell);
  }

  if (!byCharacter.has(cell.characterId)) byCharacter.set(cell.characterId, []);
  byCharacter.get(cell.characterId).push(cell);
}

// 인물별 감정 분화 — 실수와 패배, 성공과 승리가 같은 말이면 안 된다.
for (const [characterId, list] of byCharacter) {
  const pick = (event) => list.find((c) => c.event === event)?.text;
  for (const [a, b] of [["self-miss", "defeat"], ["self-match", "victory"], ["self-match", "streak"]]) {
    const left = pick(a);
    const right = pick(b);
    if (!left || !right) continue;
    const overlap = [...shingles(left)].filter((g) => shingles(right).has(g)).length;
    if (overlap >= 2) report("WARN", "flat-emotion", `${characterId}/${a}~${b}`, "두 사건의 문안이 사실상 같은 감정이다");
  }
  if (!registers.has(characterId)) {
    report("WARN", "no-contract", characterId, "화법 계약서에 화계 항목이 없다 — 화계 검사 생략됨");
  }
}

/*
 * 인물 간 검사.
 *
 * 강제 실패로 만들지 않는다. 어휘장이 겹치는 것 자체는 죄가 아니고, 같은 사건에서
 * 두 인물이 비슷하게 말할 수도 있다. 최종 판단은 사람의 캐릭터 검수다.
 * 완전히 같은 문안만 위의 duplicate 검사가 ERROR로 잡고, 여기서는 경고만 낸다.
 */

/** 어느 인물이 말해도 이상하지 않은 게임 공용어. 겹쳐도 의미가 없다. */
const SHARED_GAME_WORDS = new Set(["카드", "대국", "상대", "점수", "판에", "이번", "여기", "다음", "마지"]);

/**
 * 인물 전용으로 배정된 어휘. 다른 인물이 쓰면 캐릭터 구분이 무너진다.
 * 정본 문서에서 전용으로 못 박을 때마다 여기에 추가한다.
 */
const RESERVED_VOCABULARY = [
  [/장부|단가/, "raven", "레이븐의 거래·장부 어휘"],
  [/1급 기술자/, "cicero", "키케로의 등급 자칭"],
  [/E랭크/, "tumit-tu", "튜밋튜의 자칭 등급"],
  [/분수/, "traver", "트레버의 자기억제 어휘"],
  [/이 몸|신참/, "cradle", "크레이들의 선장 어휘"],
];

/**
 * 낱말을 어간으로 거칠게 자른다. 한국어는 조사가 붙어 `대상`과 `대상은`이 다른 문자열이 되는데,
 * 내용어 대다수가 두 음절이라 앞 두 음절만 취하면 조사·어미를 떼는 효과가 난다.
 * 정밀한 형태소 분석이 아니라 경고 판정용 근사다.
 */
const tokenize = (text) => {
  const words = text.replace(/<br>/g, " ").match(/[가-힣]{2,}|[A-Za-z]{2,}/g) || [];
  return new Set(words.map((w) => (/[가-힣]/.test(w) ? w.slice(0, 2) : w.toLowerCase())).filter((w) => !SHARED_GAME_WORDS.has(w)));
};

const byEvent = new Map();
for (const cell of cells) {
  if (/TODO/i.test(cell.text)) continue;
  if (!byEvent.has(cell.event)) byEvent.set(cell.event, []);
  byEvent.get(cell.event).push(cell);

  for (const [pattern, owner, label] of RESERVED_VOCABULARY) {
    if (cell.characterId !== owner && pattern.test(cell.text)) {
      report("WARN", "reserved-word", `${cell.characterId}/${cell.event}`, `${label}를 침범했다 (전용: ${owner})`);
    }
  }
}

/*
 * 어휘의 희소성으로 판정한다. 서른 명이 두루 쓰는 낱말이 겹치는 건 우연이지만,
 * 두세 명만 쓰는 특이한 낱말이 같은 사건에서 겹치면 두 인물의 사고방식이 구별되지 않는다는 뜻이다.
 */
const speakersOf = new Map();
for (const cell of cells) {
  if (/TODO/i.test(cell.text)) continue;
  for (const word of tokenize(cell.text)) {
    if (!speakersOf.has(word)) speakersOf.set(word, new Set());
    speakersOf.get(word).add(cell.characterId);
  }
}
const isDistinctive = (word) => {
  const count = speakersOf.get(word)?.size ?? 0;
  return count >= 2 && count <= 3;
};

/*
 * 낱말 하나가 겹치는 것으로는 판정하지 않는다. 무승부에서 서른 명이 `나누다`를 쓰는 건
 * 사건에 딸린 필연이지 결함이 아니다. 특이한 낱말이 둘 이상 겹칠 때에만 두 인물의
 * 어휘장이 실제로 포개졌다고 본다.
 */
for (const [event, list] of byEvent) {
  const tokens = list.map((cell) => tokenize(cell.text));
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (list[i].characterId === list[j].characterId) continue;
      const distinctive = [...tokens[i]].filter((w) => tokens[j].has(w) && isDistinctive(w));
      if (distinctive.length < 2) continue;
      report("WARN", "cross-character", `${list[i].characterId}~${list[j].characterId}/${event}`,
        `같은 사건에서 특이 어휘가 겹친다: ${distinctive.join(" ")}`);
    }
  }
}

// 교차 게임 재탕 — 기존 대사집과 8자 연속이 겹치면 재탕 의심.
const priorShingles = new Map();
for (const rel of PRIOR_WORKS) {
  const path = resolve(ROOT, rel);
  if (!existsSync(path)) continue;
  for (const cell of harvestDialogue(path)) {
    for (const gram of shingles(cell.text)) {
      if (!priorShingles.has(gram)) priorShingles.set(gram, `${rel}:${cell.characterId}/${cell.event}`);
    }
  }
}
for (const cell of cells) {
  if (/TODO/i.test(cell.text)) continue;
  const hits = [...shingles(cell.text)].filter((g) => priorShingles.has(g));
  if (hits.length >= 2) {
    report("WARN", "reuse", `${cell.characterId}/${cell.event}`, `기존 대사집 재탕 의심 — ${priorShingles.get(hits[0])}`);
  }
}

// ---- 출력 ----
const errors = findings.filter((f) => f.level === "ERROR");
const warns = findings.filter((f) => f.level === "WARN");
for (const f of [...errors, ...warns]) {
  process.stdout.write(`${f.level} [${f.code}] ${f.where} — ${f.detail}\n`);
}
const characterCount = byCharacter.size;
process.stdout.write(
  `\n${target}: 인물 ${characterCount}명 · 문안 ${cells.length}개 · ERROR ${errors.length} · WARN ${warns.length}\n`,
);
process.exit(errors.length > 0 ? 1 : 0);
