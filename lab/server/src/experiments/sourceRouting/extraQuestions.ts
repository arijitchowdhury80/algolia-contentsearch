/**
 * extraQuestions — 6 span/ambiguous STRESS questions (S1–S6) for the routing spike.
 *
 * The locked v3 set is light on clean single-domain Support/Academy questions and on
 * cross-domain traps, so the router (Panel C) is under-stressed by v3 alone. These add:
 *  - a clean Academy question (v3 has none) so the academy specialist is exercised,
 *  - explicit support/marketer cross-domain traps,
 *  - a maximally-ambiguous one-word query.
 * Each carries its own oracle `label` (PRIMARY domain + span flag), merged into LABELS.
 * NOT added to the locked markdown (keeps v3 score comparability intact).
 */
import type { TestQuestion } from "../../questions.js";
import type { QuestionLabel } from "./labels.js";

export type ExtraQuestion = TestQuestion & { readonly label: QuestionLabel };

/** Category 9 = synthetic spike-only stress set (kept out of the v3 taxonomy). */
export const EXTRA_QUESTIONS: readonly ExtraQuestion[] = [
  {
    id: "S1",
    category: 9,
    prompt: "I'm getting a 403 on my indexing API call and the docs didn't help — what now?",
    split: "dev",
    isRefusalTest: false,
    label: { sourceLabel: "support", intent: "troubleshoot", span: true }, // support + technical
  },
  {
    id: "S2",
    category: 9,
    prompt: "Where do I learn Algolia from scratch — is there a course or a guided path?",
    split: "dev",
    isRefusalTest: false,
    label: { sourceLabel: "academy", intent: "learn" }, // clean academy (no span)
  },
  {
    id: "S3",
    category: 9,
    prompt: "Is Algolia worth it for a small Shopify store?",
    split: "dev",
    isRefusalTest: false,
    label: { sourceLabel: "marketer", intent: "value", span: true }, // marketer + support
  },
  {
    id: "S4",
    category: 9,
    prompt: "My search relevance is bad and my boss wants ROI numbers to justify fixing it.",
    split: "dev",
    isRefusalTest: false,
    label: { sourceLabel: "support", intent: "troubleshoot", span: true }, // support + marketer trap
  },
  {
    id: "S5",
    category: 9,
    prompt: "How do other fashion retailers use Algolia, and how do I copy what they did?",
    split: "dev",
    isRefusalTest: false,
    label: { sourceLabel: "marketer", intent: "value", span: true }, // marketer + technical
  },
  {
    id: "S6",
    category: 9,
    prompt: "search",
    split: "dev",
    isRefusalTest: false,
    label: { sourceLabel: "technical", intent: "ambiguous", span: true }, // max ambiguity → default
  },
];
