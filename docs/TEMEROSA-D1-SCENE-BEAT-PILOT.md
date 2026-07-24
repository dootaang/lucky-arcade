# 테메로세 D1 장면 0~2 감정 비트 파일럿

> 상태: 2026-07-25 장면 0~2 플레이 가능판 구현. V3 원문을 대체하지 않으며, 실제 플레이 평가는 아직 남아 있다.
>
> 입력: `TEMEROSA-DIALOGUE-BIBLE-V3.md` 장면 0~2, `TEMEROSA-EMOTION-TAG-MAPPING-DRAFT.md`.

## 1. 파일럿 목적

전체 대사집을 변환하기 전에 다음을 검증한다.

1. 실제 에셋으로 `시작 → 전환 → 종료` 감정 흐름이 자연스러운가.
2. 표정이 대사를 반복 설명하지 않고 추가 정보를 주는가.
3. 니은 통신, 알제 조우, 동료 세 명 소개가 서로 다른 화면 문법을 갖는가.
4. `appearanceSet`을 섞지 않고 장면을 완성할 수 있는가.

## 2. 장면 0 — 죽은 단말기

### 화면

- 배경: 피쿼드 폐허 보급 통로.
- 플레이어 선택 전에는 인물 초상을 띄우지 않는다.
- 첫 행동 뒤 상단 니은 통신 프레임이 노란 선과 함께 열린다.
- 니은 초상은 전신을 좌우 무대에 세우지 않고 얼굴·상반신 크롭으로 사용한다.

### 비트 0-1 — 첫 연결

```yaml
id: d1-s0-nieun-first-contact
speaker: nieun
appearanceSet: nieun/finale/event-horizon-magical-girl
line: "누구야."
surfaceGoal: 침입자의 신원을 확인한다
visibleEmotion: surprised
internalEmotion: guarded
concealedFact: 134년 전 플루토 신호가 현재 생체에게 응답했다
startExpression: review-nieun-current-angry
endExpression: review-nieun-current-angry
observationFocus: frame
observationFact: 통신 영상보다 노란 경고선이 먼저 안정된다
dramaticCue: old-pluto-signal-awake
criticality: transition
```

다음 대사 `그 단말기에서 손부터 떼지 마`에서는 놀람을 반복하지 않고 통제하려는 표정으로 전환한다. 파일명 `angry`를
분노라고 단정하지 않고, 실물 검수에서 경계·통제 연기로 적합한 변형을 고른다.

### 비트 0-2 — 플레이어 질문 반응

| 플레이어 행동 | 니은 표면 연기 | 숨은 정보 | 후보 |
|---|---|---|---|
| 누구인지 묻는다 | 장난스러운 자기소개 | 과거 직책을 회피함 | `Nieun_smirk` 또는 `Nieun_smile` 실물 비교 |
| 무슨 일인지 묻는다 | 업무 집중 | 과거가 물질처럼 겹친다는 공포 | `Nieun_standing` |
| 출구를 요구한다 | 짧은 인정 | 살아 있는 사람에게 위험한 길을 권함 | `Nieun_smile` 뒤 `Nieun_upset` |
| 침묵한다 | 반응을 시험함 | 생체 여부부터 의심했음 | `Nieun_surprised` 뒤 `Nieun_smile` |

여기서는 플레이어 선택을 맞고 틀림으로 판정하지 않는다. 니은의 다른 면과 다른 정보가 열린다.

### 비트 0-3 — 움직일 수 없는 니은

```yaml
id: d1-s0-nieun-horizon
speaker: nieun
appearanceSet: nieun/finale/event-horizon-magical-girl
line: "내가 움직이면 세상 끝도 같이 움직여."
surfaceGoal: 현장에 갈 수 없는 이유를 최소한으로 알린다
visibleEmotion: neutral
internalEmotion: pressure-crack
concealedFact: 사상 지평을 놓는 순간 대멸종이 도시로 기운다
startExpression: review-nieun-current-smirk-alt
midExpression: review-nieun-current-smirk-alt
endExpression: review-nieun-current-smirk-alt
observationFocus: frame
observationFact: 진심을 말하는 동안 통신 노이즈가 오히려 줄어든다
dramaticCue: nieun-cannot-leave
criticality: required
```

핵심은 슬픈 얼굴을 오래 보여 주는 것이 아니라, 한 프레임의 지평과 노이즈 감소로 진심을 드러내는 것이다.

