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

- 원본: https://github.com/dootaang/sim-simulator
- 대상(예정): `packages/card/src`(카드 컨테이너 파싱·zip 색인·카드 지문),
  `packages/risu/src/lore.ts`·`tokens.ts`(로어 정규화·활성화 판정·토큰 추정)
- 원칙: 순수 함수만 이식한다. UI·PlaySession·LLM 경로·대형 저장 엔진은 이식 금지.
- 이식 시 이 절에 커밋 해시와 파일 목록·변경 내용을 확정 기록한다.

### shadcn/ui dashboard-01 블록 (MIT)

- 원본: https://github.com/shadcn-ui/ui — 대시보드 예제 블록(사이드바·통계 카드·차트·데이터 테이블)
- 용도: 앱 셸 레이아웃 골격. 컴포넌트는 shadcn CLI로 생성 후 우리 화면에 맞게 수정.

### Uiverse.io 마이크로 인터랙션 스니펫 (MIT)

- 원본: https://uiverse.io — 순수 CSS 스니펫. 채택한 스니펫은 원작자명을 아래에 기록한다.
- 채택 예정 목록(디자인 기준본 `docs/UI-LAYOUT.md` 참조): 햄스터 휠 로더(Nawsome),
  하트 좋아요 버튼(catraco), 체크리스트 완료 애니메이션(JkHuger), 글래스 클릭 카드(SteveBloX),
  네온 스트로크 버튼(satyamchaudharydev), 플립 카드(joe-watson-sbf, ElSombrero2),
  3D 틸트 카드(kennyotsu — 데스크톱 한정), 토글 스위치(namecho) 등.
