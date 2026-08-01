# 테메로세 4시리즈 NPC 초상 에셋 감사

> 팩: `temerosa-series-npcs/0.2.0`
>
> 기준 명부: `temerosa-series-npc-inventory/0.2` (116명, 안전 이미지 후보 1,616개)
>
> 검수 방식: 사전 육안 검사는 생략했으나 2026-08-01에 4감정 시리즈별 연락판 17장으로 116개 레코드를 사후 전수 검수했다. 판단이 필요한 항목은 `owner-review-needed`로 분리했다.

## 결과 요약

| 항목 | 결과 |
|---|---:|
| NPC 소유 관계 | 116 |
| 초상 사용 가능 | 113 |
| `unavailable` | 9 |
| 사후 승인 가능 | 89 |
| `owner-review-needed` | 27 |
| sm/md/lg 소유 관계 | 641 |
| 감정 폴백 | 12 |
| 고유 원본 바이트 해시 | 415 |
| 고유 WebP 파생 파일 | 644 |
| 이미지 용량 | 26,730,920 bytes |
| 팩 전체 파일 | 629 |

팩에는 원본 CHARX나 추출 디렉터리를 넣지 않았다. 공개 파일은 WebP 파생본 644개, `manifest.json`, `audit.json`, `review.html`뿐이다.

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

## 기계적으로 확정한 교정

후보 이름, 원본 카드, 원본 엔트리 경로를 대조해 다른 인물의 소스를 사용한 9개 레코드, 33개 감정 슬롯을 확인했다. Kano 1개 슬롯과 아래 7명×4개 슬롯은 자기 이름의 같은 시리즈 후보로 교체했다.

- `temerosa:overture:kano`
- `temerosa:root2:nostalgia`
- `temerosa:bestiaization:bacikal`
- `temerosa:bestiaization:cradle`
- `temerosa:bestiaization:tumit-tu`
- `temerosa:finale:flask-impostor`
- `temerosa:finale:renoa`
- `temerosa:finale:silentium`

`temerosa:overture:mascot`은 후보 9개가 모두 Lyla 소스이고 Mascot 소유 후보가 0개여서 임의 얼굴을 유지하지 않고 `no-owned-image-candidates`로 제외했다. 소유권 규칙은 컴파일러와 테스트에 고정했다.

## 이미지 누락 목록

단독 파일명 초상을 정식 후보로 인정해 Licanica·Mascot·Boris Leblanc·Gestas·Iweleth·Kudryavka를 연결했다. 다음 3명은 같은 시리즈 안에 자기 소유 후보가 없어 `unavailable`로 남겼다.

- `temerosa:overture:mortem`
- `temerosa:bestiaization:leviathan`
- `temerosa:bestiaization:sherirus`

표시 계층에서 Overture Mortem은 동일 인물인 √2 Mortem 초상을 명시적으로 사용한다. 특별 출전자 `temerosa:guest:nemo`는 기존 0.8.0 마법소녀 네모 초상으로 연결한다. 두 경우 모두 원장 신원과 잔고는 합치지 않는다.

## 감정 폴백 목록

| NPC | 감정 | fallbackFrom |
|---|---|---|
| `temerosa:overture:elton-carrasco` | neutral | smile |
| `temerosa:overture:hab` | neutral | embarrassed |
| `temerosa:overture:ishmael` | neutral | smile |
| `temerosa:overture:kano` | neutral | angry |
| `temerosa:overture:lyla` | neutral | embarrassed |
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

같은 시리즈에서 서로 다른 ID가 정확히 같은 원본 SHA-256을 공유한 사례는 Temute/Tumit-Tu의 4감정뿐이다. 같은 인물인지 판단할 근거가 부족하므로 자동 병합하지 않고 두 ID 모두 `owner-review-needed`로 남겼다.

기계 감사 원문은 `apps/web/public/content/temerosa-series-npcs/0.2.0/audit.json`, NPC별 sm 연락판은 같은 디렉터리의 `review.html`이다. 4감정 전수 연락판 생성기는 `apps/content-cli/src/render-temerosa-series-review-sheets.ts`이며 생성 PNG는 임시 검수물이라 저장소에 포함하지 않았다. 이미 배포된 `0.1.0`은 변경하지 않으며, 교정 결과는 새 `0.2.0` 팩에만 반영한다.

기존 `0.1.0`의 591개 파일은 `8466d7b`와 동일하다. Git 줄바꿈 정규화 후 경로와 파일 바이트를 함께 계산한 트리 SHA-256은 `44260777fe1501e420e59c0de8b9882a7a6d5e93d04185e932832a46ffc5051e`이며 content-cli 회귀 테스트로 고정한다.

## 재현 명령

루트 스크립트나 lockfile을 바꾸지 않고 content-cli 엔트리포인트를 직접 실행한다.

```powershell
pnpm exec tsx apps/content-cli/src/compile-temerosa-series-assets.ts `
  --overture <overture.charx> --root2 <root2.charx> `
  --bestiaization <bestiaization.charx> --finale <finale.charx> `
  --inventory apps/content-cli/src/temerosa-series-npc-roster.generated.json `
  --selection apps/content-cli/src/temerosa-series-npc-asset-selection.json `
  --out apps/web/public/content/temerosa-series-npcs --version 0.2.0
```

`--refresh-selection`은 현재 명부에서 자동 selection JSON을 다시 만들 때만 사용한다. 새 선택은 전부 `owner-review-needed`와 전역 `pending`으로 생성되며, 사후 검수 상태를 명시적으로 확정하기 전에는 컴파일러가 공개 팩 생성을 거부한다.
