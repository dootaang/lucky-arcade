# SPEC-A6 — 내 카드 도둑잡기

> 공개 범위 정정 (2026-07-25): 구현과 테스트는 보존하지만 개인 카드 삽입 UI는
> [SPEC-A16](./SPEC-A16-temerosa-casino-venue.md)에 따라 비공개다. 아래 공개 승인 기록은 당시 이력으로만 읽는다.

> 상태: v1.1 구현 완료 (2026-07-25). A4 도둑잡기 코어를 개인 봇카드로 여는 확장이며 새 게임 규칙이 아니다.
>
> 선행: [SPEC-A5](./SPEC-A5-old-maid-seat-dialogue.md)가 먼저 착지해야 한다. 두 명세가 같은 파일
> (`cabinets/old-maid/src/contracts.ts`)을 건드리므로 순차 진행한다.

## 1. 목적

사용자가 자기 봇카드를 넣으면 그 카드의 인물이 좌석에 앉고 그 카드의 그림이 카드 얼굴이 되는 도둑잡기를 연다.

도둑잡기 규칙 코어는 이미 세계관 없이 분리돼 있다. 이 작업은 **새 카트리지 공급원을 하나 더 만드는 일**이며
게임 규칙을 바꾸지 않는다.

기대치를 명확히 한다. 개인 카드 인물은 대사도 없고 앱이 아는 해석도 없다. 이 캐비닛의 매력은
**최애 월드컵과 같은 급**이며 테메로세 도둑잡기와 같은 급이 아니다. 목적은 깊이가 아니라
"한 규칙 코어가 여러 세계를 연다"는 제품 명제의 증명이다.

## 2. 설계 결정과 근거

| 결정 | 근거 |
|---|---|
| `NpcGroup`에 변형별 감정을 싣는다 | 현재 `emotions`(집합)와 `variantAssetIds`(배열)의 대응이 끊겨 있어 **어느 그림이 웃는 얼굴인지 알 수 없다.** 모르면 포커페이스 신호가 의미 없는 노이즈가 된다 |
| 표정 3종을 못 매핑한 인물은 좌석에서 제외한다 | 감정 치환 폴백 금지 원칙. 대신 그 인물의 그림은 카드 얼굴로 계속 쓴다 |
| `despairPortrait`는 `tense` 대체를 허용한다 | 패배 연출 전용이라 신호 채널이 아니다. 테메로세 정본 카트리지도 라일라를 `lyla-angry`로 대체하고 있다 |
| `tellStyle`을 시드로 배정하고 화면에 표기하지 않는다 | 라벨을 붙이면 카드가 말하지 않은 성격을 앱이 주장하는 것이 되어 원칙 2 위반이다. 표기하지 않으면 딜 무작위와 같은 층위의 **이번 판 규칙**이다 |
| `tellStyle`을 카드 지문에 고정하고 매 판 재배정하지 않는다 | 재배정하려면 상태 필드가 필요하고, 이어하기에서 대국 중 상대 성격이 바뀐다 |
| 중립 카트리지를 `packages/contracts`에 두고 `apps/web`에서 어댑트한다 | `extract`는 캐비닛을 import할 수 없다. A2의 `BuiltInContentPack` → 어댑터 선례와 같다 |
| 조커는 항상 생성 중립 카드다 | 사용자 OC를 패배 카드로 지목하지 않는다. 테메로세 규칙을 그대로 승계한다 |

## 3. 건드릴 파일

### 신규

| 파일 | 내용 |
|---|---|
| `packages/extract/src/old-maid.ts` | 감정 사전, 반응 매핑, 자격 판정, 중립 카트리지 생성 |
| `packages/extract/test/old-maid.test.ts` | 매핑·자격·폴백·경계 검증 |
| `apps/web/src/lib/card-old-maid.ts` | 중립 카트리지 → `OldMaidCartridge` 어댑터, `tellStyle` 배정 |
| `apps/web/src/features/card-old-maid/card-old-maid-view.tsx` | 에셋 해제·고정, 세션 저장, 화면 연결 |

### 수정

