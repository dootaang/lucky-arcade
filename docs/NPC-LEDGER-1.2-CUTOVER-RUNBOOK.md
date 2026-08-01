# npc-ledger/1.2 개장·롤백 런북

## 절대 전제

현재 후보는 `TEMEROSA_FLOW_RELEASE_READY === false`이며 개장할 수 없다. 이 문서는 미래의 별도 승인 작업을 위한 체크리스트다. 이 작업에서는 release flag와 epoch를 활성화하지 않는다.

## 개장 전 체크리스트

1. `origin/main`의 실제 배포 후보 SHA를 기록하고 변경 동결 시간을 선언한다.
2. frozen `npc-ledger/1.1` 계약, successor mapping, `npc-ledger/1.2` 후보 계약을 동일 빌드에서 검증한다.
3. 34개 legacy ID가 모두 mapping에 있고, 고유 successor가 33개인지 확인한다.
4. `bacikal`과 `nemo`만 `temerosa:guest:nemo`로 합산되는지 확인한다.
5. legacy 종가와 33개 successor opening을 ID별로 비교한다.
6. house 종가와 `NPC + house` 총 내부 공급이 경계에서 보존되는지 확인한다.
7. KST epoch 직전 1초, epoch 정각, 정각 이후 첫 정산을 검사한다.
8. 전환 직전 예약·직후 정산, 환불, forfeit 영수증을 각각 테스트한다.
9. 새로고침, 빈 cache, 오래된 checkpoint, 미래 checkpoint, 다른 contract checkpoint를 테스트한다.
   - day-365 유효 checkpoint의 첫 cold start가 최대 7일, 같은 탭 후속 tick이 최대 1일만 재생하는지 확인한다.
   - NPC 잔고뿐 아니라 house 잔고·누적 손익·운영비·감축액과 외부 준비금이 동일한지 확인한다.
10. 동일 journal 복원은 한 번만 적용되고 충돌 레코드는 명시적으로 실패하는지 확인한다.
11. 코어 정본 `auditCasinoFlowEconomy()`를 사용하는 3,650일 장기 감사 명령을 실행하고 원자 단위 house 최저 잔고, 보호준비금, 운영비 감축, 중복 라운드 ID, 불균형 라운드, 분개 합계와 실행 SHA를 보관한다.
12. release audit blocker가 0개인지 별도 승인자가 확인한다. 테스트 통과만으로 blocker를 제거하지 않는다.
13. release flag 활성화는 별도 소유 변경으로 수행하고, epoch는 승인된 KST 미래 자정으로 다시 검토한다.
14. Canary 브라우저에서 IndexedDB의 wallet, wagers, game-wagers, casino-transactions 개수와 합계를 전후 비교한다.
15. 개장 승인자, 관찰 담당자, 롤백 판단자를 기록한 후 배포한다.

## 개장 직후 관찰

- 선택된 계약 버전과 KST day를 기록한다.
- 33개 successor의 첫 snapshot과 `temerosa:guest:nemo` 합산값을 확인한다.
- house opening, gaming profit, operating expense, curtailed expense를 분리해 확인한다.
- `casino_worldline_transaction_conflict`와 `casino_worldline_unknown_npc` 발생 여부를 감시한다.
- wallet·wager·game-wager·casino-transaction 레코드 수가 감소하지 않았는지 확인한다.
- 사용자가 새로고침한 뒤 동일 거래가 중복 반영되지 않는지 확인한다.

## 안전한 롤백

1. 신규 베팅 진입을 먼저 중단한다.
2. 배포 SHA, KST 시각, 발생한 1.2 transaction ID 범위를 기록한다.
3. release flag만 false로 되돌린다. epoch와 frozen 1.1 데이터를 수정하지 않는다.
4. IndexedDB 전체 삭제, wallet 초기화, wager 삭제, casino-transaction 삭제를 하지 않는다.
5. `npc-ledger/*:checkpoint:*`만 파생 캐시로 폐기할 수 있다. 삭제 후 결정론적으로 재계산한다.
6. 1.2 개장 후 실제 series NPC transaction이 한 건이라도 있으면 단순 UI 롤백으로 종료하지 않는다. 해당 transaction을 보존한 호환 replay 또는 forward-fix를 먼저 준비한다.
7. 충돌 transaction은 임의로 하나를 선택하거나 삭제하지 말고 원본 두 레코드와 idempotency key를 보존해 감사한다.
8. 1.1 선택 상태에서 기존 local journal, house 가지, player wallet·wager 내역이 그대로 보이는지 확인한다.
9. 원인과 복원 확인을 기록한 뒤에만 베팅 진입을 다시 연다.

## 금지된 롤백 방식

- 브라우저 데이터 전체 삭제
- opening balance 수동 수정
- epoch를 과거/미래로 이동해 결과를 맞추기
- release blocker를 테스트 snapshot 변경으로 숨기기
- 동일 거래를 상쇄하는 임의 transaction 발행
- 1.2 transaction을 legacy ID로 손실 변환

체크포인트는 버려도 되지만 거래·정산·베팅 영수증은 정본 기록이므로 보존해야 한다.
