# SPEC-A19 — 카지노 NPC 대사·성격 배선

> 상태: v1.0 구현 계약 (2026-07-26). 선행 없음. 코드에 이미 있는 구조 위에 데이터를 얹는 작업이다.
>
> 문안 정본: 네 시리즈 CHARX와 교차검수를 마친 [카지노 NPC 대사집](./TEMEROSA-CASINO-NPC-DIALOGUE.md) —
> **검수 확정본을 코드에서 한 글자도 바꾸지 않는다.**
> 근거: [신규 NPC 명부](./TEMEROSA-CASINO-NPC-ROSTER.md)

## 1. 목적

카지노 카트리지에 앉은 신규 26명이 지금 **전원 침묵**하고 **전원 `standard` 성격**이다.

- 대사 **208줄**(26명 × 8상황)을 배선한다.
- `tellStyle` 26개를 **승인본으로 교체**한다.

집필과 네 시리즈 CHARX 교차검수는 끝났다. 이 문서는 그것을 코드로 옮기는 계약이다.

## 2. 현재 상태

| 항목 | 값 |
|---|---|
| 대사 계약 | `OldMaidLine { id, characterId, event, text: readonly string[] }` — 이미 존재 |
| 상황 | `OldMaidLineEvent` 8종 — 이미 존재 |
| `tellStyle` 타입 | `"standard" \| "open" \| "guarded" \| "bluffer"` — 이미 존재 |
| 성격 프리셋 | `PERSONA_PRESETS`에 네 종류 모두 존재 |
| 기존 9인 대사 | `temerosa-lines.ts`, 72줄 배선 완료 |
| 신규 26명 대사 | **없음 → 침묵** |
| 신규 26명 성격 | `cartridge.ts:95`에서 **`"standard"` 하드코딩** |

`selectOldMaidSpeech`는 `tellStyle`을 **참조하지 않는다.** 대사와 성격은 런타임에서 독립이며,
`tellStyle ↔ 화법` 대응은 집필 규칙일 뿐이다. 두 변경은 서로를 깨지 않는다.

## 3. ⚠ 구조적 제약 셋

### 3.1 기본 카트리지에 카지노 대사를 넣으면 검증이 터진다

```ts
// dialogue.ts — validateOldMaidLines
assert(characterIds.has(line.characterId), `old_maid_line_character_missing:${line.characterId}`);
```

`temerosaOldMaidCartridge`의 `characters`는 **기본 9인뿐**이다. 26명의 대사를
`temerosaOldMaidLines`에 합치면 기본 카트리지가 즉시 실패한다.

→ **파일을 분리하고, 카지노 카트리지에서만 합친다.**

### 3.2 매니페스트에 없는 인물의 대사도 걸러야 한다

`createTemerosaCasinoOldMaidCartridge`는 콘텐츠 매니페스트에서 **4표정을 모두 갖춘 인물만** 좌석에 올린다.
매니페스트가 바뀌어 누가 빠지면 그 인물의 대사가 고아가 되어 같은 검증에 걸린다.

→ **합칠 때 `characters`에 실재하는 인물로 필터링한다.** 하드코딩된 명단을 믿지 않는다.

### 3.3 `tellStyle` 교체는 CPU 행동을 바꾼다 — 팩 버전을 올려야 한다

`cpuDrawIndex`가 `PERSONA_PRESETS[tellStyle]`의 `signalAttention`·`signalTrust`를 쓴다.

```
standard  signalTrust  0      신호를 거의 쓰지 않음
open      signalTrust +0.8    재배열을 곧이곧대로 읽음
guarded   signalTrust −0.45   미끼로 의심함
```

26명을 `standard`에서 실제 성격으로 바꾸면 **같은 시드·같은 입력에서 다른 자리를 고른다.**

앱은 `createTemerosaCasinoOldMaidCartridge`를 실제로 쓰고 있고 26명이 `selectableCharacterIds`에
들어 있으므로, **진행 중인 대국에 이들이 앉아 있을 수 있다.** 그 상태로 배포하면
`recoverSession`이 액션 재생 중 해시 불일치를 만나 **대국을 조용히 되감는다.**