| 파일 | 변경 |
|---|---|
| `packages/contracts/src/index.ts` | `npcGroupSchema`에 `variants` 추가, `cardOldMaidCartridgeSchema` 신설, 보고서·분석 카드 `0.3` 범프 |
| `packages/extract/src/npc.ts` | `parseSprite`가 이미 구한 감정을 그룹에 보존 |
| `packages/extract/src/report.ts` | `assessment("old-maid-card", …)` 추가 |
| `packages/extract/src/cartridge.ts` | `createAnalyzedCard`에 `oldMaid` 연결 |
| `cabinets/old-maid/src/contracts.ts` | `version`·`packVersion` 리터럴 타입을 `string`으로 확장 |
| `cabinets/old-maid/src/engine.ts` | 초기 상태의 `packVersion`을 공급 카트리지 버전에서 기록(테메로세 런타임 값은 동일) |
| `cabinets/old-maid/src/react/old-maid-screen.tsx` | 하드코딩된 테메로세 제목·접근성 라벨을 `cartridge.title` 기반으로 중립화 |
| `apps/web/src/lib/database.ts` | `listCards` 필터에 `analyzed-card/0.3` 추가 |
| `apps/web/src/routes/home.tsx` | 재분석 조건을 최신 계약 이외 전부로 확장 |
| `apps/web/src/cabinets/registry.tsx` | `old-maid-card` 등록 + `PUBLIC_CABINET_IDS` 추가 |
| `apps/web/src/features/cards/report-view.tsx` | 적합도 보고서에 공개 도둑잡기 진입 카드 추가 |
| `apps/web/src/features/favorite-cup/favorite-cup-view.tsx`·`restoration-view.tsx` | 0.3 분석 카드에서도 기존 카트리지 소비 |
| `apps/web/src/lib/asset-service.ts` | Object URL 고정(pin) 지원 |
| `e2e/arcade.spec.ts` | 합성 카드로 개방·배분 확인 |

## 4. 금지사항

1. **도둑잡기 판정 규칙을 수정하지 않는다.** 단, 여러 공급 팩을 구분하기 위해 초기 상태의 `packVersion`은
   테메로세 상수가 아니라 `cartridge.version`을 기록한다.
2. **테메로세 카트리지(`cartridge.ts`·`temerosa-gallery.ts`·`temerosa-lines.ts`)를 수정하지 않는다.**
3. **감정 치환 폴백을 만들지 않는다.** `neutral`·`pleased`·`tense` 셋 중 하나라도 실제 감정 태그에서 매핑되지
   않으면 그 인물은 좌석 자격이 없다. 슬픔이 없다고 분노를 쓰지 않는다. `despairPortrait`만 예외다.
4. **`tellStyle`을 화면에 라벨·아이콘·툴팁으로 표기하지 않는다.**
5. **개인 카드 인물에게 대사를 생성하지 않는다.** `lines`를 비워 침묵시킨다.
6. **카드 원문·에셋 바이트를 보고서나 저장에 기록하지 않는다.** 에셋 ID와 파생 썸네일만 쓴다.
7. **`OldMaidState`에 필드를 추가하지 않는다.**
8. **여러 카드의 그림을 한 덱에 섞지 않는다.** 한 판은 한 카드에서만 나온다.
9. **자격 미달 카드에서 억지로 캐비닛을 열지 않는다.** 사유를 적합도 보고서에 남기고 닫는다.

## 5. `NpcGroup` 확장과 마이그레이션

`npc.ts`의 `parseSprite`는 이미 스프라이트별 감정을 계산한 뒤 그룹으로 접으면서 버린다. 버리지 않고 싣는다.

```ts
// packages/contracts — npcGroupSchema에 추가
variants: z.array(z.object({
  assetId: z.string().min(1),
  emotion: z.string().min(1),
})).min(1),
```

- 기존 `variantAssetIds`는 **그대로 둔다.** 최애 월드컵이 사용 중이며 `variants`에서 파생 가능하다.
- `variants`의 순서는 기존 `ordered`와 동일하다(기본 감정 우선, 그다음 `assetId` 사전순). 결정론을 위해 바꾸지 않는다.

### 버전 범프

- `suitability-report/0.2` → `0.3`
- `analyzed-card/0.2` → `0.3`
- 기존 `suitabilityReportSchema`·`analyzedCardSchema`를 `…V2`로 보존하고 `anyAnalyzedCardSchema` 유니온에 남긴다.
  V1을 보존한 기존 방식을 그대로 따른다.

