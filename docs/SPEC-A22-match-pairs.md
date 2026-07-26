# SPEC-A22 — 짝맞추기 기본판

> 상태: v1.0 구현 완료 (2026-07-26). 선행: [SPEC-A16](./SPEC-A16-temerosa-casino-venue.md).
>
> 결정 근거: [짝맞추기와 로드맵 교차검토](./MATCH-PAIRS-AND-ROADMAP-REVIEW-2026-07-26.md).

## 1. 목적과 범위

테메로세 카지노의 두 번째 공개 게임으로 1인 고전 짝맞추기를 만든다. 한 판은 30초~3분이며,
승인된 세로 카드 이미지를 이름 없이 보고 동일한 그림 두 장을 찾는다.

첫 버전에 포함한다.

- 3열×4행 6쌍 쉬움
- 4열×4행 8쌍 보통
- 동일 이미지 두 장을 찾는 1인 규칙
- 시드 결정론, 입력 WAL, 결과 해시, 스냅숏 복구
- 카드 이미지 선로딩, 뒤집기·불일치 복귀·일치 고정 연출
- 일시정지·탭 비활성 자동 정지
- 시도 횟수 기록

첫 버전에 포함하지 않는다.

- NPC 대전
- 판돈·포인트 보상
- 도감 발견·해금
- 다른 표정의 같은 인물을 짝으로 보는 변형
- 4열×6행·6열×6행
- 얼굴 정사각 자동 크롭
- 서버 순위표

## 2. 제품 문구

- 캐비닛 제목: `짝맞추기`
- 시작 버튼: `시작`
- 난도: `쉬움 · 6쌍`, `보통 · 8쌍`
- 결과 핵심: `모든 짝을 찾았습니다`, `시도 N회`

`여백의 짝맞추기`, `신경쇠약`을 공개 제목으로 쓰지 않는다.

## 3. 카드 표시 계약

### 앞면

앞면에는 승인 이미지 하나만 표시한다.

- 인물명 금지
- 카드명·표정명 금지
- 이미지 위 캡션 금지
- hover/focus 툴팁 금지
- 상세 모달 금지
- 결과 화면의 이름 목록 금지
- 이미지 `alt`에 인물명 금지

화면 리더 문구는 인물 정체 대신 위치와 상태만 쓴다. 예: `A1 카드 뒤집기`, `A1 카드 앞면`,
`A1과 C2의 짝이 맞았습니다`.

### 뒷면

- 카지노 공용 뒷면을 쓴다.
- 좌표 `A1`, `B2`를 모서리에 표시한다.
- 좌표는 카드 정체와 무관하며 모든 시드에 같은 규칙으로 붙는다.

### 일치와 불일치

- 첫 카드를 뒤집은 뒤 다른 한 장만 고를 수 있다.
- 두 번째 카드 뒤집기가 끝날 때까지 추가 입력을 막는다.
- 일치하면 앞면을 유지하고 테두리·명도만으로 완료를 표시한다.
- 불일치는 두 앞면을 약 800ms 유지한 뒤 동시에 닫는다.
- 시간값은 표현 계층이며 코어 상태·결과 해시에 넣지 않는다.
- `prefers-reduced-motion`에서는 3D 회전 없이 즉시 앞면/뒷면을 전환하되 유지 시간과 입력 잠금은 지킨다.

## 4. 콘텐츠 선택

0.8.0 카지노 팩의 승인된 세로 `portrait` 중 짝맞추기 허용 목록만 쓴다. 원본 CHARX와 추출 경로는
런타임에서 참조하지 않는다.

```ts
interface MatchPairsFace {
  id: string;
  assetId: string;
  characterId: string;
  confusionGroup?: string;
}
```

- `id`와 `characterId`는 판 생성·감사 전용이며 사용자 문구로 렌더하지 않는다.
- 한 판에 서로 다른 `characterId`를 6명 또는 8명 뽑는다.
- 같은 인물의 서로 다른 표정을 한 판에 함께 넣지 않는다.
- 같은 `confusionGroup`의 서로 다른 얼굴을 한 판에 함께 넣지 않는다.
- 선택한 얼굴 하나를 카드 두 장으로 복제한다. 두 복제본만 정확한 한 쌍이다.
- pHash·색상 지표는 혼동 후보 보고서만 만든다. 허용·제외는 실제 카드 크기의 사람 검수 결과가 소유한다.
- 초점 좌표가 없는 첫 버전은 md 세로 이미지를 `object-fit: cover` 기본 구도로 사용한다. 얼굴 크롭을 발명하지 않는다.

