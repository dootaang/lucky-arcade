# 테메로세 D1 감정 태그·에셋 매핑 초안

> 상태: 2차 감사 뒤 작성한 **검수 전 초안**. 아래 경로는 자동 허용 목록이 아니다.
>
> 목적: V3 장면 0~2의 비트 변환에 필요한 최소 연기 어휘와 실물 후보를 연결한다.

## 1. 공용 태그 초안

| 태그 | 화면에서 보일 사실 | 사용 예 | 자동 치환 |
|---|---|---|---|
| `neutral` | 긴장 변화가 크지 않음 | 일반 대화 시작 | `standing`·`natural` 명시 별칭만 |
| `warm` | 경계가 풀리고 부드러움 | 인정·안도 | `smile` 후보 안에서 수동 선택 |
| `guarded` | 시선·자세가 닫힘 | 위험 은폐·거리 두기 | 없음 |
| `angry` | 공격적 시선·몸의 긴장 | 거부·대치 | 없음 |
| `sad` | 시선 저하·움츠림 | 상실·후회 | 없음 |
| `surprised` | 눈·몸의 급격한 반응 | 예상 밖 신호 | 없음 |
| `upset` | 평정이 깨지고 불편함 | 압력 균열 | 없음 |
| `resolved` | 자세가 안정되고 행동 준비 | 책임·결단 | 전투 자세와 동일시하지 않음 |
| `combat` | 능동 전투 구도 | 기술 컷인 | 감정 단서로 사용하지 않음 |

`blush`, `smirk`, `disappointed`, `looking-back`는 공용 감정으로 즉시 승격하지 않는다. 인물·장면별 의미가 크게 달라 고유
연기 태그 또는 포즈 태그로 검수한다.

## 2. D1 핵심 인물 1차 후보

### 페일 — `pale/finale-current`

| 기능 | 원본 후보 |
|---|---|
| 기본 | `assets/other/image/Pale_standing.png` |
| 따뜻함 | `assets/other/image/Pale_smile.png` |
| 슬픔 | `assets/other/image/Pale_sad.png` |
| 분노·거부 | `assets/other/image/Pale_angry.png` |
| 놀람 | `assets/other/image/Pale_surprised.png` |
| 균열·동요 | `assets/other/image/Pale_upset.png` |
| 실망·멈춤 | `assets/other/image/Pale_disappointed.png` |
| 확신·장난 | `assets/other/image/Pale_smirk.png` |
| 전투 | `assets/other/image/Pale_combat_stance.png` |

고유 태그 후보: `익숙한 낯섦`, `충동적 확신`, `사랑의 직감`.

### 카노 — `kano/finale-current`

| 기능 | 원본 후보 |
|---|---|
| 기본 | `assets/other/image/Kano_standing.png` |
| 따뜻함 | `assets/other/image/Kano_smile.png` |
| 슬픔 | `assets/other/image/Kano_sad.png` |
| 분노·중지 | `assets/other/image/Kano_angry.png` |
| 놀람 | `assets/other/image/Kano_surprised.png` |
| 균열·동요 | `assets/other/image/Kano_upset.png` |
| 실망·피로 | `assets/other/image/Kano_disappointed.png` |
| 허세·감독 | `assets/other/image/Kano_smirk.png` |
| 전투 | `assets/other/image/Kano_combat_stance.png` |

고유 태그 후보: `감독자 모드`, `허세 붕괴`, `금기 회피`. `flame` 후보는 이 외형 세트에서 금지한다.

### 바치칼 — `bacikal/finale-current`

| 기능 | 원본 후보 |
|---|---|
| 기본 | `assets/other/image/Bacikal_standing.png` |
| 따뜻함 | `assets/other/image/Bacikal_smile.png` |
| 슬픔 | `assets/other/image/Bacikal_sad.png` |
| 분노·거부 | `assets/other/image/Bacikal_angry.png` |
| 놀람 | `assets/other/image/Bacikal_surprised.png` |
| 균열·동요 | `assets/other/image/Bacikal_upset.png` |
| 실망·피로 | `assets/other/image/Bacikal_disappointed.png` |
| 효율 가면 | `assets/other/image/Bacikal_smirk.png` |
| 전투 | `assets/other/image/Bacikal_combat_stance.png` |

고유 태그 후보: `효율 가면`, `시간 피로`, `바치칼 침식`. 얼굴 가림 때문에 `body`·`hands` 관찰 문장을 함께 쓴다.

## 3. 지원 인물 1차 후보

| 인물·외형 세트 | 기본 | 긍정 | 부정 | 놀람 | 균열 | 특수 |
|---|---|---|---|---|---|---|
| `nieun/finale-remote` | `Nieun_standing.png` | `Nieun_smile.png` | `Nieun_sad.png` | `Nieun_surprised.png` | `Nieun_upset.png` | `Nieun_disapponted.png` |
| `alger/finale-current` | `Alger_standing.png` | `Alger_smile.png` | `Alger_sad.png` | `Alger_surprised.png` | `Alger_upset.png` | `Alger_disappointed.png` |
| `wares/finale-margin` | `Wares_standing.png` | `Wares_smile.png` | `Wares_sad.png` | `Wares_surprised.png` | `Wares_upset.png` | `Wares_disappointed.png` |
| `nemo/bestiaization-record` | `322.png` | `323.png` | `325.png` | `326.png` | `329.png` | `328.png` |
| `lyla/bestiaization-record` | `297.png` | `292.png` | `293.png` | `295.png` | `296.png` | `298.png` |
| `riel/bestiaization-record` | `305.png` | `300.png` | `302.png` | `303.png` | `301.png` | `306.png` |

모든 경로의 접두사는 해당 카드의 `assets/other/image/`다. 지원 인물의 고유 태그와 세부 포즈는 V3 장면 0~2 비트 변환에서
필요가 생길 때만 추가한다.

## 4. 검수 규칙

1. 같은 파일명이 여러 장이면 경로 접미사까지 고정하고 실제 이미지를 다시 본다.
2. 핵심 단서 표정은 `required`, 일반 대사는 `general`, 감정 전환은 `transition`으로 구분한다.
3. 표정 파일이 대사 의미와 맞지 않으면 다른 감정으로 치환하지 않고 대사·장면 또는 후보를 다시 검토한다.
4. 시대·외형 세트가 다르면 자동 폴백하지 않는다.
5. 이름 기준 안전 후보라도 오너 시각 검수 전 콘텐츠팩에 추가하지 않는다.
6. 최종 매핑에는 비해석적 관찰 문장과 관찰 영역을 함께 기록한다.

## 5. 다음 파일럿

V3의 장면 0 `죽은 단말기`, 장면 1 `마지막 인사부`, 장면 2 `함께 갈 두 사람`만 대사 비트로 변환한다. 세 장면에서
다음을 먼저 확인한다.

- 좌우 동료 병립과 니은 통신 프레임이 실제 구도를 감당하는가.
- 한 장면의 감정 이동이 2~5개 이미지로 자연스러운가.
- 파일명 태그가 아니라 실물 표정에 맞춰 대사를 조정할 수 있는가.
- `appearanceSet`을 섞지 않고도 필요한 연기가 가능한가.

