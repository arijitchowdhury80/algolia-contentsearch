import { describe, expect, it } from "vitest";
import { runAutocorrect } from "../src/index.js";
import type { AutocorrectSeams, ScoredPanelAnswer, LoopConfig } from "../src/index.js";

const CFG: LoopConfig = {
  oursPanelId: "tuned",
  floorPanelId: "mirror",
  targetMargin: 1.0,
  sustainRounds: 1,
  maxRounds: 5,
  patience: 3,
  minImprovement: 0.3,
};

/** Build one split's scored answers: ours + floor at given mean scores, ours gated? */
function answers(
  split: "dev" | "held-out",
  oursScore: number,
  floorScore: number,
  oursGated = false,
): ScoredPanelAnswer[] {
  const mk = (panelId: string, meanScore: number, gated: boolean): ScoredPanelAnswer => ({
    panelId,
    split,
    meanScore,
    gated,
    borderline: false,
    dimensionMeans: { groundedness: meanScore, completeness: meanScore },
  });
  return [mk("tuned", oursScore, oursGated), mk("mirror", floorScore, false)];
}

/**
 * A scripted seams harness. `script[i]` gives ours' (dev, heldOut) scores +
 * grounding for the config evaluated in round i (round 0 = baseline). Records
 * every deploy so tests can assert keep/rollback.
 */
function makeSeams(
  script: { ours: number; heldOut?: number; gated?: boolean }[],
  floor = 4.0,
): { seams: AutocorrectSeams<string>; deploys: string[]; proposed: string[] } {
  const deploys: string[] = [];
  const proposed: string[] = [];
  let round = 0;
  let liveConfig = "baseline";

  const seams: AutocorrectSeams<string> = {
    async deploy(config) {
      liveConfig = config;
      deploys.push(config);
    },
    async evaluate(split) {
      // Find the script entry for the currently-live config.
      const idx = liveConfig === "baseline" ? 0 : Number(liveConfig.replace("cand", ""));
      const s = script[Math.min(idx, script.length - 1)];
      return split === "dev"
        ? answers("dev", s.ours, floor, s.gated ?? false)
        : answers("held-out", s.heldOut ?? s.ours, floor, s.gated ?? false);
    },
    async propose() {
      round += 1;
      const c = `cand${round}`;
      proposed.push(c);
      return c;
    },
  };
  return { seams, deploys, proposed };
}

describe("runAutocorrect orchestrator", () => {
  it("round 0 deploys + evaluates the baseline, then stops at maxRounds", async () => {
    const { seams, deploys } = makeSeams([{ ours: 5, heldOut: 5 }]);
    const res = await runAutocorrect({
      seams,
      cfg: { ...CFG, maxRounds: 1, targetMargin: 99 }, // unreachable margin → no win
      baseline: { id: "baseline", config: "baseline" },
    });
    expect(deploys[0]).toBe("baseline");
    expect(res.history.length).toBe(1);
    expect(res.stopReason).toBe("max-rounds");
    expect(res.best.config).toBe("baseline");
  });

  it("keeps a candidate that improves dev, stays grounded, and holds on held-out", async () => {
    // round0 baseline ours=5; round1 candidate ours=7 (improved, grounded).
    const { seams, deploys } = makeSeams([
      { ours: 5, heldOut: 5 },
      { ours: 7, heldOut: 7 },
    ]);
    const res = await runAutocorrect({
      seams,
      cfg: { ...CFG, maxRounds: 2, targetMargin: 99 },
      baseline: { id: "baseline", config: "baseline" },
    });
    expect(res.best.config).toBe("cand1"); // improvement kept
    // last deploy must be the kept candidate (live = best), not a rollback.
    expect(deploys[deploys.length - 1]).toBe("cand1");
  });

  it("rolls back a candidate that regresses grounding (re-deploys incumbent)", async () => {
    // candidate ours=9 but GATED → must be rejected despite higher score.
    const { seams, deploys } = makeSeams([
      { ours: 5, heldOut: 5 },
      { ours: 9, heldOut: 9, gated: true },
    ]);
    const res = await runAutocorrect({
      seams,
      cfg: { ...CFG, maxRounds: 2, targetMargin: 99 },
      baseline: { id: "baseline", config: "baseline" },
    });
    expect(res.best.config).toBe("baseline"); // candidate rejected
    expect(deploys[deploys.length - 1]).toBe("baseline"); // rolled back live
  });

  it("rejects a candidate whose gain is within the noise floor (minImprovement)", async () => {
    // ours 5.0 → 5.2: +0.2 < minImprovement 0.3 → no real improvement → reject.
    const { seams } = makeSeams([
      { ours: 5.0, heldOut: 5.0 },
      { ours: 5.2, heldOut: 5.2 },
    ]);
    const res = await runAutocorrect({
      seams,
      cfg: { ...CFG, maxRounds: 2, targetMargin: 99 },
      baseline: { id: "baseline", config: "baseline" },
    });
    expect(res.best.config).toBe("baseline");
  });

  it("stops with 'won' when ours sustains the target margin on held-out", async () => {
    // baseline ours=5 floor=4 (margin 1.0 already >= targetMargin 1.0, grounded).
    const { seams } = makeSeams([{ ours: 5, heldOut: 5 }], 4.0);
    const res = await runAutocorrect({
      seams,
      cfg: { ...CFG, maxRounds: 5, targetMargin: 1.0, sustainRounds: 1 },
      baseline: { id: "baseline", config: "baseline" },
    });
    expect(res.stopReason).toBe("won");
  });
});
