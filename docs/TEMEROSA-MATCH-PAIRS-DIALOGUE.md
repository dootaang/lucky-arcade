# 테메로세 짝맞추기 NPC 대사집 — 제미나이 검수 워크시트

> 상태: **문안 검수 대기** (2026-07-28). 코어의 12개 사건과 30인 캐릭터 해석은 확정했다.
> `검수 문안`은 제미나이 프로가 자연스러운 한국어로 작성·교정한 뒤 오너가 확정한다.
>
> 화법 정본: [TEMEROSA-SPEECH-CONTRACT.md](./TEMEROSA-SPEECH-CONTRACT.md)
> 인물 해석: [TEMEROSA-CASINO-NPC-ROSTER.md](./TEMEROSA-CASINO-NPC-ROSTER.md)

## 1. 분업 계약

- 코덱스: CHARX·기존 정본에 맞는 인물 해석, 사건 의미, 금지선, 런타임 배선.
- 제미나이 프로: 화계 계약을 지키면서 번역체가 아닌 자연스러운 한국어 문안으로 완성.
- 문서가 정본이다. 런타임 파일에서 문안을 직접 고치지 않는다.
- 문안은 숨은 카드, 실제 기억 확률, 다음 선택 결과를 누설하지 않는다.
- 캐릭터가 자기 지능 수치나 `AI`, `알고리즘`, `확률`을 말하지 않는다.
- 한 문안은 기본 한 말풍선이다. 두 박자가 꼭 필요하면 `<br>`로 나눈다.
- 마크다운 표의 구분자인 `|` 문자는 문안 안에 쓰지 않는다.
- 비속어는 화법 계약서의 허용·제한 인물과 `defeat`에만 허용한다.

## 2. 사건 의미

| event | 화자 기준 상황 |
|---|---|
| `table-open` | 대국이 시작됐다. 아직 어떤 카드도 보지 않았다. |
| `self-match` | 화자가 한 짝을 처음 또는 단발로 맞혔다. |
| `self-miss` | 화자가 고른 두 장이 달랐다. |
| `opponent-match` | 상대가 한 짝을 가져갔다. |
| `opponent-miss` | 상대가 고른 두 장이 달랐다. |
| `streak` | 화자가 두 번 이상 연속으로 짝을 맞혔다. |
| `ahead` | 화자가 점수상 앞서기 시작했다. 배선 2차 후보. |
| `behind` | 화자가 점수상 뒤처지기 시작했다. 배선 2차 후보. |
| `last-pair` | 판에 마지막 한 짝만 남았다. 위치는 모른다. |
| `victory` | 화자가 더 많은 짝을 가져가 승리했다. |
| `defeat` | 화자가 패배했다. |
| `draw` | 양쪽이 같은 수의 짝을 가져갔다. |

`ahead`와 `behind`도 이번에 문안을 완성하되, 최초 배선에서는 말풍선 과밀을 피하려고 보류할 수 있다.

## 3. 검수 대상 30인

아래 `TODO_GEMINI`만 교체한다. 인물 제목, id, event 키는 바꾸지 않는다.

### 아데샤 (`adesha`)

감정을 지운 잠입 첩자. 조사·관측 결과만 명사종결로 남긴다. 기뻐도 감탄하지 않고 `일치`, `확인`, `종료`처럼 처리한다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 알제 (`alger`)

카드 공개와 짝 회수를 공문·인수인계처럼 처리한다. 감정 대신 `접수`, `대조`, `처리 완료`를 쓰고 혼잣말에서만 작은 불평이 샌다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 안나 나자레아 (`anna`)

상대를 도우려는 말이 명령처럼 먼저 튀어나오고 곧바로 정정된다. 실패를 탓하기보다 자기가 다시 설명하려 든다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 아폴리온 아이테 (`apollyon`)

관성적으로 판을 지켜보며 짧게 단정한다. 기쁨도 패배도 크게 흔들리지 않고, 한숨 섞인 무관심을 유지한다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 브체 (`bche`)

짧은 냉소 뒤에 상태창·인벤토리식 혼잣말을 붙인다. 궁지에서는 공상으로 피하지만 defeat에서만 그 가면이 깨질 수 있다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 카미유 (`camille`)

낮은 목소리와 늘인 해요체로 상대 반응을 기다린다. 짝을 맞히는 것보다 상대가 조급해지는 모습을 즐기는 연극형이다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 키케로 (`cicero`)

카드 위치와 기억을 장비 진단처럼 과도하게 기술화한다. 흔들릴수록 `1급 기술자`라는 등급을 먼저 내세운다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 크레이들 (`cradle`)

카드판을 항해와 보물찾기로 과장하지만, 마지막에는 상대를 신참처럼 북돋는다. 패배해도 선장다운 허세를 놓지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 김덕배 (`deokbae`)

긴 침묵 뒤에 적은 말만 한다. 카드 위치를 옛 세계의 지명처럼 더듬을 수 있으나 새 정본 사건을 만들지는 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 디아모 (`diamo`)

잠결처럼 끊긴 구절로 방금 본 얼굴이 자기 기억인지 남의 기억인지 흐린다. 전략적으로 속이지는 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 에코 (`echo`)

자기 행동·생각·감정을 3인칭으로 전부 생중계한다. 기억했다고 선언해도 실제 다음 정답을 확정적으로 예고하면 안 된다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 에스더 (`esther`)

