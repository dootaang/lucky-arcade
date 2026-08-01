# SPEC-A38 — 카지노 인물 표기: 시리즈 칩과 감정 초상

> 상태: 명세. 구현 미착수.
>
> 배경: 원장 1.2 활성화(`8372b41`)와 시리즈 NPC 활성화(`259f156`) 이후 카지노 화면에
> 두 가지 어긋남이 생겼다. ① `profile.name`이 `qualifiedName`으로 바뀌면서 한 줄이
> `"라일라 · Bestiaization"`처럼 길어졌고 동명이인이 21종으로 늘었다. ② 초상 팩
> `temerosa-series-npcs/0.2.0`이 113명 × 감정 4종을 담고 있는데 리졸버가 중립만
> 노출해 감정 자산이 화면에 닿지 못한다.

## 1. 문제

### 1.1 이름이 한 덩어리다

`temerosa-flow-profiles.ts:121,123`이 `name: record.qualifiedName`으로 프로필을 만든다.
따라서 UI가 받는 이름은 항상 `"<한글 이름> · <시리즈>"` 한 문자열이다.

```text
라일라 · Overture
라일라 · √2
라일라 · Bestiaization
```

명예의 전당 행, 라이브 테이프, 좌석 칩, 관전 배당이 전부 이 문자열을 그대로 출력한다.
좁은 칸에서는 `ellipsis`로 잘려 `"라일라 · Bes…"` 또는 `"이슈메…"`가 되고, 시리즈가
먼저 잘리면 동명이인을 구분할 수 없다.

동명이인 실측: **21종**, 그중 3중복이 3건(`라일라`, `페일`, `니은`).
**같은 시리즈 안에서 겹치는 이름은 0건**이므로 시리즈 표기는 유일하고 충분한 식별자다.
즉 잘려도 되는 부분은 이름이 아니라 없고, 시리즈는 절대 잘리면 안 된다.

### 1.2 감정 초상이 화면에 닿지 않는다

`temerosa-content.ts:148-157`은 매니페스트를 읽어 감정 맵까지 번들에 싣는다.

```ts
assets[npc.npcId] = Object.freeze(Object.fromEntries(
  Object.entries(npc.md).map(([emotion, variant]) => [emotion, seriesNpcContentUrl(variant.path)])));
```

그런데 `resolveTemerosaSeriesNpcPortrait(npcId, intent)`의 `intent`가 `"sm" | "detail"`
뿐이라 `bundle.assets`는 한 번도 읽히지 않는다. 매니페스트 실측:

| 항목 | 값 |
| --- | --- |
| 전체 | 116명 |
| 초상 보유 | 113명 |
| 미보유 | 3명 (`overture:mortem`, `bestiaization:leviathan`, `bestiaization:sherirus`) |
| md 감정 | `neutral` / `pleased` / `tense` / `despair` 각 113명 |

`overture:mortem`은 `temerosa-content.ts:166`이 `root2:mortem`으로 대체 매핑하므로
실질 미보유는 2명이다.

## 2. 요구사항

### 2.1 시리즈 칩

인물 이름을 출력하는 모든 자리에서 `qualifiedName`을 **이름**과 **시리즈**로 쪼개
시리즈를 칩으로 렌더한다.

```text
[아바타] 라일라  (Bestiaization)
```

- 분리 기준은 마지막 `" · "` 구분자다. 구분자가 없으면(보존 정체 등) 칩 없이 이름만 출력한다.
- 이름은 `text-overflow: ellipsis`로 줄여도 되지만 **칩은 절대 줄이거나 숨기지 않는다**.
  좁은 칸에서는 칩을 다음 줄로 흘린다.
- 시리즈별 색을 준다. 값은 구현자 재량이되 네 시리즈가 서로 구분되고 골드 CTA와
  경쟁하지 않아야 한다. 파랑 계열 `#68b8ee`는 `npc-income` 유입 전용이므로 쓰지 않는다.

적용 자리: 명예의 전당 행, 기록실 전체 순위표, 기록실 인물 상세 머리글,
`자주 만난 상대`, 라이브 테이프, 최근 정산, 좌석 칩 툴팁, 관전 배당 선택지.

### 2.2 감정 초상

`resolveTemerosaSeriesNpcPortrait`에 감정 의도를 추가하고, **얼굴이 40px 이상인 자리에만** 쓴다.

```ts
export type TemerosaSeriesNpcPortraitIntent = "sm" | "detail" | { emotion: "neutral" | "pleased" | "tense" | "despair" };
```

- 감정 자산은 `md`(411×600, 약 33KB)뿐이다. 27px 좌석 칩에 쓰면 카드 6장 × 3좌석에
  600KB가 든다. **40px 미만 자리는 기존 `sm` 중립을 유지한다.**
- 감정 선택 규칙은 기간 순손익 기준으로 한다.
  `> 0 → pleased`, `= 0 → neutral`, `-99 ~ -1 → tense`, `<= -100 → despair`.
- 감정 자산이 없으면 `neutral`로, `neutral`도 없으면 기존 이니셜 폴백으로 내려간다.

적용 자리(현재 크기 기준):

