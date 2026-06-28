/**
 * routingAgg — PURE aggregation + verdict for the content-source routing spike.
 *
 * Turns per-question A/B/C verdicts into the kill / router-bottleneck /
 * multi-agent-wins decision. Kept side-effect-free so the decision logic is
 * unit-tested without network (the live harness lives in sourceRoutingAb.ts).
 *
 * Panels (see the plan):
 *   A = single all-source generalist (baseline)
 *   B = ORACLE-routed source specialist (isolates "does source-honing help")
 *   C = REAL-router source specialist  (adds router-error cost on top of B)
 *
 * Deltas are vs the baseline A. TIE_BAND absorbs judge round-to-round noise (~±0.3
 * on the 0–10 composite) so sub-noise "lift" is not mistaken for signal.
 */

export interface RoutingDims {
  grounding: number;
  coverage: number;
  depth: number;
  relevance: number;
}

/** One panel's scored verdict for a single question. */
export interface PanelScore {
  composite: number;
  dims: RoutingDims;
  gateTripped: boolean;
  error?: string;
}

/** One question scored under all three panels, plus routing ground-truth. */
export interface RoutingRow {
  id: string;
  category: number;
  /** Oracle hand-label = the specialist Panel B used + ground truth for Panel C. */
  sourceLabel: string;
  /** What Panel C's real classifier actually picked. */
  routedLabel: string;
  /** routedLabel === sourceLabel. */
  routedCorrect: boolean;
  /** True = question legitimately spans 2+ sources (oracle is the primary domain). */
  span: boolean;
  A: PanelScore;
  B: PanelScore;
  C: PanelScore;
}

export interface RoutingStats {
  n: number;
  meanA: number;
  meanB: number;
  meanC: number;
  /** meanB − meanA; positive ⇒ oracle source-honing beat the generalist. */
  deltaBA: number;
  /** meanC − meanA; positive ⇒ end-to-end real routing beat the generalist. */
  deltaCA: number;
  /** B vs A. */
  bWins: number;
  bTies: number;
  bLosses: number;
  /** C vs A. */
  cWins: number;
  cTies: number;
  cLosses: number;
  dimMeansA: RoutingDims;
  dimMeansB: RoutingDims;
  dimMeansC: RoutingDims;
}

export type RoutingVerdict =
  | "kill"
  | "router-bottleneck"
  | "multi-agent-wins"
  | "inconclusive";

export interface RoutingAggregate {
  /** Stats over every row all three panels scored without error. */
  all: RoutingStats;
  /** Stats over clean rows that are single-domain (span === false). */
  clean: RoutingStats;
  /** Stats over clean rows that span 2+ sources (span === true). */
  span: RoutingStats;
  /** Rows dropped from stats because a panel errored. */
  errored: number;
  /** Panel C router accuracy over clean rows (routedCorrect / n). */
  routerAccuracy: number;
  verdict: RoutingVerdict;
  rationale: string;
}

/** Noise band on the 0–10 composite; a delta within ±this is a tie. */
export const TIE_BAND = 0.3;

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

function dimMeans(scores: PanelScore[]): RoutingDims {
  return {
    grounding: r2(mean(scores.map((s) => s.dims.grounding))),
    coverage: r2(mean(scores.map((s) => s.dims.coverage))),
    depth: r2(mean(scores.map((s) => s.dims.depth))),
    relevance: r2(mean(scores.map((s) => s.dims.relevance))),
  };
}

/** Win/tie/loss of `arm` vs `base` across rows, banded by TIE_BAND. */
function record(rows: RoutingRow[], base: (r: RoutingRow) => PanelScore, arm: (r: RoutingRow) => PanelScore) {
  let wins = 0;
  let ties = 0;
  let losses = 0;
  for (const r of rows) {
    const d = arm(r).composite - base(r).composite;
    if (d > TIE_BAND) wins++;
    else if (d < -TIE_BAND) losses++;
    else ties++;
  }
  return { wins, ties, losses };
}

