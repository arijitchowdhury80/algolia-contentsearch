/**
 * multiAgent — pure extraction/routing helpers and shared prompt constants.
 * The fan-out orchestration (steps 3-5) has been retired in favour of
 * RC2-shape single-specialist orchestration in orchestrate.ts.
 *
 * Still exported:
 *   - buildRetrievalQuery (keyword de-padding vs neural pass-through)
 *   - routeSpecialists, extractRouteInput, EXTRACT_SYSTEM (pure routing logic)
 *   - FOLLOWUP_SYSTEM (shared follow-up prompt constant)
 *   - OrchestrationTrace, OrchestrationTraceSpecialist (trace shape for UI)
 */
import type { LlmComplete } from "@lab/judge";
import type { Retrieval } from "./panels.js";

// ---------------------------------------------------------------------------
// 1. EXTRACT — entities/intent from the question (pure parse around one LLM call)
// ---------------------------------------------------------------------------

export interface RouteInput {
  /** Algolia concepts/features named or implied, lowercase short terms. */
  readonly entities: string[];
  /** One short intent label, e.g. "how-to-config", "troubleshoot", "learn". */
  readonly intent: string;
  /** Under-specified question → a clarifying follow-up is appropriate later. */
  readonly ambiguous?: boolean;
}

export type SpecialistName = "technical" | "marketer" | "academy" | "support";

export const SPECIALIST_NAMES: readonly SpecialistName[] = [
  "technical",
  "marketer",
  "academy",
  "support",
];

/** EXTRACT prompt (verbatim from maverick_prompts.md Prompt 1). */
export const EXTRACT_SYSTEM = `You are the routing brain of a multi-agent Algolia answer system. You do NOT answer the
question and you do NOT use any knowledge about Algolia — you ONLY analyze the user's
question to decide which specialists should search. Never invent facts; this step asserts
nothing about Algolia.

The four specialists and their content slices are:
- technical : Documentation, Developers, Customer Stories  (how-to-config, API/SDK, integration, implementation evidence)
- marketer  : Website, Blog, Resources, Other              (positioning, use cases, value, outcomes)
- academy   : Academy                                       (structured learning, courses, guided paths)
- support   : Support                                       (troubleshooting, errors, account/billing help, "how do I fix")

From the user's question, extract:
- entities: the specific Algolia concepts/features/products named or clearly implied (1–5 short terms, lowercase, e.g. "typo tolerance", "vector search", "pricing").
- intent: one short label for what the user wants (e.g. "how-to-config", "what-is", "troubleshoot", "compare-use-cases", "learn", "pricing").
- ambiguous: true if the question is under-specified (a clarifying follow-up will be needed later), else false.

Return STRICT JSON only, no prose:
{ "entities": string[], "intent": string, "ambiguous": boolean }`;

