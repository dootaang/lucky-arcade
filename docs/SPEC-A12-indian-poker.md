# SPEC-A12 — 인디언 포커

> 상태: v1.1 비공개 구현 완료 (2026-07-25). 공개 로비 승인은 별도다.
>
> **선행: [SPEC-A10](./SPEC-A10-bluffing-and-reads.md)(심리 3층)과 [SPEC-A11](./SPEC-A11-playing-card-deck.md)(덱).**
> A10의 2·3층을 그대로 쓰고 1층만 새로 쓴다. 그 구조가 실제로 재사용되는지 검증하는 첫 사례다.

## 1. 왜 이 게임이 먼저인가

도둑잡기에서 표정은 **보조 힌트**다. 인디언 포커에서는 **게임 규칙 그 자체**다.

자기 카드만 못 보므로, 내 카드가 무엇인지 알 방법은 **그것을 보고 있는 상대의 얼굴**뿐이다.
이미 만들어 둔 `tellStyle`·반응 초상·심리 3층이 부가 기능에서 본체로 승격된다.

한 판 30초에서 2분이라 `응답 기다리는 동안` 컨셉에 가장 정확히 맞고, 구현 규모가 트럼프 후보 중 가장 작다.

## 2. 규칙

- 좌석 4개다. 플레이어 + NPC 3인이며 도둑잡기 좌석 배치를 그대로 쓴다.
- **5라운드**를 치른다.
- 매 라운드 각 좌석에 카드 한 장을 나눈다. **자기 카드만 보이지 않고 나머지 셋은 보인다.**
- 각자 `계속`과 `기권` 중 하나를 고른다.
- 공개 후 `계속`한 좌석 중 가장 높은 카드가 그 라운드를 가져간다.

```
계속해서 이김   +2
계속해서 짐     −1
기권            0
```

- `기권`은 안전하고 `계속`은 도박이다. 승산이 3분의 1을 넘을 때만 계속하는 것이 이득이다.
- 5라운드 합산 점수로 1~4위를 정한다. 동점은 **마지막으로 라운드를 가져간 좌석**이 앞선다.
- 카드 세기는 랭크 우선(A가 가장 높음), 같으면 무늬 순(♠ > ♥ > ♦ > ♣)이다. 조커는 쓰지 않는다.
- 한 라운드에서 모두가 기권하면 그 라운드는 무득점으로 넘어간다.

## 3. 설계 결정과 근거

| 결정 | 근거 |
|---|---|
| 베팅을 넣지 않는다 | SPEC-A9가 판돈을 비범위로 두었다. `계속/기권` 2지선다만으로 위험 판단이 성립한다 |
| NPC 반응이 **플레이어 카드**를 근거로 한다 | 인디언 포커의 전제 그 자체다. 표정이 유일한 정보 통로가 된다 |
| 좌석 인물 계약을 `cabinet-sdk`에 새로 둔다 | 도둑잡기 계약을 건드리면 배포된 저장이 폐기된다. 새 타입을 추가하고 도둑잡기는 나중에 옮긴다 |
| 라운드 단위로만 저장한다 | 한 판이 짧다. 라운드 중간 복구는 가치보다 복잡도가 크다 |
| 조커를 빼고 52장만 쓴다 | 순위 비교에 정의가 없는 카드다 |

## 4. 건드릴 파일

### 신규

| 파일 | 내용 |
|---|---|
| `cabinets/indian-poker/package.json` · `tsconfig.json` | 새 캐비닛 |
| `cabinets/indian-poker/src/contracts.ts` | 카트리지·상태·액션 |
| `cabinets/indian-poker/src/engine.ts` | 배분·판정 순수 리듀서 |
| `cabinets/indian-poker/src/read.ts` | 1층 — 공개 정보 관측 |
| `cabinets/indian-poker/src/cartridge.ts` | 테메로세 좌석 카트리지 |
| `cabinets/indian-poker/src/index.ts` | 공개 API·매니페스트 |
| `cabinets/indian-poker/src/react/indian-poker-screen.tsx` · `.css` | 화면 |
| `cabinets/indian-poker/test/engine.test.ts` · `read.test.ts` | 검증 |
| `apps/web/src/features/indian-poker/indian-poker-view.tsx` | 에셋·저장·전적·지급 배선 |

### 수정

