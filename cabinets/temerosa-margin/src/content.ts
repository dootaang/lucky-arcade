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
const nieun = "nieun/finale/event-horizon-magical-girl";
const alger = "alger/finale/current";
const pale = "pale/finale/current";
const kano = "kano/finale/current";
const bacikal = "bacikal/finale/current";

export const temerosaStoryContent: TemerosaStoryContent = {
  contract: "temerosa-story-content/0.1",
  version: "0.4.0",
  startNodeId: "first-action",
  companions: [
    { id: "pale", name: "페일", assetId: "review-pale-smile", summary: "사슬로 적과 감정을 묶는다.", condition: "익숙함을 관계의 증거로 쓰지 않기", refusal: "이름을 소유권처럼 쓰는 명령" },
    { id: "kano", name: "카노", assetId: "review-kano-smirk", summary: "온도를 빼앗아 위험한 기록을 멈춘다.", condition: "붕괴 선언 시 한 번은 멈추기", refusal: "증언까지 없애는 전면 정화" },
    { id: "nemo", name: "네모 / 바치칼", assetId: "review-bacikal-angry", summary: "공간을 접어 적의 선택을 제한한다.", condition: "퇴로 신호에 즉시 따르기", refusal: "선택을 지우는 시간 회귀" },
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
      nextByChoice: { "first-reach": "first-result-merged-reach", "first-observe": "first-result-merged-observe", "first-reckon": "first-result-merged-reckon", "first-ask": "first-result-merged-ask" },
    },
    {
      id: "first-result-merged-reach", kind: "dialogue", scene: 0, title: "죽은 단말기", nextId: "nieun-question",
      lines: [
        line("s0-reach-result", "system", "기록", "케이블에 끼인 물쥐를 풀어 주자 젖은 발자국이 흰 문양을 잇는다.", null, null, "none"),
        line("s0-reach-who", "nieun", "박니은", "누구야.", "review-nieun-current-angry", nieun, "communication", "통신 영상보다 노란 경고선이 먼저 안정된다.", "old-pluto-signal-awake"),
        line("s0-reach-stop", "nieun", "박니은", "아니, 잠깐. 그 단말기에서 손부터 떼지 마. 이미 늦었지만 더 늦게 만들 수는 있으니까.", "review-nieun-current-angry", nieun, "communication"),
      ],
    },
    {
      id: "first-result-merged-observe", kind: "dialogue", scene: 0, title: "죽은 단말기", nextId: "nieun-question",
      lines: [
        line("s0-observe-result", "system", "기록", "마지막 발신 시각 A.T.272. 발신자 서명, PLUTO.", null, null, "none"),
        line("s0-observe-who", "nieun", "박니은", "누구야. …그 기록, 지금 네가 열었어?", "review-nieun-current-angry", nieun, "communication", "서명 이야기가 나오자 초상이 잠깐 굳는다."),
        line("s0-observe-stop", "nieun", "박니은", "손부터 떼. 그 단말기가 깨우는 건 기록만이 아니니까.", "review-nieun-current-angry", nieun, "communication"),
      ],
    },
    {
      id: "first-result-merged-reckon", kind: "dialogue", scene: 0, title: "죽은 단말기", nextId: "nieun-question",
      lines: [
        line("s0-reckon-result", "system", "기록", "전력선을 바꿔 귀환 좌표용 전력을 남겼다.", null, null, "none"),
        line("s0-reckon-who", "nieun", "박니은", "누구야. 폐허에서 배선을 그렇게 만지는 사람, 요즘엔 드문데.", "review-nieun-current-angry", nieun, "communication"),
        line("s0-reckon-stop", "nieun", "박니은", "손 떼. 전력이 흔들리면 이 폐허에서 깨어나는 게 하나 더 늘어.", "review-nieun-current-angry", nieun, "communication"),
      ],
    },
    {
      id: "first-result-merged-ask", kind: "dialogue", scene: 0, title: "죽은 단말기", nextId: "nieun-question",
      lines: [
        line("s0-ask-result", "system", "기록", "구조 신호에 현재 시각으로 응답했다.", null, null, "none"),
        line("s0-ask-who", "nieun", "박니은", "누구야. 방금 그 응답, 네가 보냈어?", "review-nieun-current-angry", nieun, "communication"),
        line("s0-ask-stop", "nieun", "박니은", "다음부터는 응답하기 전에 나한테 물어. 죽은 신호는 대답을 기억하거든.", "review-nieun-current-angry", nieun, "communication", "경고인데 목소리가 낮아진다."),
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
      nextByChoice: { "ask-identity": "nieun-answer-merged-identity", "ask-situation": "nieun-answer-merged-situation", "ask-exit": "nieun-answer-merged-exit", "ask-silence": "nieun-answer-merged-silence" },
    },
    {
      id: "nieun-answer-merged-identity", kind: "dialogue", scene: 0, title: "죽은 단말기", nextId: "alger-arrival",
      lines: [
        line("s0-identity-1", "nieun", "박니은", "박니은. 정보상. 전직은 길고 불명예스러워서 명함 뒷면에 적었어.", "review-nieun-current-smirk-alt", nieun, "communication"),
        line("s0-identity-2", "nieun", "박니은", "지금 중요한 건 네가 134년 전에 끝난 긴급 회선을 깨웠다는 쪽이고.", "review-nieun-current-angry", nieun, "communication"),
        line("s0-identity-3", "nieun", "박니은", "내가 직접 갈 수 있으면 좋겠는데. 내가 움직이면 세상 끝도 같이 움직여.", "review-nieun-current-smirk-alt", nieun, "communication", "진심을 말하는 동안 통신 노이즈가 오히려 줄어든다.", "nieun-cannot-leave"),
        line("s0-identity-4", "nieun", "박니은", "안쪽에 알제라는 사람이 있어. 팔은 없어도 버튼은 잘 누르니까 찾아.", "review-nieun-current-smirk-alt", nieun, "communication"),
      ],
    },
    {
      id: "nieun-answer-merged-situation", kind: "dialogue", scene: 0, title: "죽은 단말기", nextId: "alger-arrival",
      lines: [
        line("s0-situation-1", "nieun", "박니은", "피쿼드 폐허에 과거가 다시 켜졌어. 전기 말고 진짜 과거.", "review-nieun-current-angry", nieun, "communication"),
        line("s0-situation-2", "nieun", "박니은", "기관차 머리 달린 놈이 죽은 항로를 끌고 다니는 중이야.", "review-nieun-current-angry", nieun, "communication"),
        line("s0-situation-3", "nieun", "박니은", "내가 가서 꺼 주고 싶은데, 내가 움직이면 세상 끝도 같이 움직여. 그러면 네 일정이 폐허 탈출에서 종말 관람으로 바뀌지.", "review-nieun-current-smirk-alt", nieun, "communication", "농담을 하는 프레임 뒤로 검은 파동이 한 번 스친다."),
        line("s0-situation-4", "nieun", "박니은", "안쪽에 알제라는 사람이 있어. 팔은 없어도 버튼은 잘 누르니까 찾아.", "review-nieun-current-smirk-alt", nieun, "communication"),
      ],
    },
    {
      id: "nieun-answer-merged-exit", kind: "dialogue", scene: 0, title: "죽은 단말기", nextId: "alger-arrival",
      lines: [
        line("s0-exit-1", "nieun", "박니은", "실용적이라 좋네. 오른쪽 통로는 막혔고 왼쪽은 곧 과거가 돼.", "review-nieun-current-smirk-alt", nieun, "communication"),
        line("s0-exit-2", "nieun", "박니은", "앞으로 가. 살아 있는 사람한테는 보통 권하지 않는 방향인데 오늘은 예외야.", "review-nieun-current-angry", nieun, "communication"),
        line("s0-exit-3", "nieun", "박니은", "안내는 여기까지. 내가 움직이면 세상 끝도 같이 움직여서, 동행은 못 해.", "review-nieun-current-smirk-alt", nieun, "communication", "이 말을 하는 동안만 노이즈가 잦아든다."),
        line("s0-exit-4", "nieun", "박니은", "대신 안쪽에 알제가 있어. 팔은 없어도 버튼은 잘 누르는 사람이야.", "review-nieun-current-smirk-alt", nieun, "communication"),
      ],
    },
    {
      id: "nieun-answer-merged-silence", kind: "dialogue", scene: 0, title: "죽은 단말기", nextId: "alger-arrival",
      lines: [
        line("s0-silence-1", "nieun", "박니은", "듣고는 있네. 죽은 사람이면 한 번, 산 사람이면 두 번 두드려.", "review-nieun-current-angry", nieun, "communication"),
        line("s0-silence-2", "system", "기록", "당신이 금속 벽을 두 번 두드린다.", null, null, "none"),
        line("s0-silence-3", "nieun", "박니은", "살아 있네. 축하해. 요즘 메트로에서 그건 꽤 희귀한 특기거든.", "review-nieun-current-smirk-alt", nieun, "communication"),
        line("s0-silence-4", "nieun", "박니은", "내려가서 악수는 못 해. 내가 움직이면 세상 끝도 같이 움직이니까. 안쪽의 알제를 찾아.", "review-nieun-current-smirk-alt", nieun, "communication", "농담과 달리, 문장 끝에서 시선이 잠깐 내려간다."),
      ],
    },
    {
      id: "alger-arrival", kind: "dialogue", scene: 1, title: "마지막 인사부", nextId: "alger-evidence",
      lines: [
        line("s1-arrival-system", "system", "기록", "게임기 소리가 새어 나오는 옛 로비. 소파의 남자는 시선도 들지 않는데, 보이지 않는 팔이 떨어지는 천장 조각을 옆으로 치운다.", null, null, "none"),
        line("s1-alger-closed", "alger", "알제", "방문 접수는 끝났어. 회사도 끝났고. 용건 없으면 화면 가리지 마.", "review-alger-smirk", alger, "stage"),
        line("s1-nieun-request", "nieun", "박니은", "협조 요청. 134년 전 긴급 권한으로.", "review-nieun-current-angry", nieun, "communication"),
        line("s1-alger-expired", "alger", "알제", "그 권한 만료됐어. …발신자가 누군지는 서로 말 안 하는 걸로 하고.", "review-alger-standing", alger, "stage"),
        line("s1-terminal", "alger", "알제", "헌터 표식 없음. 소속 없음. 그런데 죽은 단말기가 네 손에는 대답했다.", "review-alger-surprised", alger, "stage", "처음으로 게임기에서 시선을 떼고 계약 문양을 본다.", "navigator-candidate-recognized"),
      ],
    },
    {
      id: "alger-evidence", kind: "choice", scene: 1, title: "마지막 인사부", prompt: "알제가 당신이 무엇을 보고 왔는지 묻는다.",
      options: [
        option("evidence-signal", "안쪽의 구조 신호를 보여 준다", "보존한 생체 구간을 먼저 제시한다."),
        option("evidence-record", "A.T.272 발신 기록을 보여 준다", "보존한 과거 기록의 진위를 확인한다."),
        option("evidence-count", "열린 보급함과 닫힌 보급함 수를 말한다", "직접 계산한 생존 판단을 증명한다."),
        option("evidence-channel", "열어 둔 양방향 구조 채널을 보여 준다", "응답이 오가는 현재 채널을 확인시킨다."),
        option("evidence-question", "왜 단말기를 직접 끄지 않는지 묻는다", "알제가 남은 이유를 되묻는다."),
      ],
      nextByChoice: { "evidence-signal": "alger-answer-merged-signal", "evidence-record": "alger-answer-merged-record", "evidence-count": "alger-answer-merged-count", "evidence-channel": "alger-answer-merged-channel", "evidence-question": "alger-answer-merged-question" },
    },
    {
      id: "alger-answer-merged-signal", kind: "dialogue", scene: 1, title: "마지막 인사부", nextId: "registration-choice",
      lines: [
        line("s1-signal-1", "alger", "알제", "생물 신호보다 계약 신호가 많네. 어느 쪽이 사람인지는 열어 봐야 알아.", "review-alger-standing", alger, "stage"),
        line("s1-signal-2", "system", "계약 단말기", "미등록 생체 접근. 정리 대상에 현재 생체가 포함되었습니다.", null, null, "none"),
        line("s1-signal-3", "alger", "알제", "권한이 없으면 네가 폐기 대상이래. 헌터를 시키자니 시험관도 시험장도 죽었고.", "review-alger-disappointed", alger, "stage"),
        line("s1-signal-4", "alger", "알제", "항해사. 폐쇄 항로에 들어가서 경로를 고르고 사람을 데려오는 직종. 자격 조건은… 살아서 돌아올 것.", "review-alger-standing", alger, "stage", "백 년 묵은 항목인데 손끝이 망설임 없이 그 줄을 짚는다."),
      ],
    },
    {
      id: "alger-answer-merged-record", kind: "dialogue", scene: 1, title: "마지막 인사부", nextId: "registration-choice",
      lines: [
        line("s1-record-1", "alger", "알제", "플루토 서명 맞아. 본인은 저 멀리서 부정하고 있지만.", "review-alger-smirk", alger, "stage"),
        line("s1-record-2", "system", "계약 단말기", "미등록 생체 접근. 정리 대상에 현재 생체가 포함되었습니다.", null, null, "none"),
        line("s1-record-3", "alger", "알제", "네가 폐기되기 전에 서류부터 맞춘다. 백 년 넘게 비어 있던 직책이 하나 있어.", "review-alger-standing", alger, "stage"),
        line("s1-record-4", "alger", "알제", "항해사. 죽은 항로에서 무엇을 현재로 가져올지 고르는 자리다. 조건은 살아서 돌아오는 것.", "review-alger-standing", alger, "stage"),
      ],
    },
    {
      id: "alger-answer-merged-count", kind: "dialogue", scene: 1, title: "마지막 인사부", nextId: "registration-choice",
      lines: [
        line("s1-count-1", "alger", "알제", "전력 배선은 맞게 바꿨어. 살아남은 이유가 운만은 아니네.", "review-alger-smile", alger, "stage"),
        line("s1-count-2", "system", "계약 단말기", "미등록 생체 접근. 정리 대상에 현재 생체가 포함되었습니다.", null, null, "none"),
        line("s1-count-3", "alger", "알제", "계산은 되는데 서류가 없어서 죽게 생겼네. 제일 오래 버틴 서류를 꺼낸다.", "review-alger-standing", alger, "stage"),
        line("s1-count-4", "alger", "알제", "피쿼드 임시 항해사. 보수는 회수 물자 하나. 조건은 살아서 돌아올 것.", "review-alger-standing", alger, "stage"),
      ],
    },
    {
      id: "alger-answer-merged-channel", kind: "dialogue", scene: 1, title: "마지막 인사부", nextId: "registration-choice",
      lines: [
        line("s1-channel-1", "alger", "알제", "죽은 회선에 응답을 보냈군. 대답이 돌아왔다는 건, 안쪽에 아직 듣는 귀가 있다는 뜻이고.", "review-alger-standing", alger, "stage"),
        line("s1-channel-2", "system", "계약 단말기", "미등록 생체 접근. 정리 대상에 현재 생체가 포함되었습니다.", null, null, "none"),
        line("s1-channel-3", "alger", "알제", "신호만 살려 두고 발신자를 폐기되게 둘 순 없지. 시스템을 우회할 직책부터 덮어쓴다.", "review-alger-disappointed", alger, "stage"),
        line("s1-channel-4", "alger", "알제", "피쿼드 임시 항해사. 열어 둔 채널을 따라 들어가서, 대답한 쪽을 확인하고 데려오는 역할이다. 조건은 하나, 살아서 돌아올 것.", "review-alger-standing", alger, "stage"),
      ],
    },
    {
      id: "alger-answer-merged-question", kind: "dialogue", scene: 1, title: "마지막 인사부", nextId: "registration-choice",
      lines: [
        line("s1-question-1", "alger", "알제", "끄면 안쪽에 갇힌 게 같이 꺼질 수 있으니까. 책임지기 싫은 거랑 사람을 버리는 건 다른 일이야.", "review-alger-standing", alger, "stage"),
        line("s1-question-2", "system", "계약 단말기", "미등록 생체 접근. 정리 대상에 현재 생체가 포함되었습니다.", null, null, "none"),
        line("s1-question-3", "alger", "알제", "버리지 않으려면 계약서부터 바꿔야지. 회사 망하기 전 직책을 하나 발급한다.", "review-alger-standing", alger, "stage"),
        line("s1-question-4", "alger", "알제", "항해사. 안쪽의 누군가를 데려오고 싶다면, 살아 돌아올 생각으로 서명해라.", "review-alger-standing", alger, "stage"),
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
    {
      id: "registration-answer-sign", kind: "dialogue", scene: 1, title: "임시 항해사", nextId: "companions-intro",
      lines: [line("s1-reg-sign", "alger", "알제", "좋아. 이름은 네가 정할 때까지 비워 둔다. 직책만 먼저 간다.", "review-alger-smile", alger, "stage"), line("s1-reg-complete-sign", "system", "계약 단말기", "피쿼드 임시 항해사 권한이 발급되었습니다.", null, null, "none")],
    },
    {
      id: "registration-answer-terms", kind: "dialogue", scene: 1, title: "임시 항해사", nextId: "companions-intro",
      lines: [line("s1-reg-terms", "alger", "알제", "보수는 회수 물자 하나. 생환 수당은 지급 주체가 소멸해서 없어. 실패 조건은… 없네. 실패하면 정산할 사람이 없거든.", "review-alger-standing", alger, "stage"), line("s1-reg-complete-terms", "system", "계약 단말기", "피쿼드 임시 항해사 권한이 발급되었습니다.", null, null, "none")],
    },
    {
      id: "registration-answer-people", kind: "dialogue", scene: 1, title: "임시 항해사", nextId: "companions-intro",
      lines: [line("s1-reg-people", "alger", "알제", "모른다. 그러니까 확인할 사람이 필요한 거고. …신호 하나는 아직 사람일 가능성이 있어.", "review-alger-standing", alger, "stage"), line("s1-reg-complete-people", "system", "계약 단말기", "피쿼드 임시 항해사 권한이 발급되었습니다.", null, null, "none")],
    },
    {
      id: "companions-intro", kind: "dialogue", scene: 2, title: "함께 갈 두 사람", nextId: "companion-selection",
      lines: [
        line("s2-pale-1", "pale", "페일", "이상하네. 폐허 냄새랑 오래된 바다 냄새가 같이 나. 너한테서도.", "review-pale-smile", pale, "stage", "다가오다 스스로 한 걸음 멈춘다."),
        line("s2-pale-2", "pale", "페일", "아는 사람 같다는 뜻은 아니야. 아는 기분 같다는 뜻이지. 설명은 길어질 것 같고, 같이 가 보면 더 재밌을 것 같아.", "review-pale-smile", pale, "stage"),
        line("s2-kano", "kano", "카노", "임시 항해사? 직함을 너무 쉽게 주는군요. 좋아요, 제가 감독하죠. 과거를 함부로 열면 현재 쪽을 닫아 버릴 수도 있으니까.", "review-kano-smirk", kano, "stage", "서리가 출구 방향부터 막고, 당신 쪽에서는 멈춘다."),
        line("s2-nemo", "nemo", "네모 / 바치칼", "돌아갈 수 있다는 이유로 먼저 죽을 생각은 하지 마라.", "review-bacikal-angry", bacikal, "stage", "당신의 문양을 본 뒤 창끝을 아래로 내린다."),
      ],
    },
    { id: "companion-selection", kind: "companions", scene: 2, title: "함께 갈 두 사람" },
    {
      id: "nemo-name", kind: "choice", scene: 2, title: "되찾은 이름", prompt: "시간을 되돌린 사람을 무엇이라 부를까? 이 선택은 정답이 아니라 이후 호칭과 기억 검증의 문맥을 바꾼다.",
      options: [option("name-nemo", "네모라고 부른다", "현재 되찾은 이름을 쓴다."), option("name-bacikal", "바치칼이라고 부른다", "그 이름으로 한 선택도 지우지 않는다."), option("name-self", "당신이 고르라고 한다", "이름의 결정권을 돌려준다.")],
      nextByChoice: { "name-nemo": "nemo-name-ans-nemo", "name-bacikal": "nemo-name-ans-bacikal", "name-self": "nemo-name-ans-self" },
    },
    { id: "nemo-name-ans-nemo", kind: "dialogue", scene: 2, title: "되찾은 이름", lines: [line("s2-name-nemo", "nemo", "네모 / 바치칼", "네모. 아직 어색해야 할 이유가 충분하니까.", "review-bacikal-standing", bacikal, "stage")], nextId: "pale-boundary" },
    { id: "nemo-name-ans-bacikal", kind: "dialogue", scene: 2, title: "되찾은 이름", lines: [line("s2-name-bacikal", "nemo", "네모 / 바치칼", "바치칼. 그 이름으로 한 선택도 내가 했다.", "review-bacikal-angry", bacikal, "stage")], nextId: "pale-boundary" },
    { id: "nemo-name-ans-self", kind: "dialogue", scene: 2, title: "되찾은 이름", lines: [line("s2-name-self", "nemo", "네모 / 바치칼", "네모로 하겠다. 도망치지 않기 위해 되찾은 이름이다.", "review-bacikal-smile", bacikal, "stage")], nextId: "pale-boundary" },
    {
      id: "pale-boundary", kind: "choice", scene: 2, title: "익숙함의 경계", prompt: "페일이 느낀 오래된 익숙함을 현재 관계의 증거로 확정하지 않는다. 이번 항로의 경계를 정한다.",
      options: [option("pale-clue", "그 기분은 단서로만 다룬다", "지금 관계는 지금부터 정한다."), option("pale-together", "근원은 함께 찾는다", "과거의 친밀함은 요구하지 않는다."), option("pale-mission", "이번 항로에서는 임무와 감정을 분리한다", "먼저 살아 돌아온 뒤 다시 묻는다.")],
      nextByChoice: { "pale-clue": "pale-boundary-ans-clue", "pale-together": "pale-boundary-ans-together", "pale-mission": "pale-boundary-ans-mission" },
    },
    { id: "pale-boundary-ans-clue", kind: "dialogue", scene: 2, title: "익숙함의 경계", lines: [line("s2-pale-clue", "pale", "페일", "좋아. 냄새는 기억해도 사람은 새로 물어볼게.", "review-pale-smile", pale, "stage")], nextId: "nieun-return" },
    { id: "pale-boundary-ans-together", kind: "dialogue", scene: 2, title: "익숙함의 경계", lines: [line("s2-pale-together", "pale", "페일", "그게 더 재밌겠다. 같은 길인지 확인하면서, 처음부터 같이 걸을 수 있잖아.", "review-pale-smile", pale, "stage")], nextId: "nieun-return" },
    { id: "pale-boundary-ans-mission", kind: "dialogue", scene: 2, title: "익숙함의 경계", lines: [line("s2-pale-mission", "pale", "페일", "알겠어. 먼저 살아 돌아오고, 궁금한 건 그다음에 묻자.", "review-pale-standing", pale, "stage", "웃음기가 빠지지만 목소리는 가볍다.")], nextId: "nieun-return" },
    {
      id: "nieun-return-pale-kano", kind: "dialogue", scene: 2, title: "동행 계약", nextId: "pact-confirm",
      lines: [line("s2-nieun-pk", "nieun", "박니은", "편성 확인. …시끄러운 조합이야. 좋은 뜻으로.", "review-nieun-current-smirk-alt", nieun, "communication"), line("s2-nieun-pk-live", "nieun", "박니은", "죽지 마. 그게 계약 조건이니까.", "review-nieun-current-angry", nieun, "communication", "이 한마디 동안 노이즈가 잠깐 줄어든다.")],
    },
    {
      id: "nieun-return-pale-nemo", kind: "dialogue", scene: 2, title: "동행 계약", nextId: "pact-confirm",
      lines: [line("s2-nieun-pn", "nieun", "박니은", "편성 확인. 기분으로 찾는 쪽과 기록으로 찾는 쪽이네. 가운데서 고르는 건 네 몫이고.", "review-nieun-current-smirk-alt", nieun, "communication"), line("s2-nieun-pn-live", "nieun", "박니은", "죽지 마. 그게 계약 조건이니까.", "review-nieun-current-angry", nieun, "communication", "이 한마디 동안 노이즈가 잠깐 줄어든다.")],
    },
    {
      id: "nieun-return-kano-nemo", kind: "dialogue", scene: 2, title: "동행 계약", nextId: "pact-confirm",
      lines: [line("s2-nieun-kn", "nieun", "박니은", "편성 확인. 말수가 아껴지는 조합이네. 대신 표정을 잘 봐. 그 둘은 얼굴이 먼저 말하거든.", "review-nieun-current-smirk-alt", nieun, "communication"), line("s2-nieun-kn-live", "nieun", "박니은", "죽지 마. 그게 계약 조건이니까.", "review-nieun-current-angry", nieun, "communication", "이 한마디 동안 노이즈가 잠깐 줄어든다.")],
    },
    {
      id: "pact-confirm", kind: "choice", scene: 2, title: "동행 계약", prompt: "두 사람의 조건을 확인했다. 항로를 여는 건 알제, 싸우고 멈추는 건 두 사람, 고르는 건 당신이다.",
      options: [option("pacts-accept", "두 조건을 확인하고 수락한다", "서로 다른 안이 나오면 결과를 알고 하나를 고른다."), option("pacts-ask", "조건을 어기면 실제로 무슨 일이 생기는지 묻는다", "조건 위반이 무엇을 바꾸는지 확인한다.")],
      nextByChoice: { "pacts-accept": "departure", "pacts-ask": "pact-ans-ask" },
    },
    {
      id: "pact-ans-ask", kind: "dialogue", scene: 2, title: "동행 계약", nextId: "pact-accept-after-detail",
      lines: [line("s2-alger-pacts", "alger", "알제", "어긴다고 당장 죽지는 않아. 대신 저 사람의 카드, 관계, 귀환 평가 중 하나가 달라져. 동시에 다 지킬 수 있다는 거짓말은 안 한다.", "review-alger-standing", alger, "stage")],
    },
    {
      id: "pact-accept-after-detail", kind: "choice", scene: 2, title: "동행 계약", prompt: "설명을 들었다. 선택한 두 사람의 조건은 그대로 남아 있다.",
      options: [option("pacts-accept-after-detail", "설명을 들었다. 두 조건을 수락하고 출항한다", "두 계약을 명시적으로 받아들인다.")],
      nextByChoice: { "pacts-accept-after-detail": "departure" },
    },
    {
      id: "departure-pale-kano", kind: "dialogue", scene: 2, title: "첫 항로", nextId: "pilot-complete-message",
      lines: [
        line("s2-pk-support", "nemo", "네모 / 바치칼", "밖에서 퇴로를 확인한다. 돌아오지 않으면 들어간다.", "review-bacikal-angry", bacikal, "stage"),
        line("s2-pk-kano", "kano", "카노", "앞으로 튀어나가지 마요.", "review-kano-angry", kano, "stage"),
        line("s2-pk-pale", "pale", "페일", "임시 항해사가 앞을 고르잖아. 나는 그 앞의 앞을 볼게.", "review-pale-smirk", pale, "stage"),
        line("s2-pk-kano-retort", "kano", "카노", "그게 튀어나간다는 뜻이에요!", "review-kano-upset", kano, "stage", "발끈하는데 서리는 흐트러지지 않는다."),
      ],
    },
    {
      id: "departure-pale-nemo", kind: "dialogue", scene: 2, title: "첫 항로", nextId: "pilot-complete-message",
      lines: [
        line("s2-pn-support", "kano", "카노", "귀환 지점을 계속 보겠습니다. 연락을 무시하면 직접 끌어냅니다.", "review-kano-smirk", kano, "stage"),
        line("s2-pn-pale", "pale", "페일", "네모는 길을 접고, 나는 길을 묶고, 임시 항해사는 길을 고르네.", "review-pale-smile", pale, "stage"),
        line("s2-pn-nemo", "nemo", "네모 / 바치칼", "너는 길을 잃는 쪽에 더 가깝다.", "review-bacikal-standing", bacikal, "stage"),
        line("s2-pn-pale-reply", "pale", "페일", "그래도 찾으러 오는 사람이 있잖아.", "review-pale-smirk", pale, "stage"),
      ],
    },
    {
      id: "departure-kano-nemo", kind: "dialogue", scene: 2, title: "첫 항로", nextId: "pilot-complete-message",
      lines: [
        line("s2-kn-support", "pale", "페일", "다녀와. 이상한 걸 찾으면 내 몫도 남겨 둬.", "review-pale-smile", pale, "stage"),
        line("s2-kn-kano", "kano", "카노", "시간을 되돌리는 일은 금지합니다.", "review-kano-smirk", kano, "stage"),
        line("s2-kn-nemo", "nemo", "네모 / 바치칼", "동의한다. 불필요한 기술명 외침도 금지하지.", "review-bacikal-standing", bacikal, "stage"),
        line("s2-kn-kano-retort", "kano", "카노", "그건 전술 신호예요!", "review-kano-upset", kano, "stage"),
      ],
    },
    {
      id: "pilot-complete-message", kind: "dialogue", scene: 2, title: "첫 항로", nextId: "pilot-complete",
      lines: [
        line("s2-complete-1", "system", "기록", "제1장 파일럿 구간 완료 — 첫 항로 진입 준비.", null, null, "none"),
        line("s2-complete-2", "system", "기록", "동료 조합을 바꾸어 다시 출발하면, 보지 못한 대화와 단서가 열립니다.", null, null, "none"),
      ],
    },
    { id: "pilot-complete", kind: "complete", scene: 2, title: "임시 항해사의 첫 편성" },
  ],
};
