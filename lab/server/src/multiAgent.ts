/**
 * multiAgent — the CODED Maverick coordinator for the multi-agent panels (P2
 * keyword, P4 neural). Maverick is NOT an Agent Studio agent; it is deterministic,
 * testable code that:
 *   1. EXTRACT  — LLM call: question → { entities, intent, ambiguous }
 *   2. ROUTE    — pure: routeSpecialists({entities,intent}) → specialist id set
 *   3. FAN-OUT  — run the chosen specialist Agent Studio agents IN PARALLEL,
 *                 each given buildRetrievalQuery(question, mode) (bare concept term
 *                 on keyword; natural-language on neural)
 *   4. SYNTHESIZE — LLM call: merge the specialist returns into ONE grounded answer
 *   5. FOLLOW-UP  — LLM call: the shared follow-up block (fairness invariant)
 *
 * ALL LLM calls use the SAME pinned {provider, model} as every panel agent (the
 * coordinator must NOT use a stronger model — FAIRNESS INVARIANT). The prompt
 * templates live in scripts/setup/maverick_prompts.md; the operative text is
 * inlined here (consumed verbatim) so the coordinator is self-contained.
 */
import type { LlmComplete } from "@lab/judge";
import type { AgentRunner } from "./agentRunner.js";
import type { PanelSource, Retrieval } from "./panels.js";
import { mapWithConcurrency } from "./concurrency.js";

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
// 3-5. orchestrate — fan-out + synthesize + follow-up
// ---------------------------------------------------------------------------

/** The Agent Studio agent id per specialist (for the active retrieval mode). */
export type SpecialistAgentMap = Record<SpecialistName, string>;

/** One specialist's return as merged by the coordinator. */
interface SpecialistReturn {
  name: SpecialistName;
  fired: boolean;
  answer: string;
  sources: PanelSource[];
  hits: number;
}

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

export interface OrchestrationResult {
  answer: string;
  sources: PanelSource[];
  followUp: string;
  trace: OrchestrationTrace;
}

export interface OrchestrateOptions {
  readonly mode: Retrieval;
  readonly specialistAgents: SpecialistAgentMap;
  readonly llm: LlmComplete;
  readonly runAgent: AgentRunner;
  /** Optional prior turns for a follow-up turn. */
  readonly history?: { role: "user" | "assistant"; content: string }[];
  /** Max specialists run concurrently. Default 4 (all of them). */
  readonly concurrency?: number;
}

/** SYNTHESIZE system prompt (verbatim from maverick_prompts.md Prompt 2). */
export const SYNTHESIZE_SYSTEM = `You are Maverick, the coordinator of a multi-agent Algolia answer system. Several specialist
agents have each searched their own slice of Algolia's content and returned grounded results.
Your job is to merge their results into ONE excellent answer for the user. You speak as Algolia,
never about "the docs" or "the website".

## GROUNDING (ABSOLUTE)
You may state ONLY what the specialists actually retrieved and reported below. The specialist
results are your ONLY source of truth.
1. Every factual claim must be supported by a specialist's retrieved hit. No prior knowledge,
   no training data, ever — about Algolia or anything else. NEVER assert anything beyond what
   the specialists retrieved.
2. Your OPENING sentence is a factual claim too — it must trace to a retrieved hit, not a
   from-memory definition. If the specialists give specifics but no clean headline definition,
   lead with the specific sourced facts you have.
3. Never invent or guess: features, limits, customer names, metrics, percentages, quotes, or
   URLs. Output a URL only if it appears verbatim in a specialist's source.
4. Grounded synthesis, not invention: organize, connect, de-duplicate, and reconcile across the
   specialists into the most complete answer their combined evidence supports — but add NO
   insight, tradeoffs, "best practices," or architecture commentary they did not provide.
5. Partial coverage → answer the supported part fully, then plainly name what no specialist
   found ("I don't have anything in Algolia's content on X"). Never paper over a gap.
6. If NO specialist returned relevant grounded content (all empty / low confidence), do NOT
   answer from memory. Emit exactly this refusal+route line and nothing else as the answer body:
   > I don't have anything in Algolia's content that answers that. You might find what you need in our [docs](https://www.algolia.com/doc) or [support articles](https://support.algolia.com/hc/en-us/search).
   Refusing and routing to official Algolia help is the CORRECT outcome here, not a failure.
7. When unsure whether a detail is grounded, leave it out.

## MERGE RULES
- Combine overlapping specialist findings into one coherent answer; do not just concatenate.
- De-duplicate sources: if two specialists cite the same url, keep one entry.
- When specialists conflict, prefer the one whose retrieved hit is most directly on-point and
  say so plainly; never silently pick or average.
- Attribute nothing to a specialist that it did not return.

## ANSWER SHAPE — layered teaching
1. Direct answer first (1–2 sentences) — built from the specialists' hits, not from memory.
2. The explanation, layered: what it is → how it works → the specifics/caveats that matter.
   Use \`##\`/\`###\` headings and tight bullet/numbered lists; each layer builds on the last.
3. Precision without fluff: every sentence earns its place; include the specific parameters,
   settings, names, and numbers the hits provide.
4. Cite cleanly in context: concise inline markdown links whose anchor text is the page/topic
   name, e.g. \`[Query Suggestions](real-source-url)\`, placed where the claim is made. NEVER paste
   a bare/raw URL into the prose, and never dump links at the end. Use only the specialists'
   real source URLs as link targets.

Quality floor: at least as complete, well-structured, and well-cited as Algolia's Ask AI — and
easier to follow.

## VOICE
Core is crisp and authoritative; no jokes inside a technical claim. Warmth lives in the framing
(opening, transitions). Adapt to persona: developer → technical/structured; business/buyer →
outcome-focused/concise. Never at grounding's expense.

Do NOT write the follow-up question in this step — that is produced separately.`;

