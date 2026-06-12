import { describe, expect, it } from "vitest";
import {
  ALGOLIA_ANSWER_RUBRIC,
  applicableDimensions,
  toFinalScale,
  weightedAggregate,
} from "../src/index.js";
import { flatScores } from "./helpers.js";

describe("weightedAggregate", () => {
  it("returns the flat value when every applicable dimension scores the same", () => {
    const scores = flatScores(8);
    const agg = weightedAggregate(scores, ALGOLIA_ANSWER_RUBRIC, {
      notApplicableDimensions: ["engagement"],
    });
    expect(agg).toBe(8);
  });

  it("weights groundedness x2: a low groundedness pulls the mean down harder", () => {
    // 6 applicable dims (engagement N/A). Groundedness weight 2, others 1 -> total 7.
    // All 10 except groundedness=2 -> (2*2 + 10*5) / 7 = 54/7 ≈ 7.714
    const scores = flatScores(10).map((d) =>
      d.dimensionId === "groundedness" ? { ...d, score: 2 } : d,
    );
    const agg = weightedAggregate(scores, ALGOLIA_ANSWER_RUBRIC, {
      notApplicableDimensions: ["engagement"],
    });
    expect(agg).toBeCloseTo(54 / 7, 5);

    // Sanity: if a weight-1 dim were 2 instead, the mean would be HIGHER than
    // when groundedness is the low one, proving the x2 weighting bites.
    const scoresAlt = flatScores(10).map((d) =>
      d.dimensionId === "completeness" ? { ...d, score: 2 } : d,
    );
    const aggAlt = weightedAggregate(scoresAlt, ALGOLIA_ANSWER_RUBRIC, {
      notApplicableDimensions: ["engagement"],
    });
    expect(aggAlt).toBeGreaterThan(agg);
  });

  it("treats a missing dimension score as the rubric minimum (not free)", () => {
    const scores = flatScores(10).filter((d) => d.dimensionId !== "completeness");
    const agg = weightedAggregate(scores, ALGOLIA_ANSWER_RUBRIC, {
      notApplicableDimensions: ["engagement"],
    });
    // completeness missing -> counted as min (1), weight 1 of total 7.
    // (10*6 ... but completeness=1) => (2*10 + 1 + 10*4)/7 = (20+1+40)/7 = 61/7
    expect(agg).toBeCloseTo(61 / 7, 5);
  });

  it("excludes optional dimensions marked not-applicable", () => {
    const withEngagement = applicableDimensions(ALGOLIA_ANSWER_RUBRIC, []);
    const withoutEngagement = applicableDimensions(ALGOLIA_ANSWER_RUBRIC, ["engagement"]);
    expect(withEngagement.length).toBe(withoutEngagement.length + 1);
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
