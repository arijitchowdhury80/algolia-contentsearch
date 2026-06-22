import { describe, it, expect } from "vitest";
import { summarize, type ScorecardTurn } from "./scorecard";

const turns: ScorecardTurn[] = [
  { scenarioId: "retail-q1", mode: "single", turnIndex: 0, pctOfFloor: 80, gated: false, retrievalGaps: 1, generationGaps: 0 },
  { scenarioId: "retail-q1", mode: "single", turnIndex: 1, pctOfFloor: 100, gated: false, retrievalGaps: 0, generationGaps: 2 },
  { scenarioId: "cpg-q1", mode: "multi", turnIndex: 0, pctOfFloor: 0, gated: true, retrievalGaps: 0, generationGaps: 0 },
];

describe("summarize", () => {
  it("computes mean %-of-floor, gated count, and per-scenario means", () => {
    const s = summarize(turns);
    expect(s.meanPctOfFloor).toBe(60); // (80+100+0)/3
    expect(s.gatedCount).toBe(1);
    expect(s.perScenario["retail-q1"]).toBe(90); // (80+100)/2
  });
});