| 파일 | 변경 |
|---|---|
| `packages/cabinet-sdk/src/index.ts` | `TableSeatCharacter` 공용 계약 |
| `apps/web/src/cabinets/registry.tsx` | 등록. **`PUBLIC_CABINET_IDS` 추가는 오너 승인 뒤에 한다** |
| `apps/web/package.json` | 워크스페이스 의존 추가 |
| `e2e/arcade.spec.ts` | 완주·복구·표정 검사 |

## 5. 금지사항

1. **NPC 판정에 자기 카드를 넘기지 않는다.** 인디언 포커에서 자기 카드는 자기도 모르는 정보다.
2. **NPC 판정에 다른 NPC의 결정을 미리 넘기지 않는다.** 같은 라운드의 선택은 동시에 이뤄진다.
3. **도둑잡기 계약(`old-maid-*`)을 수정하지 않는다.**
4. **`Math.random()`·`Date.now()`를 판정에 쓰지 않는다.**
5. **베팅·판돈·배수를 만들지 않는다.**
6. **성격을 화면에 라벨로 표기하지 않는다.**
7. **오너 승인 없이 공개 로비에 노출하지 않는다.** 2026-07-25 결정이 유효하다.
8. **조커를 덱에 넣지 않는다.**

## 6. 계약

`packages/cabinet-sdk`에 좌석 인물 공용 계약을 새로 둔다.

```ts
export type SeatTellStyle = "open" | "guarded" | "bluffer";
export type SeatReaction = "neutral" | "pleased" | "tense";

export interface TableSeatCharacter {
  id: string;
  name: string;
  appearanceSet: string;
  tellStyle: SeatTellStyle;
  portraits: Record<SeatReaction, string>;
  despairPortrait: string;
}
```

캐비닛 상태:

```ts
export interface IndianPokerState {
  contract: "indian-poker-state/0.1";
  version: "indian-poker/0.1";
  packVersion: string;
  sessionId: string;
  seed: string;
  sequence: number;
  round: number;                    // 0 … 5
  status: "ready" | "choosing" | "revealing" | "complete";
  seats: Record<SeatId, { characterId: string | null; score: number }>;
  hands: Record<SeatId, string | null>;   // 카드 ID
  choices: Record<SeatId, "continue" | "fold" | null>;
  reactions: Record<SeatId, SeatReaction>;
  lastRound: RoundResult | null;
  history: RoundResult[];
}
```

**구현 정정:** 비동기 배분 애니메이션을 위한 별도 액션이 없고 저장 경계도 라운드 시작/종료이므로,
관측될 수 없는 `dealing` 상태를 만들지 않는다. `start`와 `next_round`가 결정론적으로 배분한 뒤 곧바로
`choosing`에 진입한다.

`hands`에 플레이어 카드도 들어 있다. **화면이 가린다.** 판정 코어는 알아야 하고 UI가 숨기는 구조다.

## 7. 배분과 판정

- 라운드 시작 시 `XorShift32(`${seed}:round:${round}`)`로 52장을 섞어 앞 4장을 나눈다.
- 라운드마다 덱을 다시 섞는다. 카드 소진 관리를 하지 않는다.
- 모든 좌석이 선택하면 공개하고 점수를 매긴다.
- 결과 해시는 `resultHash(state)`로 만든다.

## 8. 1층 — 공개 정보

```ts
export interface IndianPokerDecisionRead {
  visibleStrengths: number[];    // 관측자가 볼 수 있는 카드들의 세기
  round: number;
  scoreGap: number;              // 선두와의 점수 차
  foldsSoFar: number;            // 이전 라운드들의 기권 횟수
}

export interface IndianPokerExpressionRead {
  playerCardStrength: number;    // 표출을 만들 때만 사용
  round: number;
}

export function decisionRead(state: IndianPokerState, seatId: SeatId): IndianPokerDecisionRead;
export function expressionRead(state: IndianPokerState): IndianPokerExpressionRead;
```

결정 입력과 표출 입력을 별도 타입으로 분리한다. 따라서 NPC 결정 함수에는 자기 카드나
`playerCardStrength`를 전달할 수 없고, 플레이어 카드 세기는 3층 표출에만 들어간다.

## 9. 2층·3층 — A10 재사용

**결정 (2층)**

```
승산 추정 = 보이는 카드들보다 내 카드가 높을 확률
          ≈ 관측자가 아는 정보만으로 계산한 기대 순위
계속 임계 = 1/3을 기준으로 riskAppetite로 ±0.12 이동
readAccuracy가 낮으면 추정에 시드 잡음을 더한다
consistency가 낮으면 임계 부근에서 흔들린다
최종 선택은 weightedChoice로 한 번에 뽑는다
```

