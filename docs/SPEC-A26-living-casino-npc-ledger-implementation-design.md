# SPEC-A26 구현 보정 설계 — 살아 있는 카지노 NPC 원장 1·2단계

> 상태: **구현 계약** (2026-07-27). 14절의 오너 결정 A·B·C가 **권장안대로 전부 승인**됐다.  
> 상위 계약: [SPEC-A26 — 살아 있는 카지노: NPC 결정론 원장](./SPEC-A26-living-casino-npc-ledger.md).  
> 이 문서는 A26의 방향을 바꾸지 않는다. 구현 전에 발견한 수학·현재 코드·표시 계층의 빈틈을 닫고,
> 오너 결정이 필요했던 항목을 분리해 닫는다.

## 0. 결론

방안 1의 24시간 원장은 서버 프로세스를 계속 실행하는 기능이 아니다.

```text
NPC 잔고 = f(원장 계약, npcId, UTC epoch 분)
```

모든 클라이언트가 같은 계약과 시각을 입력해 개점 이후의 과거를 다시 계산한다. 따라서 서버·계정·동기화
프로세스 없이도 같은 NPC 잔고와 같은 활동 기록을 본다. 유저가 접속한 순간만 진행시키는 방안보다 오히려
단순하다.

1단계는 순수 원장 코어와 고정 프로필, 2단계는 명예의 전당과 최근 활동 표시다. NPC 경제와 유저 지갑은
끝까지 분리한다. 인증·서버 순위·관전석 재생·라이브 오즈는 3단계 재미 판정 전에는 만들지 않는다.

## 1. A26에서 그대로 유지할 계약

1. NPC 원장은 게임 판정과 `resultHash`에 영향을 주지 않는다.
2. NPC 잔고와 유저 지갑은 같은 트랜잭션에 들어가지 않는다.
3. 순수 코어에서 `Date.now()`·`Math.random()`·DOM·React·스토리지를 사용하지 않는다.
4. 시계는 `CasinoClock`으로 주입한다.
5. 기준 시각은 UTC epoch 분이다.
6. 원장은 대사를 만들지 않는다. 누가 언제 어느 테이블에서 얼마를 얻거나 잃었는지만 기록한다.
7. 배포된 파라미터는 동결한다. 변경은 새 계약 버전과 새 기준일을 사용하는 재기준으로만 한다.
8. 캐시는 계산 최적화일 뿐 진실이 아니다. 캐시를 지워도 같은 결과가 나와야 한다.
9. 1·2단계는 서버·Firebase Function·인증을 사용하지 않는다.

## 2. 구현 전에 보정해야 하는 충돌

### 2.1 잡음 분포를 고정한다

A26의 `noise_d`는 분포가 정의되지 않았다. 가우시안 잡음은 이론상 상한이 없어
`10,000일 동안 20μ 이하` 관문을 계약으로 보장할 수 없다.

원장 0.1의 잡음은 결정론적 유계 잡음으로 고정한다.

```text
noise ∈ [-1, 1]
```

같은 시드 문자열을 `XorShift32`에 넣어 단일 값을 얻는다. 난수 호출 순서에 의존하지 않도록 용도별 시드
영역을 분리한다.

```text
npc-ledger/0.1:<npcId>:<dayIndex>:balance
npc-ledger/0.1:<npcId>:<dayIndex>:schedule
npc-ledger/0.1:<npcId>:<dayIndex>:tables
npc-ledger/0.1:<npcId>:<dayIndex>:stakes
npc-ledger/0.1:<npcId>:<dayIndex>:bridge
```

세션 표시 규칙을 나중에 확장해도 `balance` 시드 영역은 바뀌지 않는다. 이 보장은 **일일 종가**에 대한
것이다. 세션 시각이나 브리지 규칙을 바꾸면 하루 중간 잔고는 달라지므로 이 변경도 새 원장 버전이 필요하다.

### 2.2 일일 종가는 유효 변동으로 닫는다

```text
rawClosing =
  opening
  + θ × (μ - opening)
  + σ × μ × noise

closing       = clamp(round(rawClosing), 0, 20μ)
effectiveDelta = closing - opening
```

