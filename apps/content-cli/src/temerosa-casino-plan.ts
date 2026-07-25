export const TEMEROSA_CASINO_SOURCE_CARDS = {
  overture: "overture-root2",
  root2: "temerosa-root2",
  bestiaization: "temerosa-bestiaization",
  finale: "temerosa-finale",
  nemo: "nemo",
} as const;

export type CasinoSource = keyof typeof TEMEROSA_CASINO_SOURCE_CARDS;
export type SeatRole = "neutral" | "pleased" | "tense" | "despair";

type SeatPaths = Record<SeatRole, string>;
export type CasinoNpcPlan = {
  id: string;
  displayName: string;
  source: "bestiaization" | "nemo";
  appearanceSet: string;
  loreEntry: string;
  importanceEvidence: string;
  seatPaths: SeatPaths;
  extraPaths: readonly string[];
};

const image = (number: number) => `assets/other/image/${number}.jpeg`;

function npc(id: string, displayName: string, loreEntry: string, numbers: readonly [number, number, number, number, number?, number?], importanceEvidence: string): CasinoNpcPlan {
  const [neutral, pleased, tense, despair, blush, surprised] = numbers;
  return {
    id,
    displayName,
    source: "bestiaization",
    appearanceSet: `${id}/bestiaization/current`,
    loreEntry,
    importanceEvidence,
    seatPaths: { neutral: image(neutral), pleased: image(pleased), tense: image(tense), despair: image(despair) },
    extraPaths: [blush, surprised].filter((value): value is number => value !== undefined).map(image),
  };
}

function pngNpc(id: string, displayName: string, loreEntry: string, numbers: readonly [number, number, number, number, number?, number?], importanceEvidence: string): CasinoNpcPlan {
  const plan = npc(id, displayName, loreEntry, numbers, importanceEvidence);
  return {
    ...plan,
    seatPaths: Object.fromEntries(Object.entries(plan.seatPaths).map(([role, path]) => [role, path.replace(/\.jpeg$/, ".png")])) as SeatPaths,
    extraPaths: plan.extraPaths.map((path) => path.replace(/\.jpeg$/, ".png")),
  };
}

// Every entry below has a dedicated character description in the Bestiaization
// source card and a visually reviewed expression set. Exact source wording is
// retained through loreEntry/importanceEvidence rather than inferred from names.
export const TEMEROSA_CASINO_NPCS: readonly CasinoNpcPlan[] = [
  pngNpc("alger", "Alger", "알제", [320, 316, 315, 314, 317, 318], "Pequod telekinetic executive; dedicated lore entry and recurring Finale cast member."),
  pngNpc("lyla", "Lyla", "라일라", [297, 292, 296, 293, 294, 295], "Ruler of Temerosa and central historical actor; dedicated government lore entry."),
  pngNpc("nieun", "Nieun", "니은", [347, 342, 343, 344, 346, 345], "Named major independent Bestiant tied to the Pluto incident; dedicated lore entry."),
  npc("yul", "Yul", "율", [86, 88, 85, 83, 87, 84], "Named special hunter with a dedicated biography and six-expression source set."),
  npc("cicero", "Cicero", "키케로", [93, 90, 89, 92, 91, 94], "Named regular hunter with a dedicated biography and six-expression source set."),
  npc("phaeo", "Phaeo", "폐어", [95, 100, 99, 98, 96, 97], "Named special hunter with a dedicated biography and six-expression source set."),
  npc("traver", "Traver", "트레버", [101, 102, 105, 104, 103, 106], "Named regular hunter; source typo `sas` is visually reviewed as the sad/despair portrait."),
  npc("kreva", "Kreva", "크레바", [112, 110, 111, 109, 108, 107], "Named special hunter with a dedicated biography and six-expression source set."),
  npc("camille", "Camille", "카미유", [114, 113, 115, 117], "Named regular hunter with a dedicated biography and four reviewed seat portraits."),
  npc("bche", "Bche", "브체", [124, 119, 121, 120, 122, 123], "Named regular hunter with a dedicated biography and six-expression source set."),
  npc("deokbae", "Kim Deokbae", "김덕배", [130, 125, 126, 127, 128, 129], "Named veteran special hunter with a dedicated biography and six-expression source set."),
  npc("machina", "Machina", "마키나", [131, 132, 134, 135, 136, 133], "Named augmented special hunter with a dedicated biography and six-expression source set."),
  npc("katrinka", "Katrinka", "카트린카", [137, 142, 138, 140, 141, 139], "Named regular hunter with a dedicated biography and six-expression source set."),
  npc("ttaengchil", "Ttaengchil-i", "땡칠이", [143, 144, 148, 146, 147, 145], "Named regular hunter with a dedicated biography and six-expression source set."),
  npc("tumit-tu", "Tumit-Tu", "튜밋튜", [153, 156, 151, 150, 152, 155], "Named regular hunter with a dedicated biography and six-expression source set."),
  npc("temute", "Temute", "테뮤테", [157, 159, 161, 158, 160, 162], "Named special hunter with a dedicated biography and six-expression source set."),
  npc("hiro", "Hiro Kaneda", "히로", [163, 164, 165, 166, 168, 167], "Cetus elite hunter called Red Ranger in the NPC list; dedicated lore entry."),
  npc("levillotte", "Levillotte", "레빌로트", [171, 172, 174, 175, 176, 173], "Cetus elite hunter called Rabbit's Foot Collector; dedicated lore entry."),
  npc("adesha", "Adesha", "아데샤", [177, 180, 178, 179, 182, 181], "Cetus elite hunter called the Second Coming of Pluto; dedicated lore entry."),
  npc("diamo", "Diamo", "디아모", [185, 186, 188, 190, 187, 189], "Cetus elite hunter called Dreamy Memories; dedicated lore entry."),
  npc("morsisa", "Morsisa", "모르시사", [191, 195, 192, 196, 193, 194], "Cetus elite hunter called Fighting Dog; dedicated lore entry and reviewed expression set."),
  npc("echo", "Echo", "에코", [197, 200, 199, 202, 201, 198], "Cetus elite hunter with a dedicated biography and reviewed expression set."),
  npc("nostalgia", "Nostalgia", "노스탤지아", [226, 227, 229, 228, 231, 230], "Named Geometry leader/supervisor with dedicated lore entries across source cards."),
  npc("apollyon", "Apollyon Aite", "아폴리온", [237, 233, 232, 235, 236, 234], "Named 1004 Bestia, Cursed Surname; dedicated lore entry and reviewed expression set."),
  npc("esther", "Esther", "에스더", [243, 245, 247, 244, 248, 246], "Named Geometry character with a dedicated biography and reviewed expression set."),
  npc("anna", "Anna Nazareth", "안나 나자레아", [249, 251, 253, 250, 254, 252], "Named Pentagon/Geometry character with a dedicated biography and reviewed expression set."),
  npc("cradle", "Cradle", "크레이들", [261, 262, 263, 266, 265, 264], "Named Pequod-aligned character with a dedicated biography and reviewed expression set."),
  npc("lilim", "Lilim", "릴림", [267, 268, 271, 269, 272, 270], "Named 1004 Bestia, Virgin Mother; dedicated lore entry and reviewed expression set."),
  npc("raven", "Raven", "레이븐", [385, 380, 381, 384, 382, 383], "Named Pequod bartender with a dedicated biography and reviewed expression set."),
  {
    id: "nemo",
    displayName: "Nemo",
    source: "nemo",
    appearanceSet: "nemo/magical-girl/current",
    loreEntry: "Nemo card Basic Information",
    importanceEvidence: "Standalone canonical card protagonist; former magical girl and central Bestia hunter.",
    seatPaths: {
      neutral: "assets/other/image/73.png",
      pleased: "assets/other/image/71.png",
      tense: "assets/other/image/64.png",
      despair: "assets/other/image/144.png",
    },
    extraPaths: [],
  },
] as const;

