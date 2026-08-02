import { CASINO_SPECTATOR_PRICING_VERSION, CASINO_SPECTATOR_TARGET_RETURN_BPS, TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES, legacyCabinetNpcId, type CasinoSpectatorMarket, type NpcGamblingProfile } from "@lucky-arcade/casino-ledger";
import { CASINO_MARKET_QUOTE_CONTRACT, type CasinoMarketQuote } from "@lucky-arcade/engine";
import { createIndianPokerSpectatorReplay, createTemerosaIndianPokerCartridge, type IndianPokerCharacter, type IndianPokerSpectatorReplay } from "@lucky-arcade/indian-poker";
import { createFiveCardDrawSpectatorReplay, type FiveCardDrawOpponent, type FiveCardDrawSpectatorReplay } from "@lucky-arcade/five-card-draw";
import { createMatchPairsSpectatorReplay, type MatchPairsFace, type MatchPairsOpponent, type MatchPairsSpectatorReplay } from "@lucky-arcade/match-pairs";
import { createOldMaidSpectatorReplay, createTemerosaCasinoOldMaidCartridge, type OldMaidBehaviorLevel, type OldMaidCartridge, type OldMaidSpectatorReplay } from "@lucky-arcade/old-maid";
import { createTemerosaSeriesMatchPairsOpponents } from "../features/match-pairs/temerosa-match-pairs-opponents.ts";
import { loadTemerosaSeriesGameRoster, seriesGameAssetMap, type SeriesGameNpcPresentation } from "./temerosa-series-game-roster.ts";
import { TEMEROSA_MATCH_PAIRS_FACES, TEMEROSA_MATCH_PAIRS_PACK_VERSION } from "../features/match-pairs/temerosa-match-pairs-selection.ts";
import { loadTemerosaCasinoAssets, resolveTemerosaSeriesNpcPortrait } from "./temerosa-content.ts";

export const SIDE_MARKET_REPLAY_CONTRACT = "casino-side-market-replay/0.2" as const;
export const SIDE_MARKET_NATIVE_TABLE_IDS = Object.freeze(["temerosa-match-pairs", "temerosa-old-maid", "indian-poker", "temerosa-five-card-draw"] as const);

export function supportsNativeSideMarketExperience(tableId: string): tableId is typeof SIDE_MARKET_NATIVE_TABLE_IDS[number] {
  return SIDE_MARKET_NATIVE_TABLE_IDS.some((candidate) => candidate === tableId);
}

interface SideMarketReplayBase {
  readonly contract: typeof SIDE_MARKET_REPLAY_CONTRACT;
  readonly marketId: string;
  readonly seed: string;
  readonly winningOutcomeId: string;
  readonly resultHash: string;
  readonly assets: Readonly<Record<string, string>>;
}

export interface MatchPairsSideMarketReplay extends SideMarketReplayBase {
  readonly kind: "match-pairs";
  readonly game: MatchPairsSpectatorReplay;
  readonly faces: readonly MatchPairsFace[];
  readonly opponents: readonly MatchPairsOpponent[];
}

export interface OldMaidSideMarketReplay extends SideMarketReplayBase {
  readonly kind: "old-maid";
  readonly game: OldMaidSpectatorReplay;
  readonly cartridge: OldMaidCartridge;
}

export interface IndianPokerSideMarketReplay extends SideMarketReplayBase {
  readonly kind: "indian-poker";
  readonly game: IndianPokerSpectatorReplay;
  readonly cartridge: ReturnType<typeof createTemerosaIndianPokerCartridge>;
  readonly participantCharacters: readonly [IndianPokerCharacter, IndianPokerCharacter];
}

export interface FiveCardDrawSideMarketReplay extends SideMarketReplayBase {
  readonly kind: "five-card-draw";
  readonly game: FiveCardDrawSpectatorReplay;
  readonly participants: readonly FiveCardDrawOpponent[];
  readonly participantPortraits: Readonly<Record<string, Readonly<Record<"confident" | "neutral" | "uneasy", string>>>>;
}

export type CasinoSideMarketReplay = MatchPairsSideMarketReplay | OldMaidSideMarketReplay | IndianPokerSideMarketReplay | FiveCardDrawSideMarketReplay;

const replayPromises = new Map<string, Promise<CasinoSideMarketReplay>>();
const offerPromises = new Map<string, Promise<CasinoSpectatorMarket>>();
const probabilityPromises = new Map<string, Promise<readonly number[]>>();
const PRICING_SAMPLES = 512;
const POKER_PRICING_SAMPLES = 192;
const HOUSE_RISK_LIMIT = 5_000;