세션 `delta`의 합은 클램프 전 변동이 아니라 반드시 `effectiveDelta`와 같아야 한다.

유계 잡음에서 이론상 최대 정상 범위는 대략 다음과 같다.

```text
μ + σμ/θ
허용 파라미터 최악값: μ + 0.30μ/0.04 = 8.5μ
```

따라서 20μ는 충분히 넓은 방어 상한이다. 테스트에 우연히 통과하는 것이 아니라 모델 자체가 발산하지
않는다고 설명할 수 있어야 한다.

### 2.3 0 P 회복을 명시적으로 보장한다

기존 식만으로는 잔고가 0일 때 음수 잡음 때문에 다음 날에도 0일 수 있다. 원장 0.1은 0 P에서 다음 규칙을
우선한다.

```text
0 P 도달
→ 무료 도둑잡기 회복 세션
→ max(1, round(θμ)) P 획득
→ 이후 판돈 테이블 복귀
```

따라서 판돈 타입은 다음과 같다.

```ts
export type NpcStake = 0 | 10 | 50 | 200;
```

`stake: 0`은 현재 잔고가 최소 판돈 10 P 미만일 때의 무료 도둑잡기 유동성 회복에만 허용한다. 판돈
테이블에서는 현재 잔고보다 큰 판돈을 선택하지 않는다.

### 2.4 `readAccuracy`를 원장에서 제거한다

A26 본문은 `readAccuracy`를 세션 승률 편향에 사용한다고 적었지만, 현재 공용 NPC 데이터에 연속형
`readAccuracy`는 없다. 인디언 포커 웹 어댑터가 `signalAttention`에서 임시로 파생할 뿐이다.

착수 지시는 `signalAttention`·`signalTrust`를 원장에 쓰지 말라고 고정했다. 따라서 원장은
`readAccuracy`도 간접적으로 사용하지 않는다.

```text
μ             인물 해석에서 집필
σ             reorderActivity에서 변환
θ             consistency에서 변환
그 밖의 축     사용하지 않음
```

장기적 잔고 수준은 오직 μ가 담당한다.

### 2.5 마지막 세션 단독 보정을 피한다

반올림 오차 전부를 마지막 세션 하나에 넣으면 마지막 기록만 터무니없이 커질 수 있다. 원장 0.1은 종가를
향하는 결정론적 브리지를 사용한다.

```text
각 세션의 기본 이동
  = (closing - current) / 남은 세션 수
  + 판돈에 비례한 결정론 흔들림

마지막 세션
  = closing - current
```

매 세션 뒤 잔고를 `[0, 20μ]`에 유지하고, 마지막 세션이 닫힌 뒤 다음 조건을 정확히 만족한다.

```text
sum(session.delta) === closing - opening
```

`stake`는 한 판의 단일 예약액이 아니라 그 카지노 방문에서 주로 사용한 대표 판돈이다. `delta`는 그 방문의
여러 판을 합친 순손익이므로 판돈의 정수배일 필요는 없다.

## 3. 고정 자료형

```ts
export interface CasinoClock {
  utcMinute(): number;
}

export type CasinoTableId =
  | "temerosa-old-maid"
  | "temerosa-match-pairs"
  | "temerosa-slot"
  | "indian-poker";

export type NpcStake = 0 | 10 | 50 | 200;

export interface NpcSessionRange {
  min: number;
  max: number;
}

export interface NpcActiveWindow {
  startMinute: number; // 0..1439 UTC, inclusive
  endMinute: number;   // 1..1440 UTC, exclusive
  weight: number;
}

export interface NpcTableWeight {
  tableId: CasinoTableId;
  weight: number;
}

export interface NpcGamblingProfile {
  id: string;
  name: string;
  target: number;
  volatility: number;
  reversion: number;
  sessionsPerDay: NpcSessionRange;
  tables: readonly NpcTableWeight[];
  activeHours: readonly NpcActiveWindow[];
}

export interface NpcSession {
  minuteOfDay: number;
  tableId: CasinoTableId;
  stake: NpcStake;
  delta: number;
}

export interface NpcLedgerContract {
  version: "npc-ledger/0.1";
  epochUtcDay: number;
  profiles: readonly NpcGamblingProfile[];
}

export interface NpcBalanceSnapshot {
  balance: number;
  today: readonly NpcSession[];
  dayIndex: number;
}
```

