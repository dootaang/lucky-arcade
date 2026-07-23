# SPEC-C1 — 《소녀전선: 잔불 작전》 전술 오토배틀 로그라이트

> 상태: 상세 구현계획 승인 대기
> 작성: 2026-07-24
> 상위 문서: [ROADMAP](./ROADMAP.md) · [ADR 0001](./adr/0001-modular-performance-foundation.md)
> 원본 엔진: `C:\freetalk\simbot-simulator` 기준 커밋 `4f2d05ed0f1a5f5cc7ae541227383ae454072ced`

## 0. 고정 결정

- 게임: **6칸 제대 편성 + 경로 선택 + 자동전투 + 전리품·수복의 전술 로그라이트**.
- 가칭: **《소녀전선: 잔불 작전》**. 이름은 출시 전 변경 가능하나 패키지 ID는 `gfl-ember`로 고정한다.
- 화면: 기지·편성·지도·보상은 React, 전투 재생은 **LittleJS 1.18.24(MIT)**.
- 사용자는 원본 카드나 에셋 모듈을 업로드하지 않는다. 개발 시 원본을 빌드 도구로 컴파일한
  내장 콘텐츠팩을 캐비닛이 지연 로딩한다.
- 원본 Lua/정규식/DOM/LLM 프롬프트는 실행하지 않는다. 정적으로 회수한 데이터와 검증된 순수 규칙만 사용한다.
- 게임 판정은 LittleJS가 아니라 캐비닛 순수 코어가 소유한다. 전투는 코어가 영수증을 먼저 확정하고
  LittleJS가 재생한다.
- 원본 1.18GB 모듈은 저장소·초기 번들·브라우저 런타임에 넣지 않는다.

## 1. 플레이어에게 보이는 첫 완성본

1. 카드 업로드 없이 오락실에서 `잔불 작전`을 누른다.
2. 균형·화력·방어 추천 제대 중 하나를 고르거나 12명 중 6명을 직접 편성한다.
3. 전열·중열·후열 6칸을 배치하고 작전 지도에 진입한다.
4. 7개 노드에서 교전·정찰·보급·미확인·엘리트·수복 경로를 선택한다.
5. 전투 전에 집중·균형·엄폐 전술과 지휘 개입 1회를 예약한다.
6. 20~40초 동안 인형 초상·표정·총격·피격·컷인으로 8라운드 전투 영수증을 본다.
7. 인형 영입·장비·수복 중 보상 하나를 고르고 다음 노드로 진행한다.
8. 보스를 격파하거나 전리품을 들고 중도 철수한다.
9. 모든 선택 직후 저장되며 탭 이탈·새로고침 뒤 같은 지점에서 이어진다.

한 런 목표 시간은 10~20분이다. 짧게 끝내도록 강제하지 않되 행동·노드 단위로 언제든 중단 가능해야 한다.

## 2. 확인된 원본 재료

### 2.1 실측 콘텐츠

- 카드 내장 에셋 146개: 배경 83, 작전 지도 3, 아이템·장비 등 아이콘 59, 카드 대표 이미지 1.
- 에셋 모듈 이미지 20,960개, 파일명 기반 인물 그룹 약 455개, 평균 비노출 변형 23.5개.
- 네이티브 변환 전술인형 291명: AR 71, SMG 50, SG 28, MG 34, RF 55, HG 53.
- 임무 48, 보스 26(영입 가능 25), 세계관 문서 38.
- 아이템 19종의 실제 드롭률, 장비 제조 일반 22·중형 29 풀.
- 6칸 3열 제대, 병과 상성, 시설 5종, 다단계 작전 3~11단계, 단계 지침 5종.
- 재사용 가능한 simbot 결정론 규칙: 병과 프로필, 행별 피격, 전투 8라운드, 지휘 개입,
  사기·패닉, 정찰, 루팅, 보스 영입, 제조·수복, 500시드 밸런스 하니스.
- C1 인형 12명과 Scarecrow는 아래 허용 표정 8종이 실모듈에 모두 존재함을 확인했다.

### 2.2 공개팩 콘텐츠 안전 규칙

모듈에는 공개 게임에 부적합한 변형이 있으므로 금지어 차단이 아니라 **허용목록**만 사용한다.

