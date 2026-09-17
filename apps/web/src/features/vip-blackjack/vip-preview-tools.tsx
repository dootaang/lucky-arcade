import type { VipArt, VipArtPack } from "../../lib/temerosa-vip-content.ts";
import type { VipLine } from "./vip-dialogue.ts";
import { NIEUN_VIP_LINES } from "./nieun-vip-dialogue.generated.ts";

const GROUP_LABELS = { sulky: "뚱함", flustered: "당황", weary: "지침", smug: "의기양양", back: "뒷모습", other: "기타" };

export function VipPreviewTools({ pack, disabled, canReplay, inspecting, onReset, onReplayEntry, onArt, onLine, onResume }: {
  pack: VipArtPack | null; disabled: boolean; canReplay: boolean; inspecting: boolean;
  onReset(): void; onReplayEntry(): void; onArt(art: VipArt): void; onLine(line: VipLine): void; onResume(): void;
}) {
  return <aside className="vip-preview" aria-label="관리자 시험 모드">
    <strong>관리자 시험 · 실제 기록에 반영되지 않음</strong>
    <p>시험 포인트만 사용합니다. 새로고침하면 이어지고, 이 탭의 시험 데이터는 실제 지갑·회원권·전적과 분리됩니다.</p>
    <details>
      <summary>관리자 시험 도구</summary>
      <div className="vip-preview-controls">
        <button disabled={disabled} onClick={() => { if (window.confirm("시험 포인트를 10,000 P로 돌리고 시험 대국과 입장 연출을 초기화할까요? 실제 기록은 바뀌지 않습니다.")) onReset(); }}>시험 초기화 · 10,000 P</button>
        <button disabled={disabled || !canReplay} onClick={onReplayEntry}>첫 입장 연출 다시 보기</button>
        <label>박니은 이미지 · {pack?.assets.length ?? 0}장
          <select defaultValue="" disabled={disabled || !pack} onChange={(event) => { const art = pack?.assets.find((item) => item.id === event.target.value); if (art) onArt(art); event.currentTarget.value = ""; }}>
            <option value="" disabled>확인할 이미지 선택</option>
            {pack?.assets.map((art, index) => <option key={art.id} value={art.id}>{index + 1}. {GROUP_LABELS[art.group]} · {art.id.slice(-6)}</option>)}
          </select>
        </label>
        <label>상황별 대사 · {NIEUN_VIP_LINES.length}개
          <select defaultValue="" disabled={disabled || !pack} onChange={(event) => { const line = NIEUN_VIP_LINES.find((item) => item.id === event.target.value); if (line) onLine(line); event.currentTarget.value = ""; }}>
            <option value="" disabled>확인할 대사 선택</option>
            {NIEUN_VIP_LINES.map((line) => <option key={line.id} value={line.id}>{line.id} · {line.text.slice(0, 18)}</option>)}
          </select>
        </label>
        <div className="vip-preview-comps" aria-label="컴프 단계 연출 미리보기">
          {[1, 2, 3, 4].map((tier) => <button key={tier} disabled={disabled || !pack} onClick={() => { const line = NIEUN_VIP_LINES.find((item) => item.event === `comp-${tier}`); if (line) onLine(line); }}>컴프 {tier}단계</button>)}
        </div>
      </div>
      <p>이미지는 선택한 항목만 불러옵니다. 연출 미리보기는 패·게임 결과·컴프 누적액을 바꾸지 않습니다.</p>
    </details>
    {inspecting && <button className="vip-primary" onClick={onResume}>연출 확인 종료 · 게임으로</button>}
  </aside>;
}
