# SPEC-A5 — 도둑잡기 좌석 대사

> 상태: v1.0 구현 계약 (2026-07-25). A4 《테메로세: 여백의 도둑》의 확장이며 새 캐비닛이 아니다.
>
> 문안 정본: [좌석 대사집](./TEMEROSA-OLD-MAID-DIALOGUE.md). 문장을 바꾸려면 그 문서를 먼저 고친다.
> 이 문서는 문안을 화면에 올리는 **구현 계약**이며 대사 문장을 담지 않는다.

## 1. 목적

도둑잡기 좌석의 테메로세 인물이 카드 한 장에 대해 자기 세계관대로 말한다.
아무 일도 일어나지 않은 순간에 말하고, 판을 가르는 순간에는 침묵한다.

이 기능은 **표현 계층 전용**이다. 규칙·판정·저장에 어떤 영향도 주지 않는다.

## 2. 설계 결정과 근거

| 결정 | 근거 |
|---|---|
| 대사를 `OldMaidState`에 넣지 않는다 | 필드를 추가하면 `contract`와 팩 버전을 올려야 하고, 화면이 팩 버전으로 저장을 폐기하므로 **진행 중인 대국이 전부 날아간다** |
| 쿨다운을 화면 로컬에 둔다 | `history`에 `watching`·`emptied`가 남지 않아 재생 복원이 불가능하고, 전체 재생은 행동 수에 대해 제곱 비용이다 |
| 대사 데이터를 카트리지 선택 필드로 둔다 | 대사는 세계관 콘텐츠다. 다른 세계 카트리지가 자기 대사를 공급하거나 아예 생략(침묵)할 수 있어야 한다 |
| 선택 함수가 손패를 인자로 받지 않는다 | `cpuDrawIndex`와 같은 규율. 정보 누출이 실수로도 불가능해야 한다 |
| 복구 재생 중 발화하지 않는다 | `session-recovery.ts`가 액션 영수증을 재생하므로, 재생 경로에서 발화하면 새로고침마다 과거 대사가 쏟아진다 |

## 3. 건드릴 파일

### 신규

| 파일 | 내용 |
|---|---|
| `cabinets/old-maid/src/dialogue.ts` | 세계관 없는 순수 사건 파생·선택 함수와 표현 데이터 검사 |
| `cabinets/old-maid/src/temerosa-lines.ts` | 테메로세 9인 × 8상황 = 72줄 데이터 |
| `cabinets/old-maid/test/dialogue.test.ts` | 결정론·예산·침묵·판정 불변·데이터 검증 |

### 수정

| 파일 | 변경 |
|---|---|
| `cabinets/old-maid/src/contracts.ts` | `OldMaidLineEvent`·`OldMaidLine` 타입 추가, `OldMaidCartridge`에 `lines?` **선택 필드** 추가 |
| `cabinets/old-maid/src/cartridge.ts` | `lines: temerosaOldMaidLines` 연결 |
| `cabinets/old-maid/src/index.ts` | `dialogue.ts` 재수출 |
| `cabinets/old-maid/src/react/old-maid-screen.tsx` | 발화 호출 지점, 최근 발화 ref, 말풍선 렌더 |
| `cabinets/old-maid/src/react/old-maid.css` | 말풍선 스타일 |
| `e2e/arcade.spec.ts` | 데스크톱 완주 검사에 말풍선 1회 이상 노출 확인 추가 |

## 4. 금지사항

1. **`engine.ts`를 수정하지 않는다.** `createOldMaidState`·`reduceOldMaid`에 손대지 않는다.
2. **`OldMaidState`에 필드를 추가하지 않는다.**
3. **`OLD_MAID_VERSION`·`TEMEROSA_OLD_MAID_PACK_VERSION`·`contract` 리터럴을 올리지 않는다.**
   올리면 저장된 대국이 폐기된다.
4. **선택 함수에 `hands`·`cards`·`pendingDraw`의 카드 내용을 전달하지 않는다.** 타입으로 차단한다.
5. **대사가 판정·점수·순서·표정 신호를 바꾸지 않는다.**
6. **복구 재생 경로(`session-recovery.ts`, `recoverSession`)에서 발화하지 않는다.**
7. **새 `aria-live` 영역을 만들지 않는다.** 화면에 이미 저장 상태·사건 문구·경기 기록 세 곳이 있다.
8. **문안을 이 문서나 코드에서 즉흥 수정하지 않는다.** 대사집이 정본이다.
9. **폴백 대사를 만들지 않는다.** 줄이 없으면 침묵이 정답이다.

## 5. 데이터 계약

`contracts.ts`에 추가한다.

```ts
export type OldMaidLineEvent =
  | "watching" | "idle-draw" | "pair-discard" | "taken-from"
  | "pair-made" | "joker-drawn" | "joker-left" | "emptied";

export interface OldMaidLine {
  id: string;                      // `${characterId}-${event}`
  characterId: string;
  event: OldMaidLineEvent;
  text: readonly string[];         // 두 박자 이상이면 여러 원소
}
```

