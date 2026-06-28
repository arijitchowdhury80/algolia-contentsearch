/**
 * classifier — the source router for the routing spike.
 *
 *  - routeBySource: Panel B (ORACLE) — pure passthrough of the hand-label, no LLM.
 *  - makeSourceClassifier: Panel C (REAL) — an LLM picks one of the 4 content
 *    specialists from the question alone (mirrors baton.ts's one-word-reply seam).
 *  - parseSourceVerdict: the pure, unit-tested label extractor (the LLM is injected,
 *    so the only thing to test is "given messy model text, which label").
 *
 * Safe default = "technical": the broadest content specialist (docs+developers+
 * customer stories), so a misparse degrades gracefully rather than refusing.
 */
import type { LlmComplete } from "@lab/judge";
import type { SourceLabel, QuestionLabel } from "./labels.js";

/** Panel B oracle: route to the specialist named by the hand-label. Pure. */
export function routeBySource(label: QuestionLabel): SourceLabel {
  return label.sourceLabel;
}

/**
 * Extract one SourceLabel from arbitrary model text. Pure. Specific/rarer domains
 * (support, academy) are checked before the broad ones, so "technical support
 * issue" resolves to support; unknown text defaults to technical.
 */
export function parseSourceVerdict(raw: string): SourceLabel {
  const s = (raw || "").toLowerCase();
  if (/\bsupport\b/.test(s)) return "support";
  if (/\bacademy\b/.test(s)) return "academy";
  if (/\bmarketer\b/.test(s) || /\bmarketing\b/.test(s)) return "marketer";
  if (/\btechnical\b/.test(s) || /\btech\b/.test(s)) return "technical";
  return "technical"; // safe default
}

const CLASSIFIER_PROMPT = (question: string): string =>
  `You route a user question to ONE Algolia content specialist. Reply with EXACTLY one word: support, academy, technical, or marketer.\n` +
  `- support: troubleshooting, errors, account/billing, "it's broken / not working".\n` +
  `- academy: learning from scratch, courses, guided paths, tutorials.\n` +
  `- technical: docs, API, configuration, how-to implementation, feature comparisons.\n` +
  `- marketer: positioning, business value, pricing context, customer stories, "why Algolia / is it worth it".\n` +
  `QUESTION: ${question}\n` +
  `One word:`;

/** Panel C real router: ask the injected LLM, parse to one label, default-safe. */
export function makeSourceClassifier(
  llm: LlmComplete,
): (question: string) => Promise<SourceLabel> {
  return async (question: string): Promise<SourceLabel> => {
    try {
      const ans = await llm(CLASSIFIER_PROMPT(question), {
        temperature: 0,
        tag: "source-classifier",
      });
      return parseSourceVerdict(ans);
    } catch {
      return "technical"; // safe default (mirrors baton.ts)
    }
  };
}
