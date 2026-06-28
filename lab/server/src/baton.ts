import type { LlmComplete } from "@lab/judge";
import type { BrainOutput } from "./brain.js";
import { type Dossier, isQualified } from "./discovery.js";

export type SpecialistId = "elena" | "bruno";

export interface BatonDecision {
  handoff: boolean;
  specialist?: SpecialistId;
  rationale: string;
}

export function routeByIntent(intent: string): SpecialistId | undefined {
  if (intent === "implementation") return "elena";
  if (intent === "architecture") return "bruno";
  return undefined;
}

export async function decideBaton(brain: BrainOutput, dossier: Dossier, llm: LlmComplete): Promise<BatonDecision> {
  if (!isQualified(dossier)) return { handoff: false, rationale: "still in discovery; not yet qualified" };
  // deterministic first; LLM only to disambiguate when intent is unclear
  let specialist = routeByIntent(brain.intent);
  if (!specialist) {
    try {
      const ans = (await llm(
        `Pick ONE specialist for this need. Reply exactly "elena" (implementation/how-to) or "bruno" (architecture/scale/security).\nINTENT: ${brain.intent}\nQUERY: ${brain.expandedQuery}`,
        { temperature: 0, tag: "baton" },
      )).trim().toLowerCase();
      specialist = ans.includes("bruno") ? "bruno" : "elena";
    } catch {
      specialist = "elena"; // safe default
    }
  }
  return { handoff: true, specialist, rationale: `qualified; routed to ${specialist}` };
}
