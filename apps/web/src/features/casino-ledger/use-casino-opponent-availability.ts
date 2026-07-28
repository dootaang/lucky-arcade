import { casinoPresenceAt, npcAvailability, TEMEROSA_NPC_GAMBLING_PROFILES, TEMEROSA_NPC_LEDGER_CONTRACT } from "@lucky-arcade/casino-ledger";
import { useCallback, useEffect, useMemo, useState } from "react";
import { casinoClockFromSample, deviceCasinoClockSample, type CasinoClockSample } from "../../lib/casino-clock.ts";
import { loadTemerosaCasinoManifest } from "../../lib/temerosa-content.ts";

const HOLD_SECONDS = 120;

export interface OpponentAvailabilityView {
  available: boolean;
  label: string;
  availableAtUtcSecond?: number;
}

interface HeldInvite { npcId: string; expiresAtUtcSecond: number; }

export function useCasinoOpponentAvailability(scope: string): {
  opponents: Readonly<Record<string, OpponentAvailabilityView>>;
  holdOpponents(ids: readonly string[]): void;
  clearHolds(): void;
} {
  const [sample, setSample] = useState<CasinoClockSample>();
  const [revision, setRevision] = useState(0);
  const [held, setHeld] = useState<readonly HeldInvite[]>(() => readHolds(scope));

  useEffect(() => {
    let alive = true;
    void loadTemerosaCasinoManifest().then(({ clockSample }) => { if (alive) setSample(clockSample); })
      .catch(() => { if (alive) setSample(deviceCasinoClockSample()); });
    return () => { alive = false; };
  }, []);

  const clock = useMemo(() => sample ? casinoClockFromSample(sample) : undefined, [sample]);
  useEffect(() => {
    if (!clock) return;
    const refresh = () => setRevision((value) => value + 1);
    const interval = window.setInterval(refresh, 1_000);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [clock]);

  const now = clock?.utcSecond() ?? 0;
  useEffect(() => {
    if (!clock) return;
    const active = held.filter((invite) => invite.expiresAtUtcSecond > now);
    if (active.length !== held.length) { setHeld(active); writeHolds(scope, active); }
  }, [clock, held, now, revision, scope]);

  const opponents = useMemo(() => {
    if (!clock) {
      return Object.freeze(Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => [
        profile.id,
        Object.freeze({ available: false, label: "카지노 일정 확인 중" }),
      ])));
    }
    const publicAvailability = npcAvailability(casinoPresenceAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT));
    const heldIds = new Set(held.filter((invite) => invite.expiresAtUtcSecond > now).map((invite) => invite.npcId));
    return Object.freeze(Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => {
      const status = publicAvailability[profile.id]!;
      if (heldIds.has(profile.id)) return [profile.id, Object.freeze({ available: true, label: "초대 수락" })];
      if (status.available) return [profile.id, Object.freeze({ available: true, label: "이용 가능" })];
      const remaining = status.availableAtUtcSecond === undefined ? "잠시 후" : remainingLabel(status.availableAtUtcSecond - now);
      const activity=status.phase==="spectating"?`${tableLabel(status.tableId)} 관전 중`:`${tableLabel(status.tableId)} 중`;
      return [profile.id, Object.freeze({ available: false, label: `${activity} · ${remaining}`, ...(status.availableAtUtcSecond === undefined ? {} : { availableAtUtcSecond: status.availableAtUtcSecond }) })];
    })));
  }, [clock, held, now, revision]);

  const holdOpponents = useCallback((ids: readonly string[]) => {
    if (!clock) return;
    const expiresAtUtcSecond = clock.utcSecond() + HOLD_SECONDS;
    const next = ids.map((npcId) => Object.freeze({ npcId, expiresAtUtcSecond }));
    setHeld(next); writeHolds(scope, next);
  }, [clock, scope]);
  const clearHolds = useCallback(() => { setHeld([]); writeHolds(scope, []); }, [scope]);
  return { opponents, holdOpponents, clearHolds };
}

function remainingLabel(seconds: number): string {
  if (seconds <= 60) return `${Math.max(1, seconds)}초 뒤`;
  return `${Math.ceil(seconds / 60)}분 뒤`;
}

function tableLabel(tableId: string | undefined): string {
  if (tableId === "temerosa-old-maid") return "도둑잡기";
  if (tableId === "temerosa-match-pairs") return "짝맞추기";
  if (tableId === "indian-poker") return "인디언 포커";
  return "슬롯";
}

function readHolds(scope: string): readonly HeldInvite[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key(scope)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is HeldInvite => Boolean(value && typeof value === "object" && typeof (value as HeldInvite).npcId === "string" && Number.isSafeInteger((value as HeldInvite).expiresAtUtcSecond)));
  } catch { return []; }
}

function writeHolds(scope: string, holds: readonly HeldInvite[]): void {
  try { sessionStorage.setItem(key(scope), JSON.stringify(holds)); } catch { /* invitation persistence is optional */ }
}

function key(scope: string): string { return `casino-invite/0.1:${scope}`; }