function statsFor(rows: RoutingRow[]): RoutingStats {
  const A = rows.map((r) => r.A);
  const B = rows.map((r) => r.B);
  const C = rows.map((r) => r.C);
  const meanA = mean(A.map((s) => s.composite));
  const meanB = mean(B.map((s) => s.composite));
  const meanC = mean(C.map((s) => s.composite));
  const b = record(rows, (r) => r.A, (r) => r.B);
  const c = record(rows, (r) => r.A, (r) => r.C);
  return {
    n: rows.length,
    meanA: r2(meanA),
    meanB: r2(meanB),
    meanC: r2(meanC),
    deltaBA: r2(meanB - meanA),
    deltaCA: r2(meanC - meanA),
    bWins: b.wins,
    bTies: b.ties,
    bLosses: b.losses,
    cWins: c.wins,
    cTies: c.ties,
    cLosses: c.losses,
    dimMeansA: dimMeans(A),
    dimMeansB: dimMeans(B),
    dimMeansC: dimMeans(C),
  };
}

/**
 * Aggregate the per-question A/B/C rows into the spike verdict (decided on the
 * clean = error-free set):
 *   - INCONCLUSIVE  when n < 3.
 *   - KILL          when oracle honing gives no lift over baseline (deltaBA ≤ TIE_BAND)
 *                   — multi-agent is pure overhead; stop before building any router.
 *   - MULTI-AGENT-WINS when end-to-end real routing clearly beats baseline (deltaCA > 2×TIE_BAND).
 *   - ROUTER-BOTTLENECK when oracle clearly helps (deltaBA > 2×TIE_BAND) but real
 *                   routing loses it (deltaCA ≤ TIE_BAND) — classification is the fixable gap.
 *   - INCONCLUSIVE  otherwise (mixed/sub-threshold signal).
 */
export function aggregateRouting(rows: RoutingRow[]): RoutingAggregate {
  const clean = rows.filter((r) => !r.A.error && !r.B.error && !r.C.error);
  const errored = rows.length - clean.length;

  const all = statsFor(clean);
  const cleanSingle = statsFor(clean.filter((r) => !r.span));
  const cleanSpan = statsFor(clean.filter((r) => r.span));

  const routerAccuracy =
    clean.length === 0 ? 0 : r2(clean.filter((r) => r.routedCorrect).length / clean.length);

  const { deltaBA, deltaCA, n } = all;
  let verdict: RoutingVerdict;
  let rationale: string;
  if (n < 3) {
    verdict = "inconclusive";
    rationale = `Only ${n} comparable rows — not enough to decide. Run a wider set.`;
  } else if (deltaBA <= TIE_BAND) {
    verdict = "kill";
    rationale = `Oracle source-honing moves the composite by ${deltaBA} vs the all-source baseline (within ±${TIE_BAND} noise) on ${n} questions. Source routing does not improve answers — multi-agent is pure overhead. Kill it.`;
  } else if (deltaCA > 2 * TIE_BAND) {
    verdict = "multi-agent-wins";
    rationale = `End-to-end real routing lifts the composite by +${deltaCA} (≥ ${2 * TIE_BAND}) over baseline on ${n} questions, router accuracy ${Math.round(routerAccuracy * 100)}%. Content-source multi-agent wins — productionize.`;
  } else if (deltaBA > 2 * TIE_BAND && deltaCA <= TIE_BAND) {
    verdict = "router-bottleneck";
    rationale = `Oracle routing lifts +${deltaBA} but real routing only ${deltaCA} (router accuracy ${Math.round(routerAccuracy * 100)}%). Source-honing works; the classifier loses it — fix routing, don't kill the architecture.`;
  } else {
    verdict = "inconclusive";
    rationale = `Mixed signal on ${n} questions: ΔBA ${deltaBA}, ΔCA ${deltaCA}. Neither a clear win nor a clear null — widen the set or inspect rows.`;
  }

  return { all, clean: cleanSingle, span: cleanSpan, errored, routerAccuracy, verdict, rationale };
}