`npcDaySessions`도 계약 버전을 시드에 포함할 수 있어야 한다. 따라서 A26의 초안보다 인자를 하나 늘린다.

```ts
export function npcDaySessions(
  profile: NpcGamblingProfile,
  dayIndex: number,
  openingBalance: number,
  contract: NpcLedgerContract,
): readonly NpcSession[];

export function npcBalanceAt(
  profile: NpcGamblingProfile,
  clock: CasinoClock,
  contract: NpcLedgerContract,
): NpcBalanceSnapshot;
```

원장 0.1의 기준일은 `epochUtcDay: 20661`(`2026-07-27T00:00:00Z`)로 동결한다.
기준일 이전 시각은 `dayIndex: 0`, 초기 잔고 `μ`, 오늘 세션 없음으로 처리한다. 원장 0.1의 모든 초기 잔고는
별도 집필하지 않고 각 인물의 μ로 시작한다.

## 4. 성격값 변환

현재 공용 성격 정본은 연속형 값이 아니라 도둑잡기 카트리지의 이산형 프로필이다
(`cabinets/old-maid/src/temerosa-casino-personas.ts`의 `TEMEROSA_CASINO_BEHAVIOR_PROFILES`).

### 4.0 변환 결과는 전사(transcribe)한다 — import하지 않는다

원장은 `@lucky-arcade/old-maid`를 **import하지 않는다.** 두 가지 이유가 있고 둘 다 양보할 수 없다.

1. 경계 계약상 캐비닛이 다른 캐비닛에 의존하지 않는다.
2. 더 중요하게, import하면 **도둑잡기 성격 한 줄을 고치는 순간 모든 NPC의 과거 잔고가 조용히 다시
   쓰인다.** 9절의 파라미터 동결과 12절의 재기준이 무의미해진다.

따라서 아래 변환을 사람이 한 번 수행해 `temerosa-profiles.ts`에 **동결된 리터럴**로 적는다. 카트리지와
값이 어긋나는지는 테스트가 아니라 재기준 시점의 사람 검토로 확인한다.

### 4.1 변동폭

```text
reorderActivity low     → σ 0.08
reorderActivity medium  → σ 0.16
reorderActivity high    → σ 0.27
```

### 4.2 평균회귀

```text
consistency steady    → θ 0.16
consistency adaptive  → θ 0.10
consistency erratic   → θ 0.05
```

### 4.3 세션 수

위험 성향의 근거 축은 σ와 같은 `reorderActivity`다. `signalAttention`·`signalTrust`는 2.4절에 따라
원장에서 쓰지 않으므로 세션 수 결정에도 쓰지 않는다.

```text
reorderActivity low     3~6회
reorderActivity medium  5~9회
reorderActivity high    8~14회
```

세션 수는 위 범위의 정수에서 균등하게 선택한다. `consistency`는 이미 `reversion`으로 전사됐고 고정 자료형에
별도 필드가 없으므로 세션 수 분포에 다시 숨겨서 적용하지 않는다.
35명이 합쳐 하루 종일 활동 기록을 만들되, 각 인물이 24시간 내내 도박하는 것처럼 표현하지 않는다.

활동 시간대는 세 개의 UTC 운영조로 고르게 나눈다. 이 배정은 정본 성격 주장이 아니라 카지노 스핀오프의
운영 슬롯이다. 테이블 선호도도 같은 층에 속하며 대사나 원작 설정으로 역수입하지 않는다.

## 5. μ 35명 (2026-07-27 승인 · 원장 0.1 동결값)