### 재분석 경로

`home.tsx`가 지금은 `analyzed-card/0.1`만 재분석한다. 최신 계약이 아닌 전부를 재분석하도록 바꾼다.

```ts
if (item.analyzed.contract === "analyzed-card/0.3") continue;   // 기존: !== "analyzed-card/0.1"
```

원본 파일이 `sources` 스토어에 남아 있는 카드만 승급된다. 승급 실패는 기존과 같이 조용히 무시하고
이전 분석 결과를 계속 쓴다.

## 6. 감정 → 반응 매핑

`packages/extract/src/old-maid.ts`에 사전을 둔다. 비교 전에 정규화한다:
NFKC → 소문자 → 앞뒤 구분자·후행 숫자 제거.

| 반응 | 키워드 |
|---|---|
| `neutral` | `default` `normal` `neutral` `natural` `idle` `base` `standing` `plain` `기본` `평상` `보통` `무표정` |
| `pleased` | `smile` `smiling` `happy` `joy` `joyful` `grin` `laugh` `glad` `excited` `pleased` `미소` `웃음` `기쁨` `행복` `즐거움` |
| `tense` | `angry` `mad` `rage` `furious` `upset` `annoyed` `surprise` `surprised` `shock` `startled` `worry` `worried` `nervous` `tense` `화남` `분노` `놀람` `당황` `긴장` `불안` |
| `despair` | `sad` `sorrow` `cry` `crying` `tear` `despair` `defeat` `depressed` `gloomy` `disappointed` `낙담` `슬픔` `눈물` `절망` `우울` `실망` |

규칙:

- **한 키워드는 한 반응에만 속한다.** `serious`·`smirk`처럼 두 갈래로 읽히는 낱말은 **사전에 넣지 않는다.**
  매핑되지 않은 감정은 좌석 판정에 기여하지 않되 카드 얼굴로는 그대로 쓴다.
- 한 반응에 후보가 여럿이면 `variants` 순서의 첫 번째를 쓴다. 결정론이 보장된다.
- `despair`가 없으면 `despairPortrait`에 `tense`의 에셋을 재사용한다. **이 대체만 허용한다.**

## 7. 개방 기준

```
자격 인물 = NpcGroup 중
            confidence >= 0.65
         && displayNameSource !== "technical-id"
         && neutral·pleased·tense 3종이 전부 실제 감정 태그에서 매핑됨

개방 조건 = 자격 인물 >= 4  AND  카드 얼굴 >= 12
```

근거:

- **좌석 4명** — `validateCartridge`가 `characters.length >= 4`를 요구하고 관전 모드가 좌석 4개를 고른다.
- **얼굴 12종** — 엔진이 매 판 12쌍을 뽑는다(`.slice(0, 12)`). 12 미만이면 덱이 짧아져 판이 너무 빨리 끝난다.
- `confidence`·`displayNameSource` 기준은 최애 월드컵과 동일하게 맞춘다.

카드 얼굴은 **자격 인물뿐 아니라 신뢰 가능한 모든 `NpcGroup`의 변형 전부**에서 만든다.
표정 3종을 못 채운 인물도 그림은 덱에 들어간다. 묶이지 않은 이미지(`ungroupedImageCount`)는 배경·UI일 수 있으므로 쓰지 않는다.

적합도 보고서에 사유를 남긴다. 예: `표정 의미를 판별한 인물이 2명이라 최소 4명에 못 미칩니다.`

## 8. 중립 카트리지 계약

`packages/contracts`에 추가한다. 캐비닛 타입에 의존하지 않는다.

```ts
export const cardOldMaidFaceSchema = z.object({
  faceId: z.string().min(1),
  name: z.string().min(1),
  assetId: z.string().min(1),
  npcId: z.string().min(1),
  emotion: z.string().min(1),
});

export const cardOldMaidSeatSchema = z.object({
  npcId: z.string().min(1),
  displayName: z.string().min(1),
  portraits: z.object({
    neutral: z.string().min(1),
    pleased: z.string().min(1),
    tense: z.string().min(1),
  }),
  despairAssetId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});

export const cardOldMaidCartridgeSchema = z.object({
  contract: z.literal("card-old-maid-cartridge/0.1"),
  cardFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  cardName: z.string(),
  faces: z.array(cardOldMaidFaceSchema),
  seats: z.array(cardOldMaidSeatSchema),
});
```