## 3. 장면 1 — 마지막 인사부

### 화면

- 알제는 오른쪽 무대에 크게 등장하고, 니은은 상단 통신 프레임에 남는다.
- 플레이어가 말할 때 알제의 무언 반응을 읽을 수 있도록 감광하지 않는다.
- 텔레키네시스 팔과 떨어지는 천장 조각은 알제의 능력을 설명 없이 보여 주는 짧은 Phaser 표현이다.

### 비트 1-1 — 무관심의 연기

```yaml
id: d1-s1-alger-reception-closed
speaker: alger
appearanceSet: alger/finale-current
line: "방문 접수는 끝났어. 회사도 끝났고. 용건 없으면 화면 가리지 마."
surfaceGoal: 방문자를 돌려보낸다
visibleEmotion: administrative-calm
internalEmotion: guarded
concealedFact: 안쪽 신호를 끄면 사람도 함께 꺼질까 봐 남아 있다
startExpression: candidate/Alger_smirk.png
endExpression: candidate/Alger_standing.png
observationFocus: hands
observationFact: 시선은 게임기에 있지만 텔레키네시스 팔은 통로와 단말기를 동시에 막는다
dramaticCue: alger-pretends-not-responsible
criticality: required
```

고유 태그 `행정적 평온`은 웃음이 아니라 책임을 업무 문장 뒤에 숨기는 연기다.

### 비트 1-2 — 죽은 단말기가 대답했다

```yaml
id: d1-s1-alger-terminal-responded
speaker: alger
appearanceSet: alger/finale-current
line: "그런데 죽은 단말기가 네 손에는 대답했다."
surfaceGoal: 플레이어를 조사한다
visibleEmotion: surprised
internalEmotion: pressure-crack
concealedFact: 플레이어를 들이면 과거의 자기 명령도 다시 열린다
startExpression: candidate/Alger_standing.png
midExpression: candidate/Alger_surprised.png
endExpression: candidate/Alger_disappointed.png
observationFocus: eyes
observationFact: 처음으로 게임기에서 시선을 떼고 계약 문양을 본다
dramaticCue: navigator-candidate-recognized
criticality: transition
```

### 비트 1-3 — 임시 항해사

알제는 플레이어를 영웅으로 인정하지 않는다. 현재 생체가 폐기되지 않도록 살아 있는 행정 규칙을 찾는다.

| 순간 | 알제 연기 | 이미지 후보 |
|---|---|---|
| 시스템이 현재 생체를 정리 대상으로 표시 | 통제 균열 | `Alger_angry` 또는 `Alger_upset` 실물 비교 |
| 오래된 항해사 직책을 발견 | 피로 속 집중 | `Alger_disappointed` |
| 플레이어가 직접 서명 | 작은 인정 | `Alger_smile` |
| 조건·사람을 다시 물음 | 업무적 정직 | `Alger_standing` |

공명·압력 상태는 이 장면의 모든 줄을 바꾸지 않는다. `알제 압력=균열` 플래그만 다음 과로 사건의 장면 변주 후보가 된다.

## 4. 장면 2 — 함께 갈 두 사람

### 공통 화면

- 후보 소개는 한 명씩 중앙 컷인으로 시작한다.
- 소개가 끝나면 세 후보의 축약 카드가 나타나며, 선택한 두 사람만 좌우 VN 무대에 남는다.
- 능력보다 동행 조건과 거부권을 먼저 읽을 수 있어야 한다.
- 선택하지 않은 인물은 화면에서 사라지기 전 한 줄과 표정으로 귀환 지원 의사를 남긴다.

### 비트 2-P — 페일

```yaml
id: d1-s2-pale-familiar-feeling
speaker: pale
appearanceSet: pale/finale-current
line: "아는 사람 같다는 뜻은 아니야. 아는 기분 같다는 뜻이지."
surfaceGoal: 익숙함을 말하되 관계를 확정하지 않는다
visibleEmotion: familiar-strangeness
internalEmotion: guarded-curiosity
concealedFact: 계약 문양과 냄새가 서곡의 기억을 자극한다
startExpression: candidate/Pale_smile.png
midExpression: candidate/Pale_surprised.png
endExpression: candidate/Pale_disappointed.png
observationFocus: body
observationFact: 플레이어에게 다가오다 스스로 한 걸음 멈춘다
dramaticCue: pale-recognizes-feeling-not-person
criticality: required
```

