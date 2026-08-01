# 테메로세 4시리즈 NPC 초상팩 사후 검수

> 기준: `origin/main` 8466d7b의 `temerosa-series-npcs/0.1.0`
>
> 교정 팩: `temerosa-series-npcs/0.2.0` (`temerosa-series-npc-portrait-pack/0.2`)
>
> 검수일: 2026-08-01

## 판정

| 항목 | 수 |
|---|---:|
| 전체 명부 | 116 |
| 사용 가능 | 107 |
| 승인 가능 | 89 |
| 오너 검토 필요 | 27 |
| 제외 권고 (`unavailable`) | 9 |
| 기계 교정 대상 NPC | 9 |
| 기계 교정 감정 슬롯 | 33 |
| 감정 폴백 유지 | 11 |
| 감정 폴백 교체 | 1 |
| 감정 폴백 제거 | 1 |

시리즈별 4감정 연락판 17장으로 116개 레코드를 모두 확인했다. 잘못된 얼굴 귀속 외에는 이미지가 프레임 밖으로 잘린 사례나 다른 시리즈에서 가져온 폴백을 찾지 못했다. 노출 정도는 반려 근거로 사용하지 않았다.

## 오너가 직접 볼 항목

### 초상 없음 또는 소유권 불충분 — 9

- Overture: `licanica`, `mascot`, `mortem`
- Bestiaization: `boris-leblanc`, `gestas`, `iweleth`, `kudryavka`, `leviathan`, `sherirus`

### 감정 폴백 — 12

- Overture neutral: `elton-carrasco`(smile), `hab`(embarrassed), `ishmael`(smile), `kano`(angry), `lyla`(embarrassed), `merry-pip`(smile), `pale`(blush), `septendecilliono`(contempt), `tashtego`(teardrop)
- Root2 pleased: `revi`(neutral)
- Bestiaization: `dorsinea` despair(neutral), `francis` pleased(neutral)

Kano는 기존 Pale 얼굴을 Kano 얼굴로 교체했지만 neutral에 정확히 맞는 원본 표현이 없어 `Kano.Angry` 폴백을 임의 승인하지 않았다. 기존 13건 중 나머지 11건은 유지했고, Mascot 폴백은 얼굴 소유권 불충분으로 제거했다.

### 신원·중복 판단 — 6

- 이미지 전용 신원 근거 확인: `female`, `male`, `riel`, `nieun-pluto`
- 같은 시리즈의 원본 SHA-256 4개를 전부 공유: `temute`, `tumit-tu`

Temute와 Tumit-Tu는 정확 중복이지만 명부 ID를 변경하거나 자동 병합하지 않았다. 네 항목의 이미지 전용 후보도 삭제하지 않았다.

## 기계 감사

- 실제 MIME: 전 파일 WebP, 불일치 0
- 경로·바이트·SHA-256·치수: 불일치 0
- 원본 초과 확대: 0
- 다른 시리즈 폴백: 0
- 금지 이름·경로: 0
- 원본 CHARX·추출물·PNG 공개 팩 포함: 0
- WebP: 626개, 25,900,664 bytes

연락판 PNG는 로컬 임시 디렉터리에만 만들었고 커밋하지 않는다. 원본은 읽기 전용으로 열었으며 이동·수정·삭제하지 않았다.
