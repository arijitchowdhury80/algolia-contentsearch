import { describe, expect, it } from "vitest";
import {
  decideKeep,
  diagnoseWeakest,
  isWin,
  splitMargin,
  shouldStop,
} from "../src/index.js";
import type {
  LoopConfig,
  PanelMetrics,
  RoundResult,
  SplitMetrics,
} from "../src/index.js";

const CFG: LoopConfig = {
  oursPanelId: "tuned",
  floorPanelId: "mirror",
  targetMargin: 1.0,
  sustainRounds: 2,
  maxRounds: 8,
  patience: 3,
  minImprovement: 0.1,
};

function panel(
  panelId: string,
  meanScore: number,
  opts: {
    gated?: number;
    borderline?: number;
    dims?: Record<string, number>;
  } = {},
): PanelMetrics {
  return {
    panelId,
    meanScore,
    gatedCount: opts.gated ?? 0,
    borderlineCount: opts.borderline ?? 0,
    dimensionMeans: opts.dims ?? {},
    questionsScored: 16,
  };
}

function split(
  kind: "dev" | "held-out",
  ours: PanelMetrics,
  floor: PanelMetrics,
): SplitMetrics {
  return { split: kind, panels: [floor, ours] };
}

function round(
  n: number,
  oursDev: number,
  floorDev: number,
  opts: {
    oursGated?: number;
    heldOut?: { ours: number; floor: number; oursGated?: number };
    dims?: Record<string, number>;
  } = {},
): RoundResult {
  const dev = split(
    "dev",
    panel("tuned", oursDev, { gated: opts.oursGated ?? 0, dims: opts.dims }),
    panel("mirror", floorDev),
  );
  const r: RoundResult = { round: n, configId: `v${n}`, dev };
  if (opts.heldOut) {
    return {
      ...r,
      heldOut: split(
        "held-out",
        panel("tuned", opts.heldOut.ours, { gated: opts.heldOut.oursGated ?? 0 }),
        panel("mirror", opts.heldOut.floor),
      ),
    };
  }
  return r;
}

describe("splitMargin (ours - floor)", () => {
  it("computes ours minus floor on a split", () => {
    const s = split("dev", panel("tuned", 8.2), panel("mirror", 7.0));
    expect(splitMargin(s, CFG)).toBeCloseTo(1.2, 5);
  });
});

describe("decideKeep", () => {
  it("KEEPS a config that improves dev score, stays grounded, no held-out regression", () => {
    const prev = round(1, 7.0, 7.0);
    const next = round(2, 7.5, 7.0); // +0.5 dev, grounded
    const d = decideKeep(prev, next, CFG);
    expect(d.keep).toBe(true);
    expect(d.reason).toBe("improved");
  });

  it("ROLLS BACK when dev improvement is below the noise epsilon", () => {
    const prev = round(1, 7.0, 7.0);
    const next = round(2, 7.05, 7.0); // +0.05 < minImprovement 0.1
    expect(decideKeep(prev, next, CFG).keep).toBe(false);
    expect(decideKeep(prev, next, CFG).reason).toBe("no-improvement");
  });

  it("ROLLS BACK when the mutation introduces a grounding violation, even if score rose", () => {
    const prev = round(1, 7.0, 7.0);
    const next = round(2, 8.5, 7.0, { oursGated: 1 }); // big score gain but 1 gate trip
    const d = decideKeep(prev, next, CFG);
    expect(d.keep).toBe(false);
    expect(d.reason).toBe("grounding-regressed");
  });

  it("ROLLS BACK an overfit: dev improves but held-out regresses vs prev", () => {
    const prev = round(1, 7.0, 7.0, { heldOut: { ours: 7.2, floor: 7.0 } });
    const next = round(2, 8.0, 7.0, { heldOut: { ours: 6.5, floor: 7.0 } }); // dev↑ held-out↓
    const d = decideKeep(prev, next, CFG);
    expect(d.keep).toBe(false);
    expect(d.reason).toBe("overfit-held-out-regressed");
  });
});

describe("isWin (held-out margin sustained)", () => {
  it("is a win when the last N held-out rounds all clear the target margin, grounded", () => {
    const hist = [
      round(1, 7.5, 7.0, { heldOut: { ours: 8.2, floor: 7.0 } }), // margin 1.2
      round(2, 7.8, 7.0, { heldOut: { ours: 8.1, floor: 7.0 } }), // margin 1.1
    ];
    expect(isWin(hist, CFG)).toBe(true);
  });

  it("is NOT a win if the margin held only once (not sustained)", () => {
    const hist = [
      round(1, 7.5, 7.0, { heldOut: { ours: 7.4, floor: 7.0 } }), // margin 0.4 < 1.0
      round(2, 7.8, 7.0, { heldOut: { ours: 8.1, floor: 7.0 } }), // margin 1.1
    ];
    expect(isWin(hist, CFG)).toBe(false);
  });

  it("is NOT a win if a sustaining round has a grounding violation", () => {
    const hist = [
      round(1, 7.5, 7.0, { heldOut: { ours: 8.2, floor: 7.0 } }),
      round(2, 7.8, 7.0, { heldOut: { ours: 8.1, floor: 7.0, oursGated: 1 } }),
    ];
    expect(isWin(hist, CFG)).toBe(false);
  });
});

describe("shouldStop", () => {
  it("stops with 'won' when the win condition is met", () => {
    const hist = [
      round(1, 7.5, 7.0, { heldOut: { ours: 8.2, floor: 7.0 } }),
      round(2, 7.8, 7.0, { heldOut: { ours: 8.1, floor: 7.0 } }),
    ];
    expect(shouldStop(hist, CFG)).toBe("won");
  });

  it("stops with 'max-rounds' at the cap", () => {
    const hist = Array.from({ length: 8 }, (_, i) => round(i + 1, 7.0, 7.0));
    expect(shouldStop(hist, CFG)).toBe("max-rounds");
  });

  it("stops with 'patience-exhausted' when dev hasn't improved for `patience` rounds", () => {
    // best dev ours = 7.5 at round 1; rounds 2,3,4 flat -> 3 stale rounds = patience.
    const hist = [
      round(1, 7.5, 7.0),
      round(2, 7.5, 7.0),
      round(3, 7.5, 7.0),
      round(4, 7.5, 7.0),
    ];
    expect(shouldStop(hist, CFG)).toBe("patience-exhausted");
  });

  it("keeps 'running' while improving and under the cap", () => {
    const hist = [round(1, 7.0, 7.0), round(2, 7.3, 7.0)];
    expect(shouldStop(hist, CFG)).toBe("running");
  });
});

describe("diagnoseWeakest", () => {
  it("returns ours' lowest-scoring dimensions (mutation targets), worst first", () => {
    const dims = {
      groundedness: 9.0,
      completeness: 6.0,
      depth: 5.0,
      clarity: 8.0,
      citation: 4.5,
    };
    const r = round(3, 7.0, 7.0, { dims });
    const weak = diagnoseWeakest(r.dev, CFG, 2);
    expect(weak.map((w) => w.dimensionId)).toEqual(["citation", "depth"]);
    expect(weak[0].meanScore).toBeCloseTo(4.5, 5);
  });
});
