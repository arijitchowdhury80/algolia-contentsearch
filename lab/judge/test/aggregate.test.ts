import { describe, expect, it } from "vitest";
import {
  ALGOLIA_ANSWER_RUBRIC,
  applicableDimensions,
  toFinalScale,
  weightedAggregate,
} from "../src/index.js";
import { flatScores } from "./helpers.js";

describe("weightedAggregate", () => {
  it("returns the flat value when every dimension scores the same", () => {
    const scores = flatScores(8);
    const agg = weightedAggregate(scores, ALGOLIA_ANSWER_RUBRIC);
    expect(agg).toBe(8);
  });

  it("weights grounding x2: a low grounding pulls the mean down harder", () => {
    // 3 dims: grounding(x2), confidence(x1), breadth_depth(x1) -> total weight 4.
    // All 10 except grounding=2 -> (2*2 + 10 + 10) / 4 = 24/4 = 6
    const scores = flatScores(10).map((d) =>
      d.dimensionId === "grounding" ? { ...d, score: 2 } : d,
    );
    const agg = weightedAggregate(scores, ALGOLIA_ANSWER_RUBRIC);
    expect(agg).toBeCloseTo(24 / 4, 5);

    // Sanity: if a weight-1 dim were the low one instead, the mean would be
    // HIGHER, proving the grounding x2 weighting bites harder.
    // grounding=10, confidence=2, breadth_depth=10 -> (2*10 + 2 + 10)/4 = 32/4 = 8
    const scoresAlt = flatScores(10).map((d) =>
      d.dimensionId === "confidence" ? { ...d, score: 2 } : d,
    );
    const aggAlt = weightedAggregate(scoresAlt, ALGOLIA_ANSWER_RUBRIC);
    expect(aggAlt).toBeGreaterThan(agg);
    expect(aggAlt).toBeCloseTo(32 / 4, 5);
  });

  it("treats a missing dimension score as the rubric minimum (not free)", () => {
    const scores = flatScores(10).filter((d) => d.dimensionId !== "breadth_depth");
    const agg = weightedAggregate(scores, ALGOLIA_ANSWER_RUBRIC);
    // breadth_depth missing -> counted as min (1), weight 1 of total 4.
    // (2*10 + 10 + 1)/4 = 31/4
    expect(agg).toBeCloseTo(31 / 4, 5);
  });

  it("supports optional dimensions via the applicability filter", () => {
    // The 3-dimension production rubric has no optional dims; verify the
    // mechanism still works on a synthetic rubric with one.
    const withOptional = {
      ...ALGOLIA_ANSWER_RUBRIC,
      dimensions: [
        ...ALGOLIA_ANSWER_RUBRIC.dimensions,
        { id: "extra", label: "Extra", description: "", weight: 1, optional: true },
      ],
    };
    const all = applicableDimensions(withOptional, []);
    const dropped = applicableDimensions(withOptional, ["extra"]);
    expect(all.length).toBe(dropped.length + 1);
  });
});

describe("toFinalScale", () => {
  it("maps the rubric range onto 0-10", () => {
    expect(toFinalScale(10, ALGOLIA_ANSWER_RUBRIC)).toBeCloseTo(10, 5);
    expect(toFinalScale(1, ALGOLIA_ANSWER_RUBRIC)).toBeCloseTo(0, 5);
    // midpoint of 1..10 is 5.5 -> 0.5 of span -> 5.0
    expect(toFinalScale(5.5, ALGOLIA_ANSWER_RUBRIC)).toBeCloseTo(5, 5);
  });
});