아래 35개 값은 오너 결정 C로 승인됐고 `npc-ledger/0.1`의 **동결값**이다. 배포 이후 이 표를 직접 고치지
않는다. 조정이 필요하면 12절의 재기준만 사용한다. 24위 바치칼은 결정 A에 따라 **원장에만** 존재하며
도둑잡기 선택 풀에는 계속 등장하지 않는다.

| 순위 | 인물 | id | μ |
|---:|---|---|---:|
| 1 | 카트린카 | `katrinka` | 4,000 |
| 2 | 레이븐 | `raven` | 3,800 |
| 3 | 라일라 | `lyla` | 3,600 |
| 4 | 알제 | `alger` | 3,450 |
| 5 | 크레바 | `kreva` | 3,300 |
| 6 | 폐어 | `phaeo` | 3,150 |
| 7 | 마키나 | `machina` | 3,000 |
| 8 | 카노 | `kano` | 2,900 |
| 9 | 키케로 | `cicero` | 2,800 |
| 10 | 에스더 | `esther` | 2,700 |
| 11 | 워어즈 | `wares` | 2,600 |
| 12 | 노스탤지아 | `nostalgia` | 2,500 |
| 13 | 페일 | `pale` | 2,400 |
| 14 | 아폴리온 아이테 | `apollyon` | 2,300 |
| 15 | 히로 카네다 | `hiro` | 2,250 |
| 16 | 크레이들 | `cradle` | 2,200 |
| 17 | 박니은 | `nieun` | 2,150 |
| 18 | 테뮤테 | `temute` | 2,100 |
| 19 | 김덕배 | `deokbae` | 2,050 |
| 20 | 레빌로트 | `levillotte` | 2,000 |
| 21 | 리엘 | `riel` | 1,900 |
| 22 | 트레버 | `traver` | 1,800 |
| 23 | 아데샤 | `adesha` | 1,700 |
| 24 | 바치칼 | `bacikal` | 1,650 |
| 25 | 카미유 | `camille` | 1,600 |
| 26 | 안나 나자레아 | `anna` | 1,500 |
| 27 | 에코 | `echo` | 1,400 |
| 28 | 디아모 | `diamo` | 1,300 |
| 29 | 율 | `yul` | 1,200 |
| 30 | 땡칠이 | `ttaengchil` | 1,000 |
| 31 | 네모 | `nemo` | 800 |
| 32 | 릴림 | `lilim` | 650 |
| 33 | 튜밋튜 | `tumit-tu` | 450 |
| 34 | 모르시사 | `morsisa` | 300 |
| 35 | 브체 | `bche` | 200 |

### 5.1 상위 5명 근거

1. **카트린카** — 백 번을 살려 주고도 한 번도 공짜로 해준 적 없는 유료 치료사다. 거래에서 손실을
   방치하지 않는 인물이라 가장 높은 목표 잔고가 자연스럽다.
2. **레이븐** — 어떤 상황도 거래·단가·정산으로 환산하며 정중함을 무너뜨리지 않는다. 카지노 경제에 가장
   직접적으로 맞는 계산형이다.
3. **라일라** — 모든 위험 요소를 통제 가능한 범위로 관리한다. 높은 잔고보다 손실 관리 능력이 근거다.
4. **알제** — 책임 주체와 인수인계를 수치로 닫는 관료형이다. 변수를 방치하지 않는다.
5. **크레바** — 목표 외 요소를 제거하고 정밀하게 수행한다. 감정적 판돈 확대보다 장기 생존에 강하다.

### 5.2 하위 5명 근거

1. **브체** — 밀린 집세와 궁핍이 인물 해석에 직접 포함돼 있다. 바닥에 머무는 것 자체가 이야기다.
2. **모르시사** — 가장 약한 정예이며 스스로를 계속 낮춘다. 큰 판돈을 버틸 기반이 가장 약하다.
3. **튜밋튜** — 경험보다 자기식 E랭크 자신감이 앞서는 신인이다.
4. **릴림** — 세상과 규칙 모두에 경험이 부족하다. 손익 판단보다 규칙을 확인하는 단계다.
5. **네모** — 자산 보존보다 두려워도 다시 뛰어드는 영웅적 행동이 앞선다.

