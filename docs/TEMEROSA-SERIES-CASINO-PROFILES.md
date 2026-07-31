# 테메로세 시리즈 카지노 프로필

## 범위

이 계약은 4개 CHARX에서 작성된 116개 시리즈 NPC를 각각 독립된 카지노 행동·외부 수입 프로필로 기술한다. 동일한 인물을 가리키더라도 `npcId`가 다르면 별도 프로필이다. `canonicalPersonKey`는 관계 표시용일 뿐, 이 프로필의 신원·지갑·전적·랭킹·성격 키가 아니다.

생성 결과는 `apps/content-cli/src/temerosa-series-casino-profiles.generated.json`이다. 경제 엔진, 지갑, UI에는 연결하지 않는다.

## 계약

- `npcId`: `temerosa:<series>:<source-persona>` 형식의 시리즈 계정
- `status`: `active`, `inactive`, `needs-confirmation`
- `role`: 일반 참가자와 house/dealer/host를 구분하는 진입 차단 기준
- `sourceLabel`: 해당 시리즈 명부의 표시 이름
- `evidenceRefs`: 시리즈, 로어 항목 인덱스·라벨, SHA-256만 보존
- `economy`: 일일 외부 수입 범위, 카지노 예산 비율(bps), KST 정산 창
- `behavior`: 위험·판돈·추격·중단 규율 bps, 방문/라운드 범위, 테이블, 게임별 숙련도 bps
- `fieldBasis`: 각 필드가 `lore`, `derived`, `balance` 중 무엇인지 명시
- `rationale`: 로어 해석, 밸런스 값 경계, 기존 프로필 승계 여부

`economy`의 금액과 비율, 방문·라운드 횟수, 신규 숙련도는 모두 통합 전 `balanceValue`다. 원문에 명시된 직업·재산·수입으로 주장하지 않는다. `fieldBasis`에서 이들을 `balance`로 표시한다. 성격에서 행동 성향으로 옮긴 값은 `derived`, 시리즈·역할·근거 식별자는 `lore`다.

## 편집 원칙

프로필은 해시, 시드, 난수로 생성하지 않는다. 116개 `npcId`를 코드의 편집 그룹에 하나씩 명시적으로 배치한다. 근거가 없는 이미지 전용 항목과 신원 또는 참가 적합성이 불확실한 항목은 `needs-confirmation`으로 두며 자동 참가 대상이 아니다.

기존 34개 카지노 프로필 중 4시리즈 명부에 successor가 있는 33개는 기존 성격·숙련도·선호 테이블·방문 범위를 그 successor에만 보존한다. 별도 라이선스 guest Nemo는 4시리즈 명부 밖이므로 생성물에 포함하지 않는다. 같은 인물의 다른 시리즈판은 해당 작품의 근거로 새로 해석하며 기존 값을 복제하지 않는다.

## 상태 요약

| 시리즈 | 프로필 |
|---|---:|
| Overture | 12 |
| Root2 | 18 |
| Bestiaization | 57 |
| Finale | 29 |
| 합계 | 116 |

| 상태 | 수량 | 의미 |
|---|---:|---|
| active | 101 | 근거가 있으며 일반 참가 후보 |
| needs-confirmation | 13 | 근거/신원/참가 적합성 확인 전 자동 진입 금지 |
| inactive | 2 | house 역할로 일반 도박 진입 금지 |

`needs-confirmation`은 Bestiaization의 Esther, Female, Leviathan, Male, Nemo Slaughter Orbit, Nieun Pluto, Riel, Sherirus와 Finale의 Al2zus, Car5p3, Flask Impostor, Mia, Silentium이다. `inactive`는 Root2와 Finale의 Wares다.

## 테이블 ID

허용된 ID는 `temerosa-old-maid`, `temerosa-match-pairs`, `temerosa-slot`, `indian-poker`, `temerosa-high-low`, `temerosa-five-card-draw`다. 생성기는 이 목록 밖의 선호 테이블이나 숙련도 키를 만들지 않는다.

## 재생성

저장소 루트에서 다음 명령으로 결정론적 JSON을 다시 만든다.

```powershell
pnpm --filter @lucky-arcade/content-cli exec tsx src/generate-temerosa-series-casino-profiles.ts
```

생성기는 기존 ledger 모듈을 읽기 전용으로 불러 successor 수치만 감사·승계한다. ledger나 경제 엔진을 수정하거나 런타임 연결하지 않는다.
