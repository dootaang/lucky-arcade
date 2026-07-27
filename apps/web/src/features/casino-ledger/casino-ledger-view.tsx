import {
  casinoPresenceAt,
  recentNpcActivitiesAt,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
} from "@lucky-arcade/casino-ledger";
import CasinoLedgerPanel, { type CasinoLiveTable } from "@lucky-arcade/casino-ledger/react";
import { useEffect, useMemo, useState } from "react";
import { casinoClockFromSample, deviceCasinoClockSample, type CasinoClockSample } from "../../lib/casino-clock.ts";
import { npcBalancesAtWithCheckpoint } from "../../lib/casino-ledger-cache.ts";
import { loadTemerosaCasinoManifest, temerosaContentUrl, type TemerosaManifest } from "../../lib/temerosa-content.ts";

const LEGACY_PORTRAITS: Readonly<Record<string, string>> = Object.freeze({
  pale: temerosaContentUrl("0.6.0", "assets/margin/gallery-finale-pale-neutral/sm.webp"),
  kano: temerosaContentUrl("0.6.0", "assets/margin/gallery-finale-kano-neutral/sm.webp"),
  bacikal: temerosaContentUrl("0.6.0", "assets/margin/gallery-bestiaization-bacikal-neutral/sm.webp"),
  riel: temerosaContentUrl("0.6.0", "assets/margin/gallery-bestiaization-riel-neutral/sm.webp"),
  wares: temerosaContentUrl("0.6.0", "assets/margin/gallery-finale-wares-neutral/sm.webp"),
});

export default function CasinoLedgerView({ userBalance, tables, onPlay }: { userBalance: number; tables: readonly CasinoLiveTable[]; onPlay(id: string): void }): React.ReactElement | null {
  const [loaded, setLoaded] = useState<{ sample: CasinoClockSample; manifest?: TemerosaManifest }>();
  const [, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadTemerosaCasinoManifest().then(({ manifest, clockSample }) => {
      if (alive) setLoaded({ sample: clockSample, manifest });
    }).catch(() => {
      if (alive) setLoaded({ sample: deviceCasinoClockSample() });
    });
    return () => { alive = false; };
  }, []);

  const clock = useMemo(() => loaded ? casinoClockFromSample(loaded.sample) : undefined, [loaded]);
  useEffect(() => {
    if (!clock) return;
    let previousSecond = clock.utcSecond();
    const refresh = () => {
      const nextSecond = clock.utcSecond();
      if (nextSecond !== previousSecond) { previousSecond = nextSecond; setRevision((value) => value + 1); }
    };
    const interval = window.setInterval(refresh, 1_000);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [clock]);

  if (!loaded || !clock) return <section className="casino-ledger-loading ca-label" aria-label="카지노 원장 불러오는 중">원장 정리 중…</section>;
  try {
    const currentUtcMinute = clock.utcMinute();
    const currentUtcSecond = clock.utcSecond();
    const snapshot = npcBalancesAtWithCheckpoint(clock, TEMEROSA_NPC_LEDGER_CONTRACT);
    const activities = recentNpcActivitiesAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, 6);
    const presences = casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT);
    return <CasinoLedgerPanel
      npcBalances={snapshot.balances}
      userBalance={userBalance}
      activities={activities}
      portraits={portraitMap(loaded.manifest)}
      currentUtcMinute={currentUtcMinute}
      currentUtcSecond={currentUtcSecond}
      clockSource={loaded.sample.source}
      presences={presences}
      tables={tables}
      onPlay={onPlay}
    />;
  } catch {
    return <section className="casino-ledger-loading ca-label">원장을 정리하지 못했습니다. 게임 테이블은 그대로 이용할 수 있습니다.</section>;
  }
}

function portraitMap(manifest?: TemerosaManifest): Readonly<Record<string, string>> {
  const portraits: Record<string, string> = { ...LEGACY_PORTRAITS };
  if (!manifest) return Object.freeze(portraits);
  for (const profile of TEMEROSA_NPC_GAMBLING_PROFILES) {
    if (portraits[profile.id]) continue;
    const candidates = manifest.assets.filter((asset) => asset.characterId === profile.id);
    const asset = candidates.find((candidate) => candidate.expression === "neutral") ?? candidates[0];
    const variant = asset?.variants.find((candidate) => candidate.size === "sm") ?? asset?.variants[0];
    if (variant) portraits[profile.id] = temerosaContentUrl(manifest.version, variant.path);
  }
  return Object.freeze(portraits);
}
