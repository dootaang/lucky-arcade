# 테메로세 4시리즈 NPC 초상 에셋 감사

> 팩: `temerosa-series-npcs/0.1.0`
>
> 기준 명부: `temerosa-series-npc-inventory/0.1` (116명, 안전 이미지 후보 1,616개)
>
> 검수 방식: 오너 결정에 따라 육안 사전 검사를 생략하고 자동 안전 검사 후 컴파일했다. 정적 연락판에서 사후 검수한다.

## 결과 요약

| 항목 | 결과 |
|---|---:|
| NPC 소유 관계 | 116 |
| 초상 사용 가능 | 108 |
| `unavailable` | 8 |
| sm/md/lg 소유 관계 | 647 |
| 감정 폴백 | 13 |
| 고유 원본 바이트 해시 | 391 |
| 고유 WebP 파생 파일 | 588 |
| 이미지 용량 | 24,257,462 bytes |
| 팩 전체 파일 | 591 |
| 팩 전체 용량 | 24,817,192 bytes |

팩에는 원본 CHARX나 추출 디렉터리를 넣지 않았다. 공개 파일은 WebP 파생본 588개, `manifest.json`, `audit.json`, `review.html`뿐이다.

## 자동 선택과 출처 규칙

- NPC ID는 `temerosa:<series>:<sourcePersonaKey>`를 그대로 사용한다.
- 같은 인물이어도 시리즈가 다르면 별도 NPC와 별도 선택 항목이다.
- `canonicalPersonKey`는 사용하지 않으며 팩 manifest에도 넣지 않는다.
- 선택 후보는 해당 NPC 레코드에 귀속된 같은 시리즈의 `assetCandidates`로 제한한다.
- neutral 우선순위는 `neutral`, `natural`, `standing`, 눈/책 변형 순서다.
- pleased는 `pleased`, `smile`, `smirk`, `blush`; tense는 `tense`, `angry`, `upset`, `surprised` 등; despair는 `despair`, `sad`, `cry`, `teardrop`, `disappointed` 순서다.
- 감정 후보가 없으면 neutral 선택을 사용하고 `fallbackFrom`을 기록한다.
- sm은 neutral 원본으로 최대 160×200, md는 감정별 최대 480×600이다.
- lg는 회전 보정 후 원본 세로가 900px 이상일 때만 만들며 최대 960×1200이다.
- 모든 resize는 `withoutEnlargement: true`이며 manifest 감사에서도 파생 치수가 원본 치수를 넘지 않는지 다시 검사한다.
- 실제 바이트 시그니처로 원본 MIME을 판정하고 파생본은 실제 WebP 시그니처를 다시 확인한다.
- 동일 파생 바이트는 SHA-256 경로로 한 번만 저장하지만 각 NPC의 소유 관계는 manifest에 별도로 남긴다.

## 이미지 누락 목록

다음 8명은 안전 후보가 없어 임의 생성하지 않고 `unavailable`로 남겼다.

- `temerosa:overture:licanica`
- `temerosa:overture:mortem`
- `temerosa:bestiaization:boris-leblanc`
- `temerosa:bestiaization:gestas`
- `temerosa:bestiaization:iweleth`
- `temerosa:bestiaization:kudryavka`
- `temerosa:bestiaization:leviathan`
- `temerosa:bestiaization:sherirus`

## 감정 폴백 목록

| NPC | 감정 | fallbackFrom |
|---|---|---|
| `temerosa:overture:elton-carrasco` | neutral | smile |
| `temerosa:overture:hab` | neutral | embarrassed |
| `temerosa:overture:ishmael` | neutral | smile |
| `temerosa:overture:kano` | neutral | blush |
| `temerosa:overture:lyla` | neutral | embarrassed |
| `temerosa:overture:mascot` | neutral | embarrassed |
| `temerosa:overture:merry-pip` | neutral | smile |
| `temerosa:overture:pale` | neutral | blush |
| `temerosa:overture:septendecilliono` | neutral | contempt |
| `temerosa:overture:tashtego` | neutral | teardrop |
| `temerosa:root2:revi` | pleased | neutral |
| `temerosa:bestiaization:dorsinea` | despair | neutral |
| `temerosa:bestiaization:francis` | pleased | neutral |

## 안전·무결성 감사

| 검사 | 결과 |
|---|---:|
| 금지 에셋 이름/경로 | 0 |
| 실제 MIME 불일치 | 0 |
| 원본보다 큰 파생본 | 0 |
| 다른 시리즈 폴백 | 0 |
| manifest 경로·크기·SHA-256·치수 불일치 | 0 |
| 원본 CHARX/추출물 공개 팩 포함 | 0 |

기계 감사 원문은 `apps/web/public/content/temerosa-series-npcs/0.1.0/audit.json`, NPC별 sm 연락판은 같은 디렉터리의 `review.html`이다. 연락판의 사후 육안 상태는 아직 `pending`이며, 거절 항목은 다음 팩 선택에서 교체해야 한다.

## 재현 명령

루트 스크립트나 lockfile을 바꾸지 않고 content-cli 엔트리포인트를 직접 실행한다.

```powershell
pnpm exec tsx apps/content-cli/src/compile-temerosa-series-assets.ts `
  --overture <overture.charx> --root2 <root2.charx> `
  --bestiaization <bestiaization.charx> --finale <finale.charx> `
  --inventory apps/content-cli/src/temerosa-series-npc-roster.generated.json `
  --selection apps/content-cli/src/temerosa-series-npc-asset-selection.json `
  --out apps/web/public/content/temerosa-series-npcs --version 0.1.0
```

`--refresh-selection`은 현재 명부에서 자동 selection JSON을 다시 만들 때만 사용한다.