페일은 관계를 선지급하지 않는다. `smile`은 친밀함 보상이 아니라 호기심의 시작 후보로만 사용한다.

### 비트 2-K — 카노

```yaml
id: d1-s2-kano-supervisor
speaker: kano
appearanceSet: kano/finale-current
line: "좋아요. 제가 감독하죠. 과거를 함부로 열면 현재 쪽을 닫아 버릴 수도 있으니까."
surfaceGoal: 동행과 감독을 제안한다
visibleEmotion: supervisor-mode
internalEmotion: guarded
concealedFact: 항로 오염이 사람보다 먼저 정리되는 상황을 두려워한다
startExpression: candidate/Kano_standing.png
midExpression: candidate/Kano_smirk.png
endExpression: candidate/Kano_angry.png
observationFocus: body
observationFact: 서리가 출구 방향부터 막고 플레이어 쪽에서는 멈춘다
dramaticCue: kano-demands-stop-right
criticality: required
```

니은의 `사람도 같이 닫지 말고` 뒤에는 `Kano_surprised` 또는 `Kano_upset`을 후보로 비교한다. 화염 후보와 루트2 외형은
이 장면에서 금지한다.

### 비트 2-N — 네모/바치칼

```yaml
id: d1-s2-nemo-name-choice
speaker: bacikal
appearanceSet: bacikal/finale-current
line: "돌아갈 수 있다는 이유로 먼저 죽을 생각은 하지 마라."
surfaceGoal: 항해사의 자기희생을 금지한다
visibleEmotion: efficiency-mask
internalEmotion: time-fatigue
concealedFact: 자신도 실패를 지우기 위해 회귀를 남용했다
startExpression: candidate/Bacikal_standing.png
midExpression: candidate/Bacikal_angry.png
endExpression: candidate/Bacikal_sad.png
observationFocus: body
observationFact: 플레이어의 문양을 본 뒤 창끝을 아래로 내린다
dramaticCue: nemo-refuses-sacrificial-loop
criticality: required
```

플레이어가 네모·바치칼·본인 선택 중 무엇을 고르는지는 호감도 정답이 아니다. 이후 호칭과 기억 검증 문맥을 바꾼다.

### 편성 직후 무언 반응

선택한 두 사람은 좌우로 이동한다. 선택하지 않은 사람의 지원 대사 뒤, 중요한 반응은 한 번만 보여 준다.

- 페일 선택: 현재 관계를 새로 정한다는 경계 선택에 따라 `smile`·`disappointed` 후보.
- 카노 선택: 동행 조건을 다시 물으면 `surprised → smile`, 바로 수락하면 `standing` 유지.
- 네모/바치칼 선택: 이름 선택 뒤 `sad → standing` 또는 `smirk → standing`.

모든 버튼에 즉시 무언 표정을 붙이지 않는다.

## 5. 파일럿에서 필요한 콘텐츠 추가

현재 0.1.0 콘텐츠팩에 없는 후보 중 장면 0~2에 우선 필요한 것은 다음 기능이다.

- 니은: `sad`, `upset`, `disappointed`, `smirk`
- 알제: `angry`, `upset`, `disappointed`
- 페일: `surprised`, `upset`, `disappointed`, `smirk`
- 카노: `surprised`, `upset`, `disappointed`, `smirk`
- 바치칼: `surprised`, `upset`, `disappointed`, `smirk`

기본·미소·슬픔·분노·전투 이미지는 현재 팩에 상당수 존재한다. 위 후보의 실제 변형 선택과 화면 수위 확인이 끝난 뒤에만
0.2.0 허용 목록을 만든다.

## 6. 파일럿 합격 조건

- 장면당 표정 전환이 대사 줄 수를 따라 기계적으로 반복되지 않는다.
- 표정을 가려도 대사의 사실은 이해되지만, 표정을 보면 위험·숨김·반복을 더 일찍 알아챈다.
- 니은·알제·세 동료의 연기 방식이 서로 다르다.
- 카노의 현재 외형과 얼음 연출, 니은의 원격 제약, 페일의 관계 경계가 정본을 위반하지 않는다.
- 비해석적 관찰 문장이 이미지를 설명하되 감정 정답을 대신 말하지 않는다.
- 같은 시드·입력에서 같은 비트 ID와 장면 변주가 선택된다.
