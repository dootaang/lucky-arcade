import { makeReceipt, resultHash } from "@lucky-arcade/engine";
import { OLD_MAID_VERSION, createOldMaidState, reduceOldMaid, type OldMaidAction, type OldMaidCartridge, type OldMaidState } from "@lucky-arcade/old-maid";
import { OldMaidScreen } from "@lucky-arcade/old-maid/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CabinetViewProps } from "../../cabinets/registry.tsx";
import { CardAssetService } from "../../lib/asset-service.ts";
import { CARD_OLD_MAID_PACK_VERSION, cardOldMaidCartridge } from "../../lib/card-old-maid.ts";
import { appendAction, loadCardSource, saveSnapshot } from "../../lib/database.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadMatchSummary, recordOldMaidCompletion, type MatchSummary } from "../../lib/match-history.ts";
import { readCollection, unlockCollectionItem } from "../../lib/collection.ts";
import { grantOldMaidCompletion, readWallet } from "../../lib/wallet.ts";
import type { CollectionSnapshot, WalletSnapshot } from "@lucky-arcade/persistence";

const THUMBNAIL_EDGE = 192;

interface Ready { cartridge: OldMaidCartridge; state: OldMaidState; assets: Readonly<Record<string, string>>; }

export default function CardOldMaidView({ analyzed, onExit }: CabinetViewProps) {
  const source = analyzed.contract === "analyzed-card/0.3" ? analyzed.oldMaid : null;
  const cartridge = useMemo(() => source ? cardOldMaidCartridge(source) : null, [source]);
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [collection, setCollection] = useState<CollectionSnapshot | null>(null);
  const [award, setAward] = useState<{ amount: number; rank: number } | null>(null);
  const serviceRef = useRef<CardAssetService | null>(null);
  const sourceFingerprint = source?.cardFingerprint ?? "";
  const sessionId = source ? `old-maid-card:${sourceFingerprint}` : "";
  const collectionId = sessionId;

  useEffect(() => {
    if (!source || !cartridge) return;
    let alive = true;
    void loadCardSource(source.cardFingerprint).then(async (file) => {
      if (!file) throw new Error("card_source_missing");
      const service = new CardAssetService(file);
      serviceRef.current = service;
      const fresh = createOldMaidState(cartridge, new Date().toISOString().slice(0, 10), sessionId);
      const recovered = await recoverSession<OldMaidState, OldMaidAction>({
        sessionId, fresh, cabinetVersion: OLD_MAID_VERSION, packVersion: CARD_OLD_MAID_PACK_VERSION,
        isState: (value): value is OldMaidState => Boolean(value && typeof value === "object" && (value as Partial<OldMaidState>).version === OLD_MAID_VERSION && (value as Partial<OldMaidState>).packVersion === CARD_OLD_MAID_PACK_VERSION),
        reduce: (state, action) => reduceOldMaid(cartridge, state, action),
      });
      const assets = await loadAssets(service, cartridge, recovered.state);
      if (alive) setReady({ cartridge, state: recovered.state, assets });
      if (alive && recovered.state.status === "complete") void loadMatchSummary(sessionId).then(setMatchSummary).catch(() => undefined);
    }).catch(() => { if (alive) setError("원본 카드에서 도둑잡기 그림을 불러오지 못했습니다. 카드를 다시 넣어 주세요."); });
    return () => { alive = false; serviceRef.current?.dispose(); serviceRef.current = null; };
  }, [cartridge, sessionId, source]);
  useEffect(() => {
    if (!collectionId) return;
    void Promise.all([readWallet(), readCollection(collectionId)]).then(([nextWallet, nextCollection]) => { setWallet(nextWallet); setCollection(nextCollection); }).catch(() => undefined);
  }, [collectionId]);

  async function persist(previous: OldMaidState, next: OldMaidState, action: OldMaidAction) {
    const service = serviceRef.current;
    if (service && cartridge) void loadAssets(service, cartridge, next).then((assets) => setReady((current) => current ? { ...current, assets } : current)).catch(() => undefined);
    const receipt = makeReceipt(next.sequence, action, next.turn, resultHash(previous), next);
    await appendAction(sessionId, receipt);
    await saveSnapshot({ contract: "snapshot-record/0.1", sessionId, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: "arcade-engine/0.1", cabinetVersion: OLD_MAID_VERSION, packVersion: CARD_OLD_MAID_PACK_VERSION }, {
      contract: "recent-play/0.1", cabinetId: "old-maid-card", sessionId, cardFingerprint: sourceFingerprint,
      title: cartridge?.title ?? "내 카드 도둑잡기", progressLabel: progressLabel(next), updatedAt: new Date().toISOString(),
    });
    if (cartridge && previous.status !== "complete" && next.status === "complete") {
      void recordOldMaidCompletion(cartridge, previous, next, {
        cabinetId: "old-maid-card", sessionId, cabinetVersion: OLD_MAID_VERSION, packVersion: CARD_OLD_MAID_PACK_VERSION, cardFingerprint: sourceFingerprint,
      }).then((summary) => { if (summary) setMatchSummary(summary); }).catch(() => undefined);
      void grantOldMaidCompletion(previous, next, "old-maid-card").then((result) => { if (result) { setWallet(result.wallet); setAward({ amount: result.amount, rank: result.rank }); } }).catch(() => undefined);
    }
  }

  if (!source || !cartridge) return <main className="game-shell"><div className="game-loading">이 카드에는 도둑잡기에 필요한 인물과 표정이 부족합니다.<button onClick={onExit}>돌아가기</button></div></main>;
  if (error) return <main className="game-shell"><div className="game-loading">{error}<button onClick={onExit}>돌아가기</button></div></main>;
  if (!ready) return <main className="game-shell"><div className="game-loading">카드 얼굴과 좌석 초상을 준비하고 있어요…</div></main>;
  const economy = wallet && collection ? { balance: wallet.balance, award, unlockedFaceIds: collection.unlockedFaceIds, onUnlock: async () => {
    const result = await unlockCollectionItem(collectionId, ready.cartridge.faces.map((face) => face.id));
    setWallet(result.wallet); setCollection(result.collection);
    const face = ready.cartridge.faces.find((item) => item.id === result.unlockedFaceId);
    const service = serviceRef.current;
    if (face?.assetId && service) { const url = await service.thumbnailUrl(face.assetId, THUMBNAIL_EDGE, true); setReady((current) => current ? { ...current, assets: { ...current.assets, [face.assetId!]: url } } : current); }
  } } : undefined;
  return <OldMaidScreen cartridge={ready.cartridge} assets={ready.assets} initialState={ready.state} matchSummary={matchSummary} {...(economy ? { economy } : {})} onPersist={persist} onExit={onExit} />;
}

