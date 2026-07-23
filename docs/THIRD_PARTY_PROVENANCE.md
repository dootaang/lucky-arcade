# 외부 코드·디자인 출처 (Third-Party Provenance)

이 프로젝트(GPL-3.0-or-later)에 선별 이식·참조한 외부 자산의 출처를 기록한다.
새 이식이 생길 때마다 이 문서에 원본 저장소·커밋/버전·파일·우리 변경 내용을 추가한다.

## 규약

- 코드 이식: 원본 저장소, 커밋 또는 버전, 파일 경로, 라이선스, 우리가 바꾼 내용을 명시한다.
- 디자인 스니펫: 출처 사이트와 원작자 표기를 남긴다.
- 라이선스 불명 코드는 이식하지 않는다. 링크 모음(js13kGames 등)은 구조 참고 전용이며
  실제 이식 전 작품별 라이선스 감사를 통과해야 한다.

## 이식 기록

### simbot-simulator (GPL-3.0-or-later, 자매 프로젝트)

- 원본: https://github.com/dootaang/lucky-simulator
- 기준 커밋: `a1d74c6` (2026-07-20). 아래 원본 파일은 이 커밋부터 2026-07-23 HEAD까지 내용 차이가 없음.
- 라이선스: GPL-3.0-or-later.
- 원본 `packages/risu/src/lore.ts`, `tokens.ts` → `packages/extract/src/lore.ts`, `tokens.ts`:
  `normalizeLoreEntries`, `activateLore`, 토큰 예산 판정 의미를 유지해 이식하고 포맷만 정리했다.
- 원본 `packages/card/src/{index,zip-index,png}.ts` → `packages/card-io/src/{parser,zip,source}.ts`:
  형식 판별·PNG 메타데이터·CharX 중앙 디렉터리 규칙을 참고하되, 전체 압축 해제 대신
  `BinarySource` 구간 읽기와 에셋 지연 참조로 재설계했다.
- 원본 `apps/web/src/player/npc-gallery.ts`의 `parseSpriteName`/`buildNpcClusters` →
  `packages/extract/src/npc.ts`: 파일명 구조 그룹화만 이식하고 confidence/evidence 계약을 추가했다.
- 가져오지 않음: UI, PlaySession, LLM·프롬프트, 세션 저장, Lua/JS 실행, 카드 원문 재배포 경로.

### 직접 의존 오픈소스

- LittleJS 1.18.24(MIT): `gfl-ember` 캐비닛의 전투 영수증 재생용 Canvas 표현 엔진. 게임 판정과 상태 변경에는 사용하지 않는다.

- React 19.2.8, React Router 8.3.0, Vite 8.1.5, Tailwind CSS 4.3.3: 각 패키지 공식 라이선스 조건으로 웹 셸에 사용.
- Zod 4.4.3(MIT): 외부 카드·보고서 런타임 계약 검증.
- fflate 0.8.3(MIT): 필요한 ZIP 항목의 DEFLATE 해제.
- @noble/hashes 2.2.0(MIT): 브라우저·Node 공용 SHA-256 결과 해시.
- Tabler Icons 3.45.0(MIT): 웹 셸 아이콘.

### shadcn/ui 구조 (MIT)

- 원본: https://github.com/shadcn-ui/ui — 대시보드 예제 블록(사이드바·통계 카드·차트·데이터 테이블)
- 현재 적용: 모노레포 `packages/ui` 배치와 `components.json` 규격. dashboard-01 화면 코드는 아직 이식하지 않음.

### Uiverse.io 마이크로 인터랙션 스니펫 (MIT)

- 원본: https://uiverse.io — 순수 CSS 스니펫. 채택한 스니펫은 원작자명을 아래에 기록한다.
- 채택 예정 목록(디자인 기준본 `docs/UI-LAYOUT.md` 참조): 햄스터 휠 로더(Nawsome),
  하트 좋아요 버튼(catraco), 체크리스트 완료 애니메이션(JkHuger), 글래스 클릭 카드(SteveBloX),
  네온 스트로크 버튼(satyamchaudharydev), 플립 카드(joe-watson-sbf, ElSombrero2),
  3D 틸트 카드(kennyotsu — 데스크톱 한정), 토글 스위치(namecho) 등.
