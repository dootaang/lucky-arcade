# SPEC-A7 — 도둑잡기 버림패 연출 수리

> 상태: v1.1 구현 완료 (2026-07-25). 표현 계층 전용 수리이며 규칙·판정·저장을 바꾸지 않는다.
>
> 선행: [SPEC-A5](./SPEC-A5-old-maid-seat-dialogue.md)가 먼저 착지해야 한다.
> 같은 파일(`cabinets/old-maid/src/react/old-maid-screen.tsx`, `old-maid.css`)을 건드린다.

## 1. 고칠 두 가지

1. 버린 짝이 **누가 버렸든 테이블 정중앙 한 뼘에만** 쌓인다.
2. 카드를 던지는 동안 **얼굴 이름·버튼 라벨·버튼 테두리가 같이 날아간다.**

## 2. 원인

### 2.1 좌석이 위치에 반영되지 않는다

`DiscardPile`(`old-maid-screen.tsx:391`)이 위치를 **버린 순서로만** 계산한다.

```ts
const column = index % 5 - 2;                          // -2 … +2
const row = Math.floor(index / 5);
"--pile-x": `${column * 18 + row * 4}px`,              // 대략 -36 … +44px
"--pile-y": `${row * 15 + Math.abs(column) * 2}px`,    // 0 … 34px
"--pile-angle": `${discardAngle(discard.ownerId)}deg`, // 좌석이 쓰이는 유일한 곳
```

좌석은 **회전각에만** 반영된다. 퍼지는 폭은 가로 80px·세로 34px인데 중앙 테이블은 데스크톱에서
420~700 × 430px다. ROADMAP은 이미 "버린 짝은 각 좌석 방향으로 … 그 방향 그대로 남으며"라고 적어 두었으므로
이것은 새 기능이 아니라 **문서와 구현의 간극**이다.

### 2.2 애니메이션 대상이 버튼 전체다

`throwPair`가 `optionRefs`에 담긴 **버튼 노드**를 애니메이션한다.

```tsx
<button ref={node => optionRefs.current.set(key, node)}>   // ← 이것이 날아간다
  <span className="old-maid-discard-pair">
    <CardFace/><CardFace/>                                  // 각 카드 안에 <strong>{face.name}</strong>
  </span>
  <strong>{playerControls ? "이 짝 버리기" : `${face.name} 버리는 중…`}</strong>
</button>
```

따라서 날아가는 물체에 얼굴 이름 두 개, 버튼 라벨 하나, 그리고 버튼의
`border`·`background`·`border-radius`가 함께 붙는다.

더미에는 이미 이름을 숨기는 규칙이 있다(`old-maid.css:25`의 `.old-maid-pile-pair .old-maid-card strong{display:none}`).
`.old-maid-discard-pair`에는 같은 규칙이 없어, **날아가는 동안만 이름이 보였다가 착지하면 사라진다.**

### 2.3 두 문제는 엮여 있다

던지기는 좌석에서 출발해 **오버레이 정중앙의 버튼 위치**로 착지하고, 그 뒤 오버레이가 닫히면서
카드가 **더미의 index 슬롯으로 순간이동**한다. 지금은 더미도 중앙 근처라 점프가 잘 안 보인다.

**2.1을 고쳐 카드를 넓게 흩뿌리면 이 점프가 즉시 눈에 띈다.** 2.1만 고치면 새 거슬림이 생긴다.

## 3. 건드릴 파일

| 파일 | 변경 |
|---|---|
| `cabinets/old-maid/src/react/pile-layout.ts` | **신규**. DOM 없는 순수 배치 계산 |
| `cabinets/old-maid/src/react/old-maid-screen.tsx` | 애니메이션 대상 축소, 더미 산포·착지 연출 |
| `cabinets/old-maid/src/react/old-maid.css` | 좌석 방향 변수, 텍스트 숨김, 슬롯 래퍼 |
| `cabinets/old-maid/test/pile-layout.test.ts` | **신규**. 결정론 검증 |