`OldMaidCartridge`에는 **선택 필드로만** 추가한다. 기존 `contract` 리터럴은 그대로 둔다.

```ts
lines?: readonly OldMaidLine[];
```

판정 코어인 `engine.ts`를 수정하지 않기 위해 표현 계층의 `validateOldMaidLines`가 `cartridge.lines`가 있을 때만
아래 검사를 수행한다. 화면은 카트리지를 받을 때 한 번 검사하고, 데이터 테스트도 같은 함수를 호출한다.

- `id` 중복 없음
- 모든 `characterId`가 `cartridge.characters`에 존재
- `text`가 비어 있지 않음

## 6. 사건 파생

```ts
export interface OldMaidSpeechEvent { seatId: OldMaidCpuSeatId; event: OldMaidLineEvent; }

// OldMaidState에서 표현 계층이 투영한다. 실제 카드 ID가 든 hands는 포함하지 않는다.
export interface OldMaidSpeechSnapshot {
  seed: string;
  sequence: number;
  turn: number;
  status: OldMaidStatus;
  handCounts: Record<OldMaidSeatId, number>;
  characters: Record<OldMaidCpuSeatId, string>;
  history: readonly OldMaidHistoryEntry[];
}

export function oldMaidSpeechEvents(
  cartridge: OldMaidCartridge,
  previous: OldMaidSpeechSnapshot,
  next: OldMaidSpeechSnapshot,
): readonly OldMaidSpeechEvent[];
```

순수 함수다. 두 상태 스냅숏만 본다.

`OldMaidSpeechSnapshot`은 화면이 `OldMaidState`에서 투영하며 실제 카드 ID가 든 `hands`를 포함하지 않는다.
따라서 사건 파생과 선택 함수는 손패 내용에 접근할 수 없고 좌석별 장수만 비교한다.

### 침묵 구역 — 아래 중 하나면 즉시 빈 배열

- `next.status`가 `ready` 또는 `dealing`
- `next.status`가 `complete`
- 손패가 남은 좌석이 2개 이하 (최종 2인 구간)

### 사건 매핑

`newEntries = next.history.slice(previous.history.length)` 를 순회한다. 플레이어 좌석은 제외한다.

| 새 `history` 항목 | 좌석 | 조건 | 사건 |
|---|---|---|---|
| `draw` | `actorId` | `madePair` | `pair-made` |
| `draw` | `actorId` | `faceId === cartridge.oddFaceId` | `joker-drawn` |
| `draw` | `actorId` | 그 외 | `idle-draw` |
| `draw` | `targetId` | `faceId === cartridge.oddFaceId` | `joker-left` |
| `draw` | `targetId` | 그 외 | `taken-from` |
| `discard` | `ownerId` | — | `pair-discard` |

`player` 좌석은 항상 제외한다. 관전 모드에서 네 번째 NPC가 기존 상태 모델의 `player` 좌석을 사용하더라도
이번 버전에서는 발화하지 않는다. 네 번째 관전 좌석 발화는 상태 좌석 모델을 바꾸지 않는 별도 설계 전까지 비범위다.

추가로 두 가지를 더 넣는다.

- **`emptied`**: `previous.hands[seat].length > 0 && next.hands[seat].length === 0` 인 CPU 좌석
- **`watching`**: `next.turn > previous.turn` 일 때, 그 턴의 `draw`에서 `actorId`도 `targetId`도 아니었던 CPU 좌석

## 7. 선택 알고리즘

```ts
export function selectOldMaidSpeech(
  cartridge: OldMaidCartridge,
  previous: OldMaidSpeechSnapshot,
  next: OldMaidSpeechSnapshot,
  recentLineIds: readonly string[],
): { seatId: OldMaidCpuSeatId; line: OldMaidLine } | null;
```

난수 호출 순서를 아래로 **고정**한다. 순서가 바뀌면 결정론 테스트가 깨진다.

```
1. candidates = oldMaidSpeechEvents(cartridge, previous, next)
   비어 있으면 null

2. rng = new XorShift32(`${next.seed}:speech:${next.sequence}`)

3. chosen = candidates[rng.nextUint32() % candidates.length]     ← 1차 추출: 한 전이당 한 명만

4. roll = rng.nextUint32() % 100                                  ← 2차 추출
   roll >= threshold(chosen.event) 이면 null

5. pool = cartridge.lines 중 characterId·event 일치
   비어 있으면 null (폴백 없음)
   unused = pool 중 recentLineIds에 없는 것
   최종 pool = unused.length ? unused : pool

6. line = pool[rng.nextUint32() % pool.length]                    ← 3차 추출
```

### 발화 확률

| 사건 | `threshold` |
|---|---|
| `watching` · `idle-draw` · `pair-discard` · `taken-from` | 45 |
| `pair-made` | 30 |
| `joker-drawn` · `joker-left` · `emptied` | 15 |

`recentLineIds`는 최근 **6개**를 유지한다.

## 8. 화면 계약

### 호출 지점

`OldMaidScreen`의 `dispatch` 안, `reduceOldMaid` 직후 한 곳에서만 호출한다.
`useEffect`로 상태를 관찰해 호출하지 않는다 — StrictMode 이중 실행과 복구 로드에서 오발화한다.

