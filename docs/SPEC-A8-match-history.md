# SPEC-A8 — 전적 기록

> 상태: v1.0 구현 계약 (2026-07-25). 읽기 전용 누적이며 게임 규칙·판정·저장 상태를 바꾸지 않는다.
>
> 이 문서는 경제(메달)와 눈치싸움 확장의 **선행 관문**이다. 셋의 순서는 `전적 → 경제 → 심리`다.

## 1. 목적

지금 완료된 대국은 전부 증발한다. `RecentPlay`는 `cabinetId`가 키라 최근 한 판만 남고 덮어써지며,
스냅숏은 진행 중인 판 하나만 들고 있다. 어제 몇 판을 했는지, 누구에게 강한지 알 방법이 없다.

완료된 대국을 영구 누적하고 집계해 보여 준다.

**부수 목적이 하나 더 있다.** ROADMAP이 도둑잡기 확장의 관문으로 *"짧은 게임보다 반복 플레이 수요가
확인된다"*를 걸어 두었는데, 지금은 그것을 **잴 수단이 없다.** 전적은 기능인 동시에 그 관문의 계측기다.
경제·심리 확장을 감이 아니라 데이터로 판단하기 위해 이것을 먼저 만든다.

## 2. 설계 결정과 근거

| 결정 | 근거 |
|---|---|
| 별도 스토어에 쌓고 게임 상태에 넣지 않는다 | 스냅숏에 넣으면 재시작·복구에서 복제되거나 사라진다. `WalletStore`가 나중에 붙을 자리와 같은 층이다 |
| `${sessionId}#${sequence}`를 기록 키로 쓴다 | **완료 화면은 이어하기로 다시 들어올 수 있다.** 같은 키면 덮어쓰므로 새로고침마다 전적이 불어나지 않는다 |
| 시드를 반드시 저장한다 | 결정론에 이미 투자했으므로 시드 하나로 그 판을 통째로 재현할 수 있다. `이 판 다시 보기`가 추가 저장 없이 열린다 |
| 등수 파생을 캐비닛 순수 함수로 둔다 | 테메로세 판과 개인 카드 판이 같은 코어를 쓴다. 화면 두 곳에 같은 계산을 복사하지 않는다 |
| 캐비닛이 `persistence`를 import하지 않는다 | 캐비닛 코어는 계약·엔진·SDK만 본다. 캐비닛은 결과 요약만 만들고 앱이 기록으로 변환한다 |
| 상한 200판·오래된 것부터 정리 | 무한 증가는 이 리포가 이미 한 번 지적받은 실수다. 조회도 전체 `getAll()` 대신 인덱스 커서를 쓴다 |
| 관전 판도 기록하되 승률에서 제외한다 | 플레이어가 참여하지 않은 판이다. 남기되 성적으로 세지 않는다 |

## 3. 건드릴 파일

### 신규

| 파일 | 내용 |
|---|---|
| `packages/persistence/src/index.ts`(추가) | `MatchRecord` · `MatchStanding` · `MatchRecordStore` 포트 |
| `cabinets/old-maid/src/outcome.ts` | 완료 상태 → 등수 요약 순수 함수 |
| `cabinets/old-maid/test/outcome.test.ts` | 등수 파생 검증 |
| `apps/web/src/lib/match-history.ts` | IndexedDB 읽기·쓰기·정리, 집계 순수 함수 |
| `apps/web/src/lib/match-history.test.ts` | 멱등·정리·집계 검증 |

### 수정

| 파일 | 변경 |
|---|---|
| `apps/web/src/lib/database.ts` | DB 버전 `3` → `4`, `matches` 스토어와 `by-completed-at` 인덱스 |
| `apps/web/src/features/temerosa-old-maid/temerosa-old-maid-view.tsx` | 완료 전이에서 기록 적재 |
| `apps/web/src/features/card-old-maid/card-old-maid-view.tsx` | 〃 |
| `cabinets/old-maid/src/index.ts` | `outcome.ts` 재수출 |
| `cabinets/old-maid/src/react/old-maid-screen.tsx` | 결과 화면에 전적 요약 띠 |
| `e2e/arcade.spec.ts` | 두 판 연속 완주 후 누적 확인 |

## 4. 금지사항