- C1 허용 표정: `natural`, `serious`, `motivated`, `angry`, `worry`, `exhausted`, `joy`, `defeat`.
- C1 금지: `nude.*` 전체, 성인 의미 표정, 노출·성행위·음주 수면 변형, 허용목록 밖 모든 변형.
- 콘텐츠 빌드는 허용된 `(인물 ID, 표정)` 쌍과 명시 에셋 ID만 받을 수 있다.
- 빌드 결과에 허용목록 밖 파일명이 하나라도 있으면 실패한다.
- UI·로그·소스맵에 원본 금지 파일 경로나 이름을 싣지 않는다.

## 3. C1 수직 시제품 범위

### 3.1 인형 12명

각 병과 2명이며 실카드의 ID·능력치·설명·에셋 연결을 사용한다.

| 병과 | 인형 |
|---|---|
| AR | M4A1, AR-15 |
| SMG | RO635, UMP45 |
| SG | DP-12, M500 |
| MG | M1918, MG5 |
| RF | WA2000, M14 |
| HG | Grizzly_MkV, M950A |

첫 시작은 추천 제대 3종을 제공하고 `추천 배치` 한 번으로 즉시 출격 가능해야 한다.
직접 편성에서는 12명 중 6명을 고르고 전·중·후열 두 칸씩 배치한다.

### 3.2 한 런

- 난이도: 표준 1개.
- 길이: 7노드.
- 고정 뼈대: 일반전 → 선택 노드 → 일반전 → 사건/영입 → 엘리트 → 수복/보급 → 보스.
- 경로 내용과 후보는 `run seed + node id + domain` 이름의 RNG 스트림으로 봉인한다.
- 적 세력: 철혈·E.L.I.D·패러데우스 중 콘텐츠가 완비된 3종.
- 보스: **Scarecrow** 1명(에셋 8종·능력치 연결 확인).
- 전투 전술: `focus | balanced | cover`.
- 지휘 개입: `집중사격 | 긴급엄폐 | 탄막요청`, 라운드 1~8 중 한 곳 예약.
- 보상: 인형 영입, 장비 1개, HP 수복 중 3택.
- 중도 철수: 현재까지 확보한 도감·기록은 보존하고 런 보상은 축소한다.

### 3.3 C1에서 하지 않는 것

- 291명 전체 배포, 관계·연애·성인 콘텐츠, 자유 대화, LLM 호출.
- 기지 시설 강화, 제조 대기열, 숙소 근무, 서약, 질투, 외출.
- 온라인 순위, 계정, 멀티플레이, 가챠 과금.
- 원작 전투 화면 복제, 자유 이동 액션 RPG, 원본 Lua 실행.
- Phaser·Matter·rot.js·PixiJS 동시 도입.

## 4. 게임 규칙과 결정론

### 4.1 상태 계약

```text
GflContentPack
  packId / version
  dolls / factions / bosses / missions
  items / equipment / documents
  assetManifest

GflRunState
  contract / cabinetVersion / packVersion
  sessionId / seed / sequence / phase
  route / currentNodeId
  roster / reserve / formation[6]
  resources / inventory / wounds
  tactic / intervention
  pendingBattle / pendingReward
  completedNodes / outcome
```

지속 프로필과 한 런 상태는 분리한다. C1 프로필은 최고 기록·발견 인형·해금 문서만 갖고,
런 밸런스 수치를 영구 강화하지 않는다.

### 4.2 액션

```text
begin_run
choose_starter
set_formation
confirm_formation
choose_node
choose_tactic
schedule_intervention
resolve_battle
acknowledge_battle
choose_reward
retreat
finish_run
```

- 모든 액션은 순수 리듀서에서 검증한다. 현재 phase에 허용되지 않은 액션은 상태를 바꾸지 않는다.
- `resolve_battle`는 전체 전투 결과와 `BattleTranscript`를 한 번에 확정하고 WAL에 저장한다.
- LittleJS 재생 완료는 결과에 영향을 주지 않는다. 재생 도중 이탈하면 복귀 시 처음부터 재생하거나
  결과 화면으로 건너뛸 수 있다.
- RNG는 단일 소비열이 아니라 `route`, `draft`, `battle:<node>`, `loot:<node>`, `event:<node>`의
  이름 있는 하위 스트림을 사용한다. 연출 RNG는 판정 RNG와 완전히 분리한다.

### 4.3 전투 영수증

