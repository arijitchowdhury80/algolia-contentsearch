import { describe, it, expect } from "vitest";
import { scoreCriterion, aggregatePctOfFloor, type CriterionScore } from "../src/referenceCriteria";
import type { ReferenceTurnArtifact } from "../src/referenceTypes";

const art: ReferenceTurnArtifact = {
  userInput: "retail wins?",
  candidateAnswer: "Gymshark saw a 27% lift.",
  candidateSources: [{ id: "1", text: "Gymshark 27% lift with Algolia." }],
  goldAnswer: "Gymshark saw a 27% lift; Lacoste improved conversion too.",
  goldSources: [{ id: "g", text: "..." }],
  turnRole: "discovery",
};

describe("scoreCriterion", () => {
  it("parses a pct-of-gold score and rationale", async () => {
    const llm = async () => '{"pctOfGold":80,"rationale":"covered Gymshark, missed Lacoste","missedClaims":["Lacoste improved conversion"]}';
    const s = await scoreCriterion("coverage", art, llm);
    expect(s.id).toBe("coverage");
    expect(s.pctOfGold).toBe(80);
  });
});

describe("aggregatePctOfFloor", () => {
  const scores: CriterionScore[] = [
    { id: "coverage", pctOfGold: 80, rationale: "" },
    { id: "depth", pctOfGold: 100, rationale: "" },
    { id: "onPoint", pctOfGold: 120, rationale: "" },
  ];
  it("ADR-2b: unweighted mean when grounded + voice OK", () => {
    const r = aggregatePctOfFloor(scores, true, true);
    expect(r.gated).toBe(false);
    expect(r.pctOfFloor).toBe(100); // (80+100+120)/3
  });
  it("grounding gate caps to 0 when not grounded", () => {
    const r = aggregatePctOfFloor(scores, false, true);
    expect(r.gated).toBe(true);
    expect(r.pctOfFloor).toBe(0);
  });
});
