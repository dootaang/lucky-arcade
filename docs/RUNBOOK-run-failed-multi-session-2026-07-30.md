# Run failed 대응 런북 — 다중 세션·Playwright·IndexedDB

> 작성일: 2026-07-30  
> 관련 수정: `7cbb42a test: align casino e2e with current contracts`  
> 목적: 새 Codex·Claude Code 세션이 맥락 없이 들어와도 반복되는 `run failed`를 환경 장애와 코드 회귀로 나누어 진단한다.

## 1. 이번 장애의 결론

`run failed`는 한 가지 문제가 아니었다. 아래 세 문제가 겹쳤다.

1. 이전 시각 검수에서 남은 Vite 개발 서버가 `127.0.0.1:4173`을 계속 점유했다.
2. 카지노 계약이 바뀌었는데 E2E의 고정 기대값이 예전 값에 머물렀다.
3. 앱 IndexedDB는 버전 8인데 E2E 7곳이 버전 7로 열려고 했다.

환경 충돌을 없앤 뒤에도 테스트가 계속 실패했기 때문에, 포트 문제만 고치고 종료하면 안 됐다. 환경을 먼저 정상화한 다음 실제 실패를 한 건씩 실행하여 코드와 테스트 계약을 대조해야 했다.

## 2. 관측된 증상과 실제 원인

### 2.1 Playwright/Vite가 시작하지 못하거나 반복해서 실패

- 포트: `4173`
- 당시 잔류 프로세스: pnpm → Vite 자식 프로세스
- 원인: 이전 브라우저 검수 세션이 끝났지만 개발 서버 프로세스 체인이 살아 있었다.

포트를 쓰는 프로세스라고 무조건 종료하지 않는다. 반드시 명령행이 이 저장소의 Vite/Playwright 서버인지 확인한 뒤 정확한 PID만 종료한다.

```powershell
Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess

Get-CimInstance Win32_Process |
  Where-Object { $_.ProcessId -eq <PID> } |
  Select-Object ProcessId, ParentProcessId, CommandLine
```

확인 후에만 다음을 실행한다.

```powershell
Stop-Process -Id <확인한-PID>
```

### 2.2 명예의 전당 행 수 `Expected 36, Received 35`

현재 계약은 NPC 34명과 플레이어 1명, 총 35행이다. 플레이어 행이 누락된 것이 아니다. NPC 명부가 35명에서 34명으로 개정됐는데 E2E만 이전 계약인 `35 NPC + 플레이어 = 36`을 요구했다.

현재 검증은 다음 세 조건을 각각 확인한다.

- 전체 35행
- NPC 34행
- `.is-user` 플레이어 행 정확히 1개

관련 파일: `e2e/arcade.spec.ts`

### 2.3 최근 정산·라이브 테이프 `Expected 8, Received 4`

두 패널은 **항상 8건을 생성하는 계약이 아니라 최대 8건을 보여 주는 뷰**다. UTC/KST 시각과 실제 결정론 사건 분포에 따라 4건만 존재할 수 있다.

정상 검증은 다음과 같다.

- 현재 사건이 한 건 이상 보인다.
- 표시 건수는 8건 이하이다.
- 손익 행과 실제 텍스트 형식은 별도로 검증한다.

정확히 8건을 강제하면 시각에 따라 정상 구현이 실패한다. 테스트 데이터에서 정확한 고정 시각을 주입하지 않은 이상, 시간 의존 목록에 고정 건수를 사용하지 않는다.

### 2.4 라이브 테이블 `is-active`가 0개

특정 시각에는 다섯 테이블 모두 `open`일 수 있다. 이것은 정상 상태다. 적어도 하나가 반드시 `active`라고 가정하면 시간대에 따라 실패한다.

현재는 다섯 테이블 각각이 아래 유효 상태 중 하나인지 검증한다.

- `open`
- `playing`
- `settling`
- `leaving`

### 2.5 IndexedDB `VersionError`

대표 오류:

```text
VersionError: The requested version (7) is less than the existing version (8).
```

앱의 정본은 `apps/web/src/lib/database.ts`의 `VERSION = 8`이다. 앱이 먼저 v8 DB를 만든 뒤 E2E가 `indexedDB.open("lucky-arcade", 7)`을 호출하여 일곱 시나리오가 동시에 실패했다.

2026-07-30 수정에서는 E2E 호출을 v8로 정렬했다. 앞으로 DB 버전을 올릴 때는 다음 검색도 같은 변경에 포함한다.

```powershell
rg -n 'indexedDB\.open\("lucky-arcade"|const VERSION' apps/web e2e
```

장기적으로는 테스트가 앱의 DB 계약 버전을 공유하도록 만드는 편이 낫다. 다만 브라우저 `page.evaluate` 경계에서 값을 안전하게 주입해야 하므로, 단순히 앱 모듈을 페이지 함수 안에서 참조해서는 안 된다.