## 4. 금지사항

1. **`engine.ts`·`contracts.ts`를 수정하지 않는다.** `OldMaidState`와 `discards` 구조는 그대로다.
2. **`Math.random()`·`Date.now()`를 배치 계산에 쓰지 않는다.** 리렌더마다 카드가 튀고 재현성이 깨진다.
3. **`resultHash`에 영향이 없어야 한다.** 이 작업은 화면만 바꾼다.
4. **SPEC-A5의 말풍선 로직·`.old-maid-speech` 스타일을 건드리지 않는다.**
5. **선택 단계에서는 얼굴 이름을 지우지 않는다.** 어느 짝을 버릴지 읽어야 한다. 던지는 동안에만 감춘다.
6. **새 `aria-live` 영역을 만들지 않는다.**
7. **방향 벡터를 JS에 하드코딩하지 않는다.** 5.2의 이유로 CSS에 둔다.

## 5. 단계별 계약

### 5.1 1단계 — 날아가는 것을 카드만으로 줄인다

가장 작고 부작용이 없다. 먼저 착지시킨다.

**애니메이션 대상 축소** — `optionRefs`가 버튼 대신 안쪽 `.old-maid-discard-pair` span을 담는다.
이동은 상대 translate이므로 계산식은 그대로 동작한다.

```tsx
<span className="old-maid-discard-pair" ref={node => { if (node) optionRefs.current.set(key, node); else optionRefs.current.delete(key); }}>
```

버튼 테두리·배경·라벨은 제자리에 남고 카드 두 장만 날아간다.

**텍스트 숨김** — 더미에 이미 있는 규칙을 던지는 동안에도 적용한다.

```css
.old-maid-discard-options>button.throwing .old-maid-card strong{display:none}
.old-maid-discard-options>button.throwing>strong{opacity:0;transition:opacity .12s}
```

### 5.2 2단계 — 좌석 기반 산포

**방향은 CSS에 둔다.** 모바일에서 레이아웃이 접히기 때문이다.

데스크톱(`min-width:901px`)은 3면 좌석이다.

```
.seat-cpu-1  grid-column:2 row:1  → 위
.seat-cpu-2  grid-column:1 row:2  → 왼쪽
.seat-cpu-3  grid-column:3 row:2  → 오른쪽
player                            → 아래
```

태블릿·모바일(`max-width:900px`)에서는 `.old-maid-table`이 단일 열로 접히고 **CPU 셋이 모두 중앙 위쪽에 나란히** 놓인다.
방향 벡터를 JS에 하드코딩하면 모바일에서 cpu-2가 왼쪽으로 날아가는 엉뚱한 그림이 된다.
미디어 쿼리가 알아서 처리하도록 CSS 변수로 둔다.

```css
.old-maid-pile-slot[data-owner="cpu-1"]{--pile-base-x:0px;--pile-base-y:-96px}
.old-maid-pile-slot[data-owner="cpu-2"]{--pile-base-x:-96px;--pile-base-y:0px}
.old-maid-pile-slot[data-owner="cpu-3"]{--pile-base-x:96px;--pile-base-y:0px}
.old-maid-pile-slot[data-owner="player"]{--pile-base-x:0px;--pile-base-y:96px}

@media(max-width:900px){
  .old-maid-pile-slot[data-owner="cpu-2"]{--pile-base-x:-51px;--pile-base-y:-51px}
  .old-maid-pile-slot[data-owner="cpu-3"]{--pile-base-x:51px;--pile-base-y:-51px}
}
```

숫자 방향과 길이를 `calc()` 안에서 곱하는 문법은 브라우저별 typed arithmetic 지원에 기대게 된다.
좌석별 길이 오프셋 자체를 CSS에 두면 같은 책임 분리를 더 안전하게 지킨다. `680px`에서는 이를 한 번 더 줄인다.

**흔들림은 결정론으로 계산한다.** 새 순수 모듈에 둔다.

