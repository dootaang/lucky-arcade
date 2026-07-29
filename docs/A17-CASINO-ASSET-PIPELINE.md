# A17 카지노 자산 파이프라인 운영 메모

> 2026-07-26부터 운영 순서는 `자동 감사 → 선언 용도 선구현 승인 → 파생팩 컴파일 → 실제 화면 사후 확인`이다. 사전 썸네일 육안검사는 필수 관문이 아니다. 사후 확인 전 항목은 `postImplementationReview: pending`이며, 거절된 항목은 다음 컴파일에서 제외·교체한다.

## 기존 0.8.0과의 경계

`temerosa-margin/0.8.0`은 승인된 인물 카드 얼굴·좌석 초상 201개를 위한 기존 팩이다. A17은 Venue,
슬롯 심볼, 테이블 배경을 위한 별도 인벤토리와 독립 팩 계약이다. A17의 승인 용도는 기존 `card-face` 또는
`seat-portrait` 승인에서 상속하지 않으며, 0.8.0 선택·매니페스트·파생 이미지를 수정하지 않는다.

## 제작자 직접 제공 VIP 소스의 경계 (2026-07-29)

`C:\freetalk\테메로세\바니걸`의 16장과 `C:\freetalk\테메로세\딜러`의 4장은 CHARX 엔트리가 아니라
제작자가 팬게임용으로 직접 제공한 별도 소스다. 딜러 파일의 오너 확정 이름은 **레노아 2장·이웰리스
2장**이다.

- CHARX 다섯 종의 인벤토리나 `temerosa-margin/0.8.0`에 합치지 않는다.
- 별도 소스 키와 `temerosa-vip/0.1.0` 지연 팩으로 원본 파일명·바이트 SHA-256·규격·파생 경로를 기록한다.
- 원본 PNG 20장, 82,920,007바이트는 외부 폴더에만 두고 Git 및 공개 루트에 복사하지 않는다.
- `thumb` 좌석 크롭, `table` 딜러/호스티스 연출, `gallery` 전체 구도는 서로 다른 승인 용도다.
- 여러 포즈를 감정 네 칸으로 자동 해석하지 않는다. 감정 슬롯은 실제 화면 사후 확인에서 근거가 확인된
  것만 승인한다.
- 기존 운영 순서대로 파생본을 실제 화면에 먼저 배선하고 `postImplementationReview`로 유지·교체를
  결정한다. 세부 기준은 [VIP 룸 계획](./TEMEROSA-VIP-ROOM-PLAN-2026-07-29.md)을 따른다.

기존 카지노 감사 코드에서 실제 MIME, 픽셀, SHA-256, dHash 계산 방식을 재사용했다. A17에서는 다음 공백을
별도 계약으로 채웠다.

- 원본 문자열을 보존하는 이름 정규화와 규칙별 별칭 근거
- 바이트 중복 그룹과 dHash 지각 중복 후보 그룹의 분리
- `portrait/card/square/landscape/other` geometry 작업 큐
- `unreviewed/approved/rejected` 상태와 A17 용도별 허용 목록
- Venue·슬롯·플로어 독립 팩의 개수, 실제 MIME, 경로, 픽셀, SHA-256 및 바이트 예산 감사
- Git 추적 파일에 CHARX/Risu 원본 또는 `.tmp-*` 추출물이 없는지 확인하는 감사

## 현재 산출 상태

2026-07-26 실제 다섯 원본을 스캔한 `reports/temerosa-casino-asset-inventory.json`은 2,003개,
260,204,004바이트다. 명세의 1,826개는 네 개 테메로세 시리즈 카드 합계이며, 별도 Nemo 카드 177개를
더하면 2,003개다. 같은 기준으로 네 시리즈 이름 필터 통과 1,592개가 재현되며, Nemo까지 포함한 전체
2026-07-26 재감사 상태는 `unreviewed` 1,700개, 자동 이름 정책으로 `rejected` 282개, 선언 용도 선구현이 승인된 A17 후보 `approved` 21개다. 승인 21개는 모두 실제 화면 사후 확인 대기 상태다.

첫 검수 큐는 Venue hero 1개, 슬롯 심볼 16개, 테이블 배경 4개다. 기존 승인 근거가 A17 용도 승인이
아니므로 모두 `unreviewed`이며 원본 합계는 1,879,758바이트다. 공개 디렉터리에 파생본을 만들지 않았다. 슬롯 빈도는 근거가 약한 상태의
동일 기본 등급/가중치 1만 제안하고, 검수자가 카드 내 출현·원본 설명·시각 판독성을 확인하기 전에는
희소도를 확정하지 않는다.

원본 경로의 `.png` 확장자와 실제 WebP 바이트가 다른 엔트리가 1,959개다. 인벤토리는 이를 숨기지 않고
`sourcePathMime`, `detectedMime`, `sourcePathMimeMismatch`로 보존한다. 승인 후 컴파일되는 파생본은
실제 WebP 바이트와 `.webp` 확장자, 매니페스트 MIME 및 SHA-256이 모두 일치해야 한다.

## 명령

인벤토리 생성은 다섯 원본 인자를 명시한다. 원본 또는 추출물을 저장소에 쓰지 않는다.

```text
pnpm content:temerosa:casino:inventory -- \
  --overture <charx> --root2 <charx> --bestiaization <charx> --finale <charx> --nemo <charx> \
  --out reports/temerosa-casino-asset-inventory.json
```

오너가 `apps/content-cli/src/temerosa-casino-review-queue.json`의 각 항목을 실제로 확인한 뒤에만
`semanticStatus`, 해당 `approvedUses`, 구체적인 `reviewEvidence`를 기록하고 `releaseState`를
`approved`로 바꾼다. 그 다음 `--reviews`를 포함해 인벤토리에 같은 결정을 반영한다.

```text
pnpm content:temerosa:casino:inventory -- <five source arguments> \
  --reviews apps/content-cli/src/temerosa-casino-review-queue.json \
  --out reports/temerosa-casino-asset-inventory.json
```

모든 항목과 용도가 승인된 뒤에만 컴파일러가 세 독립 팩을 만든다. 하나라도 `unreviewed`이면 출력 폴더를
만들기 전에 실패한다.

```text
pnpm content:temerosa:casino:compile -- <required source arguments> \
  --inventory reports/temerosa-casino-asset-inventory.json \
  --reviews apps/content-cli/src/temerosa-casino-review-queue.json \
  --out <content-root> --version <semver>
```

후보 단계 감사는 공개 루트에서 A17 팩이 없음을 함께 확인한다. 릴리스 감사에는 세 매니페스트를 각각
`--pack`으로 넘긴다.

```text
pnpm content:temerosa:casino:audit
```