**표출 (3층)**

- 관측자는 자기 오른쪽 좌석의 카드를 본다. 그 카드가 셀수록 `tense`, 약할수록 `pleased`가 진실이다.
- `deceptionBias`가 진실을 뒤집거나 `neutral`로 감춘다. **도둑잡기와 같은 함수를 쓴다.**
- 플레이어를 향한 반응이 곧 **플레이어 카드에 대한 정보**다.

## 10. 화면

- 좌석 3인의 초상과 반응, 그 아래 각자의 카드를 **앞면**으로 보여 준다.
- 플레이어 카드는 **뒷면**(`PlayingCardBack`)으로 자기 자리에 놓는다.
- 하단에 `계속`·`기권` 두 버튼. 라운드·점수·남은 라운드를 표시한다.
- 공개 단계에서 플레이어 카드를 뒤집어 보여 주고 라운드 결과를 알린다.
- 카드는 `@lucky-arcade/ui/playing-card`의 핍 컴포넌트와 A11 아틀라스를 쓴다.
- 관찰 보조: 초상에 마우스를 올리면 반응 문구를 보여 준다. 도둑잡기와 같은 어휘를 쓴다.
- `prefers-reduced-motion`을 존중하고 새 `aria-live` 영역을 늘리지 않는다.

## 11. 저장·전적·지급

- 세션 ID는 `indian-poker:table-1`이다.
- **라운드 경계에서만** 스냅숏을 저장한다. `recoverSession`을 그대로 쓴다.
- 완료 전이에서 A8 전적을 적재한다. `standings`는 점수 순위다.
- A9 지급표를 그대로 적용한다. 등수만 넘기면 되므로 캐비닛별 분기가 없다.
- **A8·A9가 아직 없으면 배선을 비워 두고 캐비닛만 만든다.** 순서가 뒤집혀도 진행할 수 있어야 한다.

## 12. 테스트 관문

1. **결정론** — 같은 시드·입력 열이 같은 결과 해시를 만든다.
2. **자기 카드 미접근** — NPC 결정 함수에 자기 카드가 전달되지 않는다(타입·런타임 양쪽).
3. **동시 선택** — 같은 라운드에서 다른 NPC의 선택이 결정에 영향을 주지 않는다.
4. **점수표** — 계속·승 +2, 계속·패 −1, 기권 0이 정확하다.
5. **전원 기권** — 무득점으로 넘어가고 상태가 막히지 않는다.
6. **동점** — 마지막 라운드 승자가 앞선다.
7. **카드 세기** — 랭크 우선, 무늬 보조 순서가 52장 전수에서 전순서다.
8. **덱 무결성** — 한 라운드에 같은 카드가 두 좌석에 가지 않는다.
9. **1,000시드 완주** — 5라운드가 항상 끝나고 순위가 4개 나온다.
10. **표출 일관성** — 같은 시드·라운드·좌석이면 같은 반응이다.
11. **A10 재사용** — `persona.ts`를 수정하지 않고 프리셋만 소비한다.

E2E

12. 5라운드를 끝내고 순위가 나온다.
13. 라운드 사이에 새로고침해도 같은 라운드로 복귀한다.
14. 플레이어 카드가 공개 전까지 앞면으로 노출되지 않는다.

## 13. 완료 조건

- `pnpm boundaries`·`pnpm typecheck`·`pnpm test`·빌드 통과. 코어에 React·DOM import가 없다.
- 12절 관문 14개 통과.
- **`packages/engine`을 수정하지 않고** A10의 2·3층을 그대로 썼다. 3층 구조가 재사용된다는 증거다.
- 로비 초기 JS gzip 예산 유지. 새 캐비닛은 지연 청크다.
- 오너 실플레이에서 **상대 얼굴을 보고 계속할지 망설이게 되는지** 확인한다. 이것이 이 캐비닛의 재미 관문이다.

## 14. 비범위

- **베팅·판돈** — A9와 같은 이유로 미룬다.
- **온라인 대전·순위표.**
- **도둑잡기의 `TableSeatCharacter` 이관** — 배포된 저장이 폐기된다. 별도 관문.
- **개인 봇카드 인디언 포커** — 좌석 인물만 있으면 열리지만, 테메로세 판의 재미를 먼저 본다.
- **다른 트럼프 게임(원카드·다우트)** — 이 캐비닛의 결과로 판단한다.