1. **`engine.ts`·`OldMaidState`를 수정하지 않는다.** 전적은 상태 밖에 쌓인다.
2. **카드 원문·로어 본문·에셋 바이트를 기록하지 않는다.** 인물 ID와 표시 이름까지만이다.
3. **캐비닛에서 `@lucky-arcade/persistence`를 import하지 않는다.**
4. **복구 재생 경로에서 기록하지 않는다.** `recoverSession`은 `reduceOldMaid`를 직접 돌린다.
5. **기록 실패가 대국을 막지 않는다.** 저장이 실패해도 게임은 계속되고 결과 화면은 뜬다.
6. **전체 `getAll()` 후 필터로 조회하지 않는다.** 인덱스 커서를 쓴다.
7. **기록을 서버로 보내지 않는다.** 로컬 전용 원칙 그대로다.

## 5. 계약

`packages/persistence`에 둔다. `RecentPlay`·`SnapshotRecord`와 같은 층이다.

```ts
export interface MatchStanding {
  seatId: string;
  participantId?: string;   // 카트리지의 characterId
  displayName: string;
  rank: number;             // 1이 가장 먼저 손을 비운 좌석
  isPlayer: boolean;
}

export interface MatchRecord {
  contract: "match-record/0.1";
  recordId: string;         // `${sessionId}#${sequence}`
  cabinetId: string;
  cabinetVersion: string;
  packVersion?: string;
  cardFingerprint?: string; // 개인 카드 판에서만
  sessionId: string;
  sequence: number;
  seed: string;             // 재현의 열쇠
  completedAt: string;
  turns: number;
  standings: MatchStanding[];
  outcome: "win" | "loss" | "spectated";
  resultHash: string;
}

export interface MatchRecordStore {
  append(record: MatchRecord): Promise<void>;   // 같은 recordId면 덮어쓴다
  list(cabinetId: string, limit: number): Promise<MatchRecord[]>;
  prune(maxRecords: number): Promise<void>;
}
```

`outcome`은 플레이어 관점이다. 관전 모드는 `spectated`, 그 외에는 `loserId === "player"`면 `loss`, 아니면 `win`이다.

## 6. 등수 파생

`cabinets/old-maid/src/outcome.ts` — DOM·저장소 없는 순수 함수다.

```ts
export interface OldMaidOutcome {
  turns: number;
  loserId: OldMaidSeatId;
  ranking: { seatId: OldMaidSeatId; characterId: string | null; rank: number }[];
}

export function oldMaidOutcome(state: OldMaidState): OldMaidOutcome | null;
```

- `state.status !== "complete"`면 `null`을 반환한다.
- 순위는 `safeOrder`의 순서대로 `1`부터 매기고, `loserId`는 마지막 순위를 받는다.
- `characterId`는 `characterIdForSeat(state, seatId)`를 쓴다. 관전 모드에서는 `player` 좌석에도 인물이 앉는다.
- 표시 이름은 카트리지가 가지고 있으므로 여기서 붙이지 않는다. 앱이 매핑한다.

## 7. 기록 시점과 멱등

두 도둑잡기 화면의 `persist` 콜백 안에서 **완료로 전이하는 순간에만** 적재한다.

```
previous.status !== "complete" && next.status === "complete"
  → oldMaidOutcome(next)
  → MatchRecord 조립 (recordId = `${SESSION}#${next.sequence}`)
  → append
```

- **`useEffect`로 상태를 관찰해 적재하지 않는다.** StrictMode 이중 실행과 복구 로드에서 중복된다.
- 같은 `recordId`는 덮어쓴다. 완료 화면을 새로고침으로 다시 열어도 전적이 늘지 않는다.
- `restart`는 `sequence`를 증가시키므로 같은 세션에서 다시 완주하면 새 기록이 된다. 의도한 동작이다.
- `append` 실패는 삼킨다. 저장 상태 표시(`saveState`)를 오염시키지 않는다.

## 8. 저장과 정리

`apps/web/src/lib/database.ts`

- DB 버전 `3` → `4`.
- `matches` 스토어: `keyPath: "recordId"`, 인덱스 `by-completed-at`(`completedAt`).
- 기존 스토어 생성 로직은 그대로 두고 `if (!contains) create` 패턴을 따른다.

정리:

- `append` 뒤 `prune(200)`을 호출한다.
- `prune`은 `by-completed-at` 인덱스를 **오름차순 커서**로 열어 초과분만 지운다. 전체 로드 금지.
- 정리 실패도 삼킨다.

## 9. 집계

`apps/web/src/lib/match-history.ts`의 순수 함수다. 저장소를 모른다.

```ts
export interface MatchSummary {
  played: number;          // spectated 제외
  wins: number;            // 조커를 안 든 판
  firstPlaces: number;     // rank 1
  jokerHolds: number;      // 꼴찌
  currentStreak: number;   // 연속 무패, 음수면 연패
  longestStreak: number;
  opponents: { participantId: string; displayName: string; played: number; beaten: number }[];
}

