# SPEC-A10 — 눈치싸움: 손패 재배열과 NPC 심리 3층

> 상태: v1.0 구현 계약 (2026-07-25).
>
> **선행: [SPEC-A8](./SPEC-A8-match-history.md).** ROADMAP은 도둑잡기 규칙 확장을 반복 플레이 수요 확인
> 뒤로 묶어 두었고, 그것을 잴 수단이 전적이다. 전적 데이터를 본 뒤 착수한다.
>
> 이 명세는 **앞으로 추가할 트럼프 게임들이 공유할 심리 코어**를 함께 만든다.

## 1. 지금 무엇이 반쪽인가

```ts
export function cpuDrawIndex(seed, turn, actorId, targetId, targetCardCount): number {
  const rng = new XorShift32(`${seed}:turn:${turn}:...`);
  return rng.nextUint32() % targetCardCount;   // 완전 무작위
}
```

**CPU는 아무 생각도 하지 않는다.** 플레이어만 NPC를 읽고 NPC는 주사위를 굴린다. 표정 시스템을 아무리
정교하게 만들어도 상대가 생각하지 않으면 심리전이 아니다.

그리고 반대 방향이 통째로 없다. **플레이어에게 속일 수단이 없다.** 손패 순서가 고정이라
조커를 어디에 꽂아 상대가 집게 만들지 고를 수 없는데, 그것이 정통 도둑잡기 심리의 핵심이다.

**알고리즘을 정교하게 만드는 것보다 플레이어에게 속일 수단을 주는 것이 먼저다.**

## 2. 설계 결정과 근거

| 결정 | 근거 |
|---|---|
| 손패 재배열을 먼저 넣는다 | 심리전을 양방향으로 만드는 최소 변경이다. CPU가 읽을 공개 사실도 여기서 처음 생긴다 |
| 심리를 3층으로 나눈다 | 트럼프 게임을 계속 추가할 것이므로, 새 게임은 **1층만** 쓰게 한다 |
| CPU에 손패 내용을 절대 넘기지 않는다 | 상대 패를 보는 AI는 강한 게 아니라 부정행위다. 지금 `cpuDrawIndex` 시그니처가 이미 구조로 막고 있다 |
| 관찰 횟수 제한은 상태에 넣지 않는다 | 데스크톱 호버는 의도적 행동이 아니라 연속적이다. 액션으로 만들면 로그가 범람하고 결정론이 지저분해진다 |
| `tellStyle`을 버리지 않고 4축의 프리셋으로 재정의한다 | 대사집이 `tellStyle` ↔ 화법 대응 위에 서 있다. 이름을 유지해야 인물 해석이 깨지지 않는다 |

## 3. ⚠ 저장 폐기 고지

손패 재배열은 **규칙 변경**이라 액션과 상태가 늘어난다.

```
old-maid-cartridge/0.5 → 0.6
old-maid-state/0.5     → 0.6
temerosa-old-maid/0.5  → 0.6
```

화면이 팩 버전으로 저장을 거르므로 **진행 중이던 대국은 폐기된다.** 완료된 전적과 지갑은
별도 스토어라 영향받지 않는다. 일회성 비용으로 받아들이고, 마이그레이션을 만들지 않는다.

## 4. 건드릴 파일

### 신규

| 파일 | 내용 |
|---|---|
| `packages/engine/src/persona.ts` | 4축 성격과 결정론 가중 선택. 게임 무관 |
| `packages/engine/test/persona.test.ts` | 축·가중·결정론 검증 |
| `cabinets/old-maid/src/read.ts` | 도둑잡기 1층 — 공개 정보 관측 |
| `cabinets/old-maid/test/read.test.ts` | 손패 미접근·관측 정확성 |

### 수정

| 파일 | 변경 |
|---|---|
| `cabinets/old-maid/src/contracts.ts` | `reorder_hand` 액션, `lastReorder` 상태, 계약 `0.6` |
| `cabinets/old-maid/src/engine.ts` | 재배열 리듀서, `cpuDrawIndex`를 가중 선택으로 교체, `tellReaction`을 4축 기반으로 |
| `cabinets/old-maid/src/cartridge.ts` | 팩 버전 `0.6` |
| `cabinets/old-maid/src/react/old-maid-screen.tsx` | 손패 드래그·이동 조작, 관찰 예산 표시 |
| `cabinets/old-maid/src/react/old-maid.css` | 재배열 손잡이, 예산 소진 표시 |
| `cabinets/old-maid/test/engine.test.ts` | 재배열·가중 선택 회귀 |
| `apps/web/src/lib/card-old-maid.ts` | 팩 버전 반영 |
| `e2e/arcade.spec.ts` | 재배열·관찰 예산 검사 |