에셋 로드 실패 시 다른 카드로 조용히 바꾸지 않는다. 같은 시드의 보드가 기기 상태에 따라 달라지기 때문이다.
오류 화면에서 같은 보드 재시도를 제공한다.

## 5. 순수 코어 계약

신규 패키지 `cabinets/match-pairs`가 상태·판 생성·판정을 소유한다. React·DOM·에셋 URL·지갑을 import하지 않는다.

```ts
type MatchPairsDifficulty = "easy" | "normal";
type MatchPairsStatus = "ready" | "playing" | "checking" | "complete";

interface MatchPairsCard {
  cardId: string;
  pairId: string;
}

interface MatchPairsState {
  contract: "match-pairs-state/0.1";
  version: "match-pairs/0.1";
  packVersion: string;
  sessionId: string;
  seed: string;
  sequence: number;
  difficulty: MatchPairsDifficulty;
  status: MatchPairsStatus;
  cards: readonly MatchPairsCard[];
  openIndexes: readonly number[];
  matchedPairIds: readonly string[];
  attempts: number;
}

type MatchPairsAction =
  | { type: "start" }
  | { type: "reveal"; index: number }
  | { type: "resolve" }
  | { type: "restart"; seed: string; difficulty: MatchPairsDifficulty };
```

### 전이

1. `start`: ready → playing.
2. 첫 `reveal`: 인덱스 하나를 연다. `attempts`는 아직 올리지 않는다.
3. 두 번째 `reveal`: 두 인덱스를 열고 `attempts + 1`, status=checking.
4. `resolve`: 같은 pair면 matched에 추가, 다르면 두 장을 닫고 playing으로 간다.
5. 마지막 pair의 `resolve`: complete.

`resolve`는 UI 타이머가 dispatch하지만 결과는 두 카드의 `pairId`만으로 정해진다. checking 상태를 저장하므로
새로고침해도 열린 카드와 판정이 사라지지 않는다.

### 판 생성

- 후보 선택과 보드 셔플은 `XorShift32`로 결정한다.
- 후보 정렬 → 인물/혼동 그룹 제약 선택 → 두 장 복제 → 셔플 순서를 고정한다.
- 같은 seed·difficulty·packVersion은 같은 카드와 같은 위치를 만든다.
- 이미지 URL, 로드 성공 여부, 화면 크기는 판 생성 입력이 아니다.

## 6. 시간·일시정지·복구

- 첫 버전 정본 점수는 `attempts`뿐이다.
- 벽시계 시간은 결과 해시·전적 순위·판정에 쓰지 않는다.
- 헤더에 `일시정지/계속`을 둔다.
- 탭이 비활성화되면 자동 일시정지한다.
- 정지 중 불일치 800ms 타이머를 진행하지 않는다.
- 돌아오면 남은 표현 단계를 계속하고 과거 입력을 재발화하지 않는다.
- 이어하기는 같은 sessionId·seed·board·openIndexes를 복구한다.
- 결과의 `다시하기`는 새 seed로 새 보드를 만든다. 같은 배치 반복은 개발 진단에만 둔다.

## 7. 이미지 로딩

`loadTemerosaCasinoAssets()`의 `assets`(md)를 사용한다. 0.8.0에서 이번 판에 고른 6~8개 이미지만 준비한다.

1. 코어가 보드를 만든다.
2. 고유 assetId의 md URL을 수집한다.
3. `Image.decode()`까지 완료한다.
4. 모든 카드 앞·뒷면을 마운트한다.
5. `시작`을 활성화한다.

선로딩 실패는 명시적 오류이며 조작을 열지 않는다. 카드가 뒤집힌 뒤 빈 앞면이 잠깐 보이면 실패다.
DOM·브라우저 캐시에 앞면이 존재하는 것은 로컬 전용 신뢰 모델에서 허용한다.

## 8. 경제와 전적

