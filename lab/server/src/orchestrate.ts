import type { LlmComplete } from "@lab/judge";
import type { AgentRunner, OnToken } from "./agentRunner.js";
import type { StreamSource } from "./streamParser.js";
import { runBrain } from "./brain.js";
import { type Dossier, accumulate } from "./discovery.js";
import { decideBaton, type SpecialistId } from "./baton.js";
import type { PersonaId } from "./charters.js";

export interface EngagementTurnResult {
  answer: string;
  sources: StreamSource[];
  persona: PersonaId;
  handoff?: { specialist: SpecialistId };
  proposedQuestion?: string;
  dossier: Dossier;
  error?: string;
}

export interface OrchestrateDeps {
  runAgent: AgentRunner;
  llm: LlmComplete;
  agentIds: Record<PersonaId, string>;
}

export async function orchestrateEngagement(
  userInput: string,
  dossier: Dossier,
  mode: "single" | "multi",
  deps: OrchestrateDeps,
  onToken?: OnToken,
): Promise<EngagementTurnResult> {
  const brain = await runBrain(userInput, dossier, deps.llm);
  const nextDossier = accumulate(
    dossier,
    { signals: pickSignals(brain), asked: brain.askedSignal as never },
    userInput,
  );

  // Maverick always answers first (value / discovery).
  const mav = await deps.runAgent(deps.agentIds.maverick, brain.expandedQuery, [], onToken);

  if (mode === "single") {
    return {
      answer: mav.answer,
      sources: mav.sources,
      persona: "maverick",
      proposedQuestion: brain.proposedQuestion,
      dossier: nextDossier,
      error: mav.error,
    };
  }

  // multi: decide baton; if no handoff yet, the multi panel's answer is Maverick's (still discovering).
  const baton = await decideBaton(brain, nextDossier, deps.llm);
  if (!baton.handoff || !baton.specialist) {
    return {
      answer: mav.answer,
      sources: mav.sources,
      persona: "maverick",
      proposedQuestion: brain.proposedQuestion,
      dossier: nextDossier,
      error: mav.error,
    };
  }
  const spec = await deps.runAgent(deps.agentIds[baton.specialist], brain.expandedQuery, [], onToken);
  return {
    answer: spec.answer,
    sources: spec.sources,
    persona: baton.specialist,
    handoff: { specialist: baton.specialist },
    proposedQuestion: brain.proposedQuestion,
    dossier: nextDossier,
    error: spec.error,
  };
}

function pickSignals(brain: { entities: { industry?: string; product?: string } }) {
  const s: Record<string, string> = {};
  if (brain.entities.industry) s.industry = brain.entities.industry;
  if (brain.entities.product) s.product = brain.entities.product;
  return s;
}