## 3. 새 세션이 시작할 때 반드시 확인할 것

### 3.1 현재 브랜치와 작업 디렉터리 소유권

다른 세션이 같은 폴더에서 브랜치를 바꾸면 모든 세션의 파일 화면이 동시에 바뀐다. 작업 시작 전에 아래를 확인한다.

```powershell
git status --short --branch
git worktree list
git log -3 --oneline
```

원칙:

- Codex/Claude 세션 하나당 별도 worktree 하나를 사용한다.
- 세션마다 별도 브랜치를 사용한다.
- 다른 세션이 사용하는 공용 루트에서 `git switch`, `git checkout`, 대규모 생성기를 실행하지 않는다.
- 비추적 파일은 소유자가 불명확하면 수정·삭제·커밋하지 않는다.
- 커밋할 때 `git add -A` 대신 작업한 파일을 명시한다.

권장 예시:

```powershell
git worktree add C:\freetalk\lucky-arcade-<작업명> -b codex/<작업명> origin/main
```

### 3.2 서버 포트

Playwright의 웹 서버는 현재 4173을 사용한다. 같은 저장소에서 전체 E2E 두 개를 동시에 실행하지 않는다. 병렬 세션은 다음 중 하나를 택한다.

- 한 세션만 E2E를 소유하고 나머지는 타입·단위 테스트만 실행한다.
- 별도 Playwright 설정과 별도 포트를 명시적으로 사용한다.
- 기존 서버 재사용 여부를 추측하지 말고 포트와 PID를 먼저 확인한다.

### 3.3 작업 트리

테스트가 생성한 파일과 사용자 파일을 구분한다. `git status --short`에 보인다는 이유만으로 삭제하지 않는다. 특히 첨부 이미지, 설계 초안, 원본 카드 추출물은 다른 세션 또는 사용자의 작업일 수 있다.

## 4. 권장 진단 순서

`run failed`가 보이면 전체 테스트를 무작정 반복하지 말고 아래 순서로 좁힌다.

1. `git status --short --branch`와 `git worktree list`로 브랜치 충돌을 확인한다.
2. 4173 포트와 프로세스 명령행을 확인한다.
3. `pnpm boundaries`와 해당 패키지 `typecheck`로 빠른 정적 검사를 한다.
4. 실패한 Playwright 한 건만 `--grep`으로 재현한다.
5. 첫 실패를 고친 뒤 같은 시나리오를 끝까지 다시 돌린다. 한 시나리오 안에 오래된 기대값이 여러 개 있을 수 있다.
6. 공통 원인이면 관련 실패 묶음만 먼저 실행한다.
7. `pnpm check`를 실행한다.
8. 마지막에 `pnpm test:e2e` 전체를 실행한다.
9. 종료 뒤 4173 포트가 비었는지 확인한다.

이번에 사용한 핵심 명령:

```powershell
pnpm boundaries
pnpm --filter @lucky-arcade/web typecheck
pnpm exec playwright test e2e/arcade.spec.ts --project=desktop-chromium --grep "loads the living ledger"
pnpm check
pnpm test:e2e
```

## 5. 수정 후 검증 기준선

커밋 `7cbb42a` 기준 결과:

- `pnpm check`: 통과
- 전체 Playwright: 33 통과, 9 의도적 스킵, 0 실패
- 초기 JavaScript gzip: 159.6 KiB / 200 KiB
- 테스트 종료 후 4173 포트: 비어 있음

이 기준선보다 앞선 브랜치에서는 같은 실패가 다시 보일 수 있다. 먼저 해당 커밋이 포함됐는지 확인한다.

```powershell
git merge-base --is-ancestor 7cbb42a HEAD
```

종료 코드가 0이면 포함된 것이다.

## 6. 다시 발생했을 때 성급히 결론 내리지 말 것

- `run failed`만 보고 서버 장애라고 단정하지 않는다.
- 포트만 비운 뒤 해결됐다고 보고하지 않는다. 실제 실패 테스트를 다시 실행한다.
- 화면 행이 예상보다 적다고 데이터 누락으로 단정하지 않는다. `slice(0, N)`은 최대치일 수 있다.
- 시간 기반 결정론 UI에 고정 행 수·반드시 활성 상태 같은 현실 시간 의존 단언을 넣지 않는다.
- IndexedDB `VersionError`가 나면 저장소 손상이나 사용자 데이터 삭제부터 시도하지 않는다. 먼저 코드와 테스트의 DB 버전을 대조한다.
- 다른 세션의 브랜치나 비추적 파일을 정리한다는 명목으로 되돌리거나 삭제하지 않는다.

## 7. 새 작업자에게 전달할 한 문장

> 이 저장소에서 `run failed`가 반복되면 `docs/RUNBOOK-run-failed-multi-session-2026-07-30.md`를 먼저 읽고, 브랜치/worktree → 4173 포트 → IndexedDB 버전 → 시간 의존 E2E 기대값 순서로 확인하라.