```text
BattleTranscript
  battleId / seed / rulesVersion
  alliesBefore / enemiesBefore
  missionCheck / tactic / intervention
  rounds[]
    skills[]
    exchanges[]
      actorId / targetId / hit / critical / damage / hpAfter
    morale[]
  alliesAfter / enemiesAfter
  outcome / loot / resultHash
```

기존 simbot GFL 전투와 100개 고정 시드의 골든 패리티 테스트를 먼저 만들고, 이후 로그라이트에
맞춘 변경은 버전과 변경 근거를 분리한다. `packages/modules/src/gfl.ts` 전체를 복사하지 않는다.

## 5. 목표 파일·패키지 구조

```text
apps/content-cli/
  src/gfl-ember.ts                 원본 카드+모듈 → 최적화 콘텐츠팩

packages/contracts/
  BuiltInCabinetLaunch 계약만 추가

packages/cabinet-sdk/
  ArcadeRuntimeAdapter
  BuiltInCabinetRegistration

cabinets/gfl-ember/
  package.json
  src/
    contracts.ts                   Zod 콘텐츠·저장·영수증 계약
    manifest.ts                    내장 캐비닛 선언
    core/
      state.ts
      reducer.ts
      rng.ts
      formation.ts
      combat.ts
      route.ts
      rewards.ts
      profile.ts
      migration.ts
    react/
      gfl-ember-screen.tsx
      formation-screen.tsx
      route-screen.tsx
      reward-screen.tsx
      debrief-screen.tsx
      runtime/
        littlejs-adapter.ts
        battle-presenter.ts
        portrait-actor.ts
        effects.ts

apps/web/public/content/gfl-ember/<pack-version>/
  manifest.json
  data/*.json
  portraits/<chunk>/*.webp
  backgrounds/*.webp
  icons/*.webp
```

- `cabinets/gfl-ember/core`는 DOM·React·LittleJS를 import할 수 없다.
- LittleJS import는 `react/runtime/littlejs-adapter.ts` 한 경계에서만 허용하고 동적 import한다.
- `scripts/check-boundaries.mjs`에 이 규칙을 추가한다.
- simbot에서 이식한 함수별 원본 경로·커밋·변경점을 `THIRD_PARTY_PROVENANCE.md`에 기록한다.

## 6. 내장 콘텐츠 빌드

### 6.1 입력과 출력

`apps/content-cli`는 로컬 경로로 카드 1개와 모듈 3개를 읽는다. 원본 경로는 설정·저장소에
커밋하지 않고 CLI 인자로만 받는다.

```powershell
pnpm content:gfl -- \
  --card <소녀전선_잔불.png> \
  --module <1.charx> --module <2.charx> --module <3.charx> \
  --selection content-sources/gfl-ember-selection.json \
  --out apps/web/public/content/gfl-ember/<version>
```

출력은 다음을 보장한다.

- 콘텐츠팩 Zod 검증.
- 인형 ID ↔ 능력치 ↔ 에셋 그룹의 유일 연결.
- 허용 표정만 추출.
- 초상 썸네일 256px, 전투 초상 최대 긴 변 768px WebP.
- 배경 최대 1600×900 WebP, 아이콘 최대 256px WebP.
- 동일 바이트 중복 제거와 콘텐츠 해시 파일명.
- manifest에 크기·콘텐츠 해시·MIME·용도를 기록.
- 빌드를 두 번 실행하면 manifest와 출력 해시가 동일.

### 6.2 배포 단위

- `bootstrap`: manifest, 12명 썸네일, 지도, 첫 화면에 필요한 UI 이미지.
- `battle-common`: 배경·아이콘·공용 효과.
- `doll-<id>`: 인형별 허용 표정 묶음.
- `boss-<id>`: 보스 전용 묶음.

현재 편성 6명과 다음 노드에 필요한 적만 선로딩한다. 나머지는 유휴 시간에 받고 실패 시
기본 실루엣으로 진행 가능해야 한다. 전체팩 다운로드를 게임 시작 조건으로 삼지 않는다.

## 7. LittleJS 결합 계약

```ts
interface ArcadeRuntimeAdapter<Transcript> {
  mount(host: HTMLElement): Promise<void>;
  preload(assetIds: readonly string[]): Promise<void>;
  play(transcript: Transcript, options: { speed: 1 | 2 | 4 }): Promise<void>;
  pause(): void;
  resume(): void;
  destroy(): void;
}
```

