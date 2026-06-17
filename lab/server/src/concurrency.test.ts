/**
 * Tests for mapWithConcurrency — bounded-parallelism map that preserves input
 * order (used to parallelize the judge + run-tests across questions/panels).
 */
import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency.js";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapWithConcurrency", () => {
  it("preserves input order even when tasks finish out of order", async () => {
    const input = [30, 10, 20, 0];
    const out = await mapWithConcurrency(input, 4, async (n) => {
      await tick(n);
      return n * 2;
    });
    expect(out).toEqual([60, 20, 40, 0]); // aligned to input, not completion order
  });

  it("never runs more than `limit` tasks at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(5 + (i % 3));
      inFlight--;
      return i;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // actually ran in parallel
  });

  it("passes the index and handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    const idx = await mapWithConcurrency(["a", "b", "c"], 2, async (_v, i) => i);
    expect(idx).toEqual([0, 1, 2]);
  });

  it("treats limit <= 0 as sequential (1)", async () => {
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency([1, 2, 3], 0, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(2);
      inFlight--;
    });
    expect(peak).toBe(1);
  });
});