## 5. 금지사항

1. **CPU 판정 함수에 `hands`·`cards`·`pendingDraw`의 카드 내용을 전달하지 않는다.** 타입으로 차단한다.
2. **`Math.random()`·`Date.now()`를 판정에 쓰지 않는다.**
3. **관찰 횟수를 `OldMaidState`에 넣지 않는다.** 화면 로컬이다.
4. **`tellStyle` 이름을 없애지 않는다.** 대사집과 카트리지가 그 위에 서 있다.
5. **성격을 화면에 라벨로 표기하지 않는다.** SPEC-A6의 결정 그대로다.
6. **관전 모드에서 플레이어 좌석도 CPU 규칙을 따른다.** 예외 분기를 만들지 않는다.
7. **재배열을 CPU 좌석에 주지 않는다.** 손패가 비공개이므로 관측 대상이 없다.

## 6. 1부 — 손패 재배열

### 액션

```ts
| { type: "reorder_hand"; from: number; to: number }
```

- `status === "playing"`이고 `currentPlayerId === "player"`이며 `mode === "play"`일 때만 허용한다.
- 범위 밖 인덱스는 `old_maid_reorder_index_invalid`로 거부한다.
- **턴을 소비하지 않는다.** `turn`은 그대로고 `sequence`만 오른다.
- 한 턴에 최대 **3회**까지 허용한다. 초과는 거부한다. 무한 섞기로 관측 정보를 지우지 못하게 한다.

### 상태

```ts
lastReorder: { turn: number; toIndex: number; count: number } | null;
```

카드가 움직이는 것은 **테이블에서 보이는 공개 사실**이므로 CPU가 읽어도 부정행위가 아니다.
`count`는 그 턴의 누적 횟수다.

### 화면

- 손패 카드를 좌우로 끌어 옮긴다. 드래그와 **키보드 조작(`←`/`→`)을 모두 제공**한다.
- 터치에서는 길게 누르기로 집는다. 기존 `첫 터치 확인 → 두 번째 터치 선택`과 충돌하지 않아야 한다.
- 남은 재배열 횟수를 손패 위에 조용히 표시한다.
- `prefers-reduced-motion`에서 이동 연출을 생략한다.

## 7. 2부 — 심리 3층

```
1층  공개 정보 관측     게임마다 새로 쓴다
2층  성격 4축           전 게임 공유
3층  표출               전 게임 공유
```

### 2층 — `packages/engine/src/persona.ts`

```ts
export interface Persona {
  riskAppetite: number;   // 0..1 위험한 선택을 선호하는 정도
  readAccuracy: number;   // 0..1 공개 정보를 실제 판단에 반영하는 정도
  deceptionBias: number;  // 0..1 표출을 왜곡하는 정도
  consistency: number;    // 0..1 같은 상황에서 같은 선택을 반복하는 정도
}

export const PERSONA_PRESETS: Readonly<Record<"open" | "guarded" | "bluffer", Persona>>;

/** 가중치 벡터에서 결정론적으로 하나를 고른다. */
export function weightedChoice(weights: readonly number[], seed: string): number;
```

프리셋:

| tellStyle | risk | read | deception | consistency |
|---|---|---|---|---|
| `open` | .50 | .50 | .00 | .85 |
| `guarded` | .35 | .70 | .30 | .70 |
| `bluffer` | .70 | .60 | .75 | .45 |

`weightedChoice`는 가중치 합으로 정규화한 뒤 시드 난수 한 번으로 고른다. 난수 호출 횟수를 **1회로 고정**한다.

### 1층 — `cabinets/old-maid/src/read.ts`

```ts
export interface OldMaidPublicRead {
  targetHandSize: number;
  targetDiscardCount: number;
  turnsSinceTargetDrew: number;
  reorderedThisTurn: boolean;
  reorderIndex: number | null;   // 플레이어가 마지막으로 옮겨 놓은 자리
}

export function publicRead(state: OldMaidState, targetId: OldMaidSeatId): OldMaidPublicRead;
```

`state.history`·`state.discards`·손패 **길이**·`lastReorder`만 본다. **카드 ID를 읽지 않는다.**

### 선택

```ts
export function cpuDrawIndex(
  persona: Persona,
  read: OldMaidPublicRead,
  seed: string,
  turn: number,
  actorId: OldMaidSeatId,
  targetId: OldMaidSeatId,
): number;
```

가중치 규칙:

- 기본 가중치는 모든 자리에 `1`이다.
- 플레이어가 이번 턴에 옮긴 자리는 `1 + readAccuracy * riskAppetite * 1.4`를 곱한다.
  방금 만진 자리를 **노리는** 쪽이다.
