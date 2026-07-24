import { useEffect, useMemo, useState } from "react";
import {
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconClipboard,
  IconClockPause,
  IconRefresh,
} from "@tabler/icons-react";
import {
  initialReviewChoices,
  loadTemerosaReviewManifest,
  reviewAssetUrl,
  reviewBeats,
  reviewExport,
  sanitizeReviewChoices,
  TEMEROSA_REVIEW_STORAGE_KEY,
  TEMEROSA_REVIEW_VERSION,
  type ReviewChoice,
  type ReviewStatus,
} from "./temerosa-review-data.ts";
import "./temerosa-review.css";

type ReviewManifest = Awaited<ReturnType<typeof loadTemerosaReviewManifest>>;

function readStoredChoices(): Record<string, ReviewChoice> {
  try {
    const stored = localStorage.getItem(TEMEROSA_REVIEW_STORAGE_KEY);
    return stored ? sanitizeReviewChoices(JSON.parse(stored)) : initialReviewChoices();
  } catch {
    return initialReviewChoices();
  }
}

export function TemerosaReviewPage() {
  const [manifest, setManifest] = useState<ReviewManifest | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [beatIndex, setBeatIndex] = useState(0);
  const [choices, setChoices] = useState<Record<string, ReviewChoice>>(readStoredChoices);
  const [copied, setCopied] = useState(false);
  const beat = reviewBeats[beatIndex]!;
  const choice = choices[beat.id]!;

  useEffect(() => {
    loadTemerosaReviewManifest().then(setManifest).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    localStorage.setItem(TEMEROSA_REVIEW_STORAGE_KEY, JSON.stringify(choices));
  }, [choices]);

  useEffect(() => {
    if (!manifest) return;
    for (const reviewBeat of reviewBeats) {
      for (const candidate of reviewBeat.candidates) {
        const image = new Image();
        image.src = reviewAssetUrl(manifest, candidate.assetId);
      }
    }
  }, [manifest]);

  const reviewedCount = useMemo(
    () => Object.values(choices).filter((item) => item.status !== "unreviewed").length,
    [choices],
  );

  function updateChoice(update: Partial<ReviewChoice>) {
    setChoices((current) => ({
      ...current,
      [beat.id]: { ...current[beat.id]!, ...update },
    }));
  }

  function setStatus(status: ReviewStatus) {
    updateChoice({ status });
  }

  async function copyResult() {
    await navigator.clipboard.writeText(reviewExport(choices));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function resetReview() {
    if (!window.confirm("모든 승인·보류 기록을 초기화할까요?")) return;
    setChoices(initialReviewChoices());
    setBeatIndex(0);
  }

  const selectedCandidate = beat.candidates.find((item) => item.assetId === choice.selectedAssetId)!;
  const selectedUrl = manifest ? reviewAssetUrl(manifest, choice.selectedAssetId) : "";

  if (loadError) {
    return (
      <main className="temerosa-review-shell temerosa-review-center">
        <h1>검수용 이미지를 불러오지 못했습니다.</h1>
        <p>새로고침해도 계속되면 콘텐츠 팩 배포 상태를 확인해 주세요.</p>
        <button className="temerosa-review-primary" onClick={() => window.location.reload()}>다시 불러오기</button>
      </main>
    );
  }

  if (!manifest) {
    return (
      <main className="temerosa-review-shell temerosa-review-center" aria-live="polite">
        <div className="temerosa-review-loader" />
        <p>검수 장면을 준비하고 있습니다…</p>
      </main>
    );
  }

  return (
    <main className="temerosa-review-shell">
      <header className="temerosa-review-header">
        <button className="temerosa-review-icon" aria-label="오락실로 돌아가기" onClick={() => window.location.assign("/")}>
          <IconArrowLeft />
        </button>
        <div>
          <span>TEMEROSA · EXPRESSION REVIEW {TEMEROSA_REVIEW_VERSION}</span>
          <h1>대사에 맞는 표정을 골라주세요</h1>
        </div>
        <div className="temerosa-review-progress" aria-label={`${reviewedCount}개 검수 완료`}>
          <strong>{reviewedCount}</strong><span>/ {reviewBeats.length}</span>
        </div>
      </header>

      <div className="temerosa-review-layout">
        <nav className="temerosa-review-scenes" aria-label="검수 장면">
          {reviewBeats.map((item, index) => {
            const status = choices[item.id]!.status;
            return (
              <button
                key={item.id}
                className={index === beatIndex ? "active" : ""}
                onClick={() => setBeatIndex(index)}
                aria-current={index === beatIndex ? "step" : undefined}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span><strong>{item.characterName}</strong><small>{item.scene}</small></span>
                <i data-status={status} aria-label={status === "approved" ? "승인됨" : status === "hold" ? "보류됨" : "미검수"} />
              </button>
            );
          })}
          <button className="temerosa-review-copy" onClick={copyResult}>
            <IconClipboard /> {copied ? "복사했습니다" : "검수 결과 복사"}
          </button>
          <button className="temerosa-review-reset" onClick={resetReview}><IconRefresh /> 처음부터</button>
        </nav>

        <section className="temerosa-review-workspace">
          <div className={`temerosa-review-stage ${beat.frame}`}>
            <div className="temerosa-review-stage-label">
              <span>{beat.frame === "communication" ? "REMOTE CHANNEL" : "FIELD RECORD"}</span>
              <strong>{beat.characterName}</strong>
            </div>
            <div className="temerosa-review-portrait">
              <img src={selectedUrl} alt={`${beat.characterName} - ${selectedCandidate.label}`} />
            </div>
            <div className="temerosa-review-dialogue">
              <strong>{beat.characterName}</strong>
              <p>“{beat.line}”</p>
            </div>
          </div>

          <div className="temerosa-review-notes">
            <article><span>장면 맥락</span><p>{beat.context}</p></article>
            <article><span>화면에서 확인할 것</span><p>{beat.observation}</p></article>
          </div>

          <section className="temerosa-review-candidates">
            <div className="temerosa-review-section-title">
              <div><span>표정 후보</span><h2>가장 어울리는 한 장을 선택하세요</h2></div>
              <small>{beat.appearanceSet}</small>
            </div>
            <div className="temerosa-review-candidate-grid">
              {beat.candidates.map((candidate) => {
                const selected = candidate.assetId === choice.selectedAssetId;
                return (
                  <button
                    key={candidate.assetId}
                    className={selected ? "selected" : ""}
                    aria-pressed={selected}
                    onClick={() => updateChoice({ selectedAssetId: candidate.assetId, status: "unreviewed" })}
                  >
                    <img loading="eager" src={reviewAssetUrl(manifest, candidate.assetId)} alt={candidate.label} />
                    <span><strong>{candidate.label}</strong><small>{candidate.reading}</small></span>
                    {selected && <IconCheck aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </section>

          <footer className="temerosa-review-actions">
            <div>
              <button className={choice.status === "hold" ? "hold active" : "hold"} onClick={() => setStatus("hold")}>
                <IconClockPause /> 보류
              </button>
              <button className={choice.status === "approved" ? "approve active" : "approve"} onClick={() => setStatus("approved")}>
                <IconCheck /> 이 표정 승인
              </button>
            </div>
            <button
              className="temerosa-review-next"
              onClick={() => setBeatIndex((current) => Math.min(current + 1, reviewBeats.length - 1))}
              disabled={beatIndex === reviewBeats.length - 1}
            >
              다음 장면 <IconChevronRight />
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