레빌로트는 μ가 중간이지만 높은 σ와 낮은 θ로 상·하위권을 크게 오간다. 트레버는 μ가 중간이고 낮은 σ와
중간 θ로 자기 분수 주변을 지킨다. 두 사람의 순위 움직임 자체가 인물 해석이 된다.

## 6. 세션과 테이블 규칙

현재 공개 플로어의 경제 테이블만 원장 계약에 고정한다. 새 게임이 추가돼도 과거에 소급하여 등장시키지
않는다. 테이블 구성이 바뀌면 새 원장 버전 또는 재기준이 필요하다.

- 판돈 테이블: 슬롯·인디언 포커·짝맞추기
- 무료/판돈 양쪽: 도둑잡기
- 하이로우·블랙잭·다우트·원카드·텍사스 홀덤은 현재 `개장 준비 중`이므로 원장 0.1에서 제외한다.
  실제 개장할 때 새 원장 버전으로 편입해 과거 기록에 소급 등장하지 않게 한다.

낮은 위험 성향은 10 P, 중간은 50 P, 높은 위험 성향은 200 P의 선택 비중이 커진다. 모든 프로필은 최소
하나의 판돈 테이블을 가져야 일일 음수 변동을 표현할 수 있다.

현재 잔고가 최소 판돈 10 P 미만이면 무료 도둑잡기 유동성 회복 세션을 허용한다. 첫 회복 세션은 반드시
`temerosa-old-maid · stake 0 · delta 양수`이고, 10 P 이상부터 판돈 테이블로 복귀한다. 이 규칙이 없으면
1~9 P에서 선택 가능한 판돈이 없어지는 막다른 상태가 생긴다.

## 7. 캐시 설계

A26 초안의 NPC×날짜별 키는 1년 뒤 최대 12,775개가 된다. 하루의 35명 잔고를 하나의 체크포인트로 묶는다.

```text
npc-ledger/0.1:checkpoint:<dayIndex>
```

```ts
interface NpcLedgerCheckpoint {
  contract: "npc-ledger/0.1";
  dayIndex: number;
  balances: Readonly<Record<string, number>>;
}
```

`dayIndex: K` 체크포인트는 K일의 모든 세션이 끝난 뒤의 종가다. 현재가 D일이면 `K <= D - 1`만 사용할 수
있고, K일 종가에서 K+1..D-1 완결일을 누적한 뒤 D일의 현재 분까지를 적용한다.

- 완료된 어제까지의 잔고만 저장한다.
- 최신 체크포인트 두 개만 유지한다.
- 계약·dayIndex·35명 id·정수 범위를 검증하지 못하면 폐기한다.
- 요청 시각보다 미래의 체크포인트는 사용하지 않는다.
- 캐시가 없으면 기준일부터 다시 계산한다.
- 캐시 사용 결과와 전량 재계산 결과를 테스트에서 대조한다.

스토리지 접근은 웹 어댑터가 소유한다. 순수 원장 코어는 `localStorage`를 직접 호출하지 않는다.

## 8. 시계 보정

### 8.1 순수 시계

HTTP 시각을 얻은 뒤에는 `performance.now()` 기반 단조 증가 시계로 고정한다. 사용자가 실행 중 시스템
시각을 바꿔도 열린 탭의 원장이 갑자기 며칠 이동하지 않는다.

```ts
interface CasinoClockSample {
  serverEpochMs: number;
  sampledAtPerformanceMs: number;
  uncertaintyMs: number;
  source: "http-date" | "device";
}
```

응답의 `Date`가 유효하면 기준으로 삼고, 유효한 `Age`가 있으면 더하며 없으면 0으로 처리한다. 요청 왕복
시간의 절반을 더한다.
헤더를 읽지 못하면 기기 시각으로 떨어지고 UI가 `기기 시간 기준` 상태임을 알 수 있게 한다.

### 8.2 현재 코드에서 발견한 충돌