async function loadAssets(service: CardAssetService, cartridge: OldMaidCartridge, state: OldMaidState): Promise<Readonly<Record<string, string>>> {
  const characterIds = state.status === "ready" ? cartridge.characters.map((character) => character.id) : [...Object.values(state.characters), ...(state.spectatorCharacterId ? [state.spectatorCharacterId] : [])];
  const characterAssets = cartridge.characters.filter((character) => characterIds.includes(character.id)).flatMap((character) => state.status === "ready" ? [character.portraits.neutral] : [...Object.values(character.portraits), character.despairPortrait]);
  const faceById = new Map(cartridge.faces.map((face) => [face.id, face]));
  const cardById = new Map(cartridge.cards.map((card) => [card.id, card]));
  const faceAssets = state.status === "ready" ? [] : state.dealOrder.flatMap(({ cardId }) => {
    const face = faceById.get(cardById.get(cardId)?.faceId ?? "");
    return face?.assetId ? [face.assetId] : [];
  });
  const ids = [...new Set([...characterAssets, ...faceAssets])];
  service.setPinned(ids, THUMBNAIL_EDGE);
  const entries = await Promise.all(ids.map(async (id) => [id, await service.thumbnailUrl(id, THUMBNAIL_EDGE, true)] as const));
  return Object.fromEntries(entries);
}

function progressLabel(state: OldMaidState): string {
  if (state.status === "complete") return `${state.turn}턴 · 대국 완료`;
  if (state.status === "playing") return `${state.turn}턴 · ${Object.values(state.hands).reduce((sum, hand) => sum + hand.length, 0)}장 남음`;
  if (state.status === "dealing") return "카드 배분 중";
  return state.status === "ready" ? "상대 선택" : "대국 진행 중";
}