/** Loads only audited local content and computes the canonical cabinet replay. */
export function resolveCasinoSideMarketReplay(market: CasinoSpectatorMarket): Promise<CasinoSideMarketReplay> {
  const existing = replayPromises.get(market.marketId);
  if (existing) return existing;
  const promise = buildReplay(market).catch((error: unknown) => { replayPromises.delete(market.marketId); throw error; });
  replayPromises.set(market.marketId, promise);
  return promise;
}

/** Reprices an exact matchup with the same cabinet CPUs used by its replay. */
export function resolveCasinoSideMarketOffer(market: CasinoSpectatorMarket): Promise<CasinoSpectatorMarket> {
  const offerKey = `${market.marketId}:${market.phase}`;
  const existing = offerPromises.get(offerKey);
  if (existing) return existing;
  let pricing = probabilityPromises.get(market.marketId);
  if (!pricing) {
    pricing = priceActualOutcomes(market).catch((error: unknown) => { probabilityPromises.delete(market.marketId); throw error; });
    probabilityPromises.set(market.marketId, pricing);
  }
  const promise = Promise.all([resolveCasinoSideMarketReplay(market), pricing]).then(([replay, probabilities]) => {
    const outcomes = market.outcomes.map((outcome, index) => {
      const probabilityBps = probabilities[index]!;
      const payoutBps = Math.floor(CASINO_SPECTATOR_TARGET_RETURN_BPS * 10_000 / probabilityBps);
      const maxExposure = Math.min(1_000, Math.max(10, Math.floor(HOUSE_RISK_LIMIT * 10_000 / Math.max(1, payoutBps - 10_000))));
      const quote: CasinoMarketQuote = Object.freeze({ contract: CASINO_MARKET_QUOTE_CONTRACT, marketId: market.marketId, outcomeId: outcome.outcomeId,
        probabilityBps, payoutBps, maxExposure, pricingVersion: CASINO_SPECTATOR_PRICING_VERSION });
      return Object.freeze({ ...outcome, quote });
    });
    return Object.freeze({ ...market, outcomes: Object.freeze(outcomes), ...(market.phase === "settled" ? { winningOutcomeId: replay.winningOutcomeId } : {}) });
  }).catch((error: unknown) => { offerPromises.delete(offerKey); throw error; });
  offerPromises.set(offerKey, promise);
  return promise;
}

