import { describe, expect, it } from "vitest";
import { summarizeSplit } from "../src/index.js";
import type { ScoredPanelAnswer } from "../src/index.js";

function ans(
  panelId: string,
  split: "dev" | "held-out",
  meanScore: number,
  opts: { gated?: boolean; borderline?: boolean; dims?: Record<string, number> } = {},
): ScoredPanelAnswer {
  return {
    panelId,
    split,
    meanScore,
    gated: opts.gated ?? false,
    borderline: opts.borderline ?? false,
    dimensionMeans: opts.dims ?? {},
  };
}

describe("summarizeSplit", () => {
  const answers: ScoredPanelAnswer[] = [
    // dev: 2 questions × 2 panels
    ans("tuned", "dev", 8.0, { dims: { depth: 6, citation: 4 } }),
    ans("mirror", "dev", 9.0, { dims: { depth: 8, citation: 8 } }),
    ans("tuned", "dev", 9.0, { gated: true, dims: { depth: 8, citation: 6 } }),
    ans("mirror", "dev", 7.0, { borderline: true, dims: { depth: 6, citation: 6 } }),
    // held-out: should be ignored when summarizing dev
    ans("tuned", "held-out", 2.0),
    ans("mirror", "held-out", 2.0),
  ];

  it("aggregates only the requested split, per panel", () => {
    const dev = summarizeSplit(answers, "dev");
    expect(dev.split).toBe("dev");
    const tuned = dev.panels.find((p) => p.panelId === "tuned")!;
    const mirror = dev.panels.find((p) => p.panelId === "mirror")!;

    expect(tuned.questionsScored).toBe(2);
    expect(tuned.meanScore).toBeCloseTo((8.0 + 9.0) / 2, 5);
    expect(tuned.gatedCount).toBe(1);
    expect(mirror.meanScore).toBeCloseTo((9.0 + 7.0) / 2, 5);
    expect(mirror.borderlineCount).toBe(1);
  });

  it("averages per-dimension means across the split's questions", () => {
    const dev = summarizeSplit(answers, "dev");
    const tuned = dev.panels.find((p) => p.panelId === "tuned")!;
    expect(tuned.dimensionMeans.depth).toBeCloseTo((6 + 8) / 2, 5);
    expect(tuned.dimensionMeans.citation).toBeCloseTo((4 + 6) / 2, 5);
  });

  it("excludes the other split entirely", () => {
    const dev = summarizeSplit(answers, "dev");
    // held-out tuned score 2.0 must not drag the dev mean down.
    const tuned = dev.panels.find((p) => p.panelId === "tuned")!;
    expect(tuned.meanScore).toBeGreaterThan(8);
  });
});
