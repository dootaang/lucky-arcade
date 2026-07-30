import { IconLock, IconShieldLock } from "@tabler/icons-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { CabinetHost, getCabinetRegistration } from "../cabinets/registry.tsx";
import { getVenueForCabinet, getVenueTableForCabinet } from "../venues/registry.ts";

const PASSWORD_SHA256 = "6b767bbc518ec7f3dcb0ec8ec30539a7a3e7cef27d495272ea203fff0f598f34";
const MAX_ATTEMPTS = 5;

export function AdminPreviewRoute() {
  const navigate = useNavigate();
  const { cabinetId = "" } = useParams<{ cabinetId: string }>();
  const venue = getVenueForCabinet(cabinetId);
  const table = getVenueTableForCabinet(cabinetId);
  const registration = table && table.status !== "open" ? getCabinetRegistration(cabinetId, true) : undefined;
  const storageKey = `lucky-arcade:admin-preview:${cabinetId}`;
  const [unlocked, setUnlocked] = useState(() => readUnlock(storageKey));
  const [password, setPassword] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!registration) return <main className="blocked-cabinet"><IconShieldLock size={38} /><h1>시험 테이블을 찾지 못했습니다.</h1><button onClick={() => navigate(venue ? `/venues/${venue.id}` : "/")}>카지노로 돌아가기</button></main>;
  if (unlocked) return <CabinetHost cabinetId={registration.manifest.id} preview onExit={() => navigate(venue ? `/venues/${venue.id}` : "/")} />;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy || attempts >= MAX_ATTEMPTS) return;
    setBusy(true);
    const valid = await hash(password) === PASSWORD_SHA256;
    setBusy(false);
    if (valid) {
      try { sessionStorage.setItem(storageKey, PASSWORD_SHA256); } catch { /* current page can remain unlocked */ }
      setUnlocked(true);
      setPassword("");
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setError(next >= MAX_ATTEMPTS ? "입력 횟수를 초과했습니다. 페이지를 다시 연 뒤 시도해 주세요." : "관리자 비밀번호가 맞지 않습니다.");
  }

  return <main className="admin-preview-gate">
    <form onSubmit={(event) => { void submit(event); }}>
      <IconLock size={34} aria-hidden="true" />
      <span className="eyebrow">ADMIN PREVIEW</span>
      <h1>{registration.manifest.title}</h1>
      <p>정식 개장 전에 구현 상태를 확인하는 관리자 시험판입니다. 판돈 게임은 실제 지갑 대신 시험 포인트를 사용합니다.</p>
      <label>관리자 비밀번호<input type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} disabled={busy || attempts >= MAX_ATTEMPTS} autoFocus /></label>
      {error && <p className="admin-preview-error" role="alert">{error}</p>}
      <div><button type="button" onClick={() => navigate(venue ? `/venues/${venue.id}` : "/")}>돌아가기</button><button type="submit" disabled={!password || busy || attempts >= MAX_ATTEMPTS}>{busy ? "확인 중…" : "시험 입장"}</button></div>
      <small>정적 웹의 비밀번호 문은 일반 이용자의 실수 진입을 막는 운영 장치이며 서버 인증을 대신하지 않습니다.</small>
    </form>
  </main>;
}

function readUnlock(key: string): boolean {
  try { return sessionStorage.getItem(key) === PASSWORD_SHA256; } catch { return false; }
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
