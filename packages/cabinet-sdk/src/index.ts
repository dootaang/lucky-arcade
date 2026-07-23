import type { CabinetAssessment } from "@lucky-arcade/contracts";
import type { XorShift32 } from "@lucky-arcade/engine";

export interface CabinetManifest {
  id: string;
  version: string;
  title: string;
  description: string;
  requiredCapabilities: string[];
}

export interface CabinetDefinition<Facts, State, Action, ViewModel> {
  manifest: CabinetManifest;
  assess(facts: Facts): CabinetAssessment;
  create(facts: Facts, rng: XorShift32): State;
  reduce(state: State, action: Action, rng: XorShift32): State;
  select(state: State): ViewModel;
  migrate(savedVersion: string, savedState: unknown): State;
}