현재 카지노 플로어는 콘텐츠 매니페스트를 fetch하지 않는다. 매니페스트 요청은 게임에 들어간 뒤 발생한다.
따라서 다음 둘을 첫 화면부터 동시에 완전히 만족할 수 없다.

```text
플로어 첫 진입부터 HTTP Date 보정
추가 네트워크 요청 0회
```

**결정 B로 다음을 확정했다.** 플로어 진입 시 `0.8.0/manifest.json` **한 건만** 요청하고, 그 응답의
`Date`로 시계를 보정한다. 같은 Promise를 이후 게임 에셋 로더가 재사용하므로 **중복 요청은 0회**이며,
8개 매니페스트 전량을 시계 때문에 미리 읽지는 않는다.

요청이 실패하거나 `Date`를 읽지 못하면 기기 시각으로 폴백하고, UI가 `기기 시간 기준` 상태임을 알 수
있게 한다. 폴백은 A안에서 손해가 없으므로 재시도 루프를 만들지 않는다.

### 8.3 중복 요청 0회를 만드는 실제 방법

현재 `apps/web/src/lib/temerosa-content.ts`의 `loadTemerosaCasinoAssets()`는 `PACKS` 8개를
`Promise.all`로 한꺼번에 읽는다. 플로어에서 이 함수를 그대로 부르면 시계 하나 때문에 매니페스트 8개를
읽게 되므로 결정 B 위반이다.

```text
fetchManifest(version)를 버전별 메모이즈 맵으로 바꾼다
  → 플로어는 0.8.0 하나만 요청하고 그 Response에서 Date를 읽는다
  → 게임 진입 시 loadTemerosaCasinoAssets()가 0.8.0을 다시 요청하지 않는다
```

`Response`는 한 번만 소비할 수 있으므로 메모이즈 대상은 파싱된 매니페스트이고, `Date`·`Age` 헤더와
왕복 시간은 그 fetch 시점에 별도 표본으로 뽑아 둔다.
실패한 Promise는 메모이즈 맵에서 제거한다. 자동 재시도 루프는 만들지 않지만, 이후 실제 게임 진입은 다시
요청할 수 있어야 한다.

## 9. 패키지와 경계

`packages/engine`을 테메로세 전용 데이터로 오염시키지 않는다. 별도 캐비닛 패키지로 둔다.

```text
cabinets/casino-ledger/
├─ src/contracts.ts
├─ src/engine.ts
├─ src/temerosa-profiles.ts
├─ src/index.ts
├─ src/react/casino-ledger-panel.tsx
└─ test/

apps/web/src/lib/casino-clock.ts
apps/web/src/lib/casino-ledger-cache.ts
```

- `src/engine.ts`: 순수 계산만 소유한다.
- `src/temerosa-profiles.ts`: μ와 동결된 파라미터를 한 파일에 둔다.
- `src/react`: 순위표와 티커만 소유한다.
- 웹 어댑터: HTTP Date·기기 시계·localStorage·IndexedDB 지갑을 조합한다.
- 유저 지갑은 읽기만 한다. NPC 원장과 같은 저장 트랜잭션을 열지 않는다.

`scripts/check-boundaries.mjs`의 `rules` 맵에 다음을 추가해 의존을 CI로 잠근다.

```js
["cabinets/casino-ledger", ["@lucky-arcade/engine", "@lucky-arcade/ui/number-ticker"]]
```

난수는 **새로 만들지 않는다.** `packages/engine`의 `XorShift32`가 이미 문자열 시드를 `fnv1a32`로 받으므로
2.1절의 시드 영역은 클래스를 따로 두는 것이 아니라 **시드 문자열을 다르게 주는 것**으로 달성한다.

1단계에는 엔진 의존만 두고, 2단계 React 진입점을 추가할 때 `react`·`@lucky-arcade/ui`와 `./react`
export를 함께 추가한다. `pnpm-lock.yaml`과 웹 앱의 워크스페이스 의존성도 갱신한다.

