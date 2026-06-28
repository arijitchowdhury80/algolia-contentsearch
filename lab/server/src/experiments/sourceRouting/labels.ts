/**
 * labels — the ORACLE hand-labels for the content-source routing spike.
 *
 * Sidecar to the LOCKED v3 question set (docs/experiment/test-questions-locked-v3.md):
 * we do NOT edit the locked markdown (that would bump its version and break score
 * comparability), so the per-question source label lives here, keyed by the locked id.
 * The labels are transcribed from the v3 category notes, which already name the
 * source intent per question (Cat 4/5 [M] notes name the spanned domains, Cat 7 = bait).
 *
 * `sourceLabel` = which content specialist Panel B (oracle) routes the question to,
 * and the ground truth Panel C's real classifier is scored against (routedCorrect).
 * `span: true` marks questions that legitimately need 2+ sources — the "oracle" is a
 * judgment call there, so the report splits clean-vs-span (see routingAgg).
 */
import type { TestQuestion } from "../../questions.js";
import { EXTRA_QUESTIONS } from "./extraQuestions.js";

export type SourceLabel = "support" | "academy" | "technical" | "marketer";

export const SOURCE_LABELS: readonly SourceLabel[] = [
  "support",
  "academy",
  "technical",
  "marketer",
];

export interface QuestionLabel {
  /** The specialist Panel B routes to / the ground truth for Panel C's router. */
  readonly sourceLabel: SourceLabel;
  /** Coarse intent (diagnostic only — does not drive routing). */
  readonly intent: string;
  /** True = legitimately spans 2+ sources; the oracle label is the PRIMARY domain. */
  readonly span?: boolean;
}

/** SourceLabel → the env var holding that specialist's Agent Studio id (confirmed names). */
export const SPECIALIST_AGENT_ENV: Record<SourceLabel, string> = {
  support: "ALGOLIA_AGENT_SUPPORT_NEURAL_ID",
  academy: "ALGOLIA_AGENT_ACADEMY_NEURAL_ID",
  technical: "ALGOLIA_AGENT_TECH_NEURAL_ID", // TECH, not TECHNICAL (create_central_agents.mjs)
  marketer: "ALGOLIA_AGENT_MARKETER_NEURAL_ID",
};

/**
 * SourceLabel → the live Agent Studio agent NAME. The specialists are published on
 * the CENTRAL app but their ids are NOT in .env.local (stale), so the harness
 * resolves ids by name from the live /agent-studio/1/agents list — no env, no
 * agent creation. (`tech`, not `technical`, is the live name.)
 */
export const SPECIALIST_AGENT_NAME: Record<SourceLabel, string> = {
  support: "ac2-support-neural",
  academy: "ac2-academy-neural",
  technical: "ac2-tech-neural",
  marketer: "ac2-marketer-neural",
};

/**
 * Oracle labels for the 32 locked v3 questions + the 6 span/ambiguous stress
 * questions (S1–S6, defined in extraQuestions.ts). For [M]/compound/ambiguous
 * items the label is the PRIMARY domain and `span:true`.
 */
export const LABELS: Record<string, QuestionLabel> = {
  // Cat 1 — factual lookup (ranking/distinct/removeWords/personalization) → docs
  "1.1": { sourceLabel: "technical", intent: "factual" },
  "1.2": { sourceLabel: "technical", intent: "factual" },
  "1.3": { sourceLabel: "technical", intent: "factual" },
  "1.4": { sourceLabel: "technical", intent: "factual" },
  // Cat 2 — how-to / implementation → docs/developers
  "2.1": { sourceLabel: "technical", intent: "implementation" },
  "2.2": { sourceLabel: "technical", intent: "implementation" },
  "2.3": { sourceLabel: "technical", intent: "implementation" },
  "2.4": { sourceLabel: "technical", intent: "implementation" },
  // Cat 3 — conceptual [N] (instant/discovery/beyond-keyword/tie-break) — span-ish
  "3.1": { sourceLabel: "technical", intent: "conceptual", span: true },
  "3.2": { sourceLabel: "marketer", intent: "conceptual", span: true },
  "3.3": { sourceLabel: "marketer", intent: "conceptual", span: true },
  "3.4": { sourceLabel: "technical", intent: "conceptual", span: true },
  // Cat 4 — cross-source synthesis [M] → span
  "4.1": { sourceLabel: "technical", intent: "migration", span: true }, // ES→Algolia migration docs
  "4.2": { sourceLabel: "marketer", intent: "value", span: true }, // retail implementation = stories/positioning
  "4.3": { sourceLabel: "support", intent: "troubleshoot", span: true }, // diagnose bad relevance
  // Cat 5 — compound [N][M] → span
  "5.1": { sourceLabel: "marketer", intent: "value", span: true }, // revenue from search
  "5.2": { sourceLabel: "technical", intent: "implementation", span: true }, // devs building AI search
  "5.3": { sourceLabel: "marketer", intent: "value", span: true }, // content vs catalog
  // Cat 6 — comparison / tradeoff → docs
  "6.1": { sourceLabel: "technical", intent: "comparison" },
  "6.2": { sourceLabel: "technical", intent: "comparison" },
  "6.3": { sourceLabel: "technical", intent: "comparison" },
  // Cat 7 — out-of-scope bait (label = the PLAUSIBLE domain a leaky agent would pick)
  "7.1": { sourceLabel: "technical", intent: "bait" }, // capital of France (pure control)
  "7.2": { sourceLabel: "technical", intent: "bait" }, // Elasticsearch percolator (competitor)
  "7.3": { sourceLabel: "technical", intent: "bait" }, // k8s autoscaling (adjacent-tech)
  "7.4": { sourceLabel: "marketer", intent: "bait" }, // exact pricing (gated)
  "7.5": { sourceLabel: "marketer", intent: "bait" }, // fabricated Lacoste metric (stories)
  // Cat 8 — multi-turn openers
  "8.1": { sourceLabel: "technical", intent: "factual" }, // typo tolerance
  "8.2": { sourceLabel: "technical", intent: "factual" }, // what is Recommend
  "8.3": { sourceLabel: "technical", intent: "factual" }, // synonyms
  "8.4": { sourceLabel: "technical", intent: "ambiguous", span: true }, // "set up search"
  "8.5": { sourceLabel: "support", intent: "troubleshoot", span: true }, // "results aren't good"
  "8.6": { sourceLabel: "marketer", intent: "ambiguous", span: true }, // "handle my catalog"
};

// Merge the S1–S6 span/ambiguous stress labels (carried on each extra question)
// so every routed question — locked or extra — resolves through one LABELS map.
for (const q of EXTRA_QUESTIONS as (TestQuestion & { label: QuestionLabel })[]) {
  LABELS[q.id] = q.label;
}
