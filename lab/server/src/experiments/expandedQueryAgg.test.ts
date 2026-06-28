import { describe, it, expect } from "vitest";
import { aggregateAb, normalizeQuery, TIE_BAND, type AbRow } from "./expandedQueryAgg.js";

const DIMS = { grounding: 8, coverage: 8, depth: 8, relevance: 8 };

function row(over: Partial<AbRow> & { rawC: number; rewriteC: number }): AbRow {
  const { rawC, rewriteC, ...rest } = over;
  return {
    id: "x",
    category: 1,
    isRefusalTest: false,
    rawPrompt: "raw prompt",
    expandedQuery: "a different rewritten query",
    queryChanged: true,
    raw: { composite: rawC, dims: { ...DIMS }, gateTripped: false },
    rewrite: { composite: rewriteC, dims: { ...DIMS }, gateTripped: false },
    ...rest,
  };
}

describe("normalizeQuery", () => {
  it("ignores case, punctuation, and whitespace", () => {
    expect(normalizeQuery("What is  Algolia ranking?!")).toBe(
      normalizeQuery("what is algolia ranking"),
    );
  });
});

describe("aggregateAb verdict", () => {
  it("DROPs when rewriting gives no composite lift and no grounding lift", () => {
    const rows = [row({ rawC: 8, rewriteC: 8 }), row({ rawC: 7, rewriteC: 7.1 }), row({ rawC: 6, rewriteC: 5.9 })];
    const agg = aggregateAb(rows);
    expect(agg.verdict).toBe("drop");
    expect(agg.changed.n).toBe(3);
    expect(Math.abs(agg.changed.meanDelta)).toBeLessThanOrEqual(TIE_BAND);
  });

  it("KEEPs when rewriting clearly lifts the composite", () => {
    const rows = [row({ rawC: 5, rewriteC: 7 }), row({ rawC: 6, rewriteC: 7.5 }), row({ rawC: 5, rewriteC: 6.5 })];
    const agg = aggregateAb(rows);
    expect(agg.verdict).toBe("keep");
    expect(agg.changed.wins).toBe(3);
  });

  it("counts win/tie/loss against the noise band", () => {
    const rows = [
      row({ rawC: 5, rewriteC: 6 }), // win (+1)
      row({ rawC: 6, rewriteC: 6.1 }), // tie (within band)
      row({ rawC: 7, rewriteC: 5 }), // loss (−2)
    ];
    const s = aggregateAb(rows).changed;
    expect(s.wins).toBe(1);
    expect(s.ties).toBe(1);
    expect(s.losses).toBe(1);
  });

  it("is inconclusive with fewer than 3 comparable rows", () => {
    const agg = aggregateAb([row({ rawC: 8, rewriteC: 8 })]);
    expect(agg.verdict).toBe("inconclusive");
  });

  it("excludes errored arms from the stats", () => {
    const good = row({ rawC: 8, rewriteC: 8 });
    const bad = row({ rawC: 0, rewriteC: 0 });
    bad.rewrite = { ...bad.rewrite, error: "agent HTTP 500" };
    const agg = aggregateAb([good, good, good, bad]);
    expect(agg.errored).toBe(1);
    expect(agg.all.n).toBe(3);
  });

  it("decides on the changed subset, not identical-rewrite ties", () => {
    // 3 real rewrites that clearly help + 5 no-op rewrites (queryChanged:false) that tie.
    const rewrites = [row({ rawC: 5, rewriteC: 7 }), row({ rawC: 5, rewriteC: 7 }), row({ rawC: 5, rewriteC: 7 })];
    const noops = Array.from({ length: 5 }, () =>
      row({ rawC: 8, rewriteC: 8, queryChanged: false, expandedQuery: "raw prompt" }),
    );
    const agg = aggregateAb([...rewrites, ...noops]);
    // The changed subset shows the lift; verdict must be driven by it.
    expect(agg.changed.n).toBe(3);
    expect(agg.verdict).toBe("keep");
  });
});