`analyzedCardSchema`(0.3)에 `oldMaid: cardOldMaidCartridgeSchema`를 추가한다.

얼굴 이름은 `${displayName} · ${emotion}`으로 만든다. 같은 인물·감정 조합이 둘 이상이면
뒤에 번호를 붙여 구분한다. `faceId`는 에셋 ID에서 파생해 충돌을 막는다.

## 9. 어댑터

`apps/web/src/lib/card-old-maid.ts`

```ts
export function cardOldMaidCartridge(
  cartridge: CardOldMaidCartridge,
): OldMaidCartridge | null;
```

- `faces` → `OldMaidFace[]` + 조커 `{ id: "joker", name: "조커 · 짝 없는 카드", assetId: null }`
- `cards` → 얼굴마다 `-a`/`-b` 두 장, 조커는 `pairId: null` 한 장
- `seats` → `OldMaidCharacter[]`. `appearanceSet: "card"`, `lines` 없음(침묵)
- `title` → `${cardName} 도둑잡기`
- `version` → `CARD_OLD_MAID_PACK_VERSION = "card-old-maid/0.1"`
- 개방 조건 미달이면 `null`을 반환한다. 부분 카트리지를 만들지 않는다.
- 반환 직전 `validateCartridge`를 호출해 자기 검증한다.

### 캐비닛 타입 확장

`OldMaidCartridge.version`과 `OldMaidState.packVersion`이 지금 테메로세 팩 버전의 **리터럴 타입**이라
다른 팩 버전을 넣을 수 없다. 둘을 `string`으로 넓힌다. 또한 `createOldMaidState`가 현재
`TEMEROSA_OLD_MAID_PACK_VERSION`을 직접 기록하므로 `cartridge.version`을 기록하도록 한 줄을 고친다.

- 테메로세 카트리지의 런타임 값은 이전과 동일하다. **기존 테메로세 저장은 영향받지 않는다.**
- 테메로세 화면은 계속 `TEMEROSA_OLD_MAID_PACK_VERSION`으로 비교하므로 동작이 같다.
- 이렇게 해야 나중에 테메로세 팩이 올라가도 개인 카드 대국이 무효화되지 않는다.

### `tellStyle` 배정

```ts
const roll = new XorShift32(`${cardFingerprint}:tell:${npcId}`).nextUint32() % 3;
// 0 open, 1 guarded, 2 bluffer
```

같은 카드면 항상 같다. **화면에 표기하지 않는다.**

## 10. 에셋 예산

`CardAssetService`가 Object URL을 32개 LRU로 관리한다. 한 판에 동시에 필요한 이미지는
덱 얼굴 12 + 좌석 초상 최대 4명 × 4종 = **최대 28장**이라 상한에 근접한다.
여기에 상대 선택기가 자격 인물 전원의 초상을 띄우면 상한을 넘고, LRU가 **이미 렌더된 버림패 카드를 밀어낸다.**

계약:

1. `CardAssetService`에 고정(pin) 개념을 추가한다. 고정된 키는 `#trim()` 퇴출 대상에서 제외한다.
2. **선택기 단계**: 현재 화면이 후보 전원을 즉시 렌더하므로 자격 인물의 `neutral` 초상만 해제해
   선택기가 열린 동안 고정한다. 가상 목록을 도입하기 전에는 보이는 Object URL을 퇴출시키면 안 된다.
3. **배분 직후**: 그 판에 필요한 집합(덱 얼굴 + 선택된 좌석의 4종 초상)이 확정되므로 한 번에 해제하고 고정한다.
4. **판 종료·캐비닛 이탈**: 고정을 풀고 `dispose()`로 전부 해제한다.
5. 썸네일은 `maxEdge` 192를 쓴다. 목록 썸네일 성능 계약과 같다.

## 11. 레지스트리와 저장

```
id                   old-maid-card
version              OLD_MAID_VERSION
title                내 카드 도둑잡기
requiredCapabilities ["expressive-npcs>=4"]
sessionKind          repeat
launchKind           card
resumeLabel          도둑잡기 이어하기
estimatedMinutes     { min: 2, max: 4 }
world                내 카드
badge                바로 한 판
openingRank          2
```

