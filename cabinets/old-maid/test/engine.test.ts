import { resultHash } from "@lucky-arcade/engine";
import { describe, expect, it } from "vitest";
import { PERSONA_PRESETS } from "@lucky-arcade/engine";
import { OLD_MAID_LEGACY_VERSION, OLD_MAID_OFFER_VERSION, OLD_MAID_PREVIOUS_VERSION, TEMEROSA_CASINO_BEHAVIOR_PROFILES, availablePairs, cpuDrawIndex, createOldMaidState, createTemerosaCasinoOldMaidCartridge, inspectCardReaction, isOldMaidState, legacyCpuDrawIndex, npcReorderIntent, oldMaidOutcome, publicRead, reduceOldMaid, selectAmbientReaction, temerosaOldMaidCartridge, validateCartridge, type OldMaidAction, type OldMaidCartridge, type OldMaidCharacter, type OldMaidMode, type OldMaidState } from "../src/index.ts";

const extraCharacters: OldMaidCharacter[] = Array.from({ length: 22 }, (_, index) => ({
  id: `fixture-${index + 1}`,
  name: `Fixture ${index + 1}`,
  appearanceSet: "fixture",
  tellStyle: (["open", "guarded", "bluffer"] as const)[index % 3]!,
  portraits: { neutral: "fixture-neutral", pleased: "fixture-pleased", tense: "fixture-tense" },
  despairPortrait: "fixture-despair",
}));
const thirtyCharacterCartridge: OldMaidCartridge = {
  ...temerosaOldMaidCartridge,
  version: "old-maid-fixture/18-pairs",
  dealPairCount: 18,
  characters: [...temerosaOldMaidCartridge.characters, ...extraCharacters],
  selectableCharacterIds: [...temerosaOldMaidCartridge.characters.filter(({ id }) => id !== "bacikal").map(({ id }) => id), ...extraCharacters.map(({ id }) => id)],
};

function autoplay(seed: string): { state: OldMaidState; actions: OldMaidAction[] } {
  let state = createOldMaidState(temerosaOldMaidCartridge, seed, "test-session");
  const actions: OldMaidAction[] = [{ type: "start" }];
  state = reduceOldMaid(temerosaOldMaidCartridge, state, actions[0] as OldMaidAction);
  actions.push({ type: "finish_deal" });
  state = reduceOldMaid(temerosaOldMaidCartridge, state, actions[1] as OldMaidAction);
  while (state.status !== "complete" && actions.length < 2_000) {
    const action = nextAutoAction(temerosaOldMaidCartridge, state, "play");
    actions.push(action);
    state = reduceOldMaid(temerosaOldMaidCartridge, state, action);
  }
  return { state, actions };
}

function autoplaySpectator(seed: string): OldMaidState {
  let state = createOldMaidState(temerosaOldMaidCartridge, seed, "spectator-session");
  state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start", mode: "spectate", characterIds: ["nemo", "pale", "kano", "alger"] });
  state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "finish_deal" });
  for (let step = 0; state.status !== "complete" && step < 2_000; step += 1) {
    const action = nextAutoAction(temerosaOldMaidCartridge, state, "spectate");
    state = reduceOldMaid(temerosaOldMaidCartridge, state, action);
  }
  return state;
}

function autoplayCartridge(cartridge: OldMaidCartridge, seed: string, mode: OldMaidMode, legacy = false): OldMaidState {
  let state = legacy ? asVersion07(createOldMaidState(cartridge, seed, `${mode}-session`)) : createOldMaidState(cartridge, seed, `${mode}-session`);
  state = reduceOldMaid(cartridge, state, { type: "start", mode });
  state = reduceOldMaid(cartridge, state, { type: "finish_deal" });
  for (let step = 0; state.status !== "complete" && step < 2_000; step += 1) {
    const action = nextAutoAction(cartridge, state, mode);
    state = reduceOldMaid(cartridge, state, action);
  }
  return state;
}

