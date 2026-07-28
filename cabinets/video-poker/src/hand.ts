import { standardCardById, standardRankValue, type StandardCardId } from "@lucky-arcade/card-table";
import { VIDEO_POKER_ERRORS, type JacksOrBetterCategory, type JacksOrBetterHandValue } from "./contracts.ts";

export const JACKS_OR_BETTER_PAYTABLE: Readonly<Record<Exclude<JacksOrBetterCategory, "low-pair" | "high-card">, number>> = {
  "royal-flush": 250,
  "straight-flush": 50,
  "four-of-a-kind": 25,
  "full-house": 9,
  flush: 6,
  straight: 4,
  "three-of-a-kind": 3,
  "two-pair": 2,
  "jacks-or-better": 1,
};

const LABELS: Readonly<Record<JacksOrBetterCategory, string>> = {
  "royal-flush": "로열 플러시",
  "straight-flush": "스트레이트 플러시",
  "four-of-a-kind": "포카드",
  "full-house": "풀하우스",
  flush: "플러시",
  straight: "스트레이트",
  "three-of-a-kind": "트리플",
  "two-pair": "투 페어",
  "jacks-or-better": "잭스 오어 베터",
  "low-pair": "로우 페어",
  "high-card": "하이 카드",
};

export function evaluateJacksOrBetter(ids: readonly StandardCardId[]): JacksOrBetterHandValue {
  assert(ids.length === 5 && new Set(ids).size === 5, VIDEO_POKER_ERRORS.handInvalid);
  const cards = ids.map(standardCardById);
  const values = cards.map(standardRankValue).sort((left, right) => right - left);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const unique = [...new Set(values)];
  const wheel = unique.length === 5 && unique.join(",") === "14,5,4,3,2";
  const straight = unique.length === 5 && (wheel || (unique[0] ?? 0) - (unique[4] ?? 0) === 4);
  const straightHigh = wheel ? 5 : unique[0] ?? 0;

  if (flush && straight && straightHigh === 14 && unique.includes(10)) return value("royal-flush");
  if (flush && straight) return value("straight-flush");
  if (groups[0]?.[1] === 4) return value("four-of-a-kind");
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) return value("full-house");
  if (flush) return value("flush");
  if (straight) return value("straight");
  if (groups[0]?.[1] === 3) return value("three-of-a-kind");
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) return value("two-pair");
  if (groups[0]?.[1] === 2) return value(groups[0][0] >= 11 ? "jacks-or-better" : "low-pair");
  return value("high-card");
}

function value(category: JacksOrBetterCategory): JacksOrBetterHandValue {
  const payoutMultiplier = category === "low-pair" || category === "high-card" ? 0 : JACKS_OR_BETTER_PAYTABLE[category];
  return { category, label: LABELS[category], payoutMultiplier };
}

function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
