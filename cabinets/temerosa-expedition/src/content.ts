import type { TemerosaExpeditionContentPack } from "./contracts.ts";

export const bundledPack: TemerosaExpeditionContentPack = {
  contract: "temerosa-expedition-content-pack/0.1",
  packId: "temerosa-pequod-expedition",
  version: "0.1.0",
  companions: [
    { id: "pale", name: "페일", role: "bond", grade: 4, maxHp: 1800, maxMp: 1800, power: 1050, mood: 94, description: "관계와 이름의 흔적을 붙잡는 동료.", asset: "pale-combat" },
    { id: "kano", name: "카노", role: "ward", grade: 4, maxHp: 2400, maxMp: 1500, power: 950, mood: 86, description: "위험에 응답하고 현재의 붕괴를 막는 동료.", asset: "kano-combat" },
    { id: "nemo", name: "네모", role: "echo", grade: 4, maxHp: 1600, maxMp: 2200, power: 1200, mood: 88, description: "되돌림 대신 두 실패를 기억하며 현재에 남은 동료.", asset: "nemo-magical-neutral" },
  ],
  boss: { id: "trainhead", name: "트레인헤드", role: "boss", grade: 6, maxHp: 2600, maxMp: 2200, power: 1200, mood: 80, description: "끝나지 않은 구조 명령과 도착하지 못한 기다림이 기관차가 된 베스티아.", asset: "trainhead" },
  missions: [
    { id: "pequod-edge", name: "피쿼드 외곽", enemy: "토끼벌", factions: ["베스티아"], power: 620, description: "무너진 피쿼드 외곽의 회수로를 연다.", rewards: { supplies: 1 } },
    { id: "collapsed-platform", name: "붕괴한 승강장", enemy: "눈눈늑대", factions: ["베스티아"], power: 700, description: "끊긴 승강장의 구조 신호를 따라간다.", rewards: { supplies: 1 } },
    { id: "past-metro", name: "과거 메트로", enemy: "신경나무", factions: ["베스티아"], power: 780, description: "현재 폐허에 겹쳐진 과거 메트로를 지난다.", rewards: { record: 1 } },
    { id: "riel-office", name: "리엘의 사무실", enemy: "과거 회귀 충돌", factions: ["기록"], power: 860, description: "Bestiaization 시대의 반복 기록을 통과한다.", rewards: { record: 1 } },
    { id: "passenger-record", name: "승객 기록", enemy: "눈눈늑대", factions: ["베스티아"], power: 930, description: "도착하지 못한 승객의 명부를 회수한다.", rewards: { supplies: 2 } },
    { id: "white-rift", name: "흰 균열", enemy: "신경나무", factions: ["베스티아"], power: 1020, description: "여백으로 이어지는 흰 균열 앞을 확보한다.", rewards: { record: 1 } },
    { id: "trainhead", name: "도착하지 못한 열차", enemy: "트레인헤드", factions: ["베스티아"], power: 1120, description: "집·살다·기다리다의 기록으로 마지막 목적지 규칙을 푼다.", boss: "trainhead", rewards: { record: 1 } },
  ],
  records: [
    { id: "home", name: "집의 기록", description: "승객 기록에서 되찾은 목적지의 말." },
    { id: "live", name: "살다의 기록", description: "끝나지 않은 구조 명령에 남은 말." },
    { id: "wait", name: "기다리다의 기록", description: "도착하지 못한 기다림에 남은 말." },
  ],
  salvage: [
    { id: "passenger-list", name: "승객 명부", power: 120, description: "목적지 규칙을 복원하는 기록." },
    { id: "rescue-signal", name: "구조 신호", power: 120, description: "끊긴 항로에 남은 응답 기록." },
    { id: "black-compass", name: "검은 나침반", power: 150, description: "목적지 문양이 응축된 항로 기록." },
  ],
  assets: {},
};
