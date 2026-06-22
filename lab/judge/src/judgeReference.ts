import type { LlmComplete } from "./types";
import type { ReferenceTurnArtifact } from "./referenceTypes";
import { checkGrounding } from "./grounding";
import { validateVoice, type VoiceResult } from "./voice";
import { classifyGaps, type MissedClaim } from "./gapClassifier";
import { scoreCriterion, aggregatePctOfFloor, type CriterionScore, type CriterionId } from "./referenceCriteria";

export interface TurnVerdict {
  pctOfFloor: number;
  gated: boolean;
  grounded: boolean;
  voice: VoiceResult;
  criteria: CriterionScore[];
  missedClaims: MissedClaim[];
}

export async function judgeEngagementTurn(
  art: ReferenceTurnArtifact,
  persona: "maverick" | "elena" | "bruno",
  llm: LlmComplete,
): Promise<TurnVerdict> {
  // discovery turns judge the next-question; deepdive turns judge the expert match
  const critIds: CriterionId[] = art.turnRole === "deepdive"
    ? ["coverage", "depth", "onPoint", "rightExpert"]
    : ["coverage", "depth", "onPoint", "nextQuestion"];

  const [grounding, ...criteria] = await Promise.all([
    checkGrounding(art.candidateAnswer, art.candidateSources, llm),
    ...critIds.map((id) => scoreCriterion(id, art, llm)),
  ]);

  const voice = validateVoice(persona, art.candidateAnswer, { substantive: art.candidateAnswer.trim().split(/\s+/).length >= 30 });

  // §3.5: tag coverage's missed claims by gap kind
  const rawMissed = criteria.find((c) => c.id === "coverage")?.missedClaims?.map((m) => m.claim) ?? [];
  const missedClaims = await classifyGaps(rawMissed, art.candidateSources, llm);

  const agg = aggregatePctOfFloor(criteria, grounding.grounded, voice.compliant);
  return {
    pctOfFloor: agg.pctOfFloor,
    gated: agg.gated,
    grounded: grounding.grounded,
    voice,
    criteria,
    missedClaims,
  };
}
