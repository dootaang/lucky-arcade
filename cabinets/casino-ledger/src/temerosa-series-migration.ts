export type TemerosaSeriesNpcId = `temerosa:${"overture" | "root2" | "bestiaization" | "finale" | "guest"}:${string}`;

/**
 * A legacy balance may continue as exactly one series-scoped account. Never
 * copy a balance to every incarnation of the same person: that would mint
 * points and rewrite the history users already saw.
 *
 * These targets follow the portraits and characterization used by the legacy
 * casino roster. Nemo remains the separately licensed magical-girl guest and
 * is deliberately outside the four-series census.
 */
export const TEMEROSA_LEGACY_NPC_SUCCESSORS: Readonly<Record<string, TemerosaSeriesNpcId>> = Object.freeze({
  katrinka: "temerosa:bestiaization:katrinka",
  raven: "temerosa:bestiaization:raven",
  lyla: "temerosa:bestiaization:lyla",
  alger: "temerosa:finale:alger",
  kreva: "temerosa:bestiaization:kreva",
  phaeo: "temerosa:bestiaization:phaeo",
  machina: "temerosa:bestiaization:machina",
  kano: "temerosa:finale:kano",
  cicero: "temerosa:bestiaization:cicero",
  esther: "temerosa:bestiaization:esther",
  nostalgia: "temerosa:bestiaization:nostalgia",
  pale: "temerosa:finale:pale",
  apollyon: "temerosa:bestiaization:apollyon",
  hiro: "temerosa:bestiaization:hiro",
  cradle: "temerosa:bestiaization:cradle",
  nieun: "temerosa:finale:nieun",
  temute: "temerosa:bestiaization:temute",
  deokbae: "temerosa:bestiaization:deokbae",
  levillotte: "temerosa:bestiaization:levillotte",
  riel: "temerosa:bestiaization:riel",
  traver: "temerosa:bestiaization:traver",
  adesha: "temerosa:bestiaization:adesha",
  // Owner rule: the playable NPC is magical-girl Nemo. The retired Bacikal
  // bankroll is folded into that one account instead of creating a second
  // active Nemo identity or destroying previously visible points.
  bacikal: "temerosa:guest:nemo",
  camille: "temerosa:bestiaization:camille",
  anna: "temerosa:bestiaization:anna",
  echo: "temerosa:bestiaization:echo",
  diamo: "temerosa:bestiaization:diamo",
  yul: "temerosa:bestiaization:yul",
  ttaengchil: "temerosa:bestiaization:ttaengchil",
  nemo: "temerosa:guest:nemo",
  lilim: "temerosa:bestiaization:lilim",
  "tumit-tu": "temerosa:bestiaization:tumit-tu",
  morsisa: "temerosa:bestiaization:morsisa",
  bche: "temerosa:bestiaization:bche",
});

export function successorNpcId(legacyNpcId: string): TemerosaSeriesNpcId | undefined {
  return TEMEROSA_LEGACY_NPC_SUCCESSORS[legacyNpcId];
}
