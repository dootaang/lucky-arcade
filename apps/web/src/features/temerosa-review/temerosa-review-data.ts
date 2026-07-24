export type ReviewStatus = "unreviewed" | "approved" | "hold";

export interface ReviewCandidate {
  assetId: string;
  label: string;
  reading: string;
}

export interface ReviewBeat {
  id: string;
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
interface ManifestAsset { id: string; characterId?: string; expression?: string; variants: ManifestVariant[]; }
interface ReviewManifest { version: string; assets: ManifestAsset[]; }

export const TEMEROSA_REVIEW_VERSION = "0.2.0";
export const TEMEROSA_REVIEW_STORAGE_KEY = `temerosa-expression-review/${TEMEROSA_REVIEW_VERSION}`;

export const reviewBeats: readonly ReviewBeat[] = [
  {
    id: "nieun-first-contact", scene: "장면 0 · 죽은 단말기", characterId: "nieun", characterName: "박니은",
    appearanceSet: "nieun/finale-remote", frame: "communication",
    line: "누구야. 아니, 잠깐. 그 단말기에서 손부터 떼지 마.",
    context: "134년 전에 끝난 플루토 긴급선이 현재의 생존자에게 응답한 첫 순간입니다.",
    observation: "통신 영상보다 노란 경고선이 먼저 안정됩니다.",
    candidates: [
      { assetId: "review-nieun-surprised", label: "놀람", reading: "예상 밖 신호를 마주한 첫 반응" },
      { assetId: "review-nieun-angry", label: "통제", reading: "놀람을 감추고 즉시 상황을 통제" },
      { assetId: "review-nieun-upset", label: "동요", reading: "과거 신호가 돌아온 불편함" },
    ],
  },
  {
    id: "nieun-horizon", scene: "장면 0 · 움직일 수 없는 니은", characterId: "nieun", characterName: "박니은",
    appearanceSet: "nieun/finale-remote", frame: "communication",
    line: "내가 움직이면 세상 끝도 같이 움직여.",
    context: "니은이 현장에 갈 수 없는 이유를 처음으로 짧게 드러냅니다. 진심일수록 통신 노이즈가 줄어듭니다.",
    observation: "말하는 동안 장난스러운 말투와 통신 잡음이 함께 사라집니다.",
    candidates: [
      { assetId: "review-nieun-standing", label: "담담함", reading: "위험을 일상처럼 말함" },
      { assetId: "review-nieun-sad", label: "고립", reading: "혼자 붙잡고 있는 무게가 드러남" },
      { assetId: "review-nieun-disappointed", label: "피로", reading: "오랫동안 반복된 임무의 피로" },
    ],
  },
  {
    id: "alger-terminal", scene: "장면 1 · 마지막 인사부", characterId: "alger", characterName: "알제",
    appearanceSet: "alger/finale-current", frame: "stage",
    line: "그런데 죽은 단말기가 네 손에는 대답했다.",
    context: "게임기에서 눈을 떼지 않던 알제가 처음으로 플레이어의 계약 문양을 직접 봅니다.",
    observation: "시선은 플레이어보다 손의 계약 문양에 오래 머뭅니다.",
    candidates: [
      { assetId: "review-alger-standing", label: "업무적 관찰", reading: "감정을 숨기고 사실만 확인" },
      { assetId: "review-alger-surprised", label: "균열", reading: "죽은 계약의 응답에 평정이 잠시 깨짐" },
      { assetId: "review-alger-disappointed", label: "과거의 피로", reading: "플루토와 자기 명령이 다시 열린다는 부담" },
      { assetId: "review-alger-upset", label: "불편함", reading: "책임질 사건이 돌아왔음을 직감" },
    ],
  },
  {
    id: "pale-familiar", scene: "장면 2 · 함께 갈 두 사람", characterId: "pale", characterName: "페일",
    appearanceSet: "pale/finale-current", frame: "stage",
    line: "아는 사람 같다는 뜻은 아니야. 아는 기분 같다는 뜻이지.",
    context: "페일은 익숙함을 느끼지만 현재 플레이어와의 관계를 과거에서 빌려오지 않습니다.",
    observation: "플레이어에게 다가오다가 스스로 한 걸음 멈춥니다.",
    candidates: [
      { assetId: "review-pale-smile", label: "호기심", reading: "익숙함을 반갑고 신기하게 받아들임" },
      { assetId: "review-pale-surprised", label: "기억의 자극", reading: "예상하지 못한 감각에 순간 멈춤" },
      { assetId: "review-pale-disappointed", label: "거리 두기", reading: "아는 사람이라고 단정하지 않으려 함" },
      { assetId: "review-pale-upset", label: "불안", reading: "기원의 기억이 현재를 침범할까 경계" },
    ],
  },
  {
    id: "kano-supervisor", scene: "장면 2 · 함께 갈 두 사람", characterId: "kano", characterName: "카노",
    appearanceSet: "kano/finale-current", frame: "stage",
    line: "좋아요. 제가 감독하죠. 과거를 함부로 열면 현재 쪽을 닫아 버릴 수도 있으니까.",
    context: "카노는 임시 항해사의 직함을 의심하면서도 항로 오염을 막기 위해 동행합니다.",
    observation: "서리가 출구 방향부터 막고 플레이어 쪽에서는 멈춥니다.",
    candidates: [
      { assetId: "review-kano-standing", label: "감독자", reading: "감정을 감춘 채 규칙부터 제시" },
      { assetId: "review-kano-smirk", label: "허세", reading: "감독 역할에 자신 있는 척함" },
      { assetId: "review-kano-angry", label: "경계", reading: "위험을 가볍게 보는 태도를 거부" },
      { assetId: "review-kano-upset", label: "숨은 불안", reading: "현재까지 닫힐 수 있다는 공포" },
    ],
  },
  {
    id: "bacikal-warning", scene: "장면 2 · 함께 갈 두 사람", characterId: "bacikal", characterName: "네모 / 바치칼",
    appearanceSet: "bacikal/finale-current", frame: "stage",
    line: "돌아갈 수 있다는 이유로 먼저 죽을 생각은 하지 마라.",
    context: "회귀를 경험한 네모가 항해사의 자기희생을 단호하게 금지합니다.",
    observation: "플레이어의 계약 문양을 본 뒤 창끝을 아래로 내립니다.",
    candidates: [
      { assetId: "review-bacikal-standing", label: "효율 가면", reading: "감정을 지우고 규칙처럼 경고" },
      { assetId: "review-bacikal-angry", label: "단호함", reading: "죽음을 전술로 쓰는 판단을 거부" },
      { assetId: "review-bacikal-sad", label: "시간 피로", reading: "자신이 되돌린 실패를 떠올림" },
      { assetId: "review-bacikal-upset", label: "동요", reading: "같은 실수를 반복할까 경계" },
    ],
  },
] as const;

let manifestPromise: Promise<ReviewManifest> | null = null;

export function loadTemerosaReviewManifest(): Promise<ReviewManifest> {
  manifestPromise ??= fetch(`/content/temerosa-margin/${TEMEROSA_REVIEW_VERSION}/manifest.json`).then(async (response) => {
    if (!response.ok) throw new Error("temerosa_review_manifest_missing");
    return await response.json() as ReviewManifest;
  });
  return manifestPromise;
}

export function reviewAssetUrl(manifest: ReviewManifest, assetId: string): string {
  const asset = manifest.assets.find((candidate) => candidate.id === assetId);
  const variant = asset?.variants.find((candidate) => candidate.size === "md") ?? asset?.variants[0];
  if (!variant) throw new Error(`temerosa_review_asset_missing:${assetId}`);
  return `/content/temerosa-margin/${manifest.version}/${variant.path}`;
}

export function initialReviewChoices(): Record<string, ReviewChoice> {
  return Object.fromEntries(reviewBeats.map((beat) => [beat.id, { selectedAssetId: beat.candidates[0]!.assetId, status: "unreviewed" as const }]));
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
