import { orchestrateEngagement, type OrchestrateDeps, type EngagementTurnResult } from "../orchestrate";
import { emptyDossier, type Dossier } from "../discovery";
import type { GoldEngagement, GoldTurnRecord } from "./goldLoader";

export interface ReplayedTurn {
  turnIndex: number; userInput: string; gold: GoldTurnRecord; candidate: EngagementTurnResult;
}
export interface ReplayedEngagement {
  scenarioId: string; mode: "single" | "multi"; turns: ReplayedTurn[];
}

export async function replayEngagement(
  gold: GoldEngagement,
  mode: "single" | "multi",
  deps: OrchestrateDeps,
): Promise<ReplayedEngagement> {
  let dossier: Dossier = emptyDossier();
  const turns: ReplayedTurn[] = [];
  // The driving sequence is FIXED from gold (spec §2.3); AC2's own follow-up does not steer.
  for (let i = 0; i < gold.drivingSequence.length; i++) {
    const userInput = gold.drivingSequence[i];
    const candidate = await orchestrateEngagement(userInput, dossier, mode, deps);
    dossier = candidate.dossier;
    turns.push({ turnIndex: i, userInput, gold: gold.turns[i], candidate });
  }
  return { scenarioId: gold.scenarioId, mode, turns };
}