원장 패널은 플로어에서 동적 import한다. `NumberTicker`는 현재 로비 지갑이 이미 정적으로 사용하므로 원장
전용 지연 청크에만 둘 수 없다. 완료 관문은 원장 계산 코어와 패널이 플로어 지연 청크에 있고 초기 JS 증가량을
보고하는 것으로 고정한다.

## 10. 표시 설계

플로어 헤더와 게임 테이블 목록 사이에 원장 패널을 둔다.

```text
┌ 명예의 전당 — 상위 5명 ┐  ┌ 최근 활동 6건 ┐
│ 1. 카트린카  4,031 P   │  │ 카미유 · 3분 전 · 슬롯 · -50 P │
│ 2. 레이븐    3,776 P   │  │ ...                              │
│ ...                     │  └──────────────────────────────────┘
│ 18. 나       2,104 P   │
└─────────────────────────┘
```

### 10.1 명예의 전당

- NPC 35명과 유저 본인을 합쳐 36명 기준의 실제 순위를 계산한다.
- 상위 5명과 유저 고정 행을 보여 준다.
- 유저가 상위 5명 안이면 행을 중복하지 않는다.
- 잔고 내림차순, 동점 NPC는 `npcId` 사전순이다.
- 유저는 같은 잔고의 NPC 뒤에 둔다. 동률에서 유저에게 허위 우위를 주지 않는다.
- 상위 3명만 `sm` 초상을 지연 로딩한다. 4·5위는 텍스트 행으로 충분하다.
- 0.8.0에 없는 원장 인물 `pale`·`kano`·`bacikal`·`riel`·`wares`는 동결된 구팩 `sm` URL 매핑을
  사용한다. 매니페스트 추가 요청은 만들지 않으며 이미지 실패 시 이름 모노그램으로 폴백한다.
- 마크업은 `<table>`과 `<caption>`을 사용한다.
- 잔고는 `NumberTicker`와 `tabular-nums`를 사용한다.

### 10.2 최근 활동

`npcBalanceAt().today`만 합치면 자정 직후 티커가 비게 된다. 별도 집계 함수가 현재와 전날 세션을 합쳐
최근 24시간을 계산한다.

```ts
export interface NpcActivity {
  npcId: string;
  utcMinute: number;
  session: NpcSession;
}

export function recentNpcActivitiesAt(
  profiles: readonly NpcGamblingProfile[],
  clock: CasinoClock,
  contract: NpcLedgerContract,
  limit: number,
): readonly NpcActivity[];
```

- 기본 표시는 최근 6건이다.
- UTC 분이 바뀔 때만 재계산한다.
- 탭 복귀 `visibilitychange` 시 즉시 재계산한다.
- 흘러가는 장식에는 `aria-live`를 쓰지 않는다.
- 움직이는 티커는 `aria-hidden="true"`로 두고, 최근 3건의 정적 목록을 별도로 제공한다.
- `prefers-reduced-motion`에서는 움직이는 티커를 없애고 정적 3건만 화면에 표시한다.

## 11. 검증 계약

### 11.1 순수 코어

1. 같은 `(contract, npcId, dayIndex, openingBalance)`는 항상 같은 세션과 종가를 만든다.
2. `sum(session.delta) === closing - opening`이다.
3. 모든 세션 접두 합에서 잔고가 `[0, 20μ]`를 벗어나지 않는다.
4. 35명 각각을 10,000일 돌려도 `[0, 20μ]` 안이다.
5. 0 P 다음 날 첫 회복 세션 뒤 잔고가 양수다.
6. 순수 소스에 `Date.now()`·`Math.random()`·DOM·React·스토리지 접근이 없다.
7. 시계를 하루 앞당기면 하루치가 추가되고, 되돌리면 원래 값으로 돌아온다.
8. 난수 시드 영역이 분리돼 표시 규칙 변경이 잔고를 바꾸지 않는다.

### 11.2 캐시와 시계

1. 캐시 사용과 전량 재계산 결과가 같다.
2. 캐시 전체 삭제 뒤에도 결과가 같다.
3. 손상·미래·다른 계약 버전 체크포인트를 사용하지 않는다.
4. HTTP Date 보정 시 서로 다른 기기 시계를 같은 UTC 분으로 맞춘다.
5. Date 헤더가 없으면 기기 시계로 안전하게 폴백한다.

