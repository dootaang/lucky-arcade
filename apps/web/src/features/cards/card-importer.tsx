import { IconFileUpload, IconShieldLock } from "@tabler/icons-react";
import { Button, cn } from "@lucky-arcade/ui";
import { useRef, useState, type DragEvent } from "react";
import type { StoredCard } from "../../lib/database.ts";
import { analyzeCardFile } from "../../lib/card-analysis.ts";
import { saveCard } from "../../lib/database.ts";

export function CardImporter({ onImported }: { onImported(card: StoredCard): void }) {
  const input = useRef<HTMLInputElement>(null), importSequence = useRef(0), [busy, setBusy] = useState(false), [dragging, setDragging] = useState(false), [error, setError] = useState("");
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const sequence = ++importSequence.current;
    setBusy(true); setError("");
    try { const card = await saveCard(await analyzeCardFile(file), file); if (sequence === importSequence.current) onImported(card); }
    catch (reason) { if (sequence === importSequence.current && !(reason instanceof Error && reason.message === "analysis_superseded")) setError(friendlyError(reason)); }
    finally { if (sequence === importSequence.current) { setBusy(false); if (input.current) input.current.value = ""; } }
  };
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void importFile(event.dataTransfer.files[0]); };
  return <section className={cn("import-zone", dragging && "is-dragging")} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} aria-busy={busy}>
    <input ref={input} className="sr-only" type="file" accept=".charx,.png,.risum,.json,image/png,application/json" onChange={(event) => void importFile(event.target.files?.[0])} />
    {busy ? <><div className="hamster-loader" aria-hidden="true"><span /><span /><span /></div><div><h2>카드의 놀이 재료를 찾고 있어요</h2><p>큰 카드도 화면이 멈추지 않도록 별도 작업실에서 분석합니다.</p></div></> : <>
      <span className="import-icon"><IconFileUpload size={30} /></span>
      <div><h2>봇카드를 게임 카트리지로</h2><p>여기에 놓거나 버튼으로 고르세요. charx · png · risum · json</p></div>
      <Button onClick={() => input.current?.click()}>카드 가져오기</Button>
    </>}
    <small><IconShieldLock size={16} /> 원본과 분석 결과는 이 브라우저 밖으로 전송되지 않습니다.</small>
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}

function friendlyError(reason: unknown): string {
  const code = reason instanceof Error ? reason.message : "";
  if (code.includes("card_missing") || code.includes("card_payload")) return "이 파일에서 봇카드 정보를 찾지 못했습니다.";
  if (code.includes("too_large")) return "분석 문서가 안전 한도를 넘었습니다.";
  if (code.includes("analysis_worker")) return "분석 작업실을 시작하지 못했습니다. 새로고침 후 다시 시도해 주세요.";
  return "카드를 읽지 못했습니다. 지원 형식과 파일 손상 여부를 확인해 주세요.";
}