- React는 상태·메뉴·접근성·오버레이 버튼을 소유한다.
- LittleJS canvas는 전투 재생만 소유하며 게임 상태를 직접 변경하지 않는다.
- `visibilitychange`, route 이탈, React unmount에서 즉시 pause/destroy한다.
- destroy 후 requestAnimationFrame, 이벤트 리스너, 오디오 노드, 텍스처, Object URL이 0개 남아야 한다.
- 전투 연출은 초상 이동, 사격선, 섬광, 탄피, 피해 숫자, 흔들림, 병과 스킬 컷인으로 구성한다.
- 원본 애니메이션 프레임을 발명하지 않는다. 정지 초상 전환과 엔진 효과로 연출한다.
- 음원은 원본에 없으므로 C1은 LittleJS/ZzFX의 짧은 합성 효과음만 사용한다. BGM은 별도 권리 확보 전 금지한다.

## 8. 내장 캐비닛 배선

현재 `CabinetViewProps`가 사용자 분석 카드만 받으므로 다음처럼 확장한다.

```text
CabinetLaunchContext
  kind: analyzed-card | built-in
  analyzed-card → AnyAnalyzedCard
  built-in      → packId + packVersion + manifestUrl
```

- `gfl-ember`는 `built-in` 등록이며 카드 보관함이 비어도 로비에 표시한다.
- 사용자 카드 기반 기존 캐비닛의 자동 선택 순서는 변경하지 않는다.
- 앱 셸은 장르별 조건문을 추가하지 않고 등록부의 launch kind와 loader만 읽는다.
- 콘텐츠 manifest를 읽지 못하면 기존 오락실은 정상 동작하고 잔불 작전 카드만 재시도 상태가 된다.

## 9. 저장·중단 복귀

- IndexedDB v2에 `actions`의 `(sessionId, sequence)` 복합 인덱스를 추가해 전체 행동 조회를 없앤다.
- `SnapshotRecord`에 `packVersion`을 포함한 캐비닛 저장 계약을 사용한다.
- 액션 WAL을 먼저 확정하고 스냅샷은 노드 완료·편성 확정·보상 선택 시 저장한다.
- 전투 재생 중 닫혀도 `resolve_battle` 영수증이 이미 저장되어 같은 결과를 복구한다.
- visibility hidden 시 100ms 안에 재생 정지, 마지막 확정 액션 이후 저장 Promise를 시작한다.
- 구 콘텐츠팩이 제거됐으면 조용히 새 팩으로 섞지 않고 호환 마이그레이션 또는 명시적 런 종료를 제공한다.

## 10. 성능 예산

| 항목 | 관문 |
|---|---:|
| 기존 초기 JS gzip | 200KiB 이하 유지 |
| LittleJS·잔불 캐비닛 | 초기 청크에 포함되면 실패, 캐비닛 진입 시만 로드 |
| 첫 버튼 시각 반응 | p95 50ms 이하 |
| 캐시된 콘텐츠로 전투 준비 | p95 500ms 이하 |
| 최초 bootstrap 콘텐츠 | 목표 10MiB 이하, 초과 시 분할 재설계 |
| 전투 프레임 | 기준 모바일 p95 20ms 이하, 50ms 장기 프레임 0 |
| 런 20회 후 메모리 | 캐비닛 이탈 후 기준선 +20MiB 이내 |
| 저장 성장 | 7노드 런 100회에서 행동 조회 p95 성장 1.2배 이하 |

이미지는 화면에 쓰일 크기로만 디코드하고, 현재 제대·다음 적 외 에셋은 GPU 텍스처로 만들지 않는다.

## 11. 테스트와 완료 관문

### 11.1 콘텐츠

- 12명 전원: 병과·능력치·설명·허용 표정 6개 이상·대표 이미지 연결.
- 배경·지도·아이콘 누락 0.
- 금지 에셋 검사 0건.
- 동일 입력 재빌드 해시 동일.

### 11.2 코어

- 같은 seed+action log는 상태·전투 영수증·결과 해시 동일.
- 이름 있는 RNG 스트림 사이 소비 독립.
- 6칸 행·병과·상성·지휘 개입 단위 테스트.
- simbot 전투 100시드 골든 패리티 또는 의도된 차이 목록.
- 최소 5,000시드 몬테카를로: 추천 제대와 역배치 차이, 병과별 사용률, 보스 완주율, 특정 인형 독점률 보고.
- 저장 마이그레이션과 중간 전투 복구.

