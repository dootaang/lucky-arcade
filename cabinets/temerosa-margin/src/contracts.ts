export const TEMEROSA_MARGIN_VERSION = "temerosa-margin/0.2" as const;
export const TEMEROSA_PACK_VERSION = "0.4.0" as const;

export type CharacterId = "nieun" | "alger" | "pale" | "kano" | "nemo";
export type CompanionId = "pale" | "kano" | "nemo";
export type PlayerApproach = "reach" | "observe" | "reckon" | "ask";
export type RegistrationChoiceId = "register-sign" | "register-terms" | "register-people";
export type NavigatorStage = "unregistered" | "provisional" | "navigator";
export type BondStage = "unfamiliar" | "recognized" | "trusted" | "bonded";
export type PressureStage = "stable" | "cracked" | "near-collapse";
export type SalvageState = "complete" | "damaged" | "lost";
export type StoryFrame = "none" | "communication" | "stage";

export interface CharacterEmotionState {
  characterId: CharacterId;
  bond: BondStage;
  pressure: PressureStage;
}

export interface CompanionPact {
  companionId: CompanionId;
  conditionId: string;
  refusalRuleId: string;
  accepted: boolean;
  breached: boolean;
}

export interface EchoState {
  deaths: number;
  deadRouteCardIds: string[];
  bossVariantIds: string[];
  rememberedPromiseIds: string[];
}

export interface StoryMemory {
  playerApproach: PlayerApproach | null;
  preservedResourceId: string | null;
  lostResourceId: string | null;
  choiceIds: string[];
  lineIds: string[];
  navigatorStage: NavigatorStage;
  selectedCompanions: CompanionId[];
  companionPacts: CompanionPact[];
  nemoName: "nemo" | "bacikal" | "self" | null;
  paleBoundaryId: string | null;
  registrationChoiceId: RegistrationChoiceId | null;
  currentRouteRecordIds: string[];
  deadRouteRecordIds: string[];
  salvage: Record<string, SalvageState>;
  echo: EchoState;
  emotions: CharacterEmotionState[];
  flags: string[];
}

export interface DialogueCondition {
  sceneIds?: string[];
  companionIds?: CompanionId[];
  requiredFlags?: string[];
  forbiddenFlags?: string[];
  playerApproaches?: PlayerApproach[];
  navigatorStage?: NavigatorStage;
}

export interface DialogueLine {
  id: string;
  speakerId: CharacterId | "system" | "navigator";
  speakerName: string;
  text: string;
  assetId: string | null;
  appearanceSet: string | null;
  frame: StoryFrame;
  priority: 0 | 1 | 2 | 3;
  cooldown: number;
  oncePerRun?: boolean;
  condition: DialogueCondition;
  observationFact: string | null;
  dramaticCue: string | null;
}

export interface DialogueCue {
  intent: "scene" | "choice" | "banter" | "observation";
  sceneId: string;
  actorId?: CharacterId;
  priority: 0 | 1 | 2 | 3;
}

export interface DialogueNode {
  id: string;
  kind: "dialogue";
  scene: 0 | 1 | 2;
  title: string;
  lines: DialogueLine[];
  nextId: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
  detail: string;
}

export interface ChoiceNode {
  id: string;
  kind: "choice";
  scene: 0 | 1 | 2;
  title: string;
  prompt: string;
  options: ChoiceOption[];
  nextByChoice: Record<string, string>;
}

export interface CompanionNode {
  id: "companion-selection";
  kind: "companions";
  scene: 2;
  title: string;
}

export interface CompleteNode {
  id: "pilot-complete";
  kind: "complete";
  scene: 2;
  title: string;
}

export type StoryNode = DialogueNode | ChoiceNode | CompanionNode | CompleteNode;

export interface CompanionDefinition {
  id: CompanionId;
  name: string;
  assetId: string;
  summary: string;
  condition: string;
  refusal: string;
}

export interface TemerosaStoryContent {
  contract: "temerosa-story-content/0.1";
  version: typeof TEMEROSA_PACK_VERSION;
  startNodeId: string;
  nodes: StoryNode[];
  companions: CompanionDefinition[];
}

export interface TemerosaRunState {
  contract: "temerosa-run-state/0.1";
  version: typeof TEMEROSA_MARGIN_VERSION;
  packVersion: typeof TEMEROSA_PACK_VERSION;
  sessionId: string;
  seed: string;
  sequence: number;
  nodeId: string;
  lineIndex: number;
  memory: StoryMemory;
}

export type TemerosaAction =
  | { type: "advance" }
  | { type: "choose"; choiceId: string }
  | { type: "toggle_companion"; companionId: CompanionId }
  | { type: "confirm_companions" }
  | { type: "restart" };

export type TemerosaView =
  | { kind: "dialogue"; scene: number; title: string; line: DialogueLine; canAdvance: true; progress: number }
  | { kind: "choice"; scene: number; title: string; prompt: string; options: ChoiceOption[]; progress: number }
  | { kind: "companions"; scene: 2; title: string; companions: CompanionDefinition[]; selected: CompanionId[]; canConfirm: boolean; progress: number }
  | { kind: "complete"; scene: 2; title: string; companions: CompanionDefinition[]; memory: StoryMemory; progress: 1 };