### 11.3 표시와 회귀

1. 상위 5명과 유저 고정 행의 중복이 없다.
2. NPC 동률은 `npcId`, 유저 동률은 NPC 뒤라는 규칙이 고정된다.
3. 자정 직후에도 최근 24시간 활동이 보인다.
4. 감소 동작 사용 시 티커가 흐르지 않는다.
5. 티커에 `aria-live`가 없다.
6. 원장 모듈을 통째로 제거해도 모든 게임 `resultHash`가 같다.
7. 원장은 플로어 지연 청크에 있고 초기 JS 200 KiB 예산을 넘지 않는다.
8. `pnpm check`와 전체 E2E가 통과한다.

### 11.4 μ 회귀

정확한 35개 값과 함께 다음 이야기 순서를 별도로 고정한다.

```text
katrinka > raven > lyla > alger > kreva
bche < morsisa < tumit-tu < lilim < nemo
levillotte.target는 중간권이며 volatility는 high
traver.target는 중간권이며 volatility는 low
```

## 12. 재기준

원장 0.1 배포 뒤 μ·σ·θ·기준일·테이블·세션 규칙을 직접 수정하지 않는다.

원장 0.2가 필요하면:

1. 새 기준일을 고른다.
2. 0.1이 그 기준일 시작에 산출한 35명 잔고를 새 초기 잔고로 고정한다.
3. 새 시드 영역 `npc-ledger/0.2`를 사용한다.
4. 기준일 전 기록은 0.1, 이후 기록은 0.2가 소유한다.

과거 숫자를 다시 쓰지 않는다. 그래프는 꺾일 수 있지만 끊기면 안 된다.

## 13. 이번 범위에서 하지 않는 것

- NPC 잔고와 유저 지갑 간 포인트 이동
- 다른 유저 잔고 표시
- 익명 인증과 계정 승격
- Firestore·Cloud Function
- 결과 로그 업로드와 서버 재생 검증
- 관전석의 실제 판 재생
- NPC 잔고 기반 라이브 오즈
- 원장 이벤트 기반 신규 대사 생성
- NPC 프로필 상세 화면과 클릭 상호작용

1·2단계가 배포된 뒤 오너가 순위표와 티커의 재미를 먼저 판정한다.

## 14. 오너 결정 (2026-07-27 · 전부 승인)

세 항목 모두 **권장안대로 승인**됐다. 구현은 이 절을 다시 협의하지 않고 그대로 착수한다.

### 결정 A — 바치칼 · **승인**

```text
도둑잡기 선택 풀   바치칼 제외 유지
카지노 원장        스핀오프 인물로 바치칼 포함 (35명)
```

- 테이블 상대 선택 계약은 **바뀌지 않는다.** `createTemerosaCasinoRoster()`의 `bacikal` 제외를 유지한다.
- 원장 프로필 목록만 35명이며, 바치칼은 순위표·티커에만 등장한다.
- 원장의 인물 목록을 게임 상대 선택 풀로 역수입하지 않는다. 두 목록은 서로 다른 층이다.

### 결정 B — 시계 요청 · **승인**

```text
플로어 진입 때 0.8.0 매니페스트 한 건 요청
응답 Date로 시계 보정
같은 Promise를 이후 게임 에셋 로더가 재사용 → 중복 요청 0회
실패·헤더 부재 시 기기 시각 폴백 + `기기 시간 기준` 표시
```

상세 규칙은 8절에 반영했다. 시계 전용 추가 요청은 만들지 않는다.

### 결정 C — μ 35개 · **승인 · 동결**

5절의 35개 값을 `npc-ledger/0.1`의 동결값으로 승인한다. 구현 데이터(`temerosa-profiles.ts`)로 그대로
옮기고, 이후 수정은 12절의 재기준으로만 한다.

11.4절의 μ 순서 회귀 테스트가 이 승인을 지키는 잠금장치다.