| 자리 | 크기 | 처리 |
| --- | --- | --- |
| 관전 배당 선택지 | 44px 이상으로 키움 | 감정 |
| 기록실 인물 상세 머리글 | 54px | 감정 |
| 명예의 전당 1~3위 초상 | 34px | 중립 유지 |
| 좌석 칩 · 테이프 | 24~27px | 중립 유지 |

### 2.3 초상 로딩

`useCasinoLedgerPortrait`는 비동기다. 현재는 도착 시 `hidden` 토글이라 팝이 생긴다.
이니셜 위에 초상을 겹치고 `opacity` 전환으로 바꾼다. 레이아웃 시프트가 없어야 한다.
`sm`이 137×200 세로형이므로 원형 크롭에는 `object-position: center 20%`를 준다.

## 3. 건드릴 파일

| 파일 | 작업 |
| --- | --- |
| `apps/web/src/lib/temerosa-content.ts` | `TemerosaSeriesNpcPortraitIntent`에 감정 추가, `resolveTemerosaSeriesNpcPortrait`가 `bundle.assets`를 읽도록 |
| `apps/web/src/lib/temerosa-content.test.ts` | 감정 의도 해석·폴백 테스트 |
| `cabinets/casino-ledger/src/react/casino-ledger-panel.tsx` | 이름 분리 헬퍼, 칩 렌더, 감정 의도 전달, 크로스페이드 |
| `cabinets/casino-ledger/src/react/casino-ledger-panel.css` | 칩 스타일, 초상 전환, `object-position` |
| `cabinets/casino-ledger/src/react/casino-ledger-panel.test.ts` | 이름 분리와 감정 선택 규칙 테스트 |
| `apps/web/src/features/casino-ledger/casino-side-market.tsx` | 배당 선택지에 44px 초상 + 칩 |
| `apps/web/src/features/casino-ledger/casino-side-market.css` | 위 레이아웃 |

## 4. 금지사항

- **`profile.name` 생성 규칙을 바꾸지 않는다.** `temerosa-flow-profiles.ts`의
  `name: record.qualifiedName`은 그대로 둔다. 분리는 표시 계층에서만 한다.
- **`temerosa-series-npcs` 매니페스트와 자산을 재생성하지 않는다.** 이미 있는 것을 읽기만 한다.
- **40px 미만 자리에 `md` 감정 자산을 쓰지 않는다.** 대역폭 규정이다.
- **파랑 `#68b8ee`를 시리즈 칩이나 상태 표현에 쓰지 않는다.** `npc-income` 유입 전용이다.
- **`ca-*` 네임스페이스에 새 클래스를 만들지 않는다.** `packages/ui/src/casino.css`의
  파일 상단 주석이 정한 규칙이다. 원장 전용 클래스는 `casino-ledger-panel.css`에 둔다.
- **블러 생성 레이어를 늘리지 않는다.** `casino.css` 예산 규칙은 화면당 3개까지다.
- 터치 타겟을 44px 미만으로 만들지 않는다.
- `prefers-reduced-motion`에서 크로스페이드를 끈다.

## 5. 완료 조건

1. `pnpm boundaries && pnpm -r typecheck && pnpm -r test`가 통과한다.
2. 명예의 전당과 기록실에서 `라일라` 3명이 각각 `Overture` / `√2` / `Bestiaization`
   칩으로 구분되고, 어느 칸에서도 칩이 잘리지 않는다.
3. 관전 배당 선택지 4칸에 44px 이상 초상이 뜨고, 기간 순손익 부호에 따라
   서로 다른 감정이 최소 2종 이상 나타난다.
4. 기록실 인물 상세 머리글 초상이 그 인물의 기간 순손익에 맞는 감정으로 뜬다.
5. 좌석 칩과 라이브 테이프는 `md` 자산을 요청하지 않는다.
   네트워크 탭에서 `assets/md/`가 배당·기록실 진입 전에는 받아지지 않아야 한다.
6. 초상 미보유 2명(`bestiaization:leviathan`, `bestiaization:sherirus`)이 이니셜로
   뜨고 깨진 이미지 아이콘이 보이지 않는다.
7. 초상 도착 시 레이아웃이 흔들리지 않는다(CLS 0).
8. 다크·라이트 두 테마에서 칩 글자 대비가 4.5:1 이상이다.
9. 1440px과 390px 두 폭에서 가로 스크롤이 생기지 않는다.

## 6. 참고

- 시리즈 라벨 정본은 `qualifiedName`의 꼬리다. 현재 값은 `Overture` / `√2` /
  `Bestiaization` / `Finale`이다. `Bestiaization`은 영어 철자로는 `Bestialization`이
  맞지만 시리즈 키 `bestiaization`과 맞춘 코드베이스 표기이므로 그대로 따른다.
- 감정 자산 27명은 `visualReview.status === "owner-review-needed"`다. 플레이어 화면에
  이 상태를 노출하지 않는다. 관리자 시험 입장 화면에 표시하는 것은 별건으로 다룬다.
- 목업: 이 명세의 시각적 기준은 rev.4 목업의 관전 배당 칸과 기록실 상세 머리글이다.
