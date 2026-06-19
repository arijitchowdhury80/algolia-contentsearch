/**
 * Tests for the autocorrect adapter's floor-cache logic — the optimization that
 * measures the fixed (non-ours) floor once and reuses it on later rounds (only
 * the `ours` panel is re-judged). The merge math is panel-id-agnostic; the 2×2
 * model optimizes the single-keyword panel (P1) against its sibling floor (P2).
 * The live panelIds=[ours] path is additionally proven by the end-to-end smoke
 * run; this locks the merge math.
 */
import { describe, it, expect } from "vitest";
import type { ScoredPanelAnswer } from "@lab/autocorrect";
import { applyFloorCache } from "./autocorrectAdapters.js";

const ans = (panelId: string, meanScore: number): ScoredPanelAnswer => ({
  panelId,
  split: "dev",
  meanScore,
  gated: false,
  borderline: false,
  dimensionMeans: {},
});

describe("applyFloorCache", () => {
  const ours = "P1";

  it("first eval: returns all panels and caches the non-ours floor", () => {
    const fresh = [ans("P2", 3), ans("P3", 4.4), ans("P1", 5)];
    const { merged, floorToCache } = applyFloorCache(undefined, fresh, ours);

    expect(merged.map((a) => a.panelId)).toEqual(["P2", "P3", "P1"]);
    expect(floorToCache?.map((a) => a.panelId)).toEqual(["P2", "P3"]); // ours excluded
  });

  it("later eval: merges the cached floor with the re-measured ours panel", () => {
    const cachedFloor = [ans("P2", 3), ans("P3", 4.4)];
    const freshOursOnly = [ans("P1", 6.2)]; // run-tests ran panelIds=[P1]
    const { merged, floorToCache } = applyFloorCache(cachedFloor, freshOursOnly, ours);

    expect(merged.map((a) => a.panelId)).toEqual(["P2", "P3", "P1"]);
    expect(merged.find((a) => a.panelId === "P1")!.meanScore).toBe(6.2); // fresh ours wins
    expect(merged.find((a) => a.panelId === "P3")!.meanScore).toBe(4.4); // floor reused
    expect(floorToCache).toBeUndefined(); // floor already cached — don't re-cache
  });

  it("the merged split always contains both ours and the floor for the margin", () => {
    const cachedFloor = [ans("P2", 4.0)];
    const { merged } = applyFloorCache(cachedFloor, [ans("P1", 5.0)], ours);
    expect(merged.some((a) => a.panelId === ours)).toBe(true);
    expect(merged.some((a) => a.panelId === "P2")).toBe(true);
  });
});
