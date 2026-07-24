import type { ChoiceOption, DialogueLine, TemerosaStoryContent } from "./contracts.ts";

const line = (
  id: string,
  speakerId: DialogueLine["speakerId"],
  speakerName: string,
  text: string,
  assetId: string | null,
  appearanceSet: string | null,
  frame: DialogueLine["frame"],
  observationFact: string | null = null,
  dramaticCue: string | null = null,
): DialogueLine => ({ id, speakerId, speakerName, text, assetId, appearanceSet, frame, priority: 3, cooldown: 10, oncePerRun: true, condition: {}, observationFact, dramaticCue });

const option = (id: string, label: string, detail: string): ChoiceOption => ({ id, label, detail });

export const temerosaStoryContent: TemerosaStoryContent = {
  contract: "temerosa-story-content/0.1",
  version: "0.3.0",
  startNodeId: "first-action",
  companions: [
    {
      id: "pale", name: "페일", assetId: "review-pale-smile",
      summary: "검은 사슬로 적과 감정을 묶는다. 익숙함의 이유를 찾으려 한다.",
      condition: "익숙하다는 기분을 현재 관계의 증거로 확정하지 않는다.",
      refusal: "회수한 이름을 누군가의 소유권처럼 쓰는 명령은 거부한다.",
    },
    {
      id: "kano", name: "카노", assetId: "review-kano-smirk",
      summary: "온도를 빼앗아 위험한 기록의 진행을 멈춘다. 항로 오염을 경계한다.",
      condition: "카노가 항로 붕괴를 선언하면 한 번은 멈춰 판단을 다시 확인한다.",
      refusal: "살아 있는 증언까지 없애는 전면 정화 명령은 거부한다.",
    },
    {
      id: "nemo", name: "네모 / 바치칼", assetId: "review-bacikal-angry",
      summary: "공간을 접고 적의 선택을 제한한다. 시간 회귀를 경계한다.",
      condition: "퇴로 신호를 보내면 한 번은 이유를 캐묻기 전에 철수시킨다.",
      refusal: "실패한 사람의 선택을 지우는 시간 회귀 명령은 거부한다.",
    },
  ],
  nodes: [
    {
      id: "first-action", kind: "choice", scene: 0, title: "죽은 단말기",
      prompt: "무너진 보급 통로. 먼지에 묻힌 계약 문양이 아주 약하게 맥박친다. 무엇부터 할까?",
      options: [
        option("first-reach", "손을 뻗는다", "안쪽에서 들린 금속음을 먼저 확인한다."),
        option("first-observe", "살펴본다", "계약 문양과 마지막 발신 기록을 확인한다."),
        option("first-reckon", "값을 묻는다", "남은 전력과 열 수 있는 보급함 수를 계산한다."),
        option("first-ask", "되묻는다", "폐허의 구조 신호에 짧게 응답한다."),
      ],
      nextByChoice: { "first-reach": "first-result-reach", "first-observe": "first-result-observe", "first-reckon": "first-result-reckon", "first-ask": "first-result-ask" },
    },
    { id: "first-result-reach", kind: "dialogue", scene: 0, title: "죽은 단말기", lines: [line("s0-reach", "system", "기록", "케이블에 끼인 물쥐를 풀어 주자 젖은 발자국이 흰 문양을 잇는다. 구조 신호의 생체 구간을 보존했지만, 오래된 발신 기록 한 조각은 사라졌다.", null, null, "none")], nextId: "nieun-contact" },
    { id: "first-result-observe", kind: "dialogue", scene: 0, title: "죽은 단말기", lines: [line("s0-observe", "system", "기록", "마지막 발신 시각은 A.T.272. 발신자는 PLUTO / 긴급 항로 권한. 기록을 보존하는 대신 예비 전력 한 칸을 썼다.", null, null, "none")], nextId: "nieun-contact" },
    { id: "first-result-reckon", kind: "dialogue", scene: 0, title: "죽은 단말기", lines: [line("s0-reckon", "system", "기록", "귀환 좌표용 전력을 남겼다. 대신 구조 신호의 첫 8초는 복원할 수 없게 됐다.", null, null, "none")], nextId: "nieun-contact" },
    { id: "first-result-ask", kind: "dialogue", scene: 0, title: "죽은 단말기", lines: [line("s0-ask", "system", "기록", "현재 시각의 양방향 구조 채널이 열린다. 잠긴 보급함을 열 전력 한 칸은 포기했다.", null, null, "none")], nextId: "nieun-contact" },
    {
      id: "nieun-contact", kind: "dialogue", scene: 0, title: "죽은 단말기", nextId: "nieun-question",
      lines: [
        line("s0-nieun-who", "nieun", "박니은", "누구야.", "review-nieun-current-angry", "nieun/finale/event-horizon-magical-girl", "communication", "통신 영상보다 노란 경고선이 먼저 안정된다.", "old-pluto-signal-awake"),
        line("s0-nieun-stop", "nieun", "박니은", "아니, 잠깐. 그 단말기에서 손부터 떼지 마. 이미 늦었지만 더 늦게 만들 수는 있으니까.", "review-nieun-current-angry", "nieun/finale/event-horizon-magical-girl", "communication"),
      ],
    },
    {
      id: "nieun-question", kind: "choice", scene: 0, title: "죽은 단말기", prompt: "노란 통신선 너머의 여자는 당신을 침입자로도, 구조자로도 확정하지 않았다.",
      options: [
        option("ask-identity", "당신이 먼저 누구인지 묻는다", "상대의 정체부터 확인한다."),
        option("ask-situation", "단말기에 무슨 일이 생겼는지 묻는다", "현재 위험을 먼저 확인한다."),
        option("ask-exit", "출구 방향부터 요구한다", "살아 나갈 길을 우선한다."),
        option("ask-silence", "말없이 통신 상태를 확인한다", "상대의 반응을 관찰한다."),
      ],
      nextByChoice: { "ask-identity": "nieun-answer-identity", "ask-situation": "nieun-answer-situation", "ask-exit": "nieun-answer-exit", "ask-silence": "nieun-answer-silence" },
    },
    { id: "nieun-answer-identity", kind: "dialogue", scene: 0, title: "죽은 단말기", lines: [line("s0-identity-1", "nieun", "박니은", "박니은. 정보상. 전직은 길고 불명예스러워서 명함 뒷면에 적었어.", "review-nieun-current-smirk-alt", "nieun/finale/event-horizon-magical-girl", "communication"), line("s0-identity-2", "nieun", "박니은", "지금 중요한 건 네가 134년 전에 끝난 플루토 긴급선을 깨웠다는 쪽이고.", "review-nieun-current-angry", "nieun/finale/event-horizon-magical-girl", "communication")], nextId: "nieun-horizon" },
    { id: "nieun-answer-situation", kind: "dialogue", scene: 0, title: "죽은 단말기", lines: [line("s0-situation-1", "nieun", "박니은", "피쿼드 폐허에 과거가 다시 켜졌어. 전기 말고 진짜 과거.", "review-nieun-current-angry", "nieun/finale/event-horizon-magical-girl", "communication"), line("s0-situation-2", "nieun", "박니은", "기관차 머리 달린 놈이 죽은 항로를 끌고 다니는 중이야.", "review-nieun-current-angry", "nieun/finale/event-horizon-magical-girl", "communication")], nextId: "nieun-horizon" },
    { id: "nieun-answer-exit", kind: "dialogue", scene: 0, title: "죽은 단말기", lines: [line("s0-exit-1", "nieun", "박니은", "실용적이라 좋네. 오른쪽 통로는 막혔고 왼쪽은 곧 과거가 돼.", "review-nieun-current-smirk-alt", "nieun/finale/event-horizon-magical-girl", "communication"), line("s0-exit-2", "nieun", "박니은", "앞으로 가. 살아 있는 사람한테는 보통 권하지 않는 방향인데 오늘은 예외야.", "review-nieun-current-angry", "nieun/finale/event-horizon-magical-girl", "communication")], nextId: "nieun-horizon" },
    { id: "nieun-answer-silence", kind: "dialogue", scene: 0, title: "죽은 단말기", lines: [line("s0-silence-1", "nieun", "박니은", "듣고는 있네. 죽은 사람이면 한 번, 산 사람이면 두 번 두드려.", "review-nieun-current-angry", "nieun/finale/event-horizon-magical-girl", "communication"), line("s0-silence-2", "system", "기록", "당신이 금속 벽을 두 번 두드린다.", null, null, "none"), line("s0-silence-3", "nieun", "박니은", "살아 있네. 축하해. 요즘 메트로에서 그건 꽤 희귀한 특기거든.", "review-nieun-current-smirk-alt", "nieun/finale/event-horizon-magical-girl", "communication")], nextId: "nieun-horizon" },
    {
      id: "nieun-horizon", kind: "dialogue", scene: 0, title: "죽은 단말기", nextId: "alger-arrival",
      lines: [
        line("s0-horizon", "nieun", "박니은", "내가 움직이면 세상 끝도 같이 움직여.", "review-nieun-current-smirk-alt", "nieun/finale/event-horizon-magical-girl", "communication", "진심을 말하는 동안 통신 노이즈가 오히려 줄어든다.", "nieun-cannot-leave"),
        line("s0-find-alger", "nieun", "박니은", "안쪽에 알제라는 사람이 있어. 팔은 없어도 버튼은 잘 누르니까 찾아.", "review-nieun-current-smirk-alt", "nieun/finale/event-horizon-magical-girl", "communication"),
      ],
    },
    {
      id: "alger-arrival", kind: "dialogue", scene: 1, title: "마지막 인사부", nextId: "alger-evidence",
      lines: [
        line("s1-alger-closed", "alger", "알제", "방문 접수는 끝났어. 회사도 끝났고. 용건 없으면 화면 가리지 마.", "review-alger-surprised", "alger/finale/current", "stage", "시선은 게임기에 있지만 텔레키네시스 팔은 통로와 단말기를 동시에 막는다."),
        line("s1-nieun-request", "nieun", "박니은", "플루토 긴급 권한으로 협조 요청.", "review-nieun-current-angry", "nieun/finale/event-horizon-magical-girl", "communication"),
        line("s1-alger-expired", "alger", "알제", "그 권한 134년 전에 만료됐어.", "review-alger-surprised", "alger/finale/current", "stage"),
        line("s1-terminal", "alger", "알제", "그런데 죽은 단말기가 네 손에는 대답했다.", "review-alger-surprised", "alger/finale/current", "stage", "처음으로 게임기에서 시선을 떼고 계약 문양을 본다.", "navigator-candidate-recognized"),
      ],
    },
    {
      id: "alger-evidence", kind: "choice", scene: 1, title: "마지막 인사부", prompt: "알제가 당신이 무엇을 보고 왔는지 묻는다.",
      options: [
        option("evidence-signal", "안쪽의 구조 신호를 보여 준다", "사람일 가능성을 먼저 제시한다."),
        option("evidence-record", "A.T.272 발신 기록을 보여 준다", "과거 기록의 진위를 확인한다."),
        option("evidence-count", "열린 보급함과 닫힌 보급함 수를 말한다", "생존 판단을 증명한다."),
        option("evidence-question", "왜 단말기를 직접 끄지 않는지 묻는다", "알제가 남은 이유를 되묻는다."),
      ],
      nextByChoice: { "evidence-signal": "alger-answer-signal", "evidence-record": "alger-answer-record", "evidence-count": "alger-answer-count", "evidence-question": "alger-answer-question" },
    },
    { id: "alger-answer-signal", kind: "dialogue", scene: 1, title: "마지막 인사부", lines: [line("s1-answer-signal", "alger", "알제", "생물 신호보다 계약 신호가 많네. 어느 쪽이 사람인지는 열어 봐야 알아.", "review-alger-surprised", "alger/finale/current", "stage")], nextId: "registration-intro" },
    { id: "alger-answer-record", kind: "dialogue", scene: 1, title: "마지막 인사부", lines: [line("s1-answer-record", "alger", "알제", "플루토 서명 맞아. 본인은 저 멀리서 부정하고 있지만.", "review-alger-surprised", "alger/finale/current", "stage")], nextId: "registration-intro" },
    { id: "alger-answer-count", kind: "dialogue", scene: 1, title: "마지막 인사부", lines: [line("s1-answer-count", "alger", "알제", "전력 배선은 맞게 바꿨어. 살아남은 이유가 운만은 아니네.", "review-alger-surprised", "alger/finale/current", "stage")], nextId: "registration-intro" },
    { id: "alger-answer-question", kind: "dialogue", scene: 1, title: "마지막 인사부", lines: [line("s1-answer-question", "alger", "알제", "끄면 안쪽에 갇힌 게 같이 꺼질 수 있으니까. 책임지기 싫은 거랑 사람을 버리는 건 다른 일이야.", "review-alger-surprised", "alger/finale/current", "stage")], nextId: "registration-intro" },
    {
      id: "registration-intro", kind: "dialogue", scene: 1, title: "마지막 인사부", nextId: "registration-choice",
      lines: [
        line("s1-system-disposal", "system", "계약 단말기", "미등록 생체 접근. 정리 대상에 현재 생체가 포함되었습니다.", null, null, "none"),
        line("s1-alger-access", "alger", "알제", "접근 권한 없으면 네가 폐기 대상이래.", "review-alger-surprised", "alger/finale/current", "stage"),
        line("s1-alger-navigator", "alger", "알제", "항해사. 폐쇄 항로에 들어가서 경로를 고르고 사람을 데려오는 직종. 백 년 넘게 안 썼네.", "review-alger-surprised", "alger/finale/current", "stage"),
      ],
    },
    {
      id: "registration-choice", kind: "choice", scene: 1, title: "임시 항해사", prompt: "자격 조건은 하나. 살아서 돌아올 것.",
      options: [
        option("register-sign", "계약을 읽고 직접 서명한다", "이름은 비우고 직책부터 받는다."),
        option("register-terms", "생환 수당과 실패 조건을 확인한다", "계약의 값을 먼저 확인한다."),
        option("register-people", "안쪽에 사람이 있는지 다시 묻는다", "직책보다 구조 대상을 확인한다."),
      ],
      nextByChoice: { "register-sign": "registration-answer-sign", "register-terms": "registration-answer-terms", "register-people": "registration-answer-people" },
    },
    { id: "registration-answer-sign", kind: "dialogue", scene: 1, title: "임시 항해사", lines: [line("s1-reg-sign", "alger", "알제", "좋아. 이름은 네가 정할 때까지 비워 둔다. 직책만 먼저 간다.", "review-alger-surprised", "alger/finale/current", "stage"), line("s1-reg-complete-sign", "system", "계약 단말기", "피쿼드 임시 항해사 권한이 발급되었습니다.", null, null, "none")], nextId: "companions-intro" },
    { id: "registration-answer-terms", kind: "dialogue", scene: 1, title: "임시 항해사", lines: [line("s1-reg-terms", "alger", "알제", "보수는 회수 물자 하나. 생환 수당은 지급 주체가 소멸해서 없어.", "review-alger-surprised", "alger/finale/current", "stage"), line("s1-reg-complete-terms", "system", "계약 단말기", "피쿼드 임시 항해사 권한이 발급되었습니다.", null, null, "none")], nextId: "companions-intro" },
    { id: "registration-answer-people", kind: "dialogue", scene: 1, title: "임시 항해사", lines: [line("s1-reg-people", "alger", "알제", "모른다. 그러니까 확인할 사람이 필요한 거고.", "review-alger-surprised", "alger/finale/current", "stage"), line("s1-reg-complete-people", "system", "계약 단말기", "피쿼드 임시 항해사 권한이 발급되었습니다.", null, null, "none")], nextId: "companions-intro" },
    {
      id: "companions-intro", kind: "dialogue", scene: 2, title: "함께 갈 두 사람", nextId: "companion-selection",
      lines: [
        line("s2-pale", "pale", "페일", "아는 사람 같다는 뜻은 아니야. 아는 기분 같다는 뜻이지.", "review-pale-smile", "pale/finale/current", "stage", "당신에게 다가오다 스스로 한 걸음 멈춘다."),
        line("s2-kano", "kano", "카노", "좋아요. 제가 감독하죠. 과거를 함부로 열면 현재 쪽을 닫아 버릴 수도 있으니까.", "review-kano-smirk", "kano/finale/current", "stage", "서리가 출구 방향부터 막고 당신 쪽에서는 멈춘다."),
        line("s2-nemo", "nemo", "네모 / 바치칼", "돌아갈 수 있다는 이유로 먼저 죽을 생각은 하지 마라.", "review-bacikal-angry", "bacikal/finale/current", "stage", "계약 문양을 본 뒤 창끝을 아래로 내린다."),
      ],
    },
    { id: "companion-selection", kind: "companions", scene: 2, title: "함께 갈 두 사람" },
    {
      id: "nemo-name", kind: "choice", scene: 2, title: "되찾은 이름", prompt: "시간을 되돌린 사람을 무엇이라 부를까? 이 선택은 정답이 아니라 이후 호칭과 기억 검증의 문맥을 바꾼다.",
      options: [option("name-nemo", "네모라고 부른다", "현재 되찾은 이름을 쓴다."), option("name-bacikal", "바치칼이라고 부른다", "그 이름으로 한 선택도 지우지 않는다."), option("name-self", "당신이 고르라고 한다", "이름의 결정권을 돌려준다.")],
      nextByChoice: { "name-nemo": "pale-boundary", "name-bacikal": "pale-boundary", "name-self": "pale-boundary" },
    },
    {
      id: "pale-boundary", kind: "choice", scene: 2, title: "익숙함의 경계", prompt: "페일이 느낀 오래된 익숙함을 현재 관계의 증거로 확정하지 않는다. 이번 항로의 경계를 정한다.",
      options: [option("pale-clue", "그 기분은 단서로만 다룬다", "지금 관계는 지금부터 정한다."), option("pale-together", "근원은 함께 찾는다", "과거의 친밀함은 요구하지 않는다."), option("pale-mission", "이번 항로에서는 임무와 감정을 분리한다", "먼저 살아 돌아온 뒤 다시 묻는다.")],
      nextByChoice: { "pale-clue": "pact-confirm", "pale-together": "pact-confirm", "pale-mission": "pact-confirm" },
    },
    {
      id: "pact-confirm", kind: "choice", scene: 2, title: "동행 계약", prompt: "선택한 두 사람의 동행 조건과 거부권을 확인했다. 알제는 항로만 열고, 싸우는 방식과 멈출 권리는 동료에게 남긴다.",
      options: [option("pacts-accept", "두 조건을 확인하고 수락한다", "서로 다른 안이 나오면 결과를 알고 하나를 고른다."), option("pacts-ask", "실제 위험을 한 번 더 묻는다", "조건 위반이 무엇을 바꾸는지 확인한다.")],
      nextByChoice: { "pacts-accept": "departure", "pacts-ask": "pact-detail" },
    },
    {
      id: "pact-detail", kind: "dialogue", scene: 2, title: "동행 계약", nextId: "pact-confirm",
      lines: [line("s2-alger-pacts", "alger", "알제", "조건을 어겨도 당장 죽지는 않아. 대신 저 사람의 전용 카드, 관계, 귀환 평가 중 하나는 달라져. 동시에 다 지킬 수 있다는 거짓말은 하지 마.", "review-alger-surprised", "alger/finale/current", "stage")],
    },
    { id: "departure-pale-kano", kind: "dialogue", scene: 2, title: "첫 항로", lines: [line("s2-pk-support", "nemo", "네모 / 바치칼", "밖에서 퇴로를 확인한다. 돌아오지 않으면 들어간다.", "review-bacikal-angry", "bacikal/finale/current", "stage"), line("s2-pk-kano", "kano", "카노", "앞으로 튀어나가지 마요.", "review-kano-smirk", "kano/finale/current", "stage"), line("s2-pk-pale", "pale", "페일", "임시 항해사가 앞을 고르잖아. 나는 그 앞의 앞을 볼게.", "review-pale-smile", "pale/finale/current", "stage")], nextId: "pilot-complete" },
    { id: "departure-pale-nemo", kind: "dialogue", scene: 2, title: "첫 항로", lines: [line("s2-pn-support", "kano", "카노", "귀환 지점을 계속 보겠습니다. 연락을 무시하면 직접 끌어냅니다.", "review-kano-smirk", "kano/finale/current", "stage"), line("s2-pn-pale", "pale", "페일", "네모는 길을 접고, 나는 길을 묶고, 임시 항해사는 길을 고르네.", "review-pale-smile", "pale/finale/current", "stage"), line("s2-pn-nemo", "nemo", "네모 / 바치칼", "너는 길을 잃는 쪽에 더 가깝다.", "review-bacikal-angry", "bacikal/finale/current", "stage")], nextId: "pilot-complete" },
    { id: "departure-kano-nemo", kind: "dialogue", scene: 2, title: "첫 항로", lines: [line("s2-kn-support", "pale", "페일", "다녀와. 이상한 걸 찾으면 내 몫도 남겨 둬.", "review-pale-smile", "pale/finale/current", "stage"), line("s2-kn-kano", "kano", "카노", "시간을 되돌리는 일은 금지합니다.", "review-kano-smirk", "kano/finale/current", "stage"), line("s2-kn-nemo", "nemo", "네모 / 바치칼", "동의한다. 불필요한 기술명 외침도 금지하지.", "review-bacikal-angry", "bacikal/finale/current", "stage")], nextId: "pilot-complete" },
    { id: "pilot-complete", kind: "complete", scene: 2, title: "임시 항해사의 첫 편성" },
  ],
};
