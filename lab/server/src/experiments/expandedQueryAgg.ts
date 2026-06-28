/**
 * expandedQueryAgg — the PURE aggregation for the expandedQuery-drop A/B.
 *
 * Backlog A (SESSION.md): validate that `brain.expandedQuery` (the LLM rephrase
 * before retrieval) gives NO scored answer-quality lift over the raw user turn,
 * so it can be deleted. This module turns the per-question paired verdicts into a
 * keep/drop verdict. Kept pure + side-effect-free so the decision logic is
 * unit-tested without any network (the live harness lives in expandedQueryAb.ts).
 *
 * Convention: delta = rewrite − raw, so a POSITIVE delta means rewriting helped.
 * The decision band (TIE_BAND) absorbs judge round-to-round noise (~±0.3 on the
 * 0–10 composite) so a sub-noise "lift" is not mistaken for signal.
 */

export interface AbDims {
  grounding: number;
  coverage: number;
  depth: number;
  relevance: number;
}

/** One arm's scored verdict for a single question. */
export interface AbArm {
  composite: number;
  dims: AbDims;
  gateTripped: boolean;
  error?: string;
}

/** One question scored under both arms (raw turn vs brain.expandedQuery). */
export interface AbRow {
  id: string;
  category: number;
  isRefusalTest: boolean;
  rawPrompt: string;
  expandedQuery: string;
  /** True when expandedQuery materially differs from the raw prompt (a real rewrite). */
  queryChanged: boolean;
  raw: AbArm;
  rewrite: AbArm;
}

export interface AbStats {
  n: number;
  meanRaw: number;
  meanRewrite: number;
  /** rewrite − raw; positive ⇒ rewriting helped. */
  meanDelta: number;
  wins: number; // rewrite beats raw by > TIE_BAND
  ties: number;
  losses: number; // raw beats rewrite by > TIE_BAND
  dimMeansRaw: AbDims;
  dimMeansRewrite: AbDims;
}

export interface AbAggregate {
  /** Stats over every row both arms scored without error. */
  all: AbStats;
  /** Stats over only the rows where expandedQuery actually rewrote the prompt. */
  changed: AbStats;
  /** Rows dropped from stats because an arm errored. */
  errored: number;
  /** drop = no scored lift (delete expandedQuery); keep = clear lift; inconclusive otherwise. */
  verdict: "drop" | "keep" | "inconclusive";
  /** One-line plain-English rationale for the verdict. */
  rationale: string;
}

/**
 * Noise band on the 0–10 composite. A per-question or mean delta within ±this is
 * treated as a tie (no real difference). 0.3 ≈ the judge's round-to-round σ.
 */
export const TIE_BAND = 0.3;

/** Mean of a list (0 for empty — callers guard n=0 before trusting it). */
function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function dimMeans(arms: AbArm[]): AbDims {
  return {
    grounding: mean(arms.map((a) => a.dims.grounding)),
    coverage: mean(arms.map((a) => a.dims.coverage)),
    depth: mean(arms.map((a) => a.dims.depth)),
    relevance: mean(arms.map((a) => a.dims.relevance)),
  };
}

/** Round to 2dp for stable reporting. */
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

function statsFor(rows: AbRow[]): AbStats {
  const raws = rows.map((r) => r.raw);
  const rewrites = rows.map((r) => r.rewrite);
  let wins = 0;
  let ties = 0;
  let losses = 0;
  for (const row of rows) {
    const d = row.rewrite.composite - row.raw.composite;
    if (d > TIE_BAND) wins++;
    else if (d < -TIE_BAND) losses++;
    else ties++;
  }
  const meanRaw = mean(raws.map((a) => a.composite));
  const meanRewrite = mean(rewrites.map((a) => a.composite));
  return {
    n: rows.length,
    meanRaw: r2(meanRaw),
    meanRewrite: r2(meanRewrite),
    meanDelta: r2(meanRewrite - meanRaw),
    wins,
    ties,
    losses,
    dimMeansRaw: mapDims(dimMeans(raws)),
    dimMeansRewrite: mapDims(dimMeans(rewrites)),
  };
}

function mapDims(d: AbDims): AbDims {
  return { grounding: r2(d.grounding), coverage: r2(d.coverage), depth: r2(d.depth), relevance: r2(d.relevance) };
}

/**
 * Aggregate the paired A/B rows into a keep/drop verdict.
 *
 * Decision (judged on the CHANGED subset — the only rows where expandedQuery did
 * anything; identical-rewrite rows are ties by construction and dilute the mean):
 *   - DROP  when rewriting gives no meaningful composite lift (meanDelta ≤ TIE_BAND)
 *           AND does not improve grounding beyond noise (grounding is the gate).
 *   - KEEP  when rewriting clearly lifts the composite (meanDelta ≥ 2×TIE_BAND).
 *   - INCONCLUSIVE otherwise (or too few changed rows to decide: n < 3).
 */
export function aggregateAb(rows: AbRow[]): AbAggregate {
  const clean = rows.filter((r) => !r.raw.error && !r.rewrite.error);
  const errored = rows.length - clean.length;
  const changed = clean.filter((r) => r.queryChanged);

  const all = statsFor(clean);
  const changedStats = statsFor(changed);

  // Decide on the changed subset; fall back to all if nothing was rewritten.
  const basis = changedStats.n >= 3 ? changedStats : all;
  const groundingLift = basis.dimMeansRewrite.grounding - basis.dimMeansRaw.grounding;

  let verdict: AbAggregate["verdict"];
  let rationale: string;
  if (basis.n < 3) {
    verdict = "inconclusive";
    rationale = `Only ${basis.n} comparable rows — not enough to decide. Run a wider set.`;
  } else if (basis.meanDelta >= 2 * TIE_BAND) {
    verdict = "keep";
    rationale = `Rewriting lifts the composite by +${basis.meanDelta} (≥ ${2 * TIE_BAND}) on ${basis.n} rewritten questions — expandedQuery earns its keep.`;
  } else if (basis.meanDelta <= TIE_BAND && groundingLift <= TIE_BAND) {
    verdict = "drop";
    rationale = `On ${basis.n} rewritten questions, rewriting moves the composite by ${basis.meanDelta} and grounding by ${r2(groundingLift)} — both within noise (±${TIE_BAND}). No scored lift: safe to drop expandedQuery.`;
  } else {
    verdict = "inconclusive";
    rationale = `Mixed signal on ${basis.n} rewritten questions: composite delta ${basis.meanDelta}, grounding delta ${r2(groundingLift)}. Neither clearly helps nor clearly null — widen the set or inspect rows.`;
  }

  return { all, changed: changedStats, errored, verdict, rationale };
}

/** Normalise a query for the "did the rewrite actually change anything" check. */
export function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}
