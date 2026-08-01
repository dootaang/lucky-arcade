# npc-ledger/1.2 전환 보존 감사

## 감사 범위

- 기준 커밋: `8466d7b6cdcd1c6f7bc4ae3d70770d55ff60b60b`
- 후보 계약: `npc-ledger/1.2`
- 현재 공개 계약: `npc-ledger/1.1`
- 후보 epoch: KST day `20666` (감사용 값이며 활성화하지 않음)
- release 상태: `blocked`
- release flag 기본값: `flowEconomy: false`

이 감사 변경은 release flag, epoch, ledger 엔진, house/economy 상수를 수정하지 않는다. `npc-ledger/1.2` 후보를 직접 넣은 검증과 현재 계약 선택기의 차단 상태 확인만 수행한다.

## 결과

| 항목 | 결과 |
|---|---|
| legacy 34개 계정의 successor 완전 대응 | 통과 |
| successor 고유 계정 수 | 33 |
| Bacikal + Nemo 합산 대상 | `temerosa:guest:nemo` 단일 계정 |
| 다른 legacy 계정의 다중 합산 | 0건 |
| NPC 후보 개장 잔고 | legacy 종가와 일치 |
| 기존 house 종가 및 총 내부 공급 | 보존 |
| 전환 전 로컬 NPC posting | successor에 1회 반영 |
| 전환 전 로컬 house posting | 1회 반영 |
| 전환 전 예약·전환 후 legacy 계정 정산 | successor로 복구 |
| 같은 idempotency transaction 재등장 | 동일 내용은 1회, 충돌 내용은 오류 |
| KST 자정 직전/직후 | 정확히 1초 경계 |
| 미래 시점 방문 후 과거 복귀 | 동일 입력의 동일 세계선 복원 |
| 새로고침·빈 캐시·오래된 체크포인트 | 동일 잔고 |
| 미래·다른 계약·다른 프로필 집합 캐시 | 폐기 후 재계산 |
| 날짜만 지난 상태의 1.2 선택 | 차단 유지 |
| flag를 임의로 true로 준 blocked 후보 | 차단 유지 |

## 발견 및 보정

웹 worldline의 legacy house 재생은 KST 23시 이후 결정론적 게임 손익을 주간 운영비 계산 뒤에 반영하고 있었다. ledger가 계산한 전환 직전 house 종가와 54P 차이가 났다.

결정론적 게임 손익은 ledger의 기존 종가 계산 순서와 맞추고, 브라우저 로컬 거래 손익은 별도 개인 가지로 더하도록 보정했다. 이 방식은 frozen legacy 종가와 개인 로컬 손익을 모두 보존하며, 로컬 거래를 운영비 계산에 다시 흡수하지 않는다.

## 로컬 기록 보존 경계

IndexedDB의 wallet, wager, game-wager, casino-transaction 저장소는 이 작업에서 수정하거나 마이그레이션하지 않는다. worldline은 읽어 온 `CasinoTransaction[]`을 변경하지 않으며 다음만 수행한다.

1. `idempotencyKey`와 `transactionId`를 검사한다.
2. 완전히 같은 복원 레코드는 한 번만 재생한다.
3. 같은 키의 다른 내용은 조용히 선택하지 않고 충돌 오류로 중단한다.
4. 1.2 후보에서 전환 이후 도착한 `npc:<legacyId>` posting을 지정 successor로 해석한다.

따라서 전환 전에 예약되고 전환 후 정산된 베팅도 legacy NPC credit을 잃지 않는다. 사용자 wallet·베팅 영수증·정산 내역 자체는 원래 IndexedDB 레코드로 남는다.

## 캐시 정책

NPC checkpoint는 정본이 아니라 재계산 가능한 파생 캐시다. 새 checkpoint는 다음 계약 식별자를 함께 저장한다.

- contract version
- seed version
- epoch KST day
- profile, behavior, 외부 수입, house 운영 정책을 포함한 계약 fingerprint
- personal worldline replay revision
- checkpoint 시점까지의 로컬 journal fingerprint

`npc-ledger/1.2` personal worldline checkpoint는 `dayIndex`, `npcBalances`, `houseBalance`, 누적 house 게임 손익·운영비·감축액, NPC 외부 준비금과 최근 7일 재생 anchor를 함께 저장한다. 첫 cold start는 anchor부터 최대 7일을 재생하고, 같은 탭의 후속 tick은 계약·journal·완료일별 메모리 snapshot에서 오늘 하루만 재생한다. 따라서 실제 `CasinoLedgerView` 경로는 유효한 day-365 checkpoint가 있을 때 day 0부터 다시 계산하지 않는다.

식별자가 없거나 다르면 폐기한다. 현재 시점보다 미래인 checkpoint, 다른 계약·정책·revision·journal checkpoint도 폐기한다. 오래된 정상 checkpoint, 손상된 checkpoint 또는 cache 삭제는 정본 거래를 바꾸지 않고 같은 결정론적 잔고와 누적 house 지표를 다시 만든다. 체크포인트에는 거래·정산 영수증을 저장하지 않으며 언제든 버릴 수 있다.

## 3,650일 정본 경제 감사

전환 계층은 경제 계산을 복제하지 않는다. `casino-ledger`의 `auditCasinoFlowEconomy()`를 직접 호출하며, 기본 테스트는 CI 시간을 위해 30일을 검사한다. 다음 명령은 같은 정본 감사를 3,650일로 확장한다.

```powershell
$env:CASINO_LONG_AUDIT='1'
pnpm exec vitest run src/lib/casino-worldline-audit.test.ts
```

실행 위치는 `apps/web`이다. 감사 성공 조건은 102개 후보 NPC, 전체 기간 라운드 ID 중복 0, 불균형 라운드 0, 분개 합계 0, 일중 원자 단위 house 최저 잔고가 계약의 보호준비금 이상, 운영비 감축 0이다. 하루 종가만 검사하거나 운영비 감축이 양수인 상태를 성공으로 취급하지 않는다. 이 검증은 release flag나 epoch를 활성화하지 않으며, 테스트 통과만으로 개장을 승인하지 않는다.

`casino-flow/1.1` 코어 변경 뒤의 3,650일 정본 감사는 아직 재승인되지 않았다. `TEMEROSA_FLOW_RELEASE_AUDIT.tenYears`와 `ten-year-audit-pending` blocker가 그 상태를 명시하며, 새 장기 감사 결과가 기록되고 별도 승인을 받기 전까지 release 상태는 계속 `blocked`다.