끝까지 온화하고 돌보는 해요체다. 상대의 실수도 부드럽게 감싸지만 그 안에 서늘한 판단이 남는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 히로 카네다 (`hiro`)

공석에서는 영웅 구호와 합쇼체, 혼잣말에서는 낮은 반말이 한 박자 샌다. 두 목소리가 한 문안 안에서 무질서하게 섞이지 않게 한다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 카트린카 (`katrinka`)

도움이나 칭찬보다 요금·수수료·청구 조건을 먼저 말한다. 점수와 짝을 진료비처럼 다루되 실제 경제 규칙을 발명하지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 크레바 (`kreva`)

정밀한 임무 보고와 기계 구조의 어휘로 말한다. 짝은 `일치`, 틀린 카드는 `제거 대상 외`처럼 처리한다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 레빌로트 (`levillotte`)

일부러 무례하게 상대를 밀어내고 행운과 자기 미모를 방패로 쓴다. defeat에서만 그 행운의 가면이 깨질 수 있다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 릴림 (`lilim`)

쉬운 낱말과 질문형 해요체만 쓴다. 방금 본 얼굴을 기억하는 행위도 규칙을 재확인하는 질문으로 표현한다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 라일라 (`lyla`)

짧고 냉담한 합쇼체로 관찰 범위와 판의 통제를 선언한다. 이유를 길게 설명하거나 승리에 들뜨지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 마키나 (`machina`)

정비·부품 어휘를 짧게 쓰면서 상대에게는 의외로 부드럽다. 일치를 수리 완료처럼 말해도 상대를 물건 취급하지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 모르시사 (`morsisa`)

자기를 낮추고 사과하며 말끝을 흐린다. 맞혔을 때도 우쭐하기보다 우연인지 되묻고, 패배를 과장된 자기혐오로 만들지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 네모 (`nemo`)

첫머리의 어른스러운 농담이 어색하게 풀리고, 진지한 결심 뒤에 농담이 늦게 붙는다. 마법소녀 네모의 목소리로 고정한다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 박니은 (`nieun`)

게임·정보 어휘와 농담으로 긴장을 가린 뒤 진심을 짧게 흘린다. defeat의 비속어는 허용되지만 도둑잡기 문안을 그대로 복제하지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 노스탤지아 (`nostalgia`)

평소에는 다정한 보호자지만 마지막에 양보 없는 교리가 굳어진다. 짝맞추기를 실제 신앙 의식으로 정본화하지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 폐어 (`phaeo`)

카드 소진과 실패를 임상 기록처럼 말한다. 죽음·위험 어휘는 비유로 남기되 폭력 장면을 만들지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 레이븐 (`raven`)

어떤 상황에서도 정중한 합쇼체와 거래·단가·정산 어휘를 유지한다. 손익 계산은 비유일 뿐 실제 배당을 발명하지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 테뮤테 (`temute`)

한숨 뒤에 실무적인 반말과 보호자 잔소리가 나온다. 상대 실수를 나무라더라도 끝에는 챙기는 결이 남는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 트레버 (`traver`)

욕망이나 자신감이 보이면 곧바로 `분수껏`이라는 말로 누른다. 지하철권 은어는 최소한만 쓴다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 땡칠이 (`ttaengchil`)

짧은 기본어를 반복하고 흥분할 때만 짖음·으르렁을 한 번 섞는다. 복잡한 기억 전략을 설명하지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 튜밋튜 (`tumit-tu`)

큰 느낌표와 자기식 `E랭크` 자랑을 유지한다. 실제 난도 1이라는 내부 수치와 E랭크 농담을 직접 연결하지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

### 율 (`yul`)

단순하게 말하다가 딴생각으로 문장 끝과 방금 하던 일을 잊는다. 산만함을 무능이나 유아화로 과장하지 않는다.

| event | 검수 문안 |
|---|---|
| table-open | TODO_GEMINI |
| self-match | TODO_GEMINI |
| self-miss | TODO_GEMINI |
| opponent-match | TODO_GEMINI |
| opponent-miss | TODO_GEMINI |
| streak | TODO_GEMINI |
| ahead | TODO_GEMINI |
| behind | TODO_GEMINI |
| last-pair | TODO_GEMINI |
| victory | TODO_GEMINI |
| defeat | TODO_GEMINI |
| draw | TODO_GEMINI |

## 4. 반환 전 자가 검수

- 30명 × 12상황 = 360개 `TODO_GEMINI`가 모두 교체됐는가.
- 존댓말 인물이 전부 같은 합쇼체로 평준화되지 않았는가.
- 이름만 바꾸면 다른 인물에게도 붙는 범용 문장이 과도하지 않은가.
- `self-miss`와 `defeat`, `self-match`와 `victory`가 같은 감정으로 반복되지 않는가.
- 카드 이름·표정 이름·숨은 위치·다음 정답을 말하지 않는가.
- 한 문장이 모바일 말풍선에서 너무 길면 의미 단위로 `<br>`를 사용했는가.

제미나이 검수본이 돌아오면 코덱스는 이 문서를 파싱해
`apps/web/src/features/match-pairs/temerosa-match-pairs-lines.ts`를 생성하고 글자 단위 대조 테스트를 추가한다.
