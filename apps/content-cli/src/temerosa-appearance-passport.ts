export const TEMEROSA_SOURCE_ENVELOPES = {
  overture: { worldline: "canonical", era: "overture", label: "서곡 · 기원 시대" },
  root2: { worldline: "root2-alternate", era: "root2", label: "루트2 · 평행세계" },
  bestiaization: { worldline: "canonical", era: "bestiaization", label: "테메로사 400년 체제" },
  finale: { worldline: "canonical", era: "finale-container", label: "Finale 수록 · 실제 시점 재확인 필요" },
} as const;

export type TemerosaSourceId = keyof typeof TEMEROSA_SOURCE_ENVELOPES;
export type PassportInput = {
  source: TemerosaSourceId;
  characterId: string;
  expression: string;
  path: string;
  width: number;
  height: number;
};

export type AppearancePassport = {
  sourceEnvelope: { worldline: string; era: string; label: string };
  appearanceSet: string;
  form: string;
  wardrobe: string;
  visualCluster: string;
  sceneUse: "owner-approved" | "review-required" | "blocked";
  evidence: string;
};

const SOURCE_CHARACTER_SETS: Record<string, { appearanceSet: string; form: string; wardrobe: string }> = {
  "pale:overture": { appearanceSet: "pale/overture/origin-voyage", form: "first-bestia", wardrobe: "overture-voyage" },
  "pale:root2": { appearanceSet: "pale/root2/mayor", form: "root2-civilian", wardrobe: "root2-mayor" },
  "pale:finale": { appearanceSet: "pale/finale/current", form: "reborn-bestia", wardrobe: "finale-white-regalia" },
  "kano:overture": { appearanceSet: "kano/overture/ice-goddess", form: "ice-goddess", wardrobe: "overture-ice" },
  "kano:root2": { appearanceSet: "kano/root2/purification-chief", form: "root2-civilian", wardrobe: "root2-team" },
  "kano:finale": { appearanceSet: "kano/finale/current", form: "current-bestia", wardrobe: "finale-ice" },
  "alger:bestiaization": { appearanceSet: "alger/bestiaization/executive", form: "pequod-executive", wardrobe: "executive" },
  "alger:finale": { appearanceSet: "alger/finale/current", form: "post-collapse", wardrobe: "finale-current" },
  "wares:root2": { appearanceSet: "wares/root2/observer", form: "margin-observer", wardrobe: "root2" },
  "wares:finale": { appearanceSet: "wares/finale/margin", form: "margin-observer", wardrobe: "finale-margin" },
  "nemo:bestiaization": { appearanceSet: "nemo/bestiaization/magical-girl", form: "nemo", wardrobe: "magical-girl" },
  "nemo:finale": { appearanceSet: "nemo/finale/record", form: "nemo-record", wardrobe: "record-unverified" },
  "bacikal:bestiaization": { appearanceSet: "bacikal/bestiaization/bacikal", form: "bacikal", wardrobe: "bestiaization-combat" },
  "bacikal:finale": { appearanceSet: "bacikal/finale/current", form: "bacikal", wardrobe: "finale-current" },
  "lyla:overture": { appearanceSet: "lyla/overture/founder", form: "lyla", wardrobe: "overture" },
  "lyla:root2": { appearanceSet: "lyla/root2/alternate", form: "lyla", wardrobe: "root2" },
  "lyla:bestiaization": { appearanceSet: "lyla/bestiaization/ruler", form: "temerosa-ruler", wardrobe: "black-queen" },
  "riel:bestiaization": { appearanceSet: "riel/bestiaization/record", form: "riel", wardrobe: "bestiaization" },
};

export function classifyTemerosaAppearance(input: PassportInput): AppearancePassport {
  const sourceEnvelope = TEMEROSA_SOURCE_ENVELOPES[input.source];
  if (input.characterId === "nieun") return classifyNieun(input, sourceEnvelope);
  const known = SOURCE_CHARACTER_SETS[`${input.characterId}:${input.source}`];
  if (known) {
    return {
      sourceEnvelope,
      ...known,
      visualCluster: portraitCluster(input),
      sceneUse: "review-required",
      evidence: "source-card-and-character-envelope; wardrobe still requires human visual approval",
    };
  }
  return {
    sourceEnvelope,
    appearanceSet: `${input.characterId}/${input.source}/unverified`,
    form: "unverified",
    wardrobe: "unverified",
    visualCluster: portraitCluster(input),
    sceneUse: "blocked",
    evidence: "source container only; actual depicted era and wardrobe are not established",
  };
}

function classifyNieun(input: PassportInput, sourceEnvelope: AppearancePassport["sourceEnvelope"]): AppearancePassport {
  if (input.source === "bestiaization") {
    const pluto = input.expression.startsWith("pluto-");
    return {
      sourceEnvelope,
      appearanceSet: pluto ? "nieun/bestiaization/pluto" : "nieun/bestiaization/information-broker",
      form: pluto ? "pluto" : "nieun",
      wardrobe: pluto ? "black-pluto-uniform" : "black-information-broker",
      visualCluster: portraitCluster(input),
      sceneUse: "review-required",
      evidence: pluto ? "explicit pluto expression prefix" : "Bestiaization non-Pluto Nieun asset",
    };
  }
  if (input.source === "root2") {
    return {
      sourceEnvelope,
      appearanceSet: "nieun/root2/purification-team",
      form: "root2-nieun",
      wardrobe: "white-shirt-harness-and-waist-knit",
      visualCluster: portraitCluster(input),
      sceneUse: "review-required",
      evidence: "Root2 alternate-world Nieun asset set",
    };
  }
  if (input.source === "finale") {
    const squareCloseup = Math.abs(input.width - input.height) / Math.max(input.width, input.height) < 0.08;
    return {
      sourceEnvelope: { worldline: "canonical", era: "six-years-post-collapse", label: "Finale 현재 · 붕괴 6년 후" },
      appearanceSet: "nieun/finale/event-horizon-magical-girl",
      form: "event-horizon-magical-girl",
      wardrobe: "black-wedding-dress-white-frill-yellow-rings",
      visualCluster: squareCloseup ? "square-closeup-style-drift" : "vertical-black-regalia",
      sceneUse: squareCloseup ? "blocked" : "review-required",
      evidence: squareCloseup
        ? "Finale asset but square close-up obscures or drifts from the canonical black-regalia silhouette"
        : "Finale lore fixes current Nieun in the magical-girl outfit; vertical asset visibly retains the black regalia",
    };
  }
  return {
    sourceEnvelope,
    appearanceSet: "nieun/overture/unverified",
    form: "unverified",
    wardrobe: "unverified",
    visualCluster: portraitCluster(input),
    sceneUse: "blocked",
    evidence: "Nieun appearance is not established for this source envelope",
  };
}

function portraitCluster(input: Pick<PassportInput, "width" | "height">): string {
  const ratio = input.width / input.height;
  if (ratio > 0.92 && ratio < 1.08) return "square-closeup";
  if (ratio < 0.66) return "vertical-full-figure";
  return "vertical-medium";
}
