/**
 * Tests for the autocorrect adapter's floor-cache logic — the optimization that
 * measures the fixed ①/② floor once and reuses it on later rounds (only the ③
 * `ours` panel is re-judged). The live panelIds=[ours] path is additionally
 * proven by the end-to-end smoke run; this locks the merge math.
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
  const ours = "tuned";

  it("first eval: returns all panels and caches the non-ours floor", () => {
    const fresh = [ans("website", 3), ans("mirror", 4.4), ans("tuned", 5)];
    const { merged, floorToCache } = applyFloorCache(undefined, fresh, ours);

    expect(merged.map((a) => a.panelId)).toEqual(["website", "mirror", "tuned"]);
    expect(floorToCache?.map((a) => a.panelId)).toEqual(["website", "mirror"]); // ours excluded
  });

  it("later eval: merges the cached floor with the re-measured ours panel", () => {
    const cachedFloor = [ans("website", 3), ans("mirror", 4.4)];
    const freshOursOnly = [ans("tuned", 6.2)]; // run-tests ran panelIds=[tuned]
    const { merged, floorToCache } = applyFloorCache(cachedFloor, freshOursOnly, ours);

    expect(merged.map((a) => a.panelId)).toEqual(["website", "mirror", "tuned"]);
    expect(merged.find((a) => a.panelId === "tuned")!.meanScore).toBe(6.2); // fresh ours wins
    expect(merged.find((a) => a.panelId === "mirror")!.meanScore).toBe(4.4); // floor reused
    expect(floorToCache).toBeUndefined(); // floor already cached — don't re-cache
  });

  it("the merged split always contains both ours and the floor for the margin", () => {
    const cachedFloor = [ans("mirror", 4.0)];
    const { merged } = applyFloorCache(cachedFloor, [ans("tuned", 5.0)], ours);
    expect(merged.some((a) => a.panelId === ours)).toBe(true);
    expect(merged.some((a) => a.panelId === "mirror")).toBe(true);
  });
});
