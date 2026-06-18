import { describe, expect, it } from "vitest";
import {
  ALGOLIA_ANSWER_RUBRIC,
  BLINDING_INSTRUCTION,
  DEFAULT_JUDGES,
  buildJudgePrompt,
  buildSynthesisPrompt,
  extractJsonObject,
  parseJudgeOutput,
} from "../src/index.js";
import { GROUNDED_ARTIFACT } from "./helpers.js";

describe("buildJudgePrompt", () => {
  const skeptic = DEFAULT_JUDGES.find((j) => j.id === "skeptic")!;
  const prompt = buildJudgePrompt(skeptic, GROUNDED_ARTIFACT, ALGOLIA_ANSWER_RUBRIC);

  it("includes the blinding instruction verbatim", () => {
    expect(prompt).toContain(BLINDING_INSTRUCTION);
  });

  it("includes the judge persona (temperament lens)", () => {
    expect(prompt).toContain(skeptic.persona);
  });

  it("includes every dimension of the 3-dimension rubric", () => {
    expect(prompt).toContain("grounding");
    expect(prompt).toContain("confidence");
    expect(prompt).toContain("breadth_depth");
    // the dropped legacy dimensions must not appear
    expect(prompt).not.toContain("engagement");
    expect(prompt).not.toContain("conciseness");
  });

  it("surfaces the grounding x2 weight and the sources as ground truth", () => {
    expect(prompt).toContain("weight x2");
    expect(prompt).toContain("[S1]");
    expect(prompt).toContain("grounding violation");
  });

  it("includes the JSON output contract", () => {
    expect(prompt).toContain('"dimensionScores"');
    expect(prompt).toContain('"groundingViolations"');
  });

  it("is deterministic (pure)", () => {
    const again = buildJudgePrompt(skeptic, GROUNDED_ARTIFACT, ALGOLIA_ANSWER_RUBRIC);
    expect(again).toBe(prompt);
  });
});

describe("buildSynthesisPrompt", () => {
  it("lists each judge and notes when the gate tripped", () => {
    const p = buildSynthesisPrompt(
      GROUNDED_ARTIFACT,
      [
        { judgeId: "skeptic", weightedScore: 3, summary: "weak grounding", violations: 1 },
        { judgeId: "referee", weightedScore: 6, summary: "ok", violations: 0 },
      ],
      3,
      true,
    );
    expect(p).toContain("CHIEF SYNTHESIZER");
    expect(p).toContain("skeptic");
    expect(p).toContain("hard-gate was TRIPPED");
  });
});

describe("parseJudgeOutput", () => {
  it("extracts JSON even when wrapped in prose / code fences", () => {
    const raw =
      "Here is my assessment:\n```json\n" +
      JSON.stringify({
        dimensionScores: [{ dimensionId: "groundedness", score: 7, rationale: "ok" }],
        groundingViolations: [],
        summary: "fine",
      }) +
      "\n```\nThanks!";
    const obj = extractJsonObject(raw) as { summary: string };
    expect(obj.summary).toBe("fine");
  });

  it("clamps out-of-range scores and confidences", () => {
    const raw = JSON.stringify({
      dimensionScores: [
        { dimensionId: "groundedness", score: 99, rationale: "x" },
        { dimensionId: "clarity", score: -5, rationale: "y" },
      ],
      groundingViolations: [{ claim: "c", reason: "r", confidence: 5 }],
      summary: "s",
    });
    const parsed = parseJudgeOutput(raw, ALGOLIA_ANSWER_RUBRIC);
    expect(parsed.dimensionScores[0].score).toBe(10); // clamped to max
    expect(parsed.dimensionScores[1].score).toBe(1); // clamped to min
    expect(parsed.groundingViolations[0].confidence).toBe(1); // clamped to 1
  });
});
