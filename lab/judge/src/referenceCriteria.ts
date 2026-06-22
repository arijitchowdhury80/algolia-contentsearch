import type { LlmComplete } from "./types";
import type { ReferenceTurnArtifact } from "./referenceTypes";
import type { MissedClaim } from "./gapClassifier";

export type CriterionId = "coverage" | "depth" | "onPoint" | "rightExpert" | "nextQuestion";

export interface CriterionScore {
  id: CriterionId;
  pctOfGold: number;
  rationale: string;
  missedClaims?: MissedClaim[];
}

const PROMPTS: Record<CriterionId, (a: ReferenceTurnArtifact) => string> = {
  coverage: (a) => `Compare CANDIDATE to GOLD. What % of GOLD's substantive points does CANDIDATE cover? List GOLD points CANDIDATE missed.\nGOLD:\n${a.goldAnswer}\nCANDIDATE:\n${a.candidateAnswer}\nReturn JSON {"pctOfGold","rationale","missedClaims":[...]} (100=matched, >100=exceeded).`,
  depth: (a) => `Is CANDIDATE as DEEP as GOLD (specificity, mechanism, numbers)? GOLD:\n${a.goldAnswer}\nCANDIDATE:\n${a.candidateAnswer}\nReturn JSON {"pctOfGold","rationale"}.`,
  onPoint: (a) => `Did CANDIDATE use the user's stated situation as well as GOLD did?\nUSER: ${a.userInput}\nGOLD:\n${a.goldAnswer}\nCANDIDATE:\n${a.candidateAnswer}\nReturn JSON {"pctOfGold","rationale"}.`,
  rightExpert: (a) => `Does CANDIDATE deliver the deep-dive the correct expert would, matching GOLD's expert answer (judge by CONTENT, not agent name)?\nGOLD:\n${a.goldAnswer}\nCANDIDATE:\n${a.candidateAnswer}\nReturn JSON {"pctOfGold","rationale"}.`,
  nextQuestion: (a) => `Does CANDIDATE's discovery follow-up peel the onion as well as GOLD's?\nGOLD:\n${a.goldAnswer}\nCANDIDATE:\n${a.candidateAnswer}\nReturn JSON {"pctOfGold","rationale"}.`,
};

export async function scoreCriterion(id: CriterionId, art: ReferenceTurnArtifact, llm: LlmComplete): Promise<CriterionScore> {
  try {
    const raw = await llm(PROMPTS[id](art), { temperature: 0, tag: `crit:${id}` });
    const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return {
      id,
      pctOfGold: typeof j.pctOfGold === "number" ? j.pctOfGold : 0,
      rationale: j.rationale ?? "",
      missedClaims: Array.isArray(j.missedClaims) ? j.missedClaims.map((c: string) => ({ claim: c, gap: "retrieval-gap" as const })) : undefined,
    };
  } catch {
    return { id, pctOfGold: 0, rationale: "judge parse/Unknown — insufficient evidence" }; // "Unknown" out (spec §3.4)
  }
}

export function aggregatePctOfFloor(
  scores: CriterionScore[],
  grounded: boolean,
  voiceCompliant: boolean,
): { pctOfFloor: number; gated: boolean } {
  if (!grounded) return { pctOfFloor: 0, gated: true }; // hard floor
  const base = scores.length ? scores.reduce((s, c) => s + c.pctOfGold, 0) / scores.length : 0;
  // voice is a code-gate; a non-compliant voice applies a light penalty (kept simple per ADR-2b default)
  const pct = voiceCompliant ? base : base * 0.9;
  return { pctOfFloor: Math.round(pct), gated: false };
}
