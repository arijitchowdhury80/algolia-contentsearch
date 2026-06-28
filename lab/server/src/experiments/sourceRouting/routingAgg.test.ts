import { describe, it, expect } from "vitest";
import { aggregateRouting, type RoutingRow, type PanelScore } from "./routingAgg.js";

type Opts = { span?: boolean; oracle?: string; routed?: string; errC?: boolean };

const dims = (c: number) => ({ grounding: c, coverage: c, depth: c, relevance: c });
const score = (composite: number, error?: string): PanelScore => ({
  composite,
  dims: dims(composite),
  gateTripped: false,
  ...(error ? { error } : {}),
});

function mkRow(id: string, a: number, b: number, c: number, o: Opts = {}): RoutingRow {
  const oracle = o.oracle ?? "technical";
  const routed = o.routed ?? oracle;
  return {
    id,
    category: 1,
    sourceLabel: oracle,
    routedLabel: routed,
    routedCorrect: routed === oracle,
    span: o.span ?? false,
    A: score(a),
    B: score(b),
    C: o.errC ? score(0, "judge err") : score(c),
  };
}

describe("aggregateRouting verdict", () => {
  it("KILL when oracle (B) gives no lift over baseline (A)", () => {
    const rows = [mkRow("1", 7, 7.1, 7.0), mkRow("2", 6.5, 6.4, 6.6), mkRow("3", 7.2, 7.3, 7.1), mkRow("4", 6.8, 6.9, 6.7)];
    const agg = aggregateRouting(rows);
    expect(agg.verdict).toBe("kill");
  });

  it("MULTI-AGENT-WINS when end-to-end real routing (C) clearly beats baseline", () => {
    const rows = [mkRow("1", 6, 7.2, 7.0), mkRow("2", 6, 7.3, 7.1), mkRow("3", 6, 7.1, 6.9), mkRow("4", 6, 7.4, 7.2)];
    const agg = aggregateRouting(rows);
    expect(agg.verdict).toBe("multi-agent-wins");
  });

  it("ROUTER-BOTTLENECK when oracle helps but real routing loses it", () => {
    const rows = [mkRow("1", 6, 7.0, 6.1), mkRow("2", 6, 7.1, 6.0), mkRow("3", 6, 6.9, 6.2), mkRow("4", 6, 7.0, 5.9)];
    const agg = aggregateRouting(rows);
    expect(agg.verdict).toBe("router-bottleneck");
  });

  it("INCONCLUSIVE when fewer than 3 comparable rows", () => {
    const rows = [mkRow("1", 6, 7.5, 7.5), mkRow("2", 6, 7.5, 7.5)];
    expect(aggregateRouting(rows).verdict).toBe("inconclusive");
  });

  it("excludes errored rows from the stats and counts them", () => {
    const rows = [
      mkRow("1", 7, 7.1, 7.0),
      mkRow("2", 6.5, 6.4, 6.6),
      mkRow("3", 7.2, 7.3, 7.1),
      mkRow("4", 6.8, 6.9, 6.7),
      mkRow("err", 6, 9, 0, { errC: true }),
    ];
    const agg = aggregateRouting(rows);
    expect(agg.errored).toBe(1);
    expect(agg.all.n).toBe(4);
    expect(agg.verdict).toBe("kill");
  });

  it("computes router accuracy over clean rows", () => {
    const rows = [
      mkRow("1", 6, 6, 6, { oracle: "support", routed: "support" }),
      mkRow("2", 6, 6, 6, { oracle: "academy", routed: "academy" }),
      mkRow("3", 6, 6, 6, { oracle: "technical", routed: "technical" }),
      mkRow("4", 6, 6, 6, { oracle: "marketer", routed: "support" }), // miss
    ];
    expect(aggregateRouting(rows).routerAccuracy).toBe(0.75);
  });

  it("splits clean-vs-span stats", () => {
    const rows = [
      mkRow("1", 6, 7.5, 7.4, { span: false }),
      mkRow("2", 6, 7.6, 7.5, { span: false }),
      mkRow("3", 6, 7.4, 7.3, { span: false }),
      mkRow("s1", 6, 6.1, 6.0, { span: true }),
      mkRow("s2", 6, 6.0, 6.1, { span: true }),
      mkRow("s3", 6, 6.2, 6.0, { span: true }),
    ];
    const agg = aggregateRouting(rows);
    expect(agg.clean.n).toBe(3); // single-domain
    expect(agg.span.n).toBe(3);
    expect(agg.clean.deltaBA).toBeGreaterThan(1); // honing helps single-domain
    expect(agg.span.deltaBA).toBeLessThanOrEqual(0.3); // ties on span
  });
});