```
dispatch(action)
  previous = stateRef.current
  next = reduceOldMaid(...)
  speech = selectOldMaidSpeech(cartridge, previous, next, recentRef.current)
  speech가 있으면 말풍선 갱신 + recentRef 갱신(최대 6개)
```

`recentLineIds`는 `useRef`로 보관한다. 저장하지 않는다.

### 말풍선

- 화면에 **동시에 하나만** 존재한다. 말하는 좌석 패널에 붙인다.
- 새 발화는 기존 말풍선을 **즉시 교체**한다. 대기열을 만들지 않는다.
- 한 박자 대사: 2,400ms 노출 후 사라진다.
- 여러 박자 대사: 박자당 2,000ms, 사이 간격 700ms. 교체가 들어오면 남은 박자를 버린다.
- `prefers-reduced-motion: reduce`: 이동·확대 연출 없이 즉시 표시하고, 박자 간격을 250ms로 줄인다.
- **`aria-live`를 붙이지 않는다.** 정보가 없는 표현이므로 실제 게임 안내를 덮으면 안 된다. DOM에는 남긴다.
- 레이아웃을 밀지 않는다. `position: absolute`로 띄우고, 좌석 패널 밖으로 넘칠 때는 잘리지 않게 처리한다.
- 모바일: `max-width: min(72vw, 22rem)`. 손패 영역과 뒷면 카드 열을 가리지 않는다.

## 9. 테스트 관문

`cabinets/old-maid/test/dialogue.test.ts`

1. **판정 불변** — `cartridge.lines`를 `undefined`로 둔 카트리지와 원본 카트리지로 각각 10,000시드 자동 플레이를 돌려
   `resultHash`가 전부 같다. 대사가 판정에 닿지 않음을 증명한다.
2. **결정론** — 같은 `(seed, sequence, previous, next, recentLineIds)`이면 항상 같은 결과. 100회 반복 동일.
3. **예산** — 한 전이에서 반환되는 발화는 최대 1건. 1,000시드 자동 플레이 전 구간에서 위반 0.
4. **침묵 구역** — 활성 좌석 2개 이하 구간, `complete`, `ready`, `dealing`에서 발화 0건.
5. **플레이어 배제** — 어떤 시드에서도 `seatId`가 `player`인 발화가 나오지 않는다.
6. **데이터 완전성** — 테메로세 대사 데이터가 9인 × 8상황 전부를 채우고, `id` 중복이 없으며,
   모든 `characterId`가 카트리지에 존재하고, 모든 `text`가 비어 있지 않다.
7. **쿨다운** — `recentLineIds`에 있는 줄은 같은 인물·사건의 다른 줄이 있는 한 재선택되지 않는다.
8. **폴백 없음** — 줄이 없는 인물·사건 조합에서 `null`을 반환한다. 다른 인물의 줄을 쓰지 않는다.

`e2e/arcade.spec.ts` — 데스크톱 완주 검사에 말풍선이 한 판에서 최소 1회 나타나는지 확인한다.
말풍선에 `aria-live` 속성이 없음을 확인하고, 모바일에서는 뷰포트와 손패 영역을 침범하지 않는지 측정한다.

## 10. 완료 조건

- `pnpm boundaries` 통과. `dialogue.ts`와 `temerosa-lines.ts`가 `cabinets/old-maid/src/` 아래에 있어
  React·DOM·엔진 import가 구조적으로 차단된다.
- `pnpm typecheck`·`pnpm test` 전 패키지 통과.
- 9절 관문 8개 전부 통과.
- **저장 호환**: 이 변경 전에 만든 진행 중 대국이 그대로 이어진다. 팩 버전·contract가 그대로임을 확인한다.
- 로비 초기 JS gzip 예산 200KiB 유지. 대사 데이터는 도둑잡기 지연 청크 안에만 들어간다.
- 데스크톱·모바일 E2E 통과. 말풍선이 손패와 뒷면 카드 열을 가리지 않는다.
- 문안이 [대사집](./TEMEROSA-OLD-MAID-DIALOGUE.md)과 **한 글자도 다르지 않다.**

## 11. 비범위

아래는 이번 구현에 넣지 않는다. 재미가 확인된 뒤 별도 관문에서 판단한다.

- **컨디션 축** — 매 판 인물별 상태를 배정해 표정 신뢰도를 흔들고 그 단서를 대사로만 흘리는 설계.
  대사가 정보 채널로 승격되므로 `OldMaidState` 필드 추가와 밸런스 검증이 함께 필요하다.
- **관찰 횟수 제한** — 한 턴에 살필 수 있는 카드 수 제한.
- **조합 전용 대사** — 특정 인물이 같은 테이블에 앉았을 때만 나오는 줄.
  대사집 6절의 교차 장치는 기존 줄이 나란히 뜨는 것만으로 성립하므로 이번 범위에서 코드가 필요 없다.
- **플레이어 발화** — 플레이어 좌석은 말하지 않는다.
- **음성·효과음.**