- `PUBLIC_CABINET_IDS`에 추가한다. **오너 승인 완료(2026-07-25).**
- 세션 ID는 `old-maid-card:${cardFingerprint}`로 카드마다 분리한다.
- `RecentPlay`에 `cardFingerprint`를 **반드시** 채운다. 로비가 카드 존재 여부로 이어하기를 거른다.
- `RecentPlay` 스토어의 키가 `cabinetId`라 **카드별로 하나만 남는다.** 마지막에 논 카드의 진행만 로비에 뜨고,
  다른 카드의 스냅숏은 세션 ID로 보존된다. 이번 범위에서 스토어 키를 바꾸지 않는다.

## 12. 테스트 관문

`packages/extract/test/old-maid.test.ts`

1. **감정 짝 보존** — `variants`의 `assetId`↔`emotion` 대응이 파일명에서 파싱한 값과 일치한다.
2. **매핑 사전** — 영문 태그 카드와 한글 태그 카드 양쪽에서 3종이 매핑된다.
3. **폴백 금지** — `pleased`가 없는 인물은 좌석 자격에서 빠지고, 다른 감정으로 대체되지 않는다.
4. **얼굴 승계** — 좌석 자격이 없는 인물의 그림도 카드 얼굴에는 들어간다.
5. **despair 대체** — `despair`가 없으면 `despairAssetId`가 `tense`와 같다.
6. **경계** — 자격 인물 3명이면 보고서에 사유가 남는다. 얼굴 11종 검사는 방어적 중립 카트리지 입력으로
   검증한다. 정상 추출에서는 자격 인물 4명 × 필수 표정 3종이 이미 얼굴 12종을 보장한다.
7. **모호 낱말** — `serious`·`smirk`만 가진 인물이 잘못된 반응으로 매핑되지 않는다.

`apps/web` 단위 테스트

8. **자기 검증** — 어댑터 결과가 `validateCartridge`를 통과한다.
9. **덱 구성** — 얼굴 N종에서 카드 2N+1장, `pairId === null`인 카드가 정확히 하나이며 `assetId`가 `null`이다.
10. **`tellStyle` 안정성** — 같은 지문이면 항상 같고, 서로 다른 지문 200개에서 세 성격이 모두 나온다.
11. **미달 반환** — 개방 조건 미달 입력에서 `null`을 반환한다.

`e2e/arcade.spec.ts`

12. 인물 4명 × 표정 3종 합성 카드를 넣으면 `내 카드 도둑잡기`가 열리고 배분이 끝난다. 데스크톱만 검사한다.
13. 인물 3명짜리 카드에서는 열리지 않고 사유가 보고서에 보인다.

## 13. 완료 조건

- `pnpm boundaries`·`pnpm typecheck`·`pnpm test`·빌드 전부 통과.
- 12절 관문 13개 전부 통과.
- **테메로세 도둑잡기 회귀 통과.** 같은 규칙 코어를 공유하므로 기존 대국·저장·E2E가 그대로여야 한다.
- 기존에 저장된 `analyzed-card/0.2` 카드가 원본이 남아 있으면 `0.3`으로 승급되고, 실패해도 앱이 죽지 않는다.
- 로비 초기 JS gzip 200KiB 예산 유지. 새 화면은 지연 청크다.
- 한 판 진행 중 버림패 카드가 깨지지 않는다(에셋 고정 확인).
- 자격 미달 카드에서 캐비닛이 열리지 않고 보고서에 사유가 표시된다.

## 14. 비범위

- **매 판 `tellStyle` 재배정** — 상태 필드가 필요하고 이어하기에서 성격이 바뀐다. 별도 관문.
- **개인 카드 대사** — 원칙 1(무LLM)과 원칙 2(설정 발명 금지) 양쪽을 위반한다. 침묵이 정답이다.
- **여러 카드 혼합 덱.**
- **`RecentPlay` 다중 카드 지원** — 스토어 키 변경이 필요하다.
- **컨디션 축·관찰 횟수 제한** — SPEC-A5 §11과 동일하게 재미 관문 뒤로 미룬다.
