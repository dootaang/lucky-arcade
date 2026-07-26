# SPEC-A21 — 도둑잡기 NPC별 재배열 성격

> 상태: 구현 완료 (2026-07-26). 규칙 `old-maid/0.9`, 테메로세 팩 `temerosa-old-maid/0.9`.
>
> 근거: [카지노 NPC 명부](./TEMEROSA-CASINO-NPC-ROSTER.md),
> [카지노 NPC 대사집](./TEMEROSA-CASINO-NPC-DIALOGUE.md), 네 시리즈 원본 CHARX 교차검수 결과.
> 인물별 도출 근거: [NPC 행동 성격표](./TEMEROSA-CASINO-NPC-BEHAVIOR.md).

## 1. 목적

기존 CPU는 `tellStyle` 네 종류만 보고 한 장을 다른 위치로 옮겼다. 조커를 든 인물은 대부분 조커를
옮기고, 같은 유형의 인물은 모두 같은 확률로 행동했다. 이 구조로는 35명의 차이를 플레이로 학습할 수 없다.

새 규칙은 두 질문을 분리한다.

1. 이 인물은 손패를 얼마나 자주 만지는가?
2. 만질 때 조커를 옮기는가, 일반 카드 두 장으로 미끼를 만드는가?

## 2. 계약

`OldMaidCharacter.behavior?`는 다음 일곱 개의 제한된 어휘만 받는다.

- `reorderActivity`: `low | medium | high`
- `jokerHonesty`: `low | medium | high`
- `decoyBias`: `low | medium | high`
- `consistency`: `steady | adaptive | erratic`
- `positionHabit`: `none | center | edge | left | right`
- `signalAttention`: `low | medium | high`
- `counterRead`: `literal | mixed | suspicious`

임의의 소수 확률을 인물마다 쓰지 않는다. `tellStyle`이 기본 분포를 제공하고 위 속성은 제한된 배수만
적용한다. 프로필이 없는 개인 카드 카트리지는 기존 `tellStyle` 기본값으로 동작한다.

## 3. 재배열 의도

CPU는 공개 정보와 시드만으로 다음 하나를 고른다.

- `stay`: 손을 대지 않는다.
- `joker-swap`: 조커와 일반 카드 한 장의 자리를 정확히 맞바꾼다.
- `decoy-swap`: 일반 카드 두 장만 맞바꾼다. 조커 위치는 절대 변하지 않는다.
- `habit-swap`: 일반 카드 두 장을 맞바꾸되 인물의 반복 위치 습관을 따른다.

기존의 splice 이동 대신 **두 장 교환**을 쓴다. 따라서 미끼 행동이 우연히 조커 위치를 밀어내지 않는다.
카드 ID는 상태의 손패에만 남고 공개 `offer`에는 인덱스 두 개만 기록된다.

기본 분포는 다음과 같다. 숫자는 가중치이며 프로필 배수가 적용되기 전 값이다.

| 유형 | 조커 보유 시 `stay / joker / decoy` | 조커 미보유 시 `stay / decoy` |
|---|---:|---:|
| open | 25 / 70 / 5 | 90 / 10 |
| guarded | 45 / 15 / 40 | 45 / 55 |
| bluffer | 25 / 20 / 55 | 30 / 70 |
| standard | 40 / 35 / 25 | 80 / 20 |

`habit-swap`은 위치 습관이 있는 인물의 decoy 몫 일부를 나눈 것이다. `steady`일수록 같은 습관이 더 자주
보이고 `erratic`은 습관 노출이 적다.

## 4. 인물 해석 경계

- 기존 9명과 신규 26명, 총 35명 모두 `TEMEROSA_CASINO_BEHAVIOR_PROFILES`에 명시한다.
- 속성은 CHARX의 성격·화법·행동 기록에서 테이블 행동으로 옮긴 **게임플레이 해석**이다. 원문 사실인
  것처럼 UI에 라벨로 표시하지 않는다.
- 에코처럼 상태를 숨길 수 없는 인물은 literal·높은 joker honesty, 박니은·라일라처럼 통제와 역독해가
  강한 인물은 suspicious·steady, 카미유처럼 연극적인 인물은 높은 decoy·erratic으로 구별한다.
- 근거가 없는 개인 카드 인물에게 이름이나 이미지로 성격을 발명하지 않는다. 프로필 생략이 정식 폴백이다.

## 5. 읽기 성격

`signalAttention`과 `counterRead`는 기존 `PERSONA_PRESETS`를 폐기하지 않고 CPU가 공개 재배열 신호를
해석할 때만 보정한다.

- `literal`: 옮긴 자리를 비교적 곧이곧대로 본다.
- `suspicious`: 옮긴 자리를 미끼로 보고 반대로 읽는다.
- `mixed`: 기존 유형 신뢰도를 약하게 사용한다.

손패 내용이나 카드 ID는 입력하지 않는다. `riskAppetite`도 도둑잡기 조준에서 새로 사용하지 않는다.

## 6. 버전과 복구

손패 순서는 이후 승패와 `resultHash`를 바꾸므로 규칙을 `0.9`로 올린다. 배포된 `0.8` 상태는
`OLD_MAID_OFFER_VERSION` 경로에서 이전 splice·확률 알고리즘을 그대로 사용한다. 플레이와 관전의 0.8
황금 결과 해시를 각각 고정해 이후 리팩터링도 과거 재생을 바꾸지 못하게 한다.

## 7. 완료 관문

1. 35명 전원 프로필 완비 및 런타임 값 검증.
2. 같은 시드·상태·인물은 같은 의도와 같은 교환 결과.
3. 일반 카드 미끼 교환은 조커 인덱스를 보존.
4. open·guarded·bluffer 대표 인물의 2,000시드 분포가 통계적으로 구별됨.
5. 0.8 플레이·관전 황금 해시 보존.
6. 18쌍 플레이·관전 각 10,000시드 완주.
7. 전체 경계·타입·단위·E2E·초기 번들 예산 통과.