export const NEMO_APPROVED_PATHS = new Set(Object.values(TEMEROSA_CASINO_NPCS.find((item) => item.id === "nemo")!.seatPaths));
export const SEAT_ROLES: readonly SeatRole[] = ["neutral", "pleased", "tense", "despair"];
export const TEMEROSA_CASINO_MIN_CARD_FACES = 160;

export type CasinoCardOnlyPlan = {
  id: string;
  displayName: string;
  loreEntry: string;
  importanceEvidence: string;
  appearanceSet: string;
  faces: readonly { path: string; expression: string }[];
};

const faces = (values: readonly [number, string][]) => values.map(([number, expression]) => ({ path: image(number), expression }));

// Lore-backed, visually reviewed card faces which are deliberately not in the
// selectable seat roster. They provide exact-unique inventory after byte dedupe.
export const TEMEROSA_CASINO_CARD_ONLY: readonly CasinoCardOnlyPlan[] = [
  { id: "spiril", displayName: "Spiril", loreEntry: "스피릴", importanceEvidence: "Named independent Bestiant and NLF figure with a dedicated biography.", appearanceSet: "spiril/bestiaization/current", faces: faces([[397, "neutral"], [396, "pleased"], [394, "tense"], [395, "despair"], [392, "blush"], [393, "surprised"]]) },
  { id: "snow-rim", displayName: "Snow Rim", loreEntry: "설림", importanceEvidence: "Named Geometry character Taowu with a dedicated biography.", appearanceSet: "snow-rim/bestiaization/current", faces: faces([[208, "neutral"], [212, "pleased"], [213, "tense"], [209, "despair"], [211, "blush"], [210, "surprised"]]) },
  { id: "strelka", displayName: "Strelka", loreEntry: "스트렐카", importanceEvidence: "Named Geometry Bestiant with a dedicated biography.", appearanceSet: "strelka/bestiaization/current", faces: faces([[238, "neutral"], [242, "tense"], [239, "despair"], [240, "blush"], [241, "surprised"]]) },
  { id: "sakabus", displayName: "Sakabus", loreEntry: "사카바스", importanceEvidence: "Named Geometry human with a dedicated biography.", appearanceSet: "sakabus/bestiaization/current", faces: faces([[220, "neutral"], [221, "pleased"], [222, "tense"], [224, "despair"], [223, "blush"], [225, "surprised"]]) },
  { id: "flask", displayName: "Flask", loreEntry: "플라스크", importanceEvidence: "Named Pequod scientist with a dedicated biography.", appearanceSet: "flask/bestiaization/current", faces: faces([[205, "neutral"], [416, "pleased"], [204, "tense"], [206, "despair"], [207, "blush"], [417, "surprised"]]) },
] as const;