export function summariseMatches(records: readonly MatchRecord[]): MatchSummary;
```

- `spectated`는 `played`·승률·연승에서 제외한다. 인물 대전 집계에도 넣지 않는다.
- 상대별 `beaten`은 **플레이어의 rank가 그 인물의 rank보다 작은** 판의 수다.
- `opponents`는 `played` 내림차순, 동수면 `displayName` 오름차순으로 정렬한다.

**상대별 전적이 이 기능의 핵심 값어치다.** `tellStyle`을 화면에 표기하지 않기로 했으므로,
`카노와 12판 중 4승` 같은 줄이 플레이어가 상대의 성격을 체감하는 **유일한 통로**다.

## 10. 화면

v1은 **결과 화면에만** 붙인다. 사이드바의 `기록` 항목을 살리는 것은 비범위다.

- 대국 완료 화면 아래에 요약 띠: `n판 · 1등 n회 · 조커 n회 · 현재 n연속`.
- 그 아래 상대별 줄을 최대 3명까지: `카노 12판 4승`.
- 기록이 0판이면 띠 자체를 그리지 않는다. 빈 상태 문구를 만들지 않는다.
- 기존 `aria-live` 영역을 늘리지 않는다.
- 결과 화면 진입 시 한 번만 조회한다. 매 렌더 조회 금지.

## 11. 테스트 관문

`cabinets/old-maid/test/outcome.test.ts`

1. **미완료 반환** — `complete`가 아닌 모든 상태에서 `null`.
2. **등수** — `safeOrder` 순서대로 1부터, `loserId`가 마지막.
3. **전 좌석 포함** — 4좌석이 모두 정확히 한 번씩 순위를 받는다.
4. **관전 모드** — `player` 좌석도 `characterId`를 받는다.
5. **자동 플레이 1,000시드** — 모든 완료 상태에서 순위가 빠짐없이 나온다.

`apps/web/src/lib/match-history.test.ts`

6. **멱등** — 같은 `recordId`를 두 번 넣으면 한 건만 남는다.
7. **정리** — 201건을 넣으면 200건이 남고 **가장 오래된 것**이 사라진다.
8. **집계** — 승·1등·조커·연속이 맞고, `spectated`가 `played`에서 빠진다.
9. **상대별** — `beaten`이 순위 비교로 계산되고 정렬 규칙을 지킨다.
10. **금지 필드** — 직렬화 결과에 카드 원문·에셋 경로가 없다.

`e2e/arcade.spec.ts`

11. 한 판 완주 → 새 판 완주 → 결과 화면 요약이 **2판**을 가리킨다.
12. 완료 화면에서 새로고침하고 이어하기로 돌아와도 **판수가 늘지 않는다.**

## 12. 완료 조건

- `pnpm boundaries`·`pnpm typecheck`·`pnpm test`·빌드 통과.
- 11절 관문 12개 통과.
- **`resultHash` 불변** — 전적은 판정에 닿지 않는다. 10,000시드 회귀가 그대로다.
- 기존 저장(스냅숏·액션·`RecentPlay`)이 DB 버전 상승 뒤에도 살아 있다. 진행 중이던 대국이 이어진다.
- 테메로세 판과 개인 카드 판이 **같은 코드로** 기록된다.
- 로비 초기 JS gzip 예산 유지.
- 기록이 브라우저 밖으로 나가지 않는다.

## 13. 비범위

- **메달·경제** — 지급 영수증은 이 기록과 같은 층에 붙지만 별도 관문이다.
- **`이 판 다시 보기` 리플레이** — 시드를 저장해 가능성만 열어 둔다. 재생 화면은 다음이다.
- **`기록` 화면과 사이드바 라우팅** — 지금 사이드바 항목은 전부 장식이며, 살리는 것은 별도 작업이다.
- **도전 코드 공유** — ROADMAP 공유 계약(`시드·입력·점수·카드 지문만`)의 실물화는 리플레이 뒤다.
- **다른 캐비닛 기록** — 계약은 범용으로 두되 v1은 도둑잡기 두 종만 쓴다.
