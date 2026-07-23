# UI 레이아웃 기준본 (2026-07-23 오너 승인)

디자인 재료: `C:\freetalk\디자인` — ① shadcn/ui dashboard-01 블록(구조) ② Uiverse.io 스니펫 모음(표면 질감).
방향 한 줄: **진지한 계기판 구조 + 장난감 촉감**.

## 스택 (확정)

React + Vite + TypeScript + Tailwind + shadcn/ui (+ Tabler Icons, Recharts, TanStack Table).
simbot-simulator(Svelte)와 별개 스택 — 이식 대상은 순수 TS라 프레임워크 무관.

## 셸 매핑 (dashboard-01 → 오락실)

| dashboard-01 부품 | 오락실 역할 |
|---|---|
| Sidebar 브랜드 | 럭키★오락실 로고 |
| Quick Create 강조 버튼 | **카드 가져오기** (제1 행동) |
| 주 내비 | 로비 · 카드 보관함 · 캐비닛 · 도감 · 기록 |
| 보조 내비(하단) | 설정 · 도움말 |
| 푸터 유저 카드 | 현재 선택된 봇카드 (썸네일+이름+지문 축약) — 계정 대신 카드가 유저 |
| SiteHeader | 현재 화면 제목 + 캐비닛 내 탭 |
| SectionCards 4스탯 | 로비: 보유 카드 수 · 총 발굴률 % · 오늘의 도전 상태 · 최고 기록 |
| ChartAreaInteractive | 발굴률/점수 추이 (기간 토글 재활용) |
| DataTable | 카드 보관함 목록 + 적합도 리포트 (가능 캐비닛/불가 사유 = 상태 배지, 행 클릭 → 상세 드로어) |

## 화면 지도

로비(스탯+오늘의 도전+최근 카드) → 카드 보관함(테이블+드롭존) → 캐비닛 플레이(전체 화면, 사이드바 접힘)
→ 도감(190×254 카드 그리드) → 기록(도전 코드·리플레이) → 설정.

## 마이크로 인터랙션 배치 (Uiverse 스니펫)

| 순간 | 스니펫 |
|---|---|
| 카드 분석(파싱) 대기 | 햄스터 휠 로더 (Nawsome) |
| 로어 기록·도감 카드 | 190×254 플립 카드 — 앞 요약, 뒤 원문 (joe-watson-sbf / ElSombrero2) |
| 희귀 발견 | 주황 회전 글로우 보더 (ElSombrero2 back) |
| 발굴 성공·도전 완료 | 체크 폭죽·취소선 (JkHuger) |
| 도감 즐겨찾기 | 하트 파티클 (catraco) |
| 캐비닛 시작 버튼 | 네온 스트로크 hover (satyamchaudharydev, #37FF8B) |
| 카드 눌림 | 글래스 클릭 카드 scale/기울임 (SteveBloX) |
| 3D 틸트 | kennyotsu — **데스크톱 hover 한정** (원작자 모바일 janky 경고 존중), 모바일은 눌림 효과로 대체 |

## 접근성·모바일 (simbot UX 리뉴얼 원칙 승계)

- 터치 영역 최소 44×44 CSS px, 본문 하한 13px (로그 ID·기술 코드만 11~12px 허용)
- 색상만으로 상태 구분 금지, 아이콘 전용 버튼에 접근 가능한 이름
- 다크/라이트 양 테마 (Tailwind dark: + shadcn 토큰)
- 모바일: 사이드바 offcanvas, 캐비닛 플레이는 하단 탭 없는 전체 화면 몰입형
- 애니메이션 감소 설정(prefers-reduced-motion) 존중 — 파티클·틸트·웨이브 전부

## 스타일 규율

- 색·간격은 shadcn 토큰(CSS 변수) 우선. 컴포넌트에 직접 HEX 추가 금지 (Uiverse 스니펫 이식 시
  액센트 색은 토큰으로 승격해 재사용).
- Uiverse 스니펫은 `src/styles/flair/` 아래 파일 단위로 격리하고 PROVENANCE에 원작자 기록.
