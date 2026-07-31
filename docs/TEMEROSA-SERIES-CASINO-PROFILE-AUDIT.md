# 테메로세 시리즈 카지노 프로필 감사

## 감사 결과

2026-07-31 기준 생성물은 116개 명부 항목과 1:1로 대응한다. Overture 12, Root2 18, Bestiaization 57, Finale 29이며 중복 `npcId`와 미배정 ID가 없다.

| 검사 | 결과 |
|---|---|
| 명부 116개 완전 대응 | 통과 |
| 편집 그룹 116개, 중복 0 | 통과 |
| active 최소 근거 1개 | 통과 |
| evidenceRefs 허용 정보만 포함 | 통과 |
| 난수·해시 기반 배정 | 0건 |
| 동일 canonical 인물의 시리즈별 ID 유지 | 통과 |
| 기존 34명 감사 | 33 successor 보존, guest Nemo 명부 밖 |
| 기존 값의 다른 시리즈판 복제 | 0건 |
| 허용되지 않은 게임 ID | 0건 |
| bps 정수 범위 0~10000 | 통과 |
| house/dealer/host 일반 참가 자동 진입 | 0건 |
| 원문 로어 본문/대사 포함 | 0건 |
| 생성 결정론 | 통과 |

## 근거 경계

근거 참조는 `series`, `loreItem.entryIndex`, `loreItem.label`, `sha256`만 저장한다. 원문 본문, 화법, 대사, 에셋 목록, 별칭 목록은 생성물에 없다. active 101개는 각자 최소 하나의 SHA-256 근거를 가지며, 명부의 동일 항목 인덱스·해시와 일치한다.

이미지 전용 Female, Male, Nieun Pluto, Riel은 근거 부족으로 `needs-confirmation`이다. Riel은 기존 casino 프로필의 유일 successor이므로 수치 보존 감사에는 포함되지만, 상태 게이트가 자동 참가를 막는다. 정체가 집합적이거나 불명확하거나 참가 적합성 검토가 필요한 나머지 9개도 같은 상태다.

## 기존 34명 보존

`TEMEROSA_LEGACY_NPC_SUCCESSORS`를 기준으로 33개 4시리즈 successor의 다음 값을 기존 작성 계약에서 bps로 옮겨 보존했다.

- risk appetite, win pressing → stake aggression, loss chasing, discipline
- sessions per day
- preferred table ID 순서
- old-maid, match-pairs, high-low 숙련도
- poker read/bluff의 기존 결합 규칙을 사용한 Indian Poker와 Five-card Draw 숙련도

슬롯 숙련도와 successor의 라운드 범위는 원본에 직접 대응 필드가 없어 `balance`로 표시한다. guest Nemo는 4시리즈 명부가 아니므로 승계 대상 33개 집계에서 제외했다. 보존 수치는 오직 지정 successor에만 적용하며 같은 canonical 인물의 다른 시리즈 ID에는 적용하지 않는다.

## 역할·활성화 감사

Root2 Wares와 Finale Wares는 `house`, `inactive`, 방문 0, 선호 테이블 없음으로 생성된다. 현재 명부에는 dealer/host가 없지만 테스트는 `house | dealer | host` 모두 동일한 자동 진입 금지 조건을 적용한다.

`needs-confirmation` 프로필은 경제 예산과 수입을 0으로 두어 통합자가 상태를 무시하더라도 경제 흐름에 자동 진입하지 않게 했다. 기존 successor 행동값은 역사 보존 목적으로 남을 수 있으나 상태가 활성화를 허가하지 않는다.

## 실행 검증

전용 테스트는 다음을 검증한다.

```powershell
pnpm exec vitest run apps/content-cli/test/temerosa-series-casino-profiles.test.ts --config vitest.config.ts
```

테스트는 생성 JSON을 메모리 재생성 결과와 완전 비교한다. 따라서 새로고침이나 실행 순서와 무관하게 동일 명부·동일 입력이 동일 결과를 낸다.
