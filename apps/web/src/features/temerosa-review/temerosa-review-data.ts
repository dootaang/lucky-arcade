export type ReviewStatus = "unreviewed" | "approved" | "hold";

export interface ReviewCandidate {
  assetId: string;
  label: string;
  reading: string;
}

export interface ReviewBeat {
  id: string;
  kind: "appearance" | "expression";
  scene: string;
  characterId: "nieun" | "alger" | "pale" | "kano" | "bacikal";
  characterName: string;
  appearanceSet: string;
  line: string;
  context: string;
  observation: string;
  frame: "communication" | "stage";
  candidates: readonly ReviewCandidate[];
}

export interface ReviewChoice {
  selectedAssetId: string;
  status: ReviewStatus;
}

interface ManifestVariant { size: "sm" | "md" | "lg"; path: string; width: number; height: number; }
interface ManifestAsset { id: string; characterId?: string; expression?: string; appearanceSet?: string; variants: ManifestVariant[]; }
export interface ReviewManifest { version: string; assets: ManifestAsset[]; }

export const TEMEROSA_REVIEW_VERSION = "0.3.0";
export const TEMEROSA_REVIEW_STORAGE_KEY = `temerosa-expression-review/${TEMEROSA_REVIEW_VERSION}`;
export const TEMEROSA_PREVIOUS_REVIEW_STORAGE_KEY = "temerosa-expression-review/0.2.0";

export const reviewBeats: readonly ReviewBeat[] = [
  {
    id: "nieun-appearance-anchor", kind: "appearance", scene: "외형 기준 · 시대 확인", characterId: "nieun", characterName: "박니은",
    appearanceSet: "nieun/finale/event-horizon-magical-girl", frame: "communication",
    line: "현재 장면의 니은은 ‘붕괴 6년 후, 사상 지평을 유지하는 마법소녀’입니다.",
    context: "카드에 들어 있는 서로 다른 시대의 니은을 나란히 비교합니다. 첫 번째 후보가 현재 정사 외형입니다.",
    observation: "흰 프릴 상의만 보지 말고 검은 웨딩드레스·검은 장갑·노란 고리까지 한 벌로 확인하세요.",
    candidates: [
      { assetId: "passport-nieun-finale-current", label: "Finale 현재 · 권장", reading: "붕괴 6년 후 · 사상 지평 마법소녀 · 검은 예복" },
      { assetId: "passport-nieun-bestiaization-information-broker", label: "Bestiaization 과거", reading: "테메로사 체제 말기 · 정보상 니은 · 검은 제복" },
      { assetId: "passport-nieun-bestiaization-pluto", label: "Bestiaization 플루토", reading: "과거의 전투 역할 · 검은 플루토 형태" },
      { assetId: "passport-nieun-root2-purification-team", label: "루트2 평행세계", reading: "정화팀 · 흰 셔츠와 허리 니트" },
    ],
  },
  {
    id: "nieun-first-contact", kind: "expression", scene: "장면 0 · 죽은 단말기", characterId: "nieun", characterName: "박니은",
    appearanceSet: "nieun/finale/event-horizon-magical-girl", frame: "communication",
    line: "누구야. 아니, 잠깐. 그 단말기에서 손부터 떼지 마.",
    context: "134년 전에 끝난 플루토 긴급선이 현재의 생존자에게 응답한 첫 순간입니다.",
    observation: "통신 영상보다 노란 경고선이 먼저 안정됩니다.",
    candidates: [
      { assetId: "passport-nieun-finale-current", label: "냉정", reading: "놀람보다 먼저 상황을 판단" },
      { assetId: "review-nieun-current-angry", label: "통제", reading: "감정을 지우고 즉시 지시" },
      { assetId: "review-nieun-current-upset", label: "불쾌한 동요", reading: "과거 신호가 되살아난 불편함" },
      { assetId: "review-nieun-current-combat", label: "비상 대응", reading: "신호를 즉시 위협으로 판정" },
    ],
  },
  {
    id: "nieun-horizon", kind: "expression", scene: "장면 0 · 움직일 수 없는 니은", characterId: "nieun", characterName: "박니은",
    appearanceSet: "nieun/finale/event-horizon-magical-girl", frame: "communication",
    line: "내가 움직이면 세상 끝도 같이 움직여.",
    context: "니은이 현장에 갈 수 없는 이유를 처음으로 짧게 드러냅니다. 진심일수록 통신 노이즈가 줄어듭니다.",
    observation: "말하는 동안 장난스러운 말투와 통신 잡음이 함께 사라집니다.",
    candidates: [
      { assetId: "passport-nieun-finale-current", label: "담담함", reading: "위험을 이미 일상이 된 사실처럼 말함" },
      { assetId: "review-nieun-current-upset-alt", label: "억눌린 불만", reading: "혼자 붙잡고 있는 임무에 대한 불만" },
      { assetId: "review-nieun-current-looking-back", label: "고립", reading: "현재 세계를 등지고 경계를 유지하는 사람" },
      { assetId: "review-nieun-current-smirk-alt", label: "농담 가면", reading: "무게를 웃음으로 한 번 더 감춤" },
    ],
  },
  {
    id: "alger-terminal", kind: "expression", scene: "장면 1 · 마지막 인사부", characterId: "alger", characterName: "알제",
    appearanceSet: "alger/finale/current", frame: "stage",
    line: "그런데 죽은 단말기가 네 손에는 대답했다.",
    context: "게임기에서 눈을 떼지 않던 알제가 처음으로 플레이어의 계약 문양을 직접 봅니다.",
    observation: "시선은 플레이어보다 손의 계약 문양에 오래 머뭅니다.",
    candidates: [
      { assetId: "review-alger-surprised", label: "균열", reading: "죽은 계약의 응답에 평정이 잠시 깨짐" },
    ],
  },
  {
    id: "pale-familiar", kind: "expression", scene: "장면 2 · 함께 갈 두 사람", characterId: "pale", characterName: "페일",
    appearanceSet: "pale/finale/current", frame: "stage",
    line: "아는 사람 같다는 뜻은 아니야. 아는 기분 같다는 뜻이지.",
    context: "페일은 익숙함을 느끼지만 현재 플레이어와의 관계를 과거에서 빌려오지 않습니다.",
    observation: "플레이어에게 다가오다가 스스로 한 걸음 멈춥니다.",
    candidates: [
      { assetId: "review-pale-smile", label: "호기심", reading: "익숙함을 반갑고 신기하게 받아들임" },
    ],
  },
  {
    id: "kano-supervisor", kind: "expression", scene: "장면 2 · 함께 갈 두 사람", characterId: "kano", characterName: "카노",
    appearanceSet: "kano/finale/current", frame: "stage",
    line: "좋아요. 제가 감독하죠. 과거를 함부로 열면 현재 쪽을 닫아 버릴 수도 있으니까.",
    context: "카노는 임시 항해사의 직함을 의심하면서도 항로 오염을 막기 위해 동행합니다.",
    observation: "서리가 출구 방향부터 막고 플레이어 쪽에서는 멈춥니다.",
    candidates: [
      { assetId: "review-kano-smirk", label: "허세", reading: "감독 역할에 자신 있는 척함" },
    ],
  },
  {
    id: "bacikal-warning", kind: "expression", scene: "장면 2 · 함께 갈 두 사람", characterId: "bacikal", characterName: "네모 / 바치칼",
    appearanceSet: "bacikal/finale/current", frame: "stage",
    line: "돌아갈 수 있다는 이유로 먼저 죽을 생각은 하지 마라.",
    context: "회귀를 경험한 네모가 항해사의 자기희생을 단호하게 금지합니다.",
    observation: "플레이어의 계약 문양을 본 뒤 창끝을 아래로 내립니다.",
    candidates: [
      { assetId: "review-bacikal-angry", label: "단호함", reading: "죽음을 전술로 쓰는 판단을 거부" },
    ],
  },
] as const;