function autoplayOffer08(cartridge: OldMaidCartridge, seed: string, mode: OldMaidMode): OldMaidState {
  let state = asVersion08(createOldMaidState(cartridge, seed, `${mode}-08-session`));
  state = reduceOldMaid(cartridge, state, { type: "start", mode });
  state = reduceOldMaid(cartridge, state, { type: "finish_deal" });
  for (let step = 0; state.status !== "complete" && step < 2_000; step += 1) state = reduceOldMaid(cartridge, state, nextAutoAction(cartridge, state, mode));
  return state;
}

function nextAutoAction(cartridge: OldMaidCartridge, state: OldMaidState, mode: OldMaidMode): OldMaidAction {
  if (state.status === "revealing") return { type: "collect_draw" };
  if (state.status === "discarding") return { type: "discard_pair", cardIds: availablePairs(cartridge, state)[0] as [string, string] };
  if (state.status === "offering") {
    if (state.offer?.phase === "arranging" && mode === "play" && state.offer.targetId === "player") return { type: "finish_offer" };
    if (state.offer?.phase === "arranging") return { type: "prepare_cpu_offer" };
    return { type: "finish_offer" };
  }
  return mode === "play" && state.currentPlayerId === "player" ? { type: "draw", index: 0 } : { type: "cpu_draw" };
}

function asVersion07(state: OldMaidState): OldMaidState {
  const { offer: _offer, ...legacy } = state;
  return { ...legacy, contract: "old-maid-state/0.6", version: OLD_MAID_PREVIOUS_VERSION };
}

function asVersion08(state: OldMaidState): OldMaidState { return { ...state, version: OLD_MAID_OFFER_VERSION }; }

function advanceToFirstOffer(cartridge = temerosaOldMaidCartridge, seed = "offer-phase"): OldMaidState {
  let state = createOldMaidState(cartridge, seed, "offer-session");
  state = reduceOldMaid(cartridge, state, { type: "start" });
  state = reduceOldMaid(cartridge, state, { type: "finish_deal" });
  while (state.status === "discarding") state = reduceOldMaid(cartridge, state, { type: "discard_pair", cardIds: availablePairs(cartridge, state)[0] as [string, string] });
  return state;
}

