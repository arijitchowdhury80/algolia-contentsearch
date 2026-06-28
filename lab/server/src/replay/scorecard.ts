/**
 * Scorecard for the replay gym — ABSOLUTE answer-quality scoring via the mature
 * judge engine (`judgeArtifactMultiRound`). Each replayed AC2 turn is built into
 * a judge Artifact and scored on the 4-dimension rubric (grounding / coverage /
 * depth / relevance); we record the composite finalScore (0–10), whether the
 * grounding gate tripped, and the per-dimension means.
 *
 * History: the old scorecard recorded `pctOfFloor` from the retired single-call
 * reference judge (% of RC2 gold). That judge is gone (Phase 1 of the Confidence
 * refactor); RC2 win/tie/loss is Phase 3. For now the gym scores absolutely.
 */
export interface ScorecardTurn {
  scenarioId: string;
  mode: "single" | "multi";
  turnIndex: number;
  /** Composite 0–10 from the mature engine (aggregate.finalScore). */
  composite: number;
  /** True iff the grounding hard-gate tripped for this turn. */
  gated: boolean;
  /** Per-dimension means (grounding / coverage / depth / relevance), 1–10. */
  dimensions: Record<string, number>;
}

export function summarize(turns: ScorecardTurn[]) {
  const mean = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0;

  const perScenario: Record<string, number> = {};
  const byScenario = new Map<string, number[]>();

  for (const t of turns) {
    if (!byScenario.has(t.scenarioId)) byScenario.set(t.scenarioId, []);
    byScenario.get(t.scenarioId)!.push(t.composite);
  }

  for (const [k, v] of byScenario) {
    perScenario[k] = mean(v);
  }

  return {
    meanComposite: mean(turns.map((t) => t.composite)),
    gatedCount: turns.filter((t) => t.gated).length,
    perScenario,
  };
}