- 그 자리의 양옆은 `1 - readAccuracy * 0.25`를 곱한다. 옮기면서 밀려난 자리다.
- `consistency`가 낮을수록 전체 가중치에 `±(1 - consistency) * 0.35` 폭의 시드 흔들림을 준다.
- 최종 선택은 `weightedChoice`로 한 번에 뽑는다.

**같은 시드·턴·좌석·공개 정보면 항상 같은 자리를 고른다.**

### 3층 — 표출

기존 `tellReaction`·`inspectCardReaction`의 `tellStyle` 분기를 `deceptionBias`로 다시 쓴다.
**현재 확률 곡선을 유지한다.** 프리셋 값이 지금 확률표를 재현하도록 맞춘다. 새 밸런스를 이 명세에서 도입하지 않는다.

## 8. 3부 — 관찰 횟수 제한

- 플레이어는 자기 차례에 **최대 3장**까지 상대 뒷면 카드를 살필 수 있다.
- 예산은 **화면 로컬**이며 저장하지 않고 CPU에게 노출하지 않는다.
- 예산이 떨어지면 아직 살피지 않은 카드는 반응을 보여 주지 않는다. 이미 살핀 카드는 계속 볼 수 있다.
- 남은 횟수를 뽑기 열 옆에 표시한다.
- 새로고침하면 예산이 초기화된다. 로컬 단독 게임이므로 그 대가를 감수한다. 상태에 넣으면 계약이 또 오른다.

**무작위성을 늘리지 않고 확신만 흔든다.** 어떤 카드를 살필지가 선택이 된다.

## 9. 테스트 관문

`packages/engine/test/persona.test.ts`

1. **결정론** — 같은 `(weights, seed)`는 항상 같은 인덱스.
2. **난수 1회** — `weightedChoice`가 시드당 난수를 한 번만 소비한다.
3. **분포** — 가중치 10:1이면 1,000시드에서 대략 그 비율로 갈린다.
4. **경계** — 가중치가 전부 0이면 첫 인덱스를 돌려준다. 예외를 던지지 않는다.

`cabinets/old-maid/test/read.test.ts`

5. **손패 미접근** — `publicRead` 결과에 카드 ID가 하나도 없다.
6. **관측 정확성** — 손패 길이·버림 수·마지막 뽑기 이후 턴 수가 상태와 일치한다.

`cabinets/old-maid/test/engine.test.ts`

7. **재배열** — 순서만 바뀌고 구성은 그대로다. `turn`이 오르지 않는다.
8. **재배열 한도** — 한 턴 4회째가 거부된다.
9. **재배열 권한** — CPU 차례·관전 모드에서 거부된다.
10. **CPU 결정론** — 같은 시드·턴·공개 정보면 같은 자리를 고른다.
11. **CPU 편향** — 옮긴 자리의 선택 확률이 `readAccuracy`가 높은 성격에서 유의하게 높다.
12. **10,000시드 종료** — 기존 하니스가 그대로 통과한다. 무한 루프·패자 부재 0.
13. **재현** — 재배열을 포함한 입력 열이 같은 결과 해시를 만든다.

E2E

14. 손패를 옮기면 순서가 바뀌고 장수가 유지된다.
15. 키보드로도 옮길 수 있다.
16. 네 번째 카드를 살피면 반응이 뜨지 않는다.

## 10. 완료 조건

- `pnpm boundaries`·`pnpm typecheck`·`pnpm test`·빌드 통과. `read.ts`·`persona.ts`에 DOM·React import가 없다.
- 9절 관문 16개 통과.
- `packages/engine`이 도둑잡기를 모른다. `persona.ts`에 게임 어휘가 없다.
- 전적·지갑·도감이 계약 상승 뒤에도 살아 있다.
- 로비 초기 JS gzip 예산 유지.
- 오너 실플레이에서 **조커를 어디에 둘지 고민하게 되는지** 확인한다.

## 11. 비범위

- **컨디션 축** — 매 판 인물별로 표정 신뢰도를 흔들고 단서를 대사로만 흘리는 설계. 3층이 자리 잡은 뒤다.
- **매 판 `tellStyle` 재배정** — 상태 필드가 필요하고 이어하기에서 성격이 바뀐다.
- **CPU의 표정 읽기** — CPU가 플레이어의 표정을 읽는 축은 만들지 않는다. 플레이어에게 표출 채널이 없다.
- **새 밸런스** — 3층은 현재 확률 곡선을 재현만 한다.
- **다른 캐비닛 적용** — 2·3층은 공용이지만 v1 소비자는 도둑잡기뿐이다.