describe("old maid deterministic engine", () => {
  it("accepts released 0.6, 0.7 and 0.8 snapshots while pairing offer rules with the new contract", () => {
    const current = createOldMaidState(temerosaOldMaidCartridge, "snapshot-contract");
    expect(isOldMaidState(current)).toBe(true);
    expect(isOldMaidState(asVersion07(current))).toBe(true);
    expect(isOldMaidState(asVersion08(current))).toBe(true);
    expect(isOldMaidState({ ...asVersion07(current), version: OLD_MAID_LEGACY_VERSION })).toBe(true);
    expect(isOldMaidState({ ...current, contract: "old-maid-state/0.6" })).toBe(false);
  });

  it("requires every current draw to pass through an explicit offering phase", () => {
    let state = advanceToFirstOffer();
    expect(state.status).toBe("offering");
    expect(state.offer).toMatchObject({ phase: "arranging", actorId: state.currentPlayerId });
    expect(() => reduceOldMaid(temerosaOldMaidCartridge, state, { type: "draw", index: 0 })).toThrow("old_maid_not_playing");
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "prepare_cpu_offer" });
    expect(state.offer?.phase).toBe("settling");
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "finish_offer" });
    expect(state.status).toBe("playing");
    expect(state.offer?.phase).toBe("ready");
  });

  it("lets a human target rearrange at most three times before offering the hand", () => {
    const base = advanceToFirstOffer(temerosaOldMaidCartridge, "human-offer");
    let state: OldMaidState = {
      ...base,
      currentPlayerId: "cpu-3",
      offer: { actorId: "cpu-3", targetId: "player", phase: "arranging", reorderCount: 0, lastMove: null, revision: base.sequence },
    };
    const before = [...state.hands.player];
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "reorder_offer", from: 0, to: 1 });
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "reorder_offer", from: 0, to: 1 });
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "reorder_offer", from: 0, to: 1 });
    expect([...state.hands.player].sort()).toEqual([...before].sort());
    expect(state.offer?.reorderCount).toBe(3);
    expect(() => reduceOldMaid(temerosaOldMaidCartridge, state, { type: "reorder_offer", from: 0, to: 1 })).toThrow("old_maid_reorder_limit");
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "finish_offer" });
    expect(() => reduceOldMaid(temerosaOldMaidCartridge, state, { type: "draw", index: 0 })).toThrow("old_maid_player_turn_required");
    expect(() => reduceOldMaid(temerosaOldMaidCartridge, state, { type: "cpu_draw" })).not.toThrow();
  });

  it("prepares NPC offers deterministically without leaking card identities into the offer record", () => {
    const left = reduceOldMaid(temerosaOldMaidCartridge, advanceToFirstOffer(temerosaOldMaidCartridge, "npc-offer"), { type: "prepare_cpu_offer" });
    const right = reduceOldMaid(temerosaOldMaidCartridge, advanceToFirstOffer(temerosaOldMaidCartridge, "npc-offer"), { type: "prepare_cpu_offer" });
    expect(left.hands).toEqual(right.hands);
    expect(left.offer).toEqual(right.offer);
    expect(JSON.stringify(left.offer)).not.toContain("cardId");
    if (left.offer?.lastMove) expect(Object.keys(left.offer.lastMove).sort()).toEqual(["fromIndex", "toIndex"]);
  });

  it("reorders only the player hand without consuming a turn and caps it at three", () => {
    let state: OldMaidState = { ...asVersion07(createOldMaidState(temerosaOldMaidCartridge, "reorder")), status: "playing", currentPlayerId: "player" };
    const before = [...state.hands.player], turn = state.turn;
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "reorder_hand", from: 0, to: 2 });
    expect(state.turn).toBe(turn); expect([...state.hands.player].sort()).toEqual([...before].sort()); expect(state.hands.player[2]).toBe(before[0]);
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "reorder_hand", from: 0, to: 1 });
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "reorder_hand", from: 0, to: 1 });
    expect(() => reduceOldMaid(temerosaOldMaidCartridge, state, { type: "reorder_hand", from: 0, to: 1 })).toThrow("old_maid_reorder_limit");
  });
  it("stores the supplying cartridge version without changing the Temerosa value", () => {
    expect(createOldMaidState(temerosaOldMaidCartridge, "pack-version").packVersion).toBe(temerosaOldMaidCartridge.version);
    expect(createOldMaidState({ ...temerosaOldMaidCartridge, version: "card-old-maid/0.1" }, "card-pack").packVersion).toBe("card-old-maid/0.1");
  });
  it("validates the expanded face pool, nine possible opponents, and exactly one joker", () => {
    expect(() => validateCartridge(temerosaOldMaidCartridge)).not.toThrow();
    expect(temerosaOldMaidCartridge.cards.length).toBeGreaterThan(60);
    expect(temerosaOldMaidCartridge.cards.filter((card) => card.pairId === null)).toEqual([
      expect.objectContaining({ faceId: "joker" }),
    ]);
    expect(temerosaOldMaidCartridge.characters).toHaveLength(9);
    expect(temerosaOldMaidCartridge.characters.find((character) => character.id === "nemo")?.portraits.neutral).toBe("nemo-magical-neutral");
    expect(temerosaOldMaidCartridge.characters.every((character) => Boolean(character.despairPortrait))).toBe(true);
  });

  it("does not begin play until the visible deal has completed", () => {
    const released07 = { ...temerosaOldMaidCartridge, version: "temerosa-old-maid/0.7" };
    let state = createOldMaidState(released07, "deal-phase", "test-session");
    expect(state.dealOrder).toHaveLength(25);
    expect(new Set(Object.values(state.characters)).size).toBe(3);
    state = reduceOldMaid(released07, state, { type: "start" });
    expect(state.status).toBe("dealing");
    state = reduceOldMaid(released07, state, { type: "finish_deal" });
    expect(state.status).toBe("discarding");
  });

  it("keeps legacy cartridges at 12 pairs and deals configured 18-pair games as 37 cards", () => {
    const legacy = createOldMaidState(temerosaOldMaidCartridge, "legacy-twelve", "test-session");
    const expanded = createOldMaidState(thirtyCharacterCartridge, "expanded-eighteen", "test-session");
    expect(legacy.dealOrder).toHaveLength(25);
    expect(expanded.dealOrder).toHaveLength(37);
    expect(new Set(expanded.dealOrder.map(({ cardId }) => thirtyCharacterCartridge.cards.find((card) => card.id === cardId)?.pairId).filter(Boolean)).size).toBe(18);
    expect(() => validateCartridge({ ...thirtyCharacterCartridge, dealPairCount: 10_000 })).toThrow("old_maid_deal_pairs_insufficient");
  });

  it("keeps the legacy player-first dealing order while expanding the pool", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      expect(createOldMaidState(thirtyCharacterCartridge, `seat-${seed}`, "test-session").dealOrder[0]!.seatId).toBe("player");
    }
  });

  it("uses only the selectable 30-character roster for automatic and explicit starts", () => {
    expect(thirtyCharacterCartridge.selectableCharacterIds).toHaveLength(30);
    expect(() => validateCartridge(thirtyCharacterCartridge)).not.toThrow();
    for (let seed = 0; seed < 100; seed += 1) {
      const state = createOldMaidState(thirtyCharacterCartridge, `roster-${seed}`, "test-session");
      expect(Object.values(state.characters)).not.toContain("bacikal");
    }
    const ready = createOldMaidState(thirtyCharacterCartridge, "reject-legacy", "test-session");
    expect(() => reduceOldMaid(thirtyCharacterCartridge, ready, { type: "start", characterIds: ["nemo", "pale", "bacikal"] })).toThrow("old_maid_character_selection_invalid");
    expect(() => validateCartridge({ ...thirtyCharacterCartridge, selectableCharacterIds: ["nemo", "nemo", "pale", "kano"] })).toThrow("old_maid_selectable_character_duplicate");
    expect(() => validateCartridge({ ...thirtyCharacterCartridge, selectableCharacterIds: ["nemo", "pale", "kano", "missing"] })).toThrow("old_maid_selectable_character_missing");
  });

  it("builds the casino cartridge without selectable Bacikal and keeps magical-girl Nemo", () => {
    const content = ["neutral", "pleased", "tense", "despair", "surprised"].map((expression) => ({
      id: `${expression === "surprised" ? "card" : "npc"}-fixture-main-${expression}`,
      characterId: "fixture-main",
      expression,
      appearanceSet: "fixture/main",
    }));
    const cartridge = createTemerosaCasinoOldMaidCartridge(content);
    expect(cartridge.version).toBe("temerosa-old-maid/0.9");
    expect(cartridge.dealPairCount).toBe(18);
    expect(cartridge.selectableCharacterIds).toContain("fixture-main");
    expect(cartridge.selectableCharacterIds).not.toContain("bacikal");
    expect(cartridge.characters.find(({ id }) => id === "nemo")?.appearanceSet).toBe("nemo-magical-girl");
    expect(cartridge.faces.some(({ assetId }) => assetId === "card-fixture-main-surprised")).toBe(true);
    expect(cartridge.characters.find(({ id }) => id === "fixture-main")?.tellStyle).toBe("standard");
    expect(() => validateCartridge(cartridge)).not.toThrow();
  });

  it("selects three characters for play and four for spectate deterministically", () => {
    const playReady = createOldMaidState(thirtyCharacterCartridge, "automatic-table", "test-session");
    const play = reduceOldMaid(thirtyCharacterCartridge, playReady, { type: "start", mode: "play" });
    const spectate = reduceOldMaid(thirtyCharacterCartridge, playReady, { type: "start", mode: "spectate" });
    const replay = reduceOldMaid(thirtyCharacterCartridge, createOldMaidState(thirtyCharacterCartridge, "automatic-table", "test-session"), { type: "start", mode: "spectate" });
    expect([...Object.values(play.characters), play.spectatorCharacterId].filter(Boolean)).toHaveLength(3);
    expect([...Object.values(spectate.characters), spectate.spectatorCharacterId].filter(Boolean)).toHaveLength(4);
    expect([spectate.characters, spectate.spectatorCharacterId]).toEqual([replay.characters, replay.spectatorCharacterId]);
  });

  it("continues to interpret a legacy state that references a non-selectable character", () => {
    const base = createOldMaidState(thirtyCharacterCartridge, "legacy-state", "test-session");
    const legacy = { ...base, status: "complete", loserId: "cpu-1", safeOrder: ["player", "cpu-2", "cpu-3"], characters: { ...base.characters, "cpu-1": "bacikal" } } as OldMaidState;
    expect(oldMaidOutcome(legacy)).toMatchObject({ oddCardHolderId: "cpu-1", oddCardHolderCharacterId: "bacikal" });
  });

  it("uses an explicitly selected set of three opponents", () => {
    let state = createOldMaidState(temerosaOldMaidCartridge, "chosen-opponents", "test-session");
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start", characterIds: ["nemo", "pale", "kano"] });
    expect(Object.values(state.characters)).toEqual(["nemo", "pale", "kano"]);
  });

  it("runs a four-NPC spectator table with no human turn", () => {
    const state = autoplaySpectator("spectator");
    expect(state.mode).toBe("spectate");
    expect(state.spectatorCharacterId).toBe("alger");
    expect(state.status).toBe("complete");
    expect(state.loserId).not.toBeNull();
  });

  it("keeps the selected table when restarting the same game", () => {
    let state = createOldMaidState(temerosaOldMaidCartridge, "same-table", "test-session");
    const characterIds = ["nemo", "pale", "kano", "alger"];
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start", mode: "spectate", characterIds });
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "restart", seed: state.seed, mode: state.mode, characterIds });
    expect(state.status).toBe("ready");
    expect(state.mode).toBe("spectate");
    expect(Object.values(state.characters)).toEqual(characterIds.slice(0, 3));
    expect(state.spectatorCharacterId).toBe("alger");
    expect(state.seed).toBe("same-table");
  });

  it("keeps initial pairs until each visible discard action", () => {
    let state = createOldMaidState(temerosaOldMaidCartridge, "initial-pairs-0", "test-session");
    for (let seed = 0; seed < 100; seed += 1) {
      state = createOldMaidState(temerosaOldMaidCartridge, `initial-pairs-${seed}`, "test-session");
      state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start" });
      state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "finish_deal" });
      if (state.status === "discarding") break;
    }
    expect(state.status).toBe("discarding");
    expect(availablePairs(temerosaOldMaidCartridge, state).length).toBeGreaterThan(0);
    while (state.status === "discarding") state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "discard_pair", cardIds: availablePairs(temerosaOldMaidCartridge, state)[0] as [string, string] });
    for (const hand of Object.values(state.hands)) {
      const pairIds = hand.map((cardId) => temerosaOldMaidCartridge.cards.find((card) => card.id === cardId)?.pairId).filter(Boolean);
      expect(new Set(pairIds).size).toBe(pairIds.length);
    }
  });

  it("uses only public turn metadata and target size for CPU draw selection", () => {
    const state = createOldMaidState(temerosaOldMaidCartridge, "seed");
    const read = publicRead(state, "cpu-2");
    expect(cpuDrawIndex(PERSONA_PRESETS.open, read, "seed", 4, "cpu-1", "cpu-2", 5)).toBe(cpuDrawIndex(PERSONA_PRESETS.open, read, "seed", 4, "cpu-1", "cpu-2", 5));
    expect(cpuDrawIndex(PERSONA_PRESETS.open, read, "seed", 4, "cpu-1", "cpu-2", 5)).toBeLessThan(5);
  });

  it("makes literal, neutral, and counter-reading policies observably distinct", () => {
    const read = { targetHandSize: 5, targetDiscardCount: 0, turnsSinceTargetDrew: 1, reorderedSinceTargetDraw: true, reorderIndex: 2, reorderCount: 3, reorderedImmediatelyAfterDraw: true };
    const rate = (persona: (typeof PERSONA_PRESETS)[keyof typeof PERSONA_PRESETS]) => Array.from({ length: 1_000 }, (_, seed) => cpuDrawIndex(persona, read, `policy-${seed}`, 4, "cpu-1", "player", 5)).filter((index) => index === 2).length;
    const open = rate(PERSONA_PRESETS.open), standard = rate(PERSONA_PRESETS.standard), guarded = rate(PERSONA_PRESETS.guarded);
    expect(open).toBeGreaterThan(standard + 80);
    expect(guarded).toBeLessThan(standard - 40);
  });

  it("keeps the exact 0.6 draw policy and suppresses CPU reorders for legacy states", () => {
    const fresh = createOldMaidState(temerosaOldMaidCartridge, "legacy-policy", "test-session");
    const { lastReorders: _newReorders, ...legacyFresh } = fresh;
    const state: OldMaidState = { ...legacyFresh, version: OLD_MAID_LEGACY_VERSION, status: "playing", currentPlayerId: "cpu-1" };
    const read = publicRead(state, "cpu-2");
    const style = temerosaOldMaidCartridge.characters.find(({ id }) => id === state.characters["cpu-1"])?.tellStyle ?? "standard";
    const index = legacyCpuDrawIndex(PERSONA_PRESETS[style], read, state.seed, state.turn, "cpu-1", "cpu-2", state.hands["cpu-2"].length);
    const next = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "cpu_draw" });
    expect(next.pendingDraw?.cardId).toBe(state.hands["cpu-2"][index]);
    expect(next.lastReorders).toBeUndefined();
    const playerState: OldMaidState = { ...state, currentPlayerId: "player" };
    const playerReordered = reduceOldMaid(temerosaOldMaidCartridge, playerState, { type: "reorder_hand", from: 0, to: 1 });
    expect(Object.hasOwn(playerReordered, "lastReorders")).toBe(false);
  });

  it("derives ambient pressure without changing the saved state", () => {
    const base = createOldMaidState(temerosaOldMaidCartridge, "ambient", "test-session");
    const characterState = { ...base, status: "playing" as const, currentPlayerId: "cpu-3" as const, characters: { ...base.characters, "cpu-1": "pale" } };
    const jokerOwner = (Object.keys(characterState.hands) as (keyof typeof characterState.hands)[]).find((seatId) => characterState.hands[seatId].includes("joker-odd"));
    const pressured = jokerOwner === "cpu-1" ? characterState : { ...characterState, hands: { ...characterState.hands, [jokerOwner!]: characterState.hands[jokerOwner!].filter((id) => id !== "joker-odd"), "cpu-1": [...characterState.hands["cpu-1"], "joker-odd"] } };
    const before = resultHash(pressured);
    const reactions = Array.from({ length: 100 }, (_, index) => selectAmbientReaction(temerosaOldMaidCartridge, { ...pressured, seed: `ambient-${index}` }, "cpu-1"));
    expect(reactions).toContain("tense");
    expect(resultHash(pressured)).toBe(before);
  });

  it("lets new CPU seats reorder deterministically without changing card membership", () => {
    const left = autoplayCartridge(thirtyCharacterCartridge, "cpu-reorder", "spectate");
    const right = autoplayCartridge(thirtyCharacterCartridge, "cpu-reorder", "spectate");
    expect(left.lastReorders).toEqual(right.lastReorders);
    expect(Object.keys(left.lastReorders ?? {}).length).toBeGreaterThan(0);
    expect(resultHash(left)).toBe(resultHash(right));
  });

  it("assigns all 35 Temerosa characters a validated authored behavior profile", () => {
    expect(Object.keys(TEMEROSA_CASINO_BEHAVIOR_PROFILES)).toHaveLength(35);
    expect(temerosaOldMaidCartridge.characters.every((character) => character.behavior)).toBe(true);
    expect(() => validateCartridge(temerosaOldMaidCartridge)).not.toThrow();
  });

  it("makes personality-specific reorder policies observably distinct", () => {
    const character = (id: string) => ({
      ...(temerosaOldMaidCartridge.characters.find((candidate) => candidate.id === "nemo") as OldMaidCharacter),
      id,
      behavior: TEMEROSA_CASINO_BEHAVIOR_PROFILES[id] as NonNullable<OldMaidCharacter["behavior"]>,
    } satisfies OldMaidCharacter);
    const counts = (id: string) => Array.from({ length: 2_000 }, (_, index) => npcReorderIntent(character(id), true, `intent-${index}`))
      .reduce<Record<string, number>>((all, intent) => ({ ...all, [intent]: (all[intent] ?? 0) + 1 }), {});
    const echo = counts("echo"), nieun = counts("nieun"), camille = counts("camille");
    expect(echo["joker-swap"] ?? 0).toBeGreaterThan((nieun["joker-swap"] ?? 0) * 2);
    expect(nieun["habit-swap"] ?? 0).toBeGreaterThan(echo["habit-swap"] ?? 0);
    expect(camille["decoy-swap"] ?? 0).toBeGreaterThan(echo["decoy-swap"] ?? 0);
  });

  it("can swap two ordinary cards without moving the joker", () => {
    const character = temerosaOldMaidCartridge.characters.find(({ id }) => id === "nemo") as OldMaidCharacter;
    const hand = ["joker-odd", ...temerosaOldMaidCartridge.cards.filter((card) => card.pairId !== null).slice(0, 4).map((card) => card.id)];
    const seed = Array.from({ length: 10_000 }, (_, index) => `decoy-${index}`).find((candidate) => {
      const intent = npcReorderIntent(character, true, `${candidate}:cpu-reorder:0:cpu-1:${hand.length}:intent`);
      return intent === "decoy-swap" || intent === "habit-swap";
    }) as string;
    const base = createOldMaidState(temerosaOldMaidCartridge, seed, "decoy-session");
    const state: OldMaidState = {
      ...base,
      status: "offering",
      currentPlayerId: "player",
      hands: { ...base.hands, "cpu-1": hand },
      characters: { ...base.characters, "cpu-1": "nemo" },
      offer: { actorId: "player", targetId: "cpu-1", phase: "arranging", reorderCount: 0, lastMove: null, revision: base.sequence },
    };
    const next = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "prepare_cpu_offer" });
    expect(next.offer?.lastMove).not.toBeNull();
    expect(next.hands["cpu-1"][0]).toBe("joker-odd");
    expect([...next.hands["cpu-1"]].sort()).toEqual([...hand].sort());
  });

  it("can visibly rearrange an ordinary hand that has no joker", () => {
    const character = temerosaOldMaidCartridge.characters.find(({ id }) => id === "nemo") as OldMaidCharacter;
    const hand = temerosaOldMaidCartridge.cards.filter((card) => card.pairId !== null).slice(0, 5).map((card) => card.id);
    const seed = Array.from({ length: 10_000 }, (_, index) => `no-joker-${index}`).find((candidate) =>
      npcReorderIntent(character, false, `${candidate}:cpu-reorder:0:cpu-1:${hand.length}:intent`) !== "stay",
    ) as string;
    const base = createOldMaidState(temerosaOldMaidCartridge, seed, "no-joker-session");
    const state: OldMaidState = {
      ...base,
      status: "offering",
      currentPlayerId: "player",
      hands: { ...base.hands, "cpu-1": hand },
      characters: { ...base.characters, "cpu-1": "nemo" },
      offer: { actorId: "player", targetId: "cpu-1", phase: "arranging", reorderCount: 0, lastMove: null, revision: base.sequence },
    };
    const next = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "prepare_cpu_offer" });
    expect(next.offer?.lastMove).not.toBeNull();
    expect(next.hands["cpu-1"]).not.toEqual(hand);
    expect([...next.hands["cpu-1"]].sort()).toEqual([...hand].sort());
  });

  it("lets an open opponent visibly react to the hovered joker", () => {
    let state = createOldMaidState(temerosaOldMaidCartridge, "inspect-joker", "test-session");
    const jokerOwner = (Object.keys(state.hands) as (keyof typeof state.hands)[]).find((seatId) => state.hands[seatId].includes("joker-odd"));
    if (jokerOwner === "player" || !jokerOwner) {
      const cpuCard = state.hands["cpu-1"][0] as string;
      state = { ...state, hands: { ...state.hands, player: state.hands.player.filter((id) => id !== "joker-odd").concat(cpuCard), "cpu-1": state.hands["cpu-1"].filter((id) => id !== cpuCard).concat("joker-odd") } };
    } else if (jokerOwner !== "cpu-1") {
      const cpuCard = state.hands["cpu-1"][0] as string;
      state = { ...state, hands: { ...state.hands, [jokerOwner]: state.hands[jokerOwner].filter((id) => id !== "joker-odd").concat(cpuCard), "cpu-1": state.hands["cpu-1"].filter((id) => id !== cpuCard).concat("joker-odd") } };
    }
    state = { ...state, characters: { ...state.characters, "cpu-1": "pale" } };
    expect(inspectCardReaction(temerosaOldMaidCartridge, state, "cpu-1", "joker-odd")).toBe("pleased");
  });

  it("replays identical inputs to an identical final result", () => {
    const run = autoplay("replay");
    let replay = createOldMaidState(temerosaOldMaidCartridge, "replay", "test-session");
    for (const action of run.actions) replay = reduceOldMaid(temerosaOldMaidCartridge, replay, action);
    expect(run.state.status).toBe("complete");
    expect(resultHash(replay)).toBe(resultHash(run.state));
  });

  it("keeps the released 0.7 golden play and spectator results", () => {
    const released07 = { ...temerosaOldMaidCartridge, version: "temerosa-old-maid/0.7" };
    const play = autoplayCartridge(released07, "offer-golden", "play", true);
    const spectate = autoplayCartridge(released07, "offer-golden", "spectate", true);
    expect(resultHash(play)).toBe("b222b7446e92e1b73a18dede32816db13bc99256c1b9a14edef797c497009e24");
    expect(resultHash(spectate)).toBe("d24508f938c64634e5aabd6fc382f58bf2a6262733b46c378a375e9afacc9741");
  });

  it("keeps the released 0.8 offer and reorder results", () => {
    const released08 = { ...temerosaOldMaidCartridge, version: "temerosa-old-maid/0.8" };
    expect(resultHash(autoplayOffer08(released08, "offer-08-golden", "play"))).toBe("2db9fd700b7d8d84e5e82493973a6db11140344d3a5ccdbb15adc88fed2918a6");
    expect(resultHash(autoplayOffer08(released08, "offer-08-golden", "spectate"))).toBe("f3ccc5c1e793ca391630fc927f491865cd00f4843516a057c3e87464a0839a1a");
  });

  it("replays the same 18-pair inputs to the same result hash", () => {
    const left = autoplayCartridge(thirtyCharacterCartridge, "expanded-replay", "spectate");
    const right = autoplayCartridge(thirtyCharacterCartridge, "expanded-replay", "spectate");
    expect(left.status).toBe("complete");
    expect(resultHash(left)).toBe(resultHash(right));
  });

  it("finishes 10,000 seeded 18-pair play games without a loop or a missing loser", () => {
    for (let seed = 0; seed < 10_000; seed += 1) {
      const state = autoplayCartridge(thirtyCharacterCartridge, `play-stress-${seed}`, "play");
      expect(state.status, `seed ${seed}`).toBe("complete");
      expect(state.loserId, `seed ${seed}`).not.toBeNull();
      expect(state.history.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(Object.values(state.hands).filter((hand) => hand.length > 0), `seed ${seed}`).toHaveLength(1);
    }
  }, 30_000);

  it("finishes 10,000 seeded 18-pair spectator games", () => {
    for (let seed = 0; seed < 10_000; seed += 1) {
      const state = autoplayCartridge(thirtyCharacterCartridge, `spectate-stress-${seed}`, "spectate");
      expect(state.status, `seed ${seed}`).toBe("complete");
      expect(oldMaidOutcome(state)?.oddCardHolderCharacterId, `seed ${seed}`).not.toBeNull();
    }
  }, 30_000);
});