```ts
// cabinets/old-maid/src/react/pile-layout.ts — DOM 없음
import { XorShift32 } from "@lucky-arcade/engine";

export interface PileOffset { x: number; y: number; rotation: number; }

export function pileOffset(seed: string, index: number, cardId: string): PileOffset {
  const rng = new XorShift32(`${seed}:pile:${index}:${cardId}`);
  return {
    x: (rng.nextUint32() % 57) - 28,   // ±28px
    y: (rng.nextUint32() % 57) - 28,
    rotation: (rng.nextUint32() % 21) - 10,  // ±10°
  };
}
```

난수 호출 순서를 이 순서로 고정한다. `cardId`는 `discard.cardIds[0]`을 쓴다.

**index 격자(`column`/`row`) 계산은 제거한다.** 좌석 방향과 충돌한다. 정적 슬롯의 z-index는 1로 고정하고
같은 stacking level의 DOM 순서로 최근 카드가 위에 오게 한다.

**회전 흔들림을 반드시 포함한다.** 지금은 플레이어가 버린 짝이 전부 정확히 0°라 던진 것이 아니라
반듯하게 정렬해 둔 것처럼 보인다.

최종 변형:

```css
.old-maid-pile-slot{
  position:absolute;left:50%;top:55%;z-index:var(--pile-z);
  transform:translate(
    calc(-50% + var(--pile-base-x) + var(--jitter-x)),
    calc(-50% + var(--pile-base-y) + var(--jitter-y))
  ) rotate(calc(var(--pile-angle) + var(--jitter-r)));
}
```

`.old-maid-center`가 `border-radius:50%/20%`에 `overflow:hidden`이므로 좌우로 크게 밀면 타원 가장자리에서 잘린다.
96px 기준에서 살짝 걸치는 것은 테이블 턱에 얹힌 것처럼 보이므로 허용한다. 카드가 절반 이상 사라지면 실패다.

### 5.3 3단계 — 착지 지점 일치

**연출 주체를 오버레이에서 더미로 옮긴다.** 오버레이는 *고르는 일*만 하고, 카드가 실제로 놓이는 곳에서 움직인다.

- `DiscardStage`의 `throwPair`는 이동 애니메이션 없이 짧은 선택 표시 뒤 `onDiscard(pair)`를 호출한다.
  1단계에서 만든 텍스트 숨김 규칙은 이 짧은 구간에도 그대로 적용한다.
- `DiscardPile`이 **새로 추가된 마지막 짝**을 마운트 시 좌석에서 자기 슬롯으로 날아 들어오게 한다.

```tsx
const seenRef = useRef(state.discards.length); // 복구 시 과거 버림을 다시 재생하지 않는다
useEffect(() => {
  if (state.discards.length < seenRef.current) { seenRef.current = state.discards.length; return; }  // restart
  if (state.discards.length === seenRef.current) return;
  const index = state.discards.length - 1;
  const frame = requestAnimationFrame(() => {
    // pairRefs.get(index)를 [data-deal-target="${ownerId}"]에서 자기 자리로 애니메이션
    seenRef.current = state.discards.length;
  });
  return () => cancelAnimationFrame(frame);
}, [state.discards.length]);
```

`seenRef` 갱신은 `requestAnimationFrame` 안에서 한다. 개발 StrictMode가 첫 effect를 설치 직후 정리해도
취소된 첫 실행이 항목을 본 것으로 기록하지 않아 두 번째 effect가 실제 애니메이션을 수행한다.

더미 컨테이너는 새 stacking context를 만들지 않는다. 일반 슬롯은 모두 `z-index:1`로 두고 DOM 순서로 최근 카드가
위에 놓이게 한다. **도착 중인 슬롯만** `data-arriving="true"`와 `z-index:2`를 받아 쌓인 더미 위에 얹히고,
착지가 끝나면 속성을 제거해 같은 층으로 돌아간다. DOM 순서상 마지막이므로 속성이 빠져도 위에 남는다.

