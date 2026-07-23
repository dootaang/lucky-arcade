# SPEC-B0 — 에셋 접근 계약 + 캐비닛 레지스트리 (B1 선행 기반 공사)

> 발주: 지휘자, 2026-07-23 (코덱스 검토 반영 개정). 구현: Codex. **B1·B2보다 먼저 완료해야 한다.**
> 상위 문서: [README](../README.md) · [ROADMAP](./ROADMAP.md) (모듈화·성능 계약 준수).
> 목적: 럭키 시뮬레이터에서 겪은 대형 에셋 지연·거대 컴포넌트 문제를 첫 기능부터 재발시키지 않는다.

## 1. 작업 범위

### B0-a. AssetResolver 계약 (packages/card-io)

- 저장된 원본 카드 Blob에서 `AssetReference.id`로 **해당 에셋 바이트만 지연 읽기**하는
  `AssetResolver` 계약을 추가한다 (BinarySource 구간 읽기 재사용).
- Object URL 생성·해제·썸네일 캐시는 **앱의 에셋 서비스**(apps/web)가 소유한다.
  상한·퇴출 시 해제 규칙 포함(ROADMAP 성능 계약).
- **분석 DTO(AnalyzedCard)에는 이미지 바이트를 절대 넣지 않는다.**

### B0-b. NPC·월드컵 계약 확장 (packages/extract, packages/contracts)

- NPC 그룹 결과에 에셋 연결을 추가: `representativeAssetId`(대표 초상 — default/natural 계열
  우선의 결정론 규칙), `variantAssetIds`(감정·의상 변형 목록).
- `FavoriteCupCartridge` Zod 계약 신설: `cardFingerprint`, `cardName`,
  `candidates[]{ npcId, displayName, representativeAssetId, variantAssetIds, confidence, evidence }`.
  이미지 바이트 없음 — 에셋 ID만.

### B0-c. 캐비닛 레지스트리 + 지연 로더 (packages/cabinet-sdk, apps/web)

- 캐비닛 레지스트리: 매니페스트(id·이름·필요 재료·관문 판정 함수)를 등록부에 선언하고,
  캐비닛 React 화면은 `React.lazy` 지연 로딩으로 연결한다.
- 공용 라우터: 캐비닛 ID로 화면을 여는 단일 경로. **home.tsx의 lore-circuit 직접 import와
  playing 불리언 배선을 제거**하고 레지스트리 경유로 교체한다 (동작 동일 회귀 보장).
- 첫 체험 자동 선택기의 자리(분석 결과→적합 캐비닛 목록→기본 선택)만 만들어 둔다.
  월드컵 연결은 B1에서 한다.

### B0-d. NPC 그룹 신뢰도 사전 측정 (도구 + 보고서)

- 실카드 3종(NPC 다수 2종 + 빈약/에셋 잡음 1종)에 대해 다음을 기록하는 측정 리포트를 만든다:
  실제 인물 수(사람 확인) vs 추출 그룹 수, 오합침 건수, 누락 건수, 배경·아이콘 오인식 건수,
  대표 이미지 선택 정확도.
- 산출물: `reports/npc-accuracy-<지문>.md` 초안 + 측정 스크립트. **관문 상수(최소 confidence·
  최소 인원)는 이 측정 결과를 보고 지휘자·오너가 확정**한다 — 코드에 임의 상수 선고정 금지
  (임시 상수는 `TODO(B1-gate)` 표기).

## 2. 금지사항

- 분석 DTO·저장 스냅샷·Worker 메시지에 이미지 바이트 포함 금지.
- React 화면에서 카드 파일 재파싱 금지 (AssetResolver 경유만).
- 게임 기능·새 화면 추가 금지 (이번 범위는 계약·배선·측정뿐).
- 스트리밍/점진 분석 도입 금지 — 대신 실카드 최대 크기에서 전체 분석 소요를 측정해 보고서에
  기록한다 (30초 초과 카드가 실측되면 그때 별도 성능 스펙으로 발주).
- 기존 로어 회로 동작 변경 금지 (레지스트리 경유 후에도 동일해야 함).

## 3. 완료 조건

1. `pnpm check` + 전체 테스트 + E2E + 경계 검사 통과.
2. 로어 회로가 레지스트리 경유로 기존과 동일하게 작동 (기존 E2E 그대로 통과).
3. 대형 실카드에서 특정 에셋 1장 로드가 전체 파일 복사 없이 동작함을 테스트로 증명.
4. NPC 정확도 측정 리포트 3종 + 분석 소요 시간 실측 제출.
5. 커밋 분할: ①AssetResolver ②계약 확장 ③레지스트리·라우터 ④측정. 푸시는 지휘자 검수 후.