let manifestPromise: Promise<ReviewManifest> | null = null;

export function loadTemerosaReviewManifest(): Promise<ReviewManifest> {
  manifestPromise ??= fetch(`/content/temerosa-margin/${TEMEROSA_REVIEW_VERSION}/manifest.json`).then(async (response) => {
    if (!response.ok) throw new Error("temerosa_review_manifest_missing");
    const manifest = await response.json() as ReviewManifest;
    validateReviewManifest(manifest);
    return manifest;
  });
  return manifestPromise;
}

export function validateReviewManifest(manifest: ReviewManifest): void {
  for (const beat of reviewBeats) {
    for (const candidate of beat.candidates) {
      const asset = manifest.assets.find((item) => item.id === candidate.assetId);
      if (!asset) throw new Error(`temerosa_review_asset_missing:${candidate.assetId}`);
      if (beat.kind === "expression" && asset.appearanceSet !== beat.appearanceSet) {
        throw new Error(`temerosa_review_appearance_mismatch:${beat.id}:${candidate.assetId}`);
      }
    }
  }
}

export function reviewAssetUrl(manifest: ReviewManifest, assetId: string): string {
  const asset = manifest.assets.find((candidate) => candidate.id === assetId);
  const variant = asset?.variants.find((candidate) => candidate.size === "md") ?? asset?.variants[0];
  if (!variant) throw new Error(`temerosa_review_asset_missing:${assetId}`);
  return `/content/temerosa-margin/${manifest.version}/${variant.path}`;
}

export function initialReviewChoices(): Record<string, ReviewChoice> {
  const ownerApproved = new Set(["alger-terminal", "pale-familiar", "kano-supervisor", "bacikal-warning"]);
  return Object.fromEntries(reviewBeats.map((beat) => [beat.id, {
    selectedAssetId: beat.candidates[0]!.assetId,
    status: ownerApproved.has(beat.id) ? "approved" as const : "unreviewed" as const,
  }]));
}

export function sanitizeReviewChoices(value: unknown): Record<string, ReviewChoice> {
  const defaults = initialReviewChoices();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const input = value as Record<string, unknown>;
  for (const beat of reviewBeats) {
    const candidate = input[beat.id];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const selectedAssetId = (candidate as Record<string, unknown>).selectedAssetId;
    const status = (candidate as Record<string, unknown>).status;
    if (typeof selectedAssetId !== "string" || !beat.candidates.some((item) => item.assetId === selectedAssetId)) continue;
    if (status !== "unreviewed" && status !== "approved" && status !== "hold") continue;
    defaults[beat.id] = { selectedAssetId, status };
  }
  return defaults;
}

export function reviewExport(choices: Record<string, ReviewChoice>): string {
  return JSON.stringify({ contract: "temerosa-expression-review/0.1", version: TEMEROSA_REVIEW_VERSION, results: reviewBeats.map((beat) => ({ beatId: beat.id, ...choices[beat.id] })) }, null, 2);
}
