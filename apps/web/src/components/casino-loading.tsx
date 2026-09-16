import { Component, useEffect, useState, type ReactNode } from "react";

interface LoadingTable { id: string; title: string; }
interface CasinoLoadingProps {
  phase: "screen" | "records" | "error";
  tables?: readonly LoadingTable[];
  onPlay?: (id: string) => void;
  onRetry?: () => void;
}

/** Kept in the entry chunk: loading feedback must not wait for ledger code/CSS. */
export function CasinoLoading({ phase, tables = [], onPlay, onRetry }: CasinoLoadingProps) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (phase === "error") return;
    const timeout = window.setTimeout(() => setSlow(true), 15_000);
    return () => window.clearTimeout(timeout);
  }, [phase]);
  const failed = phase === "error";
  return <section className="casino-ledger-loading" aria-label={failed ? "카지노 기록 로딩 오류" : "카지노 준비 중"}>
    <div className="casino-loading-message" role="status" aria-live="polite" aria-atomic="true">
      <span className="casino-loading-indicator" data-failed={failed} aria-hidden="true">{failed ? "!" : ""}</span>
      <div>
        <h3>{failed ? "카지노 기록을 불러오지 못했습니다." : phase === "screen" ? "카지노를 준비하고 있습니다." : "카지노 기록을 불러오는 중입니다."}</h3>
        <p>{onPlay ? "게임은 먼저 시작할 수 있어요." : "잠시만 기다려 주세요."}</p>
        {slow && <p className="casino-loading-help">예상보다 시간이 걸리고 있습니다. 첫 방문에는 기록 준비가 길어질 수 있어요.</p>}
        {failed && <p className="casino-loading-help">연결 상태를 확인한 뒤 다시 시도해 주세요. 저장된 기록은 지우지 않습니다.</p>}
      </div>
    </div>
    {onPlay && <div className="casino-loading-games" aria-label="먼저 시작할 수 있는 게임">
      {tables.map((table) => <button type="button" key={table.id} onClick={() => onPlay(table.id)}>{table.title} 시작</button>)}
    </div>}
    <div className="casino-loading-actions">
      {failed && onRetry && <button type="button" onClick={onRetry}>다시 시도</button>}
      <a href="/">로비로 돌아가기</a>
    </div>
  </section>;
}

/** A rejected lazy import is cached by React; explicit reload retries the assets. */
export class CasinoLoadingBoundary extends Component<{ children: ReactNode; tables: readonly LoadingTable[]; onPlay(id: string): void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    return this.state.failed
      ? <CasinoLoading phase="error" tables={this.props.tables} onPlay={this.props.onPlay} onRetry={() => window.location.reload()} />
      : this.props.children;
  }
}