- 진입 비용 0 P.
- 완료 보상 0 P.
- 지갑을 읽거나 쓰지 않는다.
- 도둑잡기의 `SpectatorPrediction`을 재사용하지 않는다.
- 완료 전적은 기존 `match-record/0.1`을 쓰고 `turns=attempts`, 플레이어 단독 1위, `outcome=win`으로 남긴다.
- 무료 뽑기 적립이나 도감 해금과 자동 연결하지 않는다.

후속 도전 모드는 공용 판돈 영수증 계약이 생긴 뒤 별도 버전으로 설계한다. 일반 이탈은 예약과 판을 유지하고,
명시적 포기만 손실 정산한다.

## 9. Venue와 공개

- A16의 `temerosa-casino` Venue 안에만 노출한다.
- 중립 럭키★오락실 루트의 `PUBLIC_CABINET_IDS`에 직접 추가하지 않는다.
- Venue 플로어에서 `무료` 또는 `빠른 테이블` 구역에 둔다.
- 미구현 상태에서는 클릭 가능한 준비 중 버튼을 만들지 않는다.
- RecentPlay는 Venue를 건너뛰고 짝맞추기로 직행한다.

## 10. 구현 파일

### 신규

- `cabinets/match-pairs/src/contracts.ts`
- `cabinets/match-pairs/src/engine.ts`
- `cabinets/match-pairs/src/react/match-pairs-screen.tsx`
- `cabinets/match-pairs/src/react/match-pairs.css`
- `cabinets/match-pairs/test/engine.test.ts`
- `cabinets/match-pairs/package.json`, `tsconfig.json`
- `apps/web/src/features/match-pairs/match-pairs-view.tsx`
- `apps/content-cli/src/temerosa-match-pairs-selection.json`

### 수정

- workspace/package 설정
- `apps/web/src/cabinets/registry.tsx`
- A16 Venue 레지스트리와 카지노 플로어
- `apps/web/src/lib/database.ts`의 기존 스냅숏·전적 포트 배선
- `e2e/arcade.spec.ts`

도둑잡기 React 컴포넌트를 deep import하거나 복사해 결합하지 않는다. 짝맞추기 뒤집기는 자기 표현 계층이 소유한다.

## 11. 검증 관문

1. 같은 seed·difficulty·packVersion의 초기 상태와 resultHash가 같다.
2. easy는 정확히 6 pair/12 cards, normal은 8 pair/16 cards다.
3. 모든 pairId가 정확히 두 번 나오고 cardId는 전부 고유하다.
4. 한 판의 서로 다른 pair가 characterId·confusionGroup을 공유하지 않는다.
5. 잘못된 인덱스, 이미 맞은 카드, 같은 카드 두 번, checking 중 reveal을 거부한다.
6. 두 번째 reveal마다 attempts가 정확히 한 번 증가한다.
7. 10,000 seed에서 생성 실패·중복 위반·완료 불가능 보드가 0건이다.
8. 입력 재생이 같은 최종 resultHash를 만든다.
9. checking 스냅숏 복구 뒤 resolve가 정확히 한 번 일어난다.
10. 앞면과 결과 화면에 인물명·카드명·표정명·툴팁이 없다.
11. 시작 활성화 전에 선택 이미지 6~8종의 decode가 끝난다.
12. 이미지 실패 시 보드가 바뀌지 않고 재시도할 수 있다.
13. 모바일 360px에서 3열×4행과 4열×4행이 가로 스크롤 없이 조작된다.
14. 키보드만으로 모든 카드를 선택할 수 있고 포커스가 뒤집기 뒤 사라지지 않는다.
15. reduced-motion에서 3D 회전 없이 같은 입력 잠금과 판정을 유지한다.
16. 무료 완료 전후 지갑 잔액이 같다.
17. 비공개 직접 URL 우회가 막히고 공개 Venue 이어하기가 한 번에 복구된다.
18. 경계·타입·단위·전체 E2E·초기 JS 200KiB gzip 예산을 통과한다.

## 12. 완료 조건

- 모바일과 데스크톱에서 쉬움·보통을 설명 없이 시작하고 완료할 수 있다.
- 카드 앞면은 끝까지 이미지 전용이다.
- 로드 지연 때문에 빈 앞면이 보이지 않는다.
- 포인트 발행 없이 전적과 복구가 동작한다.
- 도둑잡기와 인디언 포커의 저장·결과 해시를 바꾸지 않는다.
