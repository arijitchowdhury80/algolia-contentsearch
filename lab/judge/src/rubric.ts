import type {
  HardGateConfig,
  JudgeConfig,
  JudgeProfile,
  Rubric,
  SynthesisConfig,
} from "./types.js";

/**
 * Default rubric for the Algolia answer-quality experiment.
 * Groundedness is weight x2 and is the gated, CRITICAL dimension.
 * Engagement is optional (only scored for conversational answers).
 */
export const ALGOLIA_ANSWER_RUBRIC: Rubric = {
  name: "Algolia answer quality v1",
  min: 1,
  max: 10,
  dimensions: [
    {
      id: "groundedness",
      label: "Groundedness",
      description:
        "Is every factual claim traceable to a provided source? Penalise any claim not supported by the sources. This is CRITICAL — score conservatively.",
      weight: 2,
    },
    {
      id: "completeness",
      label: "Completeness",
      description:
        "Does the answer fully address the question, covering the parts a strong answer would include?",
      weight: 1,
    },
    {
      id: "depth",
      label: "Depth / rigor",
      description:
        "Does the answer go beyond surface level — explaining mechanism, trade-offs, and nuance where warranted?",
      weight: 1,
    },
    {
      id: "clarity",
      label: "Clarity & logical layering",
      description:
        "Is the answer well-structured, with ideas layered in a logical order that is easy to follow?",
      weight: 1,
    },
    {
      id: "conciseness",
      label: "Conciseness",
      description:
        "Is the answer free of filler and repetition, saying what is needed without padding?",
      weight: 1,
    },
    {
      id: "citation",
      label: "Citation quality",
      description:
        "Are citations present where claims are made, and do the cited sources actually support the claim?",
      weight: 1,
    },
    {
      id: "engagement",
      label: "Engagement / two-way",
      description:
        "For conversational answers only: does it advance a genuine two-way exchange? Reward, specifically: (a) APPROPRIATE CLARIFICATION — when the question is genuinely ambiguous it asks one crisp clarifying question (after a brief best-effort answer, never a bare stall); and when the question is already clear it does NOT ask, it just answers (penalise needless 'what do you mean?' over-asking as much as failing to clarify when needed); (b) NON-REPETITION across turns — a follow-up adds new, grounded detail and builds on the prior turn rather than restating it; (c) at most ONE forward move per turn (a clarifier OR one high-signal follow-up question, never generic 'anything else?', never both). A clarifying or follow-up question that asserts an unverified fact is a grounding failure, not engagement credit. (Skip entirely for one-shot answers.)",
      weight: 1,
      optional: true,
    },
  ],
};

/**
 * The three blind judge personas. Identity of the pipeline is never revealed.
 *
 * ALL judges run at temperature 0 (zero-flicker policy, 2026-06-13): determinism
 * comes from temperature 0; perspective diversity comes from the distinct PERSONAS
 * below, NOT from random sampling. A nonzero temperature on the gating Skeptic was
 * the primary source of grounding-gate flicker (its violation-detection wobbled
 * across runs). The claim-recurrence gate is the safety net for any residual
 * provider nondeterminism; temperature 0 removes it at the source.
 */
export const DEFAULT_JUDGES: readonly JudgeProfile[] = [
  {
    id: "skeptic",
    temperament: "skeptic",
    temperature: 0.0,
    persona:
      "You are a CONTRARIAN skeptic. Hunt for hallucination, unsupported claims, fluff, broken logic, and citations that do not actually back the claim they attach to. Assume the answer is wrong until the sources prove it right. Score conservatively: when in doubt, score lower. Flag every claim you cannot map to a provided source as a grounding violation with your confidence.",
  },
  {
    id: "referee",
    temperament: "referee",
    temperature: 0.0,
    persona:
      "You are a NEUTRAL referee. Apply the rubric literally and dispassionately. Do not reward effort or punish ambition — score exactly what the rubric describes, no more, no less.",
  },
  {
    id: "advocate",
    temperament: "advocate",
    temperature: 0.0,
    persona:
      "You are a generous ADVOCATE who believes the answer is trying to help. Reward genuine depth, helpfulness, layered teaching, completeness, and engagement. Give credit for substance. You still must not excuse fabricated facts — grounding is non-negotiable — but everywhere else, find the value.",
  },
];

export const DEFAULT_GATE: HardGateConfig = {
  groundingGateEnabled: true,
  cap: 3,
  verifiedConfidence: 0.7,
  gatingTemperaments: ["skeptic"],
};

export const DEFAULT_SYNTHESIS: SynthesisConfig = {
  rule: "trimmed-skeptic-weighted",
  skepticWeight: 1.5,
};

export const DEFAULT_JUDGE_CONFIG: JudgeConfig = {
  rubric: ALGOLIA_ANSWER_RUBRIC,
  judges: DEFAULT_JUDGES,
  gate: DEFAULT_GATE,
  synthesis: DEFAULT_SYNTHESIS,
};

/**
 * The set of rubric dimensions that apply to a given artifact: drops optional
 * dimensions the artifact explicitly marks not-applicable.
 */
export function applicableDimensions(
  rubric: Rubric,
  notApplicable: readonly string[] = [],
) {
  const skip = new Set(notApplicable);
  return rubric.dimensions.filter((d) => !(d.optional && skip.has(d.id)));
}