/** FOLLOW-UP system prompt (verbatim from maverick_prompts.md Prompt 3 / shared block). */
export const FOLLOWUP_SYSTEM = `You just answered an Algolia question. Now produce the follow-up per this exact rule:

After answering, propose exactly ONE logical, on-topic follow-up question. If the original request was ambiguous, make it a CLARIFYING question; if it was clear, make it a DEEPENING/next-step question. Stay strictly on-domain; never ask an off-topic question. Output it as a single sentence.

Return ONLY the single follow-up sentence, nothing else.`;

/** De-dupe sources by label/url (code guard, independent of the LLM). Pure. */
function dedupeSources(all: PanelSource[]): PanelSource[] {
  const seen = new Set<string>();
  const out: PanelSource[] = [];
  for (const s of all) {
    const key = (s.label ?? s.text).toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, id: `S${out.length + 1}` });
  }
  return out;
}

/**
 * Run the full Maverick coordination for one question. ALL LLM calls use the
 * injected (pinned) llm; specialist agents run via the injected runAgent. No
 * network is hard-wired — answer.ts binds the real seams.
 */
export async function orchestrate(
  question: string,
  opts: OrchestrateOptions,
): Promise<OrchestrationResult> {
  const { mode, specialistAgents, llm, runAgent } = opts;

  // 1. EXTRACT.
  const route = await extractRouteInput(question, llm);

  // 2. ROUTE (pure).
  const fired = routeSpecialists(route);

  // 3. FAN-OUT — run the chosen specialists in PARALLEL with the mode's query.
  const query = buildRetrievalQuery(question, mode);
  const concurrency = opts.concurrency ?? SPECIALIST_NAMES.length;
  const returns = await mapWithConcurrency(
    fired,
    concurrency,
    async (name): Promise<SpecialistReturn> => {
      const agentId = specialistAgents[name];
      const res = await runAgent(agentId, query, opts.history);
      return {
        name,
        fired: true,
        answer: res.answer,
        sources: res.sources,
        hits: res.sources.length,
      };
    },
  );

  // Trace covers ALL specialists (fired or not) for the UI orchestration view.
  const firedByName = new Map(returns.map((r) => [r.name, r]));
  const traceSpecialists: OrchestrationTraceSpecialist[] = SPECIALIST_NAMES.map((name) => {
    const r = firedByName.get(name);
    return { name, fired: Boolean(r), hits: r?.hits ?? 0 };
  });

  // 4. SYNTHESIZE — merge specialist returns into ONE grounded answer.
  const t0 = Date.now();
  const specialistResultsJson = JSON.stringify(
    returns.map((r) => ({
      name: r.name,
      answer: r.answer,
      sources: r.sources.map((s) => ({ title: s.label, url: s.label, text: s.text })),
      confidence: r.hits > 0 ? "high" : "low",
    })),
    null,
    2,
  );
  const answer = (
    await llm(
      `Question: ${question}\n\nSpecialist results (your ONLY source of truth):\n${specialistResultsJson}`,
      { system: SYNTHESIZE_SYSTEM, temperature: 0, tag: "maverick:synthesize" },
    )
  ).trim();
  const synthesisMs = Date.now() - t0;

  // Sources = code-deduped union of what the specialists actually returned (a
  // guard so the answer's citations can only be ones a specialist retrieved).
  const sources = dedupeSources(returns.flatMap((r) => r.sources));

  // 5. FOLLOW-UP — the shared block (fairness invariant).
  const followUp = (
    await llm(
      `Original question: ${question}\nYour answer (for context): ${answer}\nOriginal request was ambiguous: ${route.ambiguous}`,
      { system: FOLLOWUP_SYSTEM, temperature: 0, tag: "maverick:followup" },
    )
  ).trim();

  return {
    answer,
    sources,
    followUp,
    trace: {
      entities: route.entities,
      intent: route.intent,
      ambiguous: Boolean(route.ambiguous),
      specialists: traceSpecialists,
      synthesisMs,
    },
  };
}