도착 슬롯을 진행 UI(`z-index:3`) 위로 올리지 않는다. 올리면 플레이어가 뒷면 카드를 고르는 동안 날아온 카드가
그 열을 잠깐 덮었다가 밑으로 빠지는 것이 보인다. **스테이지 커튼이 투과되므로 위로 올릴 이유가 없다** —
커튼이 불투명하던 시절에는 도착 카드를 그 위로 올려야 보였지만, 지금은 커튼 너머로 더미 전체가 비친다.

**변형 충돌 주의.** 슬롯의 정지 위치는 CSS 변수로 조립한 `transform`이다. 같은 요소에 WAAPI로
`transform` 키프레임을 주면 정지 위치가 덮인다. 따라서 **바깥 슬롯과 안쪽 카드 묶음을 분리한다.**

```tsx
<div className="old-maid-pile-slot" data-owner={discard.ownerId} style={slotStyle}>
  <div className="old-maid-pile-pair" ref={node => pairRefs.current.set(index, node)}>
    <CardFace/><CardFace/>
  </div>
</div>
```

바깥이 정지 위치를 소유하고 안쪽만 애니메이션한다. 안쪽에는 CSS `transform`을 두지 않는다.

- `prefers-reduced-motion: reduce`면 지속 시간을 90ms로 줄인다. 기존 `throwPair`·`DealingAnimation`과 같은 처리다.
- 좌석 요소를 찾지 못하면 애니메이션을 건너뛰고 카드는 제자리에 그대로 나타난다. 진행이 막히면 안 된다.
- CPU 차례와 플레이어 차례가 **같은 경로**를 타므로 연출이 통일된다.

## 6. 테스트 관문

`cabinets/old-maid/test/pile-layout.test.ts`

1. **결정론** — 같은 `(seed, index, cardId)`는 항상 같은 `PileOffset`. 100회 반복 동일.
2. **범위** — 1,000개 표본에서 `x`·`y`가 −28…28, `rotation`이 −10…10을 벗어나지 않는다.
3. **분산** — 서로 다른 입력 200개에서 같은 값이 몰리지 않는다(고유값 비율 확인).
4. **난수 순서 고정** — `x` → `y` → `rotation` 순서를 바꾸면 실패하는 회귀 값을 고정한다.

기존 테스트

5. **판정 불변** — `cabinets/old-maid/test/engine.test.ts`의 10,000시드 회귀가 그대로 통과한다.

`e2e/arcade.spec.ts`

6. 데스크톱 완주 검사에서 `.old-maid-pile-slot`이 하나 이상 나타나고, 서로 다른 `data-owner`를 가진
   슬롯이 둘 이상일 때 두 슬롯의 계산된 위치가 서로 다르다.
7. 모바일 검사에서 버림패가 손패 영역과 뒷면 카드 열을 가리지 않는다.

## 7. 완료 조건

- `pnpm boundaries`·`pnpm typecheck`·`pnpm test`·빌드 통과.
- 6절 관문 7개 통과.
- 데스크톱·모바일 양쪽에서 **네 좌석의 버림패가 서로 다른 구역에 쌓인다.**
- 던지는 동안 얼굴 이름·버튼 라벨·버튼 테두리가 따라다니지 않는다.
- 카드가 착지한 뒤 **위치가 순간이동하지 않는다.**
- `prefers-reduced-motion`에서 즉시 표시되고 진행이 막히지 않는다.
- 같은 시드·같은 입력이면 버림패 위치가 항상 같다.
- 기존 테메로세 도둑잡기 대국·저장·이어하기가 그대로 동작한다.

## 8. 비범위

- 버림패 물리 시뮬레이션, 겹침 회피 알고리즘.
- 같은 좌석의 N번째 버림을 바깥쪽으로 밀어내는 추가 분산. 3~4장 겹침은 자연스러우므로 필요해지면 그때 넣는다.
- 버림패 클릭·확대 등 상호작용 추가.
- 딜링·뽑기 연출 변경.
