import { describe, it, expect } from "vitest";
import { summarize, type ScorecardTurn } from "./scorecard";

const turns: ScorecardTurn[] = [
  { scenarioId: "retail-q1", mode: "single", turnIndex: 0, composite: 8, gated: false, dimensions: { grounding: 8 } },
  { scenarioId: "retail-q1", mode: "single", turnIndex: 1, composite: 6, gated: false, dimensions: { grounding: 6 } },
  { scenarioId: "cpg-q1", mode: "multi", turnIndex: 0, composite: 3, gated: true, dimensions: { grounding: 2 } },
];

describe("summarize", () => {
  it("computes mean composite, gated count, and per-scenario means", () => {
    const s = summarize(turns);
    expect(s.meanComposite).toBeCloseTo((8 + 6 + 3) / 3, 2); // 5.67
    expect(s.gatedCount).toBe(1);
    expect(s.perScenario["retail-q1"]).toBe(7); // (8+6)/2
  });
});
