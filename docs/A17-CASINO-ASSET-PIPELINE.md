# A17 카지노 자산 파이프라인 운영 메모

> 2026-07-26부터 운영 순서는 `자동 감사 → 선언 용도 선구현 승인 → 파생팩 컴파일 → 실제 화면 사후 확인`이다. 사전 썸네일 육안검사는 필수 관문이 아니다. 사후 확인 전 항목은 `postImplementationReview: pending`이며, 거절된 항목은 다음 컴파일에서 제외·교체한다.

## 기존 0.8.0과의 경계

`temerosa-margin/0.8.0`은 승인된 인물 카드 얼굴·좌석 초상 201개를 위한 기존 팩이다. A17은 Venue,
슬롯 심볼, 테이블 배경을 위한 별도 인벤토리와 독립 팩 계약이다. A17의 승인 용도는 기존 `card-face` 또는
`seat-portrait` 승인에서 상속하지 않으며, 0.8.0 선택·매니페스트·파생 이미지를 수정하지 않는다.

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