→ **`TEMEROSA_OLD_MAID_PACK_VERSION`을 `temerosa-old-maid/0.7` → `0.8`로 올린다.**
되감기보다 깨끗한 폐기가 낫다. 전적·포인트·도감은 별도 스토어라 영향받지 않는다.

## 4. 건드릴 파일

### 신규

| 파일 | 내용 |
|---|---|
| `cabinets/old-maid/src/temerosa-casino-lines.ts` | 26명 208줄. 기존 `temerosa-lines.ts`와 동일한 구조 |
| `cabinets/old-maid/src/temerosa-casino-personas.ts` | 26명 `tellStyle` 표 |
| `cabinets/old-maid/test/casino-lines.test.ts` | 완전성·중복·필터링·검증 |

### 수정

| 파일 | 변경 |
|---|---|
| `cabinets/old-maid/src/cartridge.ts` | 카지노 카트리지에서 대사 병합·필터, `tellStyle` 하드코딩 제거 |
| `cabinets/old-maid/src/contracts.ts` | 팩 버전 `0.8` |
| `cabinets/old-maid/src/index.ts` | 신규 모듈 재수출 |
| `e2e/arcade.spec.ts` | 신규 NPC 좌석에서 말풍선이 뜨는지 확인 |

## 5. 금지사항

1. **확정 문안을 코드에서 고치지 않는다.** 오탈자나 스타일 수정은 CHARX 근거와 함께 대사집을 먼저 고친다.
2. **`temerosa-lines.ts`(기존 9인)에 카지노 대사를 섞지 않는다.** 3.1의 이유다.
3. **`engine.ts`의 판정 규칙을 수정하지 않는다.** 이 작업은 데이터 교체다.
4. **`selectOldMaidSpeech`에 `tellStyle`을 넣지 않는다.** 대사와 성격은 런타임에서 독립을 유지한다.
5. **좌석 명단을 하드코딩하지 않는다.** 매니페스트가 정하는 대로 따른다.
6. **`standard`를 폴백으로 쓰지 않는다.** 26명 전원 승인본 값이 있다. 명단에 없는 인물만 `standard`다.
7. **대사 없는 인물에게 다른 인물의 대사를 돌려주지 않는다.** 침묵이 정답이다.
8. **`OldMaidState`에 필드를 추가하지 않는다.**

## 6. 구현 계약

### 6.1 대사 파일

`temerosa-lines.ts`와 **똑같은 모양**으로 만든다. 구조를 새로 발명하지 않는다.

```ts
// temerosa-casino-lines.ts
type LineText = Readonly<Record<OldMaidLineEvent, readonly string[]>>;

const text = {
  echo: {
    watching: ["에코는 기다리고 있어. 기다리는 게 지루하다고 에코는 생각해. 방금 그 생각도 말해 버렸어."],
    // …
  },
  // …
} as const satisfies Readonly<Record<string, LineText>>;

export const temerosaCasinoOldMaidLines: readonly OldMaidLine[] = /* 동일한 flatMap */;
```

- 인물 키는 카트리지 `characterId`와 **정확히 일치**해야 한다(`tumit-tu`의 하이픈 포함).
- 네모의 두 박자 대사처럼 `text`가 여러 원소인 경우가 신규 26명에는 **없다.** 전부 한 박자다.
- `id`는 기존과 같은 `${characterId}-${event}` 규칙을 쓴다. 기존 9인과 겹치지 않는다.

### 6.2 카트리지 병합

```ts
export function createTemerosaCasinoOldMaidCartridge(contentAssets) {
  // …기존 로직…
  const characterIds = new Set(characters.map((character) => character.id));
  const lines = [...temerosaOldMaidLines, ...temerosaCasinoOldMaidLines]
    .filter((line) => characterIds.has(line.characterId));
  return { ...temerosaOldMaidCartridge, faces, cards, characters, selectableCharacterIds, lines, dealPairCount: 18 };
}
```

**기본 카트리지의 `lines`는 그대로 둔다.** 9인 72줄만 갖는다.

### 6.3 `tellStyle` 표

`cartridge.ts:95`의 하드코딩을 지우고 이 표를 참조한다. 표에 없는 인물만 `standard`로 떨어진다.

