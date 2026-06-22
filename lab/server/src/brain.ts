import type { LlmComplete } from "@lab/judge";
import type { Dossier } from "./discovery.js";

export interface BrainOutput {
  intent: string;
  entities: { brand?: string; industry?: string; product?: string; concepts?: string[] };
  expandedQuery: string;
  proposedQuestion?: string;
  askedSignal?: string;
}

export const BRAIN_SYSTEM = `You extract structured signals from one user turn in a sales-discovery conversation about Algolia.
Return ONLY JSON: {intent, entities:{brand,industry,product,concepts[]}, expandedQuery, proposedQuestion, askedSignal}.
- intent: one of "discovery","implementation","architecture","value".
- expandedQuery: a neural-search-friendly rephrasing of what to retrieve.
- proposedQuestion: the single best next discovery question (Onion Protocol) given what is still unknown; omit if already well-qualified.
- askedSignal: which onion signal that question targets (stack|scale|role|pain|industry|product|feature|solution).`;

export function parseBrain(raw: string): BrainOutput {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON in brain output");
  const j = JSON.parse(match[0]);
  return {
    intent: j.intent ?? "unknown",
    entities: j.entities ?? {},
    expandedQuery: j.expandedQuery ?? "",
    proposedQuestion: j.proposedQuestion,
    askedSignal: j.askedSignal,
  };
}

export async function runBrain(userInput: string, dossier: Dossier, llm: LlmComplete): Promise<BrainOutput> {
  try {
    const prompt = `${BRAIN_SYSTEM}\n\nKNOWN SO FAR: ${JSON.stringify(dossier.signals)}\nUSER TURN: ${userInput}`;
    const raw = await llm(prompt, { temperature: 0, tag: "brain" });
    const out = parseBrain(raw);
    if (!out.expandedQuery) out.expandedQuery = userInput; // never retrieve on empty
    return out;
  } catch {
    return { intent: "unknown", entities: {}, expandedQuery: userInput }; // spec §8 fallback
  }
}