async function buildReplay(market: CasinoSpectatorMarket): Promise<CasinoSideMarketReplay> {
  if (!market.matchId.startsWith("casino-spectator-exhibition/0.3:")) throw new Error("side_market_replay_unsupported_match");
  if (!supportsNativeSideMarketExperience(market.tableId)) throw new Error("side_market_native_experience_missing");
  const bundle = await loadTemerosaCasinoAssets();
  const fallback=Object.values(bundle.assets)[0];if(!fallback)throw new Error("side_market_portrait_fallback_missing");
  const seriesRoster=await loadTemerosaSeriesGameRoster(fallback),seriesAssets=seriesGameAssetMap(seriesRoster);
  const seed = `${SIDE_MARKET_REPLAY_CONTRACT}:${market.matchId}`;
  if (market.tableId === "temerosa-match-pairs") {
    if (market.participantIds.length !== 2) throw new Error("side_market_replay_participant_count");
    const participantIds = replayParticipantIds(market) as unknown as readonly [string, string];
    const opponents = createTemerosaSeriesMatchPairsOpponents(seriesRoster);
    const game = createMatchPairsSpectatorReplay({
      faces: TEMEROSA_MATCH_PAIRS_FACES,
      opponents,
      packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
      seed,
      sessionId: `side-market:${market.marketId}`,
      participantIds,
      difficulty: "normal",
      focus: "standard",
    });
    const winningOutcomeId=marketOutcomeId(market,participantIds,game.winningCharacterId);
    assertMarketOutcome(market,winningOutcomeId);
    return Object.freeze({ contract: SIDE_MARKET_REPLAY_CONTRACT, kind: "match-pairs", marketId: market.marketId, seed,
      winningOutcomeId, resultHash: game.resultHash, assets: Object.freeze({...bundle.assets,...seriesAssets}),
      game, faces: TEMEROSA_MATCH_PAIRS_FACES, opponents });
  }
  if (market.tableId === "indian-poker") {
    if (market.participantIds.length !== 2) throw new Error("side_market_replay_participant_count");
    const built = await buildIndianPokerParticipants(market.participantIds);
    const participantIds = market.participantIds as unknown as readonly [string, string];
    const game = createIndianPokerSpectatorReplay({ cartridge: built.cartridge, participantIds, seed, roundCount: 7 });
    const winningOutcomeId = game.winningCharacterId === "draw" ? "draw" : game.winningCharacterId;
    assertMarketOutcome(market, winningOutcomeId);
    return Object.freeze({ contract: SIDE_MARKET_REPLAY_CONTRACT, kind: "indian-poker", marketId: market.marketId, seed,
      winningOutcomeId, resultHash: game.resultHash, assets: built.assets, game, cartridge: built.cartridge,
      participantCharacters: built.characters });
  }
  if (market.tableId === "temerosa-five-card-draw") {
    if (market.participantIds.length !== 4) throw new Error("side_market_replay_participant_count");
    const built = await buildFiveCardDrawParticipants(market.participantIds);
    const game = createFiveCardDrawSpectatorReplay({ participants: built.participants, seed, targetHands: 3 });
    const winningOutcomeId = game.winningCharacterId === "draw" ? "draw" : game.winningCharacterId;
    assertMarketOutcome(market, winningOutcomeId);
    return Object.freeze({ contract: SIDE_MARKET_REPLAY_CONTRACT, kind: "five-card-draw", marketId: market.marketId, seed,
      winningOutcomeId, resultHash: game.resultHash, assets: Object.freeze({}), game, participants: built.participants,
      participantPortraits: built.portraits });
  }
  if (market.tableId !== "temerosa-old-maid") throw new Error("side_market_native_experience_missing");
  if (market.participantIds.length !== 4) throw new Error("side_market_replay_participant_count");
  const participantIds = replayParticipantIds(market) as unknown as readonly [string, string, string, string];
  const cartridge = seriesOldMaidCartridge(createTemerosaCasinoOldMaidCartridge(bundle.contentAssets),seriesRoster);
  const game = createOldMaidSpectatorReplay({ cartridge, seed, sessionId: `side-market:${market.marketId}`, participantIds });
  const winningOutcomeId=marketOutcomeId(market,participantIds,game.oddCardHolderCharacterId);
  assertMarketOutcome(market,winningOutcomeId);
  return Object.freeze({ contract: SIDE_MARKET_REPLAY_CONTRACT, kind: "old-maid", marketId: market.marketId, seed,
    winningOutcomeId, resultHash: game.resultHash, assets: Object.freeze({...bundle.assets,...seriesAssets}), game, cartridge });
}

function assertMarketOutcome(market: CasinoSpectatorMarket, winningOutcomeId: string): void {
  if (!market.outcomes.some((outcome) => outcome.outcomeId === winningOutcomeId)) throw new Error("side_market_replay_outcome_missing");
}

