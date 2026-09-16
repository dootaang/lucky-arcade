import { useEffect, useRef, useState } from "react";
import type { VipArt } from "../../lib/temerosa-vip-content.ts";

/** No image cache or preload loop: only the shown image and one requested successor. */
export function VipHostArt({ art }: { art: VipArt | null }) {
  const [shown, setShown] = useState<VipArt | null>(null);
  const [next, setNext] = useState<VipArt | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const shownRef = useRef(shown); shownRef.current = shown;
  useEffect(() => {
    setLoaded(false); setFailed(false);
    setNext(art?.id !== shownRef.current?.id ? art : null);
  }, [art]);
  useEffect(() => {
    if (!loaded || !next) return;
    const commit = () => { setShown(next); setNext(null); setLoaded(false); };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { commit(); return; }
    const timer = setTimeout(commit, 210);
    return () => clearTimeout(timer);
  }, [loaded, next]);
  return <figure className="vip-host-art" aria-label="박니은 VIP 딜러">
    {shown && <img src={shown.url} width={shown.width} height={shown.height} alt="박니은 VIP 전신 일러스트" decoding="async" />}
    {next && <img key={next.id} className={`vip-host-next ${loaded ? "is-loaded" : ""}`} src={next.url} width={next.width} height={next.height} alt={shown ? "" : "박니은 VIP 전신 일러스트"} aria-hidden={shown ? true : undefined} decoding="async" onLoad={async (event) => { const node = event.currentTarget; try { await node.decode(); } catch { /* Loaded bitmap may already be decoded. */ } if (node.isConnected) setLoaded(true); }} onError={() => { setFailed(true); setNext(null); }} />}
    {!shown && !loaded && <figcaption>{failed ? "그림을 불러오지 못했습니다. 게임은 계속할 수 있습니다." : "박니은이 기다리고 있어요…"}</figcaption>}
  </figure>;
}
