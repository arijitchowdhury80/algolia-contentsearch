import { applicableDimensions } from "./rubric.js";
import type { Artifact, JudgeProfile, Rubric } from "./types.js";

/**
 * The exact blinding instruction injected into every judge prompt. Kept as an
 * exported constant so tests can assert its presence verbatim and so the
 * methodology doc and prompt stay in sync.
 */
export const BLINDING_INSTRUCTION =
  "BLIND PANEL: You are one of several independent judges scoring this artifact. " +
  "You do NOT know which system or author produced it, and you must NOT speculate. " +
  "Judge ONLY the text in front of you against the rubric. Do not infer identity, " +
  "vendor, or pipeline from style, formatting, or self-references.";

function renderRubric(rubric: Rubric, dims: ReturnType<typeof applicableDimensions>): string {
  const lines = dims.map(
    (d) =>
      `- ${d.id} ("${d.label}", weight x${d.weight}): ${d.description} Score ${rubric.min}-${rubric.max}.`,
  );
  return `RUBRIC "${rubric.name}" — score each dimension on an integer ${rubric.min}-${rubric.max} scale:\n${lines.join("\n")}`;
}

function renderSources(artifact: Artifact): string {
  if (artifact.sources.length === 0) {
    return "SOURCES: (none provided — this artifact is not graded for external grounding).";
  }
  const body = artifact.sources
    .map((s) => `[${s.id}]${s.label ? ` ${s.label}` : ""}: ${s.text}`)
    .join("\n");
  return `SOURCES (the ONLY ground truth — a claim not supported here is a grounding violation):\n${body}`;
}

/**
 * A claim ABOUT the absence of content, or a routing pointer to official help,
 * is not a fabricated factual assertion. Stated on every prompt so judges don't
 * mis-flag honest "I don't have this" answers or help links as grounding
 * violations. CRITICALLY, this protection is scoped: it stops fabrication
 * false-positives, it does NOT turn a non-answer into a good answer. An empty,
 * evasive, or thin response must still lose points on completeness/depth/clarity
 * — otherwise a content-free stub inflates to a mid score.
 */
const GROUNDING_NOTE =
  "GROUNDING NOTE: An honest statement that no relevant content was found, that a " +
  "topic isn't covered, or that simply routes the user to official help (docs, " +
  "support, or a contact/demo link) is NOT a fabricated factual claim — never " +
  "count it as a grounding violation. This protects honest disclaimers ONLY; it " +
  "does NOT excuse a weak answer. An empty, evasive, or incomplete response must " +
  "still score LOW on Completeness, Depth, and Clarity. Absence of fabrication is " +
  "not the same as a good answer — do not reward a non-answer.";

/** Authoritative block when the artifact is expected to refuse (out-of-scope prompt). */
const REFUSAL_DIRECTIVE =
  "OUT-OF-SCOPE / REFUSAL TEST (authoritative — overrides the rubric's default reading): " +
  "This prompt is OUTSIDE the knowledge base on purpose. The CORRECT artifact is a brief, " +
  "polite REFUSAL that declines and routes the user elsewhere — NOT a substantive answer.\n" +
  "- If the artifact correctly refuses/declines (optionally routing to docs/support), score it " +
  "HIGH (9-10) on EVERY dimension: that refusal IS the ideal response, and there are no claims to ground.\n" +
  "- If the artifact instead gives a substantive factual answer to this out-of-scope question, that is a " +
  "SERIOUS grounding violation: record it in groundingViolations with confidence >= 0.9 and score low.";

/**
 * The JSON shape every judge must return. Exported so the parser and the prompt
 * agree on the contract.
 */
export const JUDGE_OUTPUT_CONTRACT = `Respond with ONLY a JSON object, no prose around it, of this exact shape:
{
  "dimensionScores": [{ "dimensionId": string, "score": number, "rationale": string }],
  "groundingViolations": [{ "claim": string, "reason": string, "confidence": number }],
  "summary": string
}
- Include one entry in "dimensionScores" for EVERY rubric dimension id listed above.
- "groundingViolations" lists factual claims NOT supported by the SOURCES. Empty array if none. "confidence" is 0-1.`;

/**
 * Builds the full prompt for a single blind judge. Pure: same inputs -> same
 * string. Guarantees the rubric, the blinding instruction, and the persona are
 * all present (asserted by tests).
 */
export function buildJudgePrompt(
  judge: JudgeProfile,
  artifact: Artifact,
  rubric: Rubric,
): string {
  const dims = applicableDimensions(rubric, artifact.notApplicableDimensions);
  const parts: string[] = [
    BLINDING_INSTRUCTION,
    "",
    `YOUR LENS: ${judge.persona}`,
    "",
    `ARTIFACT TYPE: ${artifact.type}`,
    artifact.prompt ? `QUESTION / BRIEF:\n${artifact.prompt}` : "",
    artifact.expectedBehavior === "refuse" ? `\n${REFUSAL_DIRECTIVE}` : "",
    "",
    `ARTIFACT TO JUDGE:\n${artifact.content}`,
    "",
    renderSources(artifact),
    "",
    GROUNDING_NOTE,
    "",
    renderRubric(rubric, dims),
    "",
    JUDGE_OUTPUT_CONTRACT,
  ];
  return parts.filter((p) => p !== "").join("\n");
}

/**
 * Builds the Chief Synthesizer prompt from the panel's parsed judgments. Pure.
 * The synthesizer sees scores + rationales + flagged violations and must
 * reconcile them into one verdict; the numeric final score is computed in code,
 * so the synthesizer only authors the rationale.
 */
export function buildSynthesisPrompt(
  artifact: Artifact,
  judgeBlocks: readonly { judgeId: string; weightedScore: number; summary: string; violations: number }[],
  computedFinalScore: number,
  gateTripped: boolean,
): string {
  const panel = judgeBlocks
    .map(
      (b) =>
        `- Judge ${b.judgeId}: weighted ${b.weightedScore.toFixed(2)}/10, ${b.violations} grounding violation(s). Verdict: ${b.summary}`,
    )
    .join("\n");
  return [
    "You are the CHIEF SYNTHESIZER. Three blind judges scored the same artifact.",
    "Reconcile their views into one written rationale. The numeric final score has",
    `already been computed by the panel math: ${computedFinalScore.toFixed(2)}/10` +
      (gateTripped
        ? " (a grounding hard-gate was TRIPPED — explain that the cap was applied because of an unsupported factual claim)."
        : "."),
    "",
    `ARTIFACT TYPE: ${artifact.type}`,
    "",
    "PANEL:",
    panel,
    "",
    "Write 2-4 sentences explaining the final score: where judges agreed, where they",
    "diverged, and what most drove the verdict. Respond with prose only.",
  ].join("\n");
}
