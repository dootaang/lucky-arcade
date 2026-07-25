# SPEC-A11 — 트럼프 덱 반입

> 상태: v1.1 구현·감사 완료 (2026-07-25). 선행 없음.
>
> 핍 카드 40장은 이미 `@lucky-arcade/ui/playing-card`에 벡터로 들어와 있다(커밋 `b5b86f2`).
> 이 문서는 **남은 그림 카드 13장을 리포로 들여오는 계약**이다.

## 1. 배경

원본 폴더 `C:\freetalk\테메로세\트럼프`를 실측한 결과는 다음과 같다.

| 항목 | 상태 |
|---|---|
| `트럼프.png` (A~10 × 4무늬) | 731×392, **카드 한 장이 73×98px**, 격자가 10으로 나눠떨어지지 않음 → **사용 불가** |
| J·Q·K 12장 + 조커 | 337×518 일러스트 (일부 예외) → **사용 가능** |

핍 카드는 배치가 규격이므로 벡터로 그려 넣었다. 해상도 제한이 사라졌고 이미지 요청이 0이 됐다.
**남은 13장은 실제 일러스트라 벡터화할 수 없다.** 한 판에 덱 전체를 쓰는 게임들이므로 아틀라스가 맞다.

## 2. 설계 결정과 근거

| 결정 | 근거 |
|---|---|
| 그림 13장만 아틀라스로 묶는다 | **전부 쓰면 아틀라스, 일부만 쓰면 개별 파일.** 테메로세 초상은 매 판 일부만 쓰므로 아틀라스가 손해다 |
| SpriteSmith를 쓰지 않는다 | 이미 `content-cli`에 sharp가 있고, 균일 격자라 빈 패킹 알고리즘이 할 일이 없다. 의존성을 늘리지 않는다 |
| 퍼센트 스프라이트 공식을 쓰지 않는다 | 여백과 공존하지 못한다. 트럼프 카드는 **검은 테두리**라 여백 없이 붙이면 옆 카드 선이 샌다 |
| px 피치 + `--scale` 변수로 자른다 | 여백과 공존하고 서브픽셀 반올림에 강하다. 크기는 변수 하나로 바꾼다 |
| `sm`·`md` 두 장을 만든다 | 한 장만 두면 모바일이 큰 시트의 디코드 메모리를 계속 물고 있다 |
| 별도 매니페스트 계약을 만든다 | 기존 `temerosa-content-manifest`는 **에셋 1개 = 파일 1개**를 전제한다. 억지로 늘리면 감사 논리가 꼬인다 |

## 3. 건드릴 파일

### 신규

| 파일 | 내용 |
|---|---|
| `apps/content-cli/src/playing-cards.ts` | 원본 → 아틀라스·매니페스트 컴파일 |
| `apps/content-cli/src/audit-playing-cards.ts` | 매니페스트 감사기 |
| `apps/content-cli/test/playing-cards.test.ts` | 프레임 배치·경계 검증 |
| `packages/ui/src/court-card.tsx` | 아틀라스 슬라이스 컴포넌트 |
| `packages/ui/test/court-card-layout.test.ts` | 프레임 좌표 계산 검증 |
| `apps/web/public/content/playing-cards/1.0.0/` | `court-atlas-sm.webp` · `court-atlas-md.webp` · `manifest.json` |

### 수정

| 파일 | 변경 |
|---|---|
| `packages/contracts/src/index.ts` | `spriteAtlasManifestSchema` 신설 |
| `packages/ui/src/playing-card.tsx` | `court-card.tsx` 재수출 |
| `package.json` | `content:cards` · `content:cards:audit` 스크립트 |
| `docs/THIRD_PARTY_PROVENANCE.md` | 트럼프 도안 출처 기록 |

## 4. 금지사항

