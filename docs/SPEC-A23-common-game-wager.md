# SPEC-A23 — 공용 게임 판돈 영수증

> 상태: v1.0 구현 완료 (2026-07-26). 선행: [SPEC-A13](./SPEC-A13-point-economy.md).
>
> 도둑잡기의 `SpectatorPrediction`은 조커 보유자·1등 예측이라는 전용 사이드게임으로 유지한다.

## 1. 목적

슬롯·인디언 포커·더비·하이로우가 같은 포인트 지갑을 안전하게 쓰되 서로의 규칙 필드에 의존하지 않게 한다.
공용 계층은 **최대 손실 예약과 한 번의 정산**만 소유한다. 배당표·족보·승패·판돈 단계는 각 순수 게임 코어가 소유한다.

## 2. 영수증

`game-wager/0.1`은 다음 불변 근거를 저장한다.

- `wagerId`: 영수증 식별자
- `outcomeKey`: 같은 미리 정해진 결과에 두 번 유료 진입하지 못하게 하는 멱등 키
- `cabinetId`, `sessionId`: 게임과 대국
- `termsVersion`: 게임이 사용한 배당 계약 버전
- `choiceKey`: 선택한 말·심볼·좌석 등 선택적 불투명 키
- `stake`: 화면에 표시한 기본 판돈
- `reservedAmount`: 시작 전에 차감한 최대 손실 노출액
- `settlementSequence`, `resultKey`, `settlementCredit`: 완료 근거와 반환액

`choiceKey`와 `resultKey`는 저장 계층이 해석하지 않는다. 카드에 없는 의미나 배당을 저장 계층이 발명하지 않는다.

## 3. 상태기계

```text
reserve: 지갑 차감 → reserved
reserved → settle   → settled   (게임이 계산한 creditAmount 입금)
reserved → forfeit  → forfeited (명시적 포기, 입금 0)
reserved → invalidate → refunded (시스템 폐기, 예약액 전액 반환)
```

- 예약은 `wallet + game-wagers` 한 IndexedDB 트랜잭션에서 처리한다. 다중 탭이 같은 잔액을 중복 약속할 수 없다.
- `reservedAmount`는 양의 안전한 정수이고 `stake` 이상이어야 한다.
- `creditAmount`는 음수가 아닌 안전한 정수다. 예약액은 이미 차감됐으므로 원금 반환도 이 값에 포함한다.
- 첫 종결 상태가 정본이다. 이후 같은 정산·포기·환불 호출은 지갑을 다시 움직이지 않는다.
- 사용자가 불리한 결과를 보고 환불할 수 없게, 환불은 `outcome-unavailable`, `version-mismatch`, `corrupt-state` 같은 시스템 사유만 허용한다.
- 동일 `outcomeKey`의 두 번째 예약은 거부한다. 새 결과는 새 시드·새 결과 키를 가져야 한다.

## 4. 저장 이관

- IndexedDB를 7로 올리고 별도 `game-wagers` 저장소를 추가한다.
- 기존 `wallet`, `grants`, `wagers`와 도둑잡기 `spectator-prediction/0.1~0.3` 레코드는 재작성하지 않는다.
- 새 저장소의 인덱스는 고유 `by-outcome-key`, 조회용 `by-session-id`, `by-created-at`이다.
- 현 시점에 공개 게임 UI는 이 계약을 자동 사용하지 않는다. 각 게임이 자기 배당 명세와 복구 배선을 갖출 때 연결한다.

## 5. 금지사항

1. 도둑잡기 예측 레코드를 공용 영수증으로 강제 마이그레이션하지 않는다.
2. 완료 뒤에 잔액을 검사하거나 판돈을 차감하지 않는다.
3. 일반 뒤로가기·새로고침을 환불 사유로 삼지 않는다. 예약 상태를 복구한다.
4. 저장 계층에서 승패·배당·제로섬 여부를 계산하지 않는다.
5. 포인트를 서버로 보내거나 외부 가치와 연결하지 않는다.

## 6. 검증 관문

1. 잔액보다 큰 동시 예약 두 건 중 정확히 한 건만 성공한다.
2. 같은 `outcomeKey`의 유료 재생이 거부된다.
3. 승리·패배를 포함한 정산이 한 번만 지갑에 반영된다.
4. 명시적 포기는 예약액을 반환하지 않는다.
5. 시스템 무효화는 예약액 전액을 정확히 한 번 반환한다.
6. 새로고침 뒤 세션별 예약과 종결 상태를 조회할 수 있다.
7. 기존 지갑·완료 보상·도둑잡기 예측 테스트가 그대로 통과한다.
8. 경계·타입·전체 단위·초기 JS 200KiB gzip 예산을 통과한다.