async function priceActualOutcomes(market: CasinoSpectatorMarket): Promise<readonly number[]> {
  const bundle = await loadTemerosaCasinoAssets();
  const fallback=Object.values(bundle.assets)[0];if(!fallback)throw new Error("side_market_portrait_fallback_missing");
  const seriesRoster=await loadTemerosaSeriesGameRoster(fallback);
  const outcomeIds = market.outcomes.map((outcome) => outcome.outcomeId);
  const counts = Object.fromEntries(outcomeIds.map((id) => [id, 1])) as Record<string, number>;
  if (market.tableId === "temerosa-match-pairs") {
    if (market.participantIds.length !== 2) throw new Error("side_market_replay_participant_count");
    const participantIds = replayParticipantIds(market) as unknown as readonly [string, string];
    const opponents = createTemerosaSeriesMatchPairsOpponents(seriesRoster);
    for (let sample = 0; sample < PRICING_SAMPLES; sample += 1) {
      const game = createMatchPairsSpectatorReplay({ faces: TEMEROSA_MATCH_PAIRS_FACES, opponents, packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
        seed: `${CASINO_SPECTATOR_PRICING_VERSION}:${market.tableId}:${participantIds.join("+")}:${sample}`, sessionId: `side-market-price:${sample}`,
        participantIds, difficulty: "normal", focus: "standard", captureFrames: false });
      counts[marketOutcomeId(market,participantIds,game.winningCharacterId)]! += 1;
    }
  } else if (market.tableId === "temerosa-old-maid") {
    if (market.participantIds.length !== 4) throw new Error("side_market_replay_participant_count");
    const participantIds = replayParticipantIds(market) as unknown as readonly [string, string, string, string];
    const cartridge = seriesOldMaidCartridge(createTemerosaCasinoOldMaidCartridge(bundle.contentAssets),seriesRoster);
    for (let sample = 0; sample < PRICING_SAMPLES; sample += 1) {
      const game = createOldMaidSpectatorReplay({ cartridge, seed: `${CASINO_SPECTATOR_PRICING_VERSION}:${market.tableId}:${participantIds.join("+")}:${sample}`,
        sessionId: `side-market-price:${sample}`, participantIds, captureFrames: false });
      counts[marketOutcomeId(market,participantIds,game.oddCardHolderCharacterId)]! += 1;
    }
  } else if (market.tableId === "indian-poker") {
    const built = await buildIndianPokerParticipants(market.participantIds);
    const participantIds = market.participantIds as unknown as readonly [string, string];
    for (let sample = 0; sample < POKER_PRICING_SAMPLES; sample += 1) {
      const game=createIndianPokerSpectatorReplay({cartridge:built.cartridge,participantIds,
        seed:`${CASINO_SPECTATOR_PRICING_VERSION}:${market.tableId}:${participantIds.join("+")}:${sample}`,roundCount:7,captureFrames:false});
      counts[game.winningCharacterId]! += 1;
    }
  } else {
    const built = await buildFiveCardDrawParticipants(market.participantIds);
    for (let sample = 0; sample < POKER_PRICING_SAMPLES; sample += 1) {
      const game=createFiveCardDrawSpectatorReplay({participants:built.participants,
        seed:`${CASINO_SPECTATOR_PRICING_VERSION}:${market.tableId}:${market.participantIds.join("+")}:${sample}`,targetHands:3,captureFrames:false});
      counts[game.winningCharacterId]! += 1;
    }
  }
  return probabilityBps(outcomeIds.map((id) => counts[id]!));
}

function probabilityBps(counts: readonly number[]): readonly number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const exact = counts.map((count) => count * 10_000 / total), output = exact.map(Math.floor);
  let remainder = 10_000 - output.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) output[order[cursor % order.length]!.index]! += 1;
  return Object.freeze(output);
}

function replayParticipantIds(market:CasinoSpectatorMarket):readonly string[]{
  return Object.freeze(market.participantIds.map((id)=>legacyCabinetNpcId(id)??id));
}

function marketOutcomeId(market:CasinoSpectatorMarket,replayIds:readonly string[],winningReplayId:string):string{
  if(winningReplayId==="draw"&&market.outcomes.some((outcome)=>outcome.outcomeId==="draw"))return "draw";
  const index=replayIds.indexOf(winningReplayId);
  if(index<0)throw new Error("side_market_replay_outcome_missing");
  return market.participantIds[index]!;
}

const flowProfiles=new Map(TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile]));

async function buildIndianPokerParticipants(ids:readonly string[]):Promise<{
  cartridge:ReturnType<typeof createTemerosaIndianPokerCartridge>;
  characters:readonly [IndianPokerCharacter,IndianPokerCharacter];
  assets:Readonly<Record<string,string>>;
}>{
  if(ids.length!==2)throw new Error("side_market_replay_participant_count");
  const assets:Record<string,string>={};
  const characters=await Promise.all(ids.map(async(id):Promise<IndianPokerCharacter>=>{
    const profile=requiredFlowProfile(id),prefix=`series:${id}`;
    const neutral=await resolveTemerosaSeriesNpcPortrait(id,{emotion:"neutral"});
    const pleased=await resolveTemerosaSeriesNpcPortrait(id,{emotion:"pleased"})??neutral;
    const tense=await resolveTemerosaSeriesNpcPortrait(id,{emotion:"tense"})??neutral;
    const despair=await resolveTemerosaSeriesNpcPortrait(id,{emotion:"despair"})??tense??neutral;
    if(neutral){assets[`${prefix}:neutral`]=neutral;assets[`${prefix}:pleased`]=pleased!;assets[`${prefix}:tense`]=tense!;assets[`${prefix}:despair`]=despair!;}
    return Object.freeze({id,name:profile.name,appearanceSet:id.split(":")[1]??"casino",tellStyle:profile.skills.pokerBluff>.65?"bluffer":profile.discipline>.7?"guarded":"open",
      portraits:{neutral:`${prefix}:neutral`,pleased:`${prefix}:pleased`,tense:`${prefix}:tense`},despairPortrait:`${prefix}:despair`,persona:indianPersona(profile)});
  }));
  const tuple=characters as unknown as readonly [IndianPokerCharacter,IndianPokerCharacter];
  return {cartridge:createTemerosaIndianPokerCartridge(tuple),characters:tuple,assets:Object.freeze(assets)};
}