1. **`트럼프.png`를 소재로 쓰지 않는다.** 73×98px이고 격자가 정수가 아니다.
2. **핍 카드를 이미지로 되돌리지 않는다.** 이미 벡터다.
3. **테메로세 초상 파이프라인을 아틀라스로 바꾸지 않는다.** 일부만 쓰는 에셋은 손해다.
4. **새 의존성을 추가하지 않는다.** sharp로 충분하다.
5. **퍼센트 `background-position` 공식을 쓰지 않는다.**
6. **아틀라스를 초기 청크에 넣지 않는다.** 캐비닛 진입 뒤에 받는다.
7. **접근성을 잃지 않는다.** `background-image`는 접근성 트리에 이름을 남기지 않으므로 `role="img"`와 이름을 반드시 준다.
8. **출처가 확인되지 않은 도안을 반입하지 않는다.** 5절을 먼저 통과한다.

## 5. 출처 기록 — 먼저 한다

`docs/THIRD_PARTY_PROVENANCE.md`에 항목을 추가한다. **이 기록 없이 에셋을 커밋하지 않는다.**

- 오너가 2026-07-25에 특정 렌더링본의 사용·가공·내장·배포 허가 절차를 통과했음을 확인했다.
- 표준 트럼프 문양 자체는 전통 도안이지만 **특정 렌더링본은 별개**다. 공개 도안이라는 추정에 기대지 않는다.
- 이 리포는 `라이선스 불명 코드는 이식하지 않는다`를 규약으로 두고 있고, 소녀전선 에셋 건으로 한 번 지적된 자리다.

## 6. 컴파일 계약

`pnpm content:cards -- "C:\freetalk\테메로세\트럼프"`

- 대조표는 육안 확인으로 확정됐다. 코드에 그대로 둔다.

```
J.webp   → spades-j     퀸.webp  → spades-q     킹.webp  → spades-k
J2.webp  → hearts-j     Q.webp   → hearts-q     K.webp   → hearts-k
J3.webp  → diamonds-j   Q3.webp  → diamonds-q   K2.webp  → diamonds-k
J4.webp  → clubs-j      Q4.webp  → clubs-q      K3.webp  → clubs-k
Joker.webp → joker
```

- 격자는 **4열 × 4행**, 13장 배치 후 3칸이 빈다.
- 여백은 **4px 투명**이다. 테두리 누출을 막는다.
- 두 단계를 굽는다.

| 단계 | 셀 | 시트 | 용도 |
|---|---|---|---|
| `sm` | 112×172 | 460×700 | 모바일·목록 |
| `md` | 224×344 | 908×1388 | 데스크톱·상세 |

- 비율이 다른 원본은 `fit: contain` + 투명 배경으로 레터박스한다. `Joker.webp`(1.45)와 `J2.webp`가 해당한다.
- `J2.webp`는 원본이 195×300뿐이라 `md`에서 확대된다. **덱에서 가장 흐린 카드**임을 매니페스트 경고에 남긴다.

## 7. 매니페스트 계약

`packages/contracts`에 둔다.

```ts
export const spriteAtlasFrameSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  col: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
});

export const spriteAtlasSheetSchema = z.object({
  size: z.enum(["sm", "md"]),
  path: z.string().min(1),
  mime: z.literal("image/webp"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cell: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  gutter: z.number().int().nonnegative(),
  bytes: z.number().int().positive(),
});

export const spriteAtlasManifestSchema = z.object({
  contract: z.literal("sprite-atlas/0.1"),
  atlasId: z.literal("playing-cards"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  frames: z.array(spriteAtlasFrameSchema).min(1),
  sheets: z.array(spriteAtlasSheetSchema).min(1),
  warnings: z.array(z.string()),
});
```

## 8. 감사기

`pnpm content:cards:audit -- "apps/web/public/content/playing-cards/1.0.0/manifest.json"`

기존 테메로세 감사기와 같은 규율을 적용한다.