/** Extract the first {...} JSON object from possibly-noisy LLM output. Pure. */
function extractJson(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return {};
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function extractRouteInput(
  question: string,
  llm: LlmComplete,
): Promise<RouteInput> {
  const out = await llm(question, {
    system: EXTRACT_SYSTEM,
    temperature: 0,
    tag: "maverick:extract",
  });
  const j = extractJson(out);
  const entities = Array.isArray(j.entities)
    ? (j.entities as unknown[]).filter((e): e is string => typeof e === "string")
    : [];
  const intent = typeof j.intent === "string" ? j.intent : "";
  const ambiguous = j.ambiguous === true;
  return { entities, intent, ambiguous };
}

// ---------------------------------------------------------------------------
// 2. ROUTE — deterministic mapping (entities + intent) → specialist set (pure)
// ---------------------------------------------------------------------------

/**
 * Map an extracted {entities, intent} to the set of specialists to fan out to.
 * Deterministic + testable (the LLM only extracts; routing is code). Always
 * returns at least one specialist (defaults to `technical`), never duplicates.
 */
export function routeSpecialists(input: RouteInput): SpecialistName[] {
  const intent = (input.intent ?? "").toLowerCase();
  const haystack = `${intent} ${(input.entities ?? []).join(" ")}`.toLowerCase();
  const chosen = new Set<SpecialistName>();

  // Support — troubleshooting, errors, account/billing help.
  if (/troubleshoot|error|fix|broken|fail|billing|account|refund|support|help|issue/.test(haystack)) {
    chosen.add("support");
  }
  // Academy — structured learning.
  if (/learn|course|academy|tutorial|guided|training|onboarding/.test(haystack)) {
    chosen.add("academy");
  }
  // Marketer — positioning, use cases, value, outcomes.
  if (/use-?case|pricing|value|positioning|compare|outcome|benefit|why|roi|customer/.test(haystack)) {
    chosen.add("marketer");
  }
  // Technical — how-to-config, API/SDK, integration, what-is, implementation.
  if (
    /how-?to|config|api|sdk|integration|implement|what-?is|setup|install|index|search|feature/.test(
      haystack,
    )
  ) {
    chosen.add("technical");
  }

  // Always have at least one searcher; technical is the broadest default.
  if (chosen.size === 0) chosen.add("technical");

  // Stable order matching SPECIALIST_NAMES.
  return SPECIALIST_NAMES.filter((n) => chosen.has(n));
}

// ---------------------------------------------------------------------------
// query construction — keyword de-padding vs neural pass-through (pure)
// ---------------------------------------------------------------------------

/**
 * Framing/question words that poison KEYWORD ranking (data-proven 2026-06-18,
 * docs/experiment/finding-typo-tolerance-false-refusal.md). "algolia" is the
 * worst offender (it's in every doc). Stripped for keyword; kept for neural.
 */
const KEYWORD_STOPWORDS = new Set([
  "algolia",
  "how",
  "does",
  "do",
  "did",
  "what",
  "is",
  "are",
  "the",
  "a",
  "an",
  "your",
  "you",
  "user",
  "users",
  "use",
  "using",
  "used",
  "handle",
  "handles",
  "handling",
  "work",
  "works",
  "working",
  "configuration",
  "configure",
  "setup",
  "set",
  "up",
  "guide",
  "intent",
  "help",
  "i",
  "me",
  "my",
  "can",
  "to",
  "in",
  "on",
  "of",
  "for",
  "with",
  "and",
  "or",
  "add",
  "get",
  "it",
  "this",
  "that",
]);

/**
 * Build the retrieval query for a specialist/agent given the mode:
 *   - keyword: strip "algolia" + framing/stopwords → the bare concept term(s).
 *              Never produce an empty query — if everything is a stopword, fall
 *              back to the cleaned full question (NARROW, but never nothing).
 *   - neural:  pass the natural-language question through (NeuralSearch wants it).
 */
export function buildRetrievalQuery(question: string, mode: Retrieval): string {
  if (mode === "neural") {
    return question.trim();
  }
  const tokens = question
    .toLowerCase()
    .replace(/[?.,!;:"'()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept = tokens.filter((t) => !KEYWORD_STOPWORDS.has(t));
  const bare = kept.join(" ").trim();
  // Guard: never refuse-by-empty-query. Fall back to the de-punctuated question.
  return bare || tokens.join(" ").trim() || question.trim();
}

// ---------------------------------------------------------------------------
// Trace shape — kept for the UI's orchestration view
// ---------------------------------------------------------------------------

export interface OrchestrationTraceSpecialist {
  name: SpecialistName;
  fired: boolean;
  hits: number;
}

export interface OrchestrationTrace {
  entities: string[];
  intent: string;
  ambiguous: boolean;
  specialists: OrchestrationTraceSpecialist[];
  synthesisMs: number;
}

/** FOLLOW-UP system prompt (verbatim from maverick_prompts.md Prompt 3 / shared block). */
export const FOLLOWUP_SYSTEM = `You just answered an Algolia question. Now produce the follow-up per this exact rule:

After answering, propose exactly ONE logical, on-topic follow-up question. If the original request was ambiguous, make it a CLARIFYING question; if it was clear, make it a DEEPENING/next-step question. Stay strictly on-domain; never ask an off-topic question. Output it as a single sentence.

Return ONLY the single follow-up sentence, nothing else.`;

