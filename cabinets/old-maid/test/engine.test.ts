import { resultHash } from "@lucky-arcade/engine";
import { describe, expect, it } from "vitest";
import { PERSONA_PRESETS } from "@lucky-arcade/engine";
import { availablePairs, cpuDrawIndex, createOldMaidState, createTemerosaCasinoOldMaidCartridge, inspectCardReaction, oldMaidOutcome, publicRead, reduceOldMaid, temerosaOldMaidCartridge, validateCartridge, type OldMaidAction, type OldMaidCartridge, type OldMaidCharacter, type OldMaidMode, type OldMaidState } from "../src/index.ts";

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
    const action: OldMaidAction = state.status === "revealing" ? { type: "collect_draw" }
      : state.status === "discarding" ? { type: "discard_pair", cardIds: availablePairs(temerosaOldMaidCartridge, state)[0] as [string, string] }
      : state.currentPlayerId === "player" ? { type: "draw", index: 0 } : { type: "cpu_draw" };
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
    const action: OldMaidAction = state.status === "revealing" ? { type: "collect_draw" }
      : state.status === "discarding" ? { type: "discard_pair", cardIds: availablePairs(temerosaOldMaidCartridge, state)[0] as [string, string] }
      : { type: "cpu_draw" };
    state = reduceOldMaid(temerosaOldMaidCartridge, state, action);
  }
  return state;
}

function autoplayCartridge(cartridge: OldMaidCartridge, seed: string, mode: OldMaidMode): OldMaidState {
  let state = createOldMaidState(cartridge, seed, `${mode}-session`);
  state = reduceOldMaid(cartridge, state, { type: "start", mode });
  state = reduceOldMaid(cartridge, state, { type: "finish_deal" });
  for (let step = 0; state.status !== "complete" && step < 2_000; step += 1) {
    const action: OldMaidAction = state.status === "revealing" ? { type: "collect_draw" }
      : state.status === "discarding" ? { type: "discard_pair", cardIds: availablePairs(cartridge, state)[0] as [string, string] }
      : mode === "play" && state.currentPlayerId === "player" ? { type: "draw", index: 0 } : { type: "cpu_draw" };
    state = reduceOldMaid(cartridge, state, action);
  }
  return state;
}

describe("old maid deterministic engine", () => {
  it("reorders only the player hand without consuming a turn and caps it at three", () => {
    let state: OldMaidState = { ...createOldMaidState(temerosaOldMaidCartridge, "reorder"), status: "playing", currentPlayerId: "player" };
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
    let state = createOldMaidState(temerosaOldMaidCartridge, "deal-phase", "test-session");
    expect(state.dealOrder).toHaveLength(25);
    expect(new Set(Object.values(state.characters)).size).toBe(3);
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start" });
    expect(state.status).toBe("dealing");
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "finish_deal" });
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
    expect(cartridge.version).toBe("temerosa-old-maid/0.7");
    expect(cartridge.dealPairCount).toBe(18);
    expect(cartridge.selectableCharacterIds).toContain("fixture-main");
    expect(cartridge.selectableCharacterIds).not.toContain("bacikal");
    expect(cartridge.characters.find(({ id }) => id === "nemo")?.appearanceSet).toBe("nemo-magical-girl");
    expect(cartridge.faces.some(({ assetId }) => assetId === "card-fixture-main-surprised")).toBe(true);
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
