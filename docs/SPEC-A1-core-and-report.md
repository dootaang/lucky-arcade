# SPEC-A1 — 코어 이식 + 공용 데이터 계약 + 카드 적합도 측정기

> 발주: 지휘자, 2026-07-23. 구현: Codex. 로드맵 2~4단계에 해당.
> 이 저장소의 [README](../README.md)·[ROADMAP](./ROADMAP.md)가 상위 원칙이다.
> 상태: 2026-07-23 구현·실카드 검증 완료. 로어 회로 최종 go/no-go는 ROADMAP 5단계에서 계속한다.

## 목표

게임 UI 없이, 봇카드 파일을 넣으면 **카드별 적합도 보고서**(JSON+Markdown)를 내는 CLI까지 완성한다.
이 보고서가 1호 캐비닛(로어 회로) go/no-go 관문의 입력이다.

## 1. 작업 범위 (건드릴 파일)

새로 만들 것 (pnpm workspace — **[ROADMAP의 모듈화·무이주 계약](./ROADMAP.md) 준수**):

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` — TypeScript strict, vitest
- 의존 방향 검사 스크립트를 `pnpm test`에 포함: contracts←card-io←extract, contracts←engine.
  DOM/React import는 이번 범위의 전 패키지에서 금지하고 공개 `exports` 밖 deep import를 차단한다.
- `packages/contracts/` — Zod 런타임 스키마 + 추론 타입. `Sourced<T> = { value:T, source:'recovered'|'derived'|'heuristic', confidence:number(0~1), evidence:string[], derived?:string }`, 카드 지문·보고서·버전 계약.
- `packages/card-io/` — `BinarySource`와 Node 파일 어댑터, 카드 컨테이너 파싱(charx zip 색인,
  PNG 카드 추출), 카드 지문. 원본 에셋 바이트는 보고서 DTO에 포함하지 않는다.
- `packages/extract/` — 카드 → 놀이 재료
  - `src/lore/` — simbot `packages/risu/src/lore.ts`와 그 의존 `tokens.ts` 이식. **activateLore의 판정 동작을 바꾸지 말 것** (형식 정리 외 로직 수정 금지)
  - `src/graph/` — 신규: 로어 그래프 빌더 + 지표
    - 잠재 그래프: 로어 본문에 다른 로어의 리터럴 키워드가 등장하면 간선. **정규식 키 로어는 노드로 표시하되 기본 그래프에서 `excluded:'regex-key'`로 격리**
    - 지표: Tarjan SCC 압축 → DAG 깊이, BFS 최단거리 지름(최대 유한 최단거리), 시작어 도달률, 고립 노드 비율, 순환 덩어리 비율
    - 퍼즐 후보: (시작 키워드, 목표 로어) 쌍 중 최소 입력 횟수 2~4인 것 열거, 각 후보를 **이식한 activateLore를 시드 고정으로 재실행해 정답 성립을 자동 검증** (실행 그래프 검증)
  - `src/npc/` — simbot `apps/web/src/player/npc-gallery.ts`의 `parseSpriteName`/`buildNpcClusters`를 **후보 그룹화**로 이식하되, 결과를 contract로 감싸고 confidence 휴리스틱(규칙 일치도·`기타` 폴백 비율)을 부여. 추측 보정 추가 금지
- `packages/engine/` — 신규 소형 판정 코어 씨앗: FNV/xorshift 계열 시드 RNG, 입력 기록 배열, 결과 해시(SHA-256), 게임 버전 상수. 의존 0·DOM 금지
- `apps/report-cli/` — CLI: `pnpm report -- <카드파일경로>` → `reports/<지문축약>.json` + `.md`
  - 내용: 카드 지문, 로어 노드/간선 수, SCC 깊이·지름·도달률·고립률, 생성 가능 퍼즐 수(검증 통과 수), NPC 그룹 후보 수와 confidence 분포, 스프라이트 그룹 수, 경제표 존재 여부(숫자 테이블 감지 수준), **가능 캐비닛 판정과 불가 사유** (ROADMAP 우선순위 표 기준)
- 각 패키지 `test/` — vitest: 합성 픽스처로 SCC/지름/도달률/퍼즐 검증 로직 단위 테스트, contract 검증, 시드 RNG 결정론 테스트. **전 코어 테스트는 jsdom 없이 Node에서 실행**
- `scripts/check-boundaries.mjs` — 패키지 의존 방향·DOM/React 금지·deep import 경계를 CI에서 검사
- `scripts/perf-harness.mjs` 또는 동등 테스트 — 50/1,000행동의 p95 성장과 payload 상한 측정
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
5. 커밋 분리: ①문서·워크스페이스 ②이식 ③그래프+측정기. 오너 전체 승인 후 검증된 완료 커밋만 푸시한다.
6. 보고서에는 카드 원문·에셋 바이트를 기록하지 않고 `reports/`는 gitignore한다.
