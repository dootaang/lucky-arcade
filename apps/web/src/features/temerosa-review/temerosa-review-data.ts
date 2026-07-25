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

export const TEMEROSA_REVIEW_VERSION = "0.4.0";
export const TEMEROSA_REVIEW_STORAGE_KEY = `temerosa-expression-review/${TEMEROSA_REVIEW_VERSION}`;
export const TEMEROSA_PREVIOUS_REVIEW_STORAGE_KEY = "temerosa-expression-review/0.3.0";

const expressionBeat = (
  id: string,
  scene: string,
  characterId: ReviewBeat["characterId"],
  characterName: string,
  appearanceSet: string,
  line: string,
  context: string,
  observation: string,
  assetId: string,
  label: string,
  reading: string,
): ReviewBeat => ({
  id,
  kind: "expression",
  scene,
  characterId,
  characterName,
  appearanceSet,
  line,
  context,
  observation,
  frame: "stage",
  candidates: [{ assetId, label, reading }],
});

export const reviewBeats: readonly ReviewBeat[] = [
  expressionBeat(
    "alger-arrival-smirk", "장면 1 · 첫 대면", "alger", "알제", "alger/finale/current",
    "방문 접수는 끝났어. 회사도 끝났고. 용건 없으면 화면 가리지 마.",
    "게임기를 보던 알제가 방문자를 건조하게 돌려보내려는 첫 순간입니다.",
    "미소가 호의보다 무심한 빈정거림으로 읽히는지 확인하세요.",
    "review-alger-smirk", "무심한 빈정거림", "화면을 가린 방문자를 귀찮아하는 표정",
  ),
  expressionBeat(
    "alger-standing-authority", "장면 1 · 긴급 권한", "alger", "알제", "alger/finale/current",
    "그 권한 만료됐어. …발신자가 누군지는 서로 말 안 하는 걸로 하고.",
    "니은의 과거를 알아보면서도 더 캐묻지 않는 장면입니다.",
    "놀람이나 미소 없이 행정 사실을 확인하는 현재 복장인지 확인하세요.",
    "review-alger-standing", "건조한 확인", "감정을 드러내지 않고 만료된 권한을 확인",
  ),
  expressionBeat(
    "alger-disappointed-disposal", "장면 1 · 폐기 경고", "alger", "알제", "alger/finale/current",
    "권한이 없으면 네가 폐기 대상이래. 헌터를 시키자니 시험관도 시험장도 죽었고.",
    "플레이어를 살리기 위해 끝난 회사의 규정을 다시 뒤지는 순간입니다.",
    "슬픔보다 피로와 난감함이 먼저 보이는지 확인하세요.",
    "review-alger-disappointed", "피로한 난감함", "사람을 살리려면 죽은 행정을 다시 돌려야 하는 표정",
  ),
  expressionBeat(
    "alger-smile-aptitude", "장면 1 · 적성 확인", "alger", "알제", "alger/finale/current",
    "전력 배선은 맞게 바꿨어. 살아남은 이유가 운만은 아니네.",
    "플레이어의 생존 판단을 처음으로 인정하는 장면입니다.",
    "환한 칭찬보다 짧고 절제된 인정으로 읽히는지 확인하세요.",
    "review-alger-smile", "짧은 인정", "운이 아니라 판단이었다고 인정하는 미소",
  ),
  expressionBeat(
    "kano-standing-supervisor", "장면 2 · 감독 자처", "kano", "카노", "kano/finale/current",
    "임시 항해사? 직함을 너무 쉽게 주는군요.",
    "카노가 플레이어의 직함을 아직 신뢰하지 않는 첫 반응입니다.",
    "현재의 얼음 외형이며 허세 섞인 미소가 나오기 전 중립 상태인지 확인하세요.",
    "review-kano-standing", "경계하는 중립", "직함을 검토하는 감독자의 기본 자세",
  ),
  expressionBeat(
    "kano-angry-departure", "장면 2 · 출항", "kano", "카노", "kano/finale/current",
    "앞으로 튀어나가지 마요.",
    "페일과 함께 출항하며 카노가 위험한 선행을 제지하는 장면입니다.",
    "격노보다 즉각적인 제지와 걱정으로 읽히는지 확인하세요.",
    "review-kano-angry", "즉각 제지", "위험 행동을 먼저 막는 감독자의 반응",
  ),
  expressionBeat(
    "kano-upset-retort", "장면 2 · 출항 농담", "kano", "카노", "kano/finale/current",
    "그게 튀어나간다는 뜻이에요!",
    "페일의 말에 카노의 허세가 짧게 무너지는 장면입니다.",
    "분노보다 당황과 발끈이 섞여 있는지 확인하세요.",
    "review-kano-upset", "허세 붕괴", "동료의 농담에 즉시 발끈하는 표정",
  ),
  expressionBeat(
    "pale-standing-boundary", "장면 2 · 관계 경계", "pale", "페일", "pale/finale/current",
    "알겠어. 먼저 살아 돌아오고, 궁금한 건 그다음에 묻자.",
    "플레이어가 임무와 감정을 분리하자고 정한 뒤 페일이 그 경계를 받아들이는 장면입니다.",
    "웃음기가 빠져도 거절이나 적대로 보이지 않는지 확인하세요.",
    "review-pale-standing", "경계 수용", "현재 관계를 강요하지 않고 한 걸음 물러난 표정",
  ),
  expressionBeat(
    "pale-smirk-departure", "장면 2 · 출항", "pale", "페일", "pale/finale/current",
    "임시 항해사가 앞을 고르잖아. 나는 그 앞의 앞을 볼게.",
    "카노의 제지를 장난스럽게 비껴가며 앞장서려는 장면입니다.",
    "유치한 장난보다 빠른 호기심과 자신감으로 읽히는지 확인하세요.",
    "review-pale-smirk", "장난스러운 자신감", "위험한 호기심을 가볍게 드러내는 표정",
  ),
  expressionBeat(
    "bacikal-standing-name", "장면 2 · 호칭", "bacikal", "네모 / 바치칼", "bacikal/finale/current",
    "네모. 아직 어색해야 할 이유가 충분하니까.",
    "플레이어가 네모라는 호칭을 고른 뒤 그 선택을 받아들이는 장면입니다.",
    "분노나 호감 없이 짧고 정확하게 답하는 현재 외형인지 확인하세요.",
    "review-bacikal-standing", "절제된 수용", "호칭을 판단하되 감정을 선고하지 않는 표정",
  ),
  expressionBeat(
    "bacikal-smile-name", "장면 2 · 호칭", "bacikal", "네모 / 바치칼", "bacikal/finale/current",
    "네모로 하겠다. 도망치지 않기 위해 되찾은 이름이다.",
    "호칭 결정을 자신에게 돌려준 플레이어에게 네모가 직접 이름을 고르는 장면입니다.",
    "밝은 호감 보상보다 자기 결정을 되찾은 아주 작은 변화인지 확인하세요.",
    "review-bacikal-smile", "작은 자기결정", "이름을 스스로 선택한 뒤의 절제된 미소",
  ),
  expressionBeat(
    "bacikal-disappointed-warning", "장면 2 · 자기희생 경고", "bacikal", "네모 / 바치칼", "bacikal/finale/current",
    "돌아갈 수 있다는 이유로 먼저 죽을 생각은 하지 마라.",
    "회귀를 겪은 네모가 항해사의 자기희생을 경고한 직후의 무언 반응입니다.",
    "분노가 가라앉은 뒤 회귀에 대한 피로가 남는지 확인하세요.",
    "review-bacikal-disappointed", "회귀의 피로", "경고 뒤에 남는 피로와 불신",
  ),
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
  if (manifest.version !== TEMEROSA_REVIEW_VERSION) throw new Error("temerosa_review_manifest_version_mismatch");
  for (const beat of reviewBeats) {
    for (const candidate of beat.candidates) {
      const asset = manifest.assets.find((item) => item.id === candidate.assetId);
      if (!asset) throw new Error(`temerosa_review_asset_missing:${candidate.assetId}`);
      if (asset.appearanceSet !== beat.appearanceSet) throw new Error(`temerosa_review_appearance_mismatch:${beat.id}:${candidate.assetId}`);
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
  return Object.fromEntries(reviewBeats.map((beat) => [beat.id, {
    selectedAssetId: beat.candidates[0]!.assetId,
    status: "approved" as const,
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