### 11.3 화면

- 데스크톱·모바일 한 런 완주 E2E.
- 전투 재생 중 새로고침 → 동일 결과 복구.
- 전투 중 탭 이탈 → 자동 일시정지 → 복귀 재생.
- 1×/2×/4× 속도에서 결과 동일.
- 캐비닛 이탈 후 루프·오디오·Object URL 해제.
- 네트워크에서 한 인형팩 로드 실패 시 실루엣 폴백으로 완주.

### 11.4 제품 관문

- 오너가 추천 제대로 설명 없이 첫 교전을 시작할 수 있다.
- 편성을 바꿨을 때 전투 결과와 화면에서 차이를 느낀다.
- 최소 한 번 `다음 노드`를 자발적으로 누른다.
- 중단 후 복귀가 불안하거나 느리지 않다.
- 재미 검증 전 291명·기지 경영·장기 메타로 확장하지 않는다.

## 12. 구현 순서

### C1-0 — 콘텐츠 선택 고정

1. 12명·표정·배경·아이콘 selection manifest 고정.
2. LittleJS 1.18.24 라이선스·버전 provenance 기록.

완료 산출물: selection manifest와 선택 결과 감사 보고서.

### C1-1 — 콘텐츠 컴파일러

1. 카드와 3개 ZIP 중앙 목차 지연 읽기.
2. simbot GFL 정적 컴파일러의 데이터 회수 함수를 순수 모듈로 선별 이식.
3. SFW 허용목록 추출·리사이즈·중복 제거·콘텐츠팩 생성.
4. 콘텐츠 감사 CLI와 재현성 테스트.

완료 관문: 원본 1.18GB를 메모리에 일괄 해제하지 않고 C1 팩 생성, 감사 0오류.

### C1-2 — 내장 캐비닛·런타임 경계

1. built-in launch 계약과 레지스트리 추가.
2. `ArcadeRuntimeAdapter` 계약 추가.
3. `gfl-ember` 빈 캐비닛을 동적 로딩하고 진입·이탈 자원 해제 검증.
4. 기존 3개 캐비닛 회귀 유지.

완료 관문: 카드가 0장이어도 잔불 작전 진입, 초기 번들 증가 없음.

### C1-3 — 순수 전투 수직 절편

1. 12명 데이터·6칸 편성·병과 프로필 이식.
2. 전술·개입·8라운드 전투 영수증.
3. simbot 골든 패리티·5000시드 밸런스.
4. 편성 UI와 텍스트 전투 보고서로 먼저 완주.

완료 관문: 캔버스 없이도 한 전투를 완전히 플레이·저장·복구.

### C1-4 — LittleJS 전투 재생

1. LittleJS 지연 import와 canvas 수명주기.
2. 배경·초상·표정·총격·피격·스킬 컷인.
3. 재생 속도·일시정지·건너뛰기.
4. 모바일 프레임·메모리 관문.

완료 관문: 같은 영수증을 모든 속도에서 같은 결과로 재생하고 이탈 후 자원 누수 0.

### C1-5 — 7노드 런

1. 경로 생성과 노드 선택.
2. 보상 3택·영입·장비·수복·철수.
3. 보스전·결산·발견 도감.
4. WAL·스냅샷·중단 복귀 E2E.

완료 관문: 데스크톱·모바일에서 한 런 완주, 중간 새로고침 복구.

### C1-6 — 오너 재미 검증과 확장 판정

오너 실플레이 뒤 하나만 선택한다.

- GO: 24명·3보스·시설 메타 확장.
- ADJUST: 전투 속도·선택 밀도·보상 구조만 수정.
- STOP: 에셋·전투 코어를 덱빌더 또는 순수 오토배틀러 시제품으로 재사용.

## 13. 구현 중 변경 권한

- 타입명·파일 배치는 경계와 공개 계약을 지키는 범위에서 조정 가능하다.
- 숫자 밸런스는 몬테카를로 보고서와 함께 조정 가능하다.
- C1 인형·보스 교체는 실제 에셋 누락이나 데이터 불일치 때만 하고 이유를 기록한다.
- 장르, 통짜 엔진, 원본 실행 금지, 허용 에셋 정책, 판정/표현 분리는 오너 승인 없이 바꾸지 않는다.
