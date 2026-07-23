# SPEC-A1 — 코어 이식 + 공용 데이터 계약 + 카드 적합도 측정기

> 발주: 지휘자, 2026-07-23. 구현: Codex. 로드맵 2~4단계에 해당.
> 이 저장소의 [README](../README.md)·[ROADMAP](./ROADMAP.md)가 상위 원칙이다.

## 목표

게임 UI 없이, 봇카드 파일을 넣으면 **카드별 적합도 보고서**(JSON+Markdown)를 내는 CLI까지 완성한다.
이 보고서가 1호 캐비닛(로어 회로) go/no-go 관문의 입력이다.

## 1. 작업 범위 (건드릴 파일)

새로 만들 것 (pnpm workspace):

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` — TypeScript strict, vitest
- `packages/core/` — 이식 + 신규 순수 로직
  - `src/contract.ts` — 공용 데이터 계약 `Sourced<T> = { value:T, source:'recovered'|'derived'|'heuristic', confidence:number(0~1), evidence:string[], derived?:string }` (derived에는 공식/근거 설명)
  - `src/card/` — simbot `packages/card/src`에서 카드 컨테이너 파싱(charx zip 색인, PNG 카드 추출)과 카드 지문에 필요한 **순수 함수만** 이식
  - `src/lore/` — simbot `packages/risu/src/lore.ts`와 그 의존 `tokens.ts` 이식. **activateLore의 판정 동작을 바꾸지 말 것** (형식 정리 외 로직 수정 금지)
  - `src/graph/` — 신규: 로어 그래프 빌더 + 지표
    - 잠재 그래프: 로어 본문에 다른 로어의 리터럴 키워드가 등장하면 간선. **정규식 키 로어는 노드로 표시하되 기본 그래프에서 `excluded:'regex-key'`로 격리**
    - 지표: Tarjan SCC 압축 → DAG 깊이, BFS 최단거리 지름(최대 유한 최단거리), 시작어 도달률, 고립 노드 비율, 순환 덩어리 비율
    - 퍼즐 후보: (시작 키워드, 목표 로어) 쌍 중 최소 입력 횟수 2~4인 것 열거, 각 후보를 **이식한 activateLore를 시드 고정으로 재실행해 정답 성립을 자동 검증** (실행 그래프 검증)
  - `src/npc/` — simbot `apps/web/src/player/npc-gallery.ts`의 `parseSpriteName`/`buildNpcClusters`를 **후보 그룹화**로 이식하되, 결과를 contract로 감싸고 confidence 휴리스틱(규칙 일치도·`기타` 폴백 비율)을 부여. 추측 보정 추가 금지
  - `src/seed/` — 신규 소형 판정 코어 씨앗: FNV/xorshift 계열 시드 RNG, 입력 기록 배열, 결과 해시(SHA-256), 게임 버전 상수
- `tools/report/` — CLI: `pnpm report -- <카드파일경로>` → `reports/<지문축약>.json` + `.md`
  - 내용: 카드 지문, 로어 노드/간선 수, SCC 깊이·지름·도달률·고립률, 생성 가능 퍼즐 수(검증 통과 수), NPC 그룹 후보 수와 confidence 분포, 스프라이트 그룹 수, 경제표 존재 여부(숫자 테이블 감지 수준), **가능 캐비닛 판정과 불가 사유** (ROADMAP 우선순위 표 기준)
- `packages/core/test/` — vitest: 합성 픽스처로 SCC/지름/도달률/퍼즐 검증 로직 단위 테스트, contract 검증, 시드 RNG 결정론 테스트
- `docs/THIRD_PARTY_PROVENANCE.md` — simbot 이식분 확정 기록 (원본 커밋 `a1d74c6`, 파일 목록, 변경 내용)

이식 원본 위치: `C:\freetalk\simbot-simulator` (읽기만 할 것).

## 2. 금지사항

- LLM 호출·네트워크 요청 코드 금지 (pnpm install 제외)
- UI(React/DOM) 코드 금지 — 이번 범위는 코어+CLI뿐
- 카드 Lua/JS 실행 금지, 카드 파일을 저장소에 커밋 금지 (.gitignore 준수)
- simbot 저장소 수정 금지. PlaySession·세션 저장·LLM·프롬프트·UI 코드 이식 금지
- activateLore 판정 로직 변경 금지, 최장 단순 경로 지표 사용 금지(ROADMAP 정의 준수)
- 캐릭터 강함·성격 등 의미 추측으로 수치 합성 금지 — 모든 derived 값은 공식을 evidence에 남길 것

## 3. 완료 조건

1. `pnpm install && pnpm test` 통과 (TS strict, 신규 로직 단위 테스트 포함)
2. `pnpm report -- C:\freetalk\용사여관.charx` 가 JSON+MD 보고서를 생성하고,
   `C:\freetalk\소녀전선` 아래 실카드 PNG 1종에서도 성공
3. 보고서의 모든 퍼즐 후보가 activateLore 재실행 검증을 통과한 것만 집계됨
4. PROVENANCE에 이식 파일·커밋·변경 내용 기록 완료
5. 커밋 분리: ①워크스페이스 ②이식 ③그래프+측정기. 푸시는 하지 말 것(지휘자 검수 후)
