import type {
  HardGateConfig,
  JudgeConfig,
  JudgeProfile,
  Rubric,
  SynthesisConfig,
} from "./types.js";

/**
 * Default rubric for the Algolia answer-quality experiment — 3-dimension model
 * (Arijit, 2026-06-18). The verdict is a composite across exactly three facets:
 * Grounding, Answer confidence, and Breadth & depth. All three carry EQUAL weight
 * (x1) — the composite is their simple mean (Arijit, 2026-06-18: reconcile to
 * equal-weight). Grounding is NOT up-weighted in the quality average; instead it
 * is the HARD FLOOR — a verified grounding violation still caps the whole score
 * via the gate (see DEFAULT_GATE / aggregateRounds), independent of its weight.
 * The earlier 7-dimension rubric folded into these three: citation quality →
 * Grounding; completeness + depth + logical structure → Breadth & depth;
 * decisiveness is the new Confidence dimension. (Two-way "engagement" is
 * deferred — not scored here.)
 */
export const ALGOLIA_ANSWER_RUBRIC: Rubric = {
  name: "Algolia answer quality v2 (3-dimension)",
  min: 1,
  max: 10,
  dimensions: [
    {
      id: "grounding",
      label: "Grounding",
      description:
        "Is EVERY factual claim traceable to a provided source, with no hallucination or unsupported assertion? Citations must actually support the claim they attach to. This is CRITICAL — score conservatively; even one unsupported claim is a serious problem. (An honest 'this isn't covered' statement or a routing link to official help is NOT a violation.)",
      weight: 1,
    },
    {
      id: "confidence",
      label: "Answer confidence",
      description:
        "How decisive and self-assured is the answer GIVEN its sources? A strong answer commits to a clear, direct response and states what it knows plainly. Penalise needless hedging, vague qualifiers, or refusing/deferring when the sources actually support an answer. IMPORTANT: confidence is decisiveness given the sources — it is NEVER a licence to overstate; claims beyond the sources are a Grounding failure, not confidence credit. A correct, clean refusal to a genuinely unanswerable question is itself confident — score it high.",
      weight: 1,
    },
    {
      id: "breadth_depth",
      label: "Breadth & depth",
      description:
        "Does the answer cover the question broadly (the parts a strong answer would include) AND go deep where it matters — mechanism, specific parameters/settings/names, trade-offs, and nuance that the sources provide — in a clear, logically layered structure? Reward complete, substantive, well-organised answers; penalise thin, shallow, partial, or rambling ones. Depth must come from the sources, not padding.",
      weight: 1,
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

/**
 * Final pre-gate score = the simple MEAN of the three judges' composites
 * (Arijit, 2026-06-18: "final = average of the 3 judges"). The skeptic still
 * governs the grounding HARD FLOOR via the gate; it is no longer up-weighted in
 * the quality average. The "trimmed-skeptic-weighted" rule remains available for
 * callers that want it, but is no longer the default.
 */
export const DEFAULT_SYNTHESIS: SynthesisConfig = {
  rule: "mean",
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