- 실제 바이트 시그니처가 WebP다. 확장자를 믿지 않는다.
- 선언 크기와 실제 파일 크기·픽셀 크기가 일치한다.
- **프레임이 시트 밖으로 나가지 않는다** — `col*(cell.w+gutter)+cell.w <= width`.
- **프레임 좌표가 중복되지 않는다.**
- **프레임 ID가 중복되지 않고 13개 전부 있다.**
- 경로 탈출이 없다.

## 9. 소비 계약

`packages/ui/src/court-card.tsx` — `@lucky-arcade/ui/playing-card`에서 함께 내보낸다.

```ts
export type PlayingCardCourtRank = "j" | "q" | "k";
export type CourtCardId = `${PlayingCardSuit}-${PlayingCardCourtRank}` | "joker";

export interface CourtAtlas {
  url: string;
  cols: number;
  cell: { w: number; h: number };
  gutter: number;
  sheet: { width: number; height: number };
  frames: Readonly<Record<string, { col: number; row: number }>>;
}

export interface CourtCardProps {
  atlas: CourtAtlas;
  id: CourtCardId;
  scale?: number;      // 기본 1
  className?: string;
  label?: string;
  decorative?: boolean;
}
```

CSS는 px 피치를 쓴다. 퍼센트 공식을 쓰지 않는다.

```css
.court-card{
  width: calc(var(--cell-w) * var(--scale));
  height: calc(var(--cell-h) * var(--scale));
  background-image: var(--atlas);
  background-size: calc(var(--sheet-w) * var(--scale)) calc(var(--sheet-h) * var(--scale));
  background-position:
    calc(var(--col) * -1 * var(--pitch-x) * var(--scale))
    calc(var(--row) * -1 * var(--pitch-y) * var(--scale));
  background-repeat: no-repeat;
}
```

- 좌표 계산은 **DOM 없는 순수 함수**로 분리해 테스트한다.
- 접근성: `decorative`면 `aria-hidden`, 아니면 `role="img"` + 한국어 이름(`하트 킹`, `조커`).
- 아틀라스 URL과 매니페스트 로딩은 **앱이 주입**한다. `packages/ui`가 경로를 알지 않는다.

## 10. 테스트 관문

1. **좌표** — 각 프레임의 배경 오프셋이 `col*(cell+gutter)`와 일치한다.
2. **배율** — `scale` 0.5에서 크기·오프셋이 정확히 절반이다.
3. **경계** — 13개 프레임이 모두 시트 안에 들어간다.
4. **중복 없음** — 좌표와 ID 모두 중복이 없다.
5. **접근성** — `decorative`가 아니면 이름이 붙고, 맞으면 `aria-hidden`이다.
6. **감사기** — 프레임을 시트 밖으로 옮긴 매니페스트가 실패한다.
7. **감사기** — MIME을 위조한 매니페스트가 실패한다.
8. **컴파일 재현** — 같은 원본에서 두 번 구우면 프레임 표가 동일하다.

## 11. 완료 조건

- `pnpm boundaries`·`pnpm typecheck`·`pnpm test`·빌드 통과.
- 10절 관문 8개 통과.
- `pnpm content:cards:audit`가 통과하고 경고에 `J2` 해상도 항목이 남는다.
- PROVENANCE에 트럼프 항목이 있다.
- **로비 초기 JS·이미지 예산이 그대로다.** 아틀라스는 캐비닛 진입 뒤에만 받는다.
- 52장 + 조커가 한 화면에서 같은 배율로 정렬된다. 핍은 벡터, 그림은 아틀라스지만 캔버스가 337×518로 같다.

## 12. 비범위

- **카드 뒷면 일러스트** — `PlayingCardBack`이 벡터로 이미 있다.
- **다른 덱 스킨·세계관 덱** — 색 변수로 열려 있지만 v1은 표준 도안 하나다.
- **원본 폴더의 `deck/pips/` 정리** — 리포 밖이며 컴포넌트가 이미 대체했다.
- **트럼프 게임 자체** — [SPEC-A12](./SPEC-A12-indian-poker.md)다.