async function buildFiveCardDrawParticipants(ids:readonly string[]):Promise<{
  participants:readonly FiveCardDrawOpponent[];
  portraits:Readonly<Record<string,Readonly<Record<"confident"|"neutral"|"uneasy",string>>>>;
}>{
  if(ids.length<2||ids.length>4)throw new Error("side_market_replay_participant_count");
  const portraits:Record<string,Readonly<Record<"confident"|"neutral"|"uneasy",string>>>= {};
  const participants=await Promise.all(ids.map(async(id):Promise<FiveCardDrawOpponent>=>{
    const profile=requiredFlowProfile(id),neutral=await resolveTemerosaSeriesNpcPortrait(id,{emotion:"neutral"});
    const confident=await resolveTemerosaSeriesNpcPortrait(id,{emotion:"pleased"})??neutral;
    const uneasy=await resolveTemerosaSeriesNpcPortrait(id,{emotion:"tense"})??neutral;
    if(neutral)portraits[id]=Object.freeze({neutral,confident:confident!,uneasy:uneasy!});
    return Object.freeze({id,name:profile.name,persona:drawPersona(profile)});
  }));
  return {participants:Object.freeze(participants),portraits:Object.freeze(portraits)};
}

function requiredFlowProfile(id:string):NpcGamblingProfile{
  const profile=flowProfiles.get(id);if(!profile)throw new Error(`side_market_profile_missing:${id}`);return profile;
}
function unit(value:number):number{return Math.max(0,Math.min(1,value));}
function indianPersona(profile:NpcGamblingProfile):IndianPokerCharacter["persona"]{return Object.freeze({
  aggression:unit((profile.riskAppetite+profile.winPressing)/2),bluffFrequency:unit(profile.skills.pokerBluff),
  slowPlay:unit(profile.discipline*.55),estimationNoise:unit((1-profile.skills.pokerRead)*.24),
  tellReliability:unit(.3+profile.discipline*.6),tiltResponse:unit((profile.lossChasing+profile.riskAppetite)/2),
});}
function drawPersona(profile:NpcGamblingProfile):FiveCardDrawOpponent["persona"]{return Object.freeze({
  drawActivity:unit(.25+profile.riskAppetite*.65),riskAppetite:unit(profile.riskAppetite),signalAttention:unit(profile.skills.pokerRead),
  signalTrust:unit(profile.skills.pokerRead)*1.4-.7,deceptionBias:unit(profile.skills.pokerBluff),consistency:unit(profile.discipline),
  tellStyle:profile.skills.pokerBluff>.68?"bluffer":profile.discipline>.7?"guarded":profile.riskAppetite>.7?"open":"standard",
});}

function seriesOldMaidCartridge(base:OldMaidCartridge,roster:readonly SeriesGameNpcPresentation[]):OldMaidCartridge{
  const characters=roster.map((item)=>({id:item.id,name:item.name,appearanceSet:item.id.split(":")[1]??"casino",
    tellStyle:item.profile.skills.pokerBluff>.68?"bluffer" as const:item.profile.discipline>.72?"guarded" as const:item.profile.riskAppetite>.72?"open" as const:"standard" as const,
    behavior:{reorderActivity:oldMaidLevel(item.profile.riskAppetite),jokerHonesty:oldMaidLevel(item.profile.discipline),decoyBias:oldMaidLevel(item.profile.skills.pokerBluff),
      consistency:item.profile.discipline>.72?"steady" as const:item.profile.discipline>.43?"adaptive" as const:"erratic" as const,
      positionHabit:"none" as const,signalAttention:oldMaidLevel(item.profile.skills.pokerRead),counterRead:item.profile.skills.pokerRead>.72?"suspicious" as const:item.profile.skills.pokerRead>.42?"mixed" as const:"literal" as const},
    portraits:{neutral:item.assetIds.neutral,pleased:item.assetIds.pleased,tense:item.assetIds.tense},despairPortrait:item.assetIds.despair}));
  return Object.freeze({...base,characters,selectableCharacterIds:Object.freeze(characters.map((character)=>character.id)),lines:Object.freeze([])});
}
function oldMaidLevel(value:number):OldMaidBehaviorLevel{return value>.7?"high":value>.4?"medium":"low";}
