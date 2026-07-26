import type { MatchPairsFace } from "@lucky-arcade/match-pairs";

export const TEMEROSA_MATCH_PAIRS_PACK_VERSION = "temerosa-match-pairs/0.2" as const;

// Owner-approved static allowlist. Runtime selection may only choose from this
// list; names and character ids are evidence and are never rendered to players.
export const TEMEROSA_MATCH_PAIRS_FACES: readonly MatchPairsFace[] = ([
  ["adesha", "card-adesha-blush"], ["alger", "card-alger-surprised"],
  ["anna", "card-anna-blush"], ["apollyon", "card-apollyon-surprised"],
  ["bche", "card-bche-blush"], ["cicero", "card-cicero-surprised"],
  ["cradle", "card-cradle-blush"], ["deokbae", "card-deokbae-surprised"],
  ["diamo", "card-diamo-blush"], ["echo", "card-echo-surprised"],
  ["esther", "card-esther-blush"], ["flask", "card-flask-neutral"],
  ["hiro", "card-hiro-surprised"], ["kreva", "card-kreva-blush"],
  ["levillotte", "card-levillotte-surprised"], ["lilim", "card-lilim-blush"],
  ["lyla", "card-lyla-surprised"], ["machina", "card-machina-blush"],
  ["morsisa", "card-morsisa-surprised"], ["nostalgia", "card-nostalgia-blush"],
  ["phaeo", "card-phaeo-surprised"], ["raven", "card-raven-blush"],
  ["sakabus", "card-sakabus-neutral"], ["snow-rim", "card-snow-rim-tense"],
] as const satisfies readonly (readonly [string, string])[]).map(([characterId, assetId]) => ({ id: `face-${characterId}`, characterId, assetId }));