```ts
// temerosa-casino-personas.ts
export const TEMEROSA_CASINO_TELL_STYLES: Readonly<Record<string, OldMaidTellStyle>> = {
  adesha: "guarded",    anna: "open",         apollyon: "guarded",  bche: "open",
  camille: "bluffer",   cicero: "guarded",    cradle: "open",       deokbae: "guarded",
  diamo: "standard",    echo: "open",         esther: "bluffer",    hiro: "guarded",
  katrinka: "guarded",  kreva: "guarded",     levillotte: "bluffer", lilim: "open",
  machina: "open",      morsisa: "open",      nostalgia: "guarded", phaeo: "guarded",
  raven: "bluffer",     temute: "open",       traver: "guarded",    ttaengchil: "open",
  "tumit-tu": "open",   yul: "standard",
};
```

분포는 `open 10 · guarded 10 · bluffer 4 · standard 2`다.

기존 9인의 `tellStyle`은 **건드리지 않는다.** `baseCharacters`에 이미 값이 있고
`uniqueCharacters`가 기존 정의를 우선하므로 자동으로 보존된다 — 구현 시 이 순서를 확인한다.

### 6.4 팩 버전

```ts
export const TEMEROSA_OLD_MAID_PACK_VERSION = "temerosa-old-maid/0.8" as const;
```

이전 값을 상수로 보존할 필요는 없다. 화면이 팩 버전 불일치를 폐기로 처리하므로
진행 중 대국은 새 판으로 시작된다. **이것이 의도된 동작이다.**

## 7. 테스트 관문

1. **완전성** — 카지노 대사가 26명 × 8상황 = **208줄**이고 빠진 조합이 없다.
2. **ID 유일성** — 기존 72줄과 합쳐 280줄의 `id`가 전부 다르다.
3. **인물 일치** — 모든 `characterId`가 카지노 카트리지의 `characters`에 존재한다.
4. **필터링** — 콘텐츠 자산을 일부만 준 카트리지에서 **좌석에 없는 인물의 대사가 빠진다.**
5. **기본 카트리지 격리** — `temerosaOldMaidCartridge.lines`가 여전히 72줄이고 `validateOldMaidLines`를 통과한다.
6. **성격 배정** — 26명이 표대로 배정되고 분포가 `10/10/4/2`다.
7. **기존 9인 보존** — 페일 `open`, 카노 `guarded`, 네모 `bluffer` 등이 그대로다.
8. **폴백 없음** — 대사가 없는 인물·상황에서 `selectOldMaidSpeech`가 `null`을 돌려주고
   다른 인물의 줄을 쓰지 않는다.
9. **판정 불변** — 카지노 대사를 통째로 비워도 같은 시드·입력의 `resultHash`가 같다.
10. **문안 대조** — 표본 10줄을 대사집 원문과 문자열 비교해 일치한다.
11. **10,000시드 완주** — 기존 하니스가 그대로 통과한다.

E2E

12. 신규 NPC를 좌석에 앉힌 판에서 말풍선이 한 번 이상 뜬다.
13. 저장된 이전 팩 버전 대국이 폐기되고 새 판이 정상 시작된다.

## 8. 완료 조건

- `pnpm boundaries`·`pnpm typecheck`·`pnpm test`·빌드 통과.
- 7절 관문 13개 통과.
- 문안이 대사집과 **한 글자도 다르지 않다.**
- 전적·포인트·도감이 팩 버전 상승 뒤에도 살아 있다.
- 로비 초기 JS gzip 예산 유지. 대사 데이터는 도둑잡기 지연 청크 안에만 들어간다.
- 신규 NPC 세 명을 앉힌 판에서 **세 사람이 서로 다른 목소리로** 말한다.

## 9. 비범위

- **다른 게임의 대사** — 인디언 포커 등은 상황 집합이 다르다. 별도 집필이 필요하다.
- **조합 전용 대사** — 카트린카·튜밋튜·테뮤테의 관계는 기존 줄이 나란히 뜨는 것만으로 성립한다.
  전용 대사를 만들지 않는다.
- **대사 해금·뽑기 연동** — [SPEC-A14](./SPEC-A14-draw-and-collection.md)의 범위다.
  이번에는 전 대사를 처음부터 연다.
- **`tellStyle` 재조정** — 승인본을 그대로 쓴다. 밸런스 관찰은 전적 데이터가 쌓인 뒤다.
