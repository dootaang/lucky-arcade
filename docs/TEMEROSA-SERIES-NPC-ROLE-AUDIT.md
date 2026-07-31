# 테메로세 4시리즈 NPC 역할·출시 감사

> 기준 명부: `temerosa-series-npc-inventory/0.2`
>
> 범위: Overture, Root2, Bestiaization, Finale의 series-and-source-persona 116개
>
> 비범위: 경제 엔진, 지갑 생성, 전적·랭킹, 앱 UI, 이미지 컴파일

## 결론

| 항목 | 결과 |
|---|---:|
| 전체 레코드 | 116 |
| 시리즈별 | 12 / 18 / 57 / 29 |
| 고유 ID | 116 |
| confirmed / needs-confirmation | 112 / 4 |
| gambler / dealer / host / house | 114 / 0 / 0 / 2 |
| 초상 complete / partial / missing | 95 / 13 / 8 |
| casino-ready / ledger-only / house-only / blocked / excluded | 87 / 21 / 2 / 4 / 2 |

모든 런타임·경제 후보 키는 `id`다. `canonicalPersonKey`는 같은 인물 또는 관계를 표시하기 위한 보조 키일
뿐이며 지갑, 전적, 랭킹, 성격, 대사 또는 게임 상태를 합치는 키가 아니다. 같은
`canonicalPersonKey`가 다른 시리즈에 나타나더라도 각각 별도 레코드와 별도 `id`를 유지한다.

## 역할 판정

- 각 시리즈의 워어즈 두 레코드만 `house`다. 둘은 별도 시리즈 신원이지만 개인 도박 지갑을 만들지 않으며
  `releaseEligibility: house-only`, `exclusionReason: house-role-no-personal-wallet`을 갖는다.
- 나머지 114개는 현 단계에서 `gambler`다. CHARX 인물 근거만으로 카지노 진행자 직무를 새로 만들지 않았다.
- `dealer`와 `host`는 계약에 존재하지만 이 명부에서는 0개다. 제작자 직접 제공 딜러 이미지의 레노아·이웰리스는
  CHARX 네 시리즈와 별도 소스이며, 어느 시리즈 인격에 연결되는지 확정되지 않았다. 따라서 이름만으로
  Bestiaization/Finale 레노아 또는 Bestiaization 이웰리스를 자동으로 딜러로 승격하지 않았다.
- 괴물·세력·장소·개념은 새 사람 NPC로 승격하지 않았다. 112개 confirmed 레코드는 원본의 인물 구역에 있는
  로어 항목 해시를 최소 하나씩 가지며, 이미지 이름만 있는 네 후보는 아래와 같이 차단했다.

## 신원·예외 감사

| 대상 | 처리 |
|---|---|
| `temerosa:bestiaization:female` | 삭제하지 않음, `needs-confirmation`, `blocked` |
| `temerosa:bestiaization:male` | 삭제하지 않음, `needs-confirmation`, `blocked` |
| `temerosa:bestiaization:riel` | 라일라와 관계만 표시, 별도 ID 유지, `needs-confirmation`, `blocked` |
| `temerosa:bestiaization:nieun-pluto` | 니은과 관계만 표시, 별도 ID 유지, `needs-confirmation`, `blocked` |
| Bestiaization/Finale 바치칼 | 레코드와 카드 후보는 유지, 일반 선택 풀에서는 `excluded` |
| `temerosa:bestiaization:nemo-slaughter-orbit` | Bestiaization 신원으로 유지하며 guest 네모와 합치지 않음 |
| `temerosa:guest:nemo` | 4시리즈 116개 밖의 기존 마법소녀 guest로 유지 |

## 초상과 출시 관문

초상 상태는 이름이나 크기로 추정하지 않고 안전 이미지 후보의 실제 expression 태그를 다음 좌석 역할에
대응해 계산한다.

| 좌석 역할 | 인정 expression |
|---|---|
| neutral | natural, neutral, standing, closed-eyes, opened-eyes, looking-book |
| pleased | smile, smirk, blush |
| tense | angry, upset, fight, combat, combat-stance, surprised, contempt |
| despair | sad, cry, teardrop, disappointed, embarrassed |

- 네 역할이 모두 있으면 `complete`, 일부만 있으면 `partial`, 하나도 없으면 `missing`이다.
- confirmed + complete만 일반적으로 `casino-ready`다.
- `casino-ready`도 이 작업에서는 경제/UI 연결 전이므로 `pendingReason: runtime-integration-not-wired`를 유지한다.
- confirmed이지만 partial/missing이면 신원은 원장 후보로 유지하되 좌석 출시는 `ledger-only`다.
- 이미지 전용 네 후보는 `blocked`이며 로어 신원 확인 전 경제·좌석 양쪽에 연결하지 않는다.
- 워어즈와 바치칼의 명시적 정책은 초상 완성도보다 우선한다.
- 이 명부는 초상 존재와 역할 커버리지만 감사한다. 이미지 파일을 복사하거나 배포 승인으로 간주하지 않는다.

## 로어 및 생성물 경계

생성 JSON에는 원문 로어 본문을 넣지 않는다. `loreEvidence`에는 원본 카드의 항목 번호, comment/key 메타데이터,
본문 SHA-256만 남긴다. 원본 CHARX, 원본 추출물, 이미지 파일은 저장소에 추가하지 않는다.

## 기존 34명 후계 매핑 읽기 전용 감사

`cabinets/casino-ledger/src/temerosa-series-migration.ts`는 수정하지 않고 테스트에서 읽기만 했다.

- legacy ID: 34개, 중복 0
- successor 대상: 34개, 중복 0
- 네 시리즈 대상: 모두 116개 고정 명부에 존재
- 네모 대상: 정확히 `temerosa:guest:nemo` 한 곳

따라서 과거 계정을 `canonicalPersonKey`가 같은 다른 시대 인격으로 복제하지 않는다. 실제 이관과 지갑 생성은
이 작업의 범위가 아니며 후속 경제 통합 전까지 수행하지 않는다.
