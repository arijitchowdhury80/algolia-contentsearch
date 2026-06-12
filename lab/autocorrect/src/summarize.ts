import type { PanelMetrics, SplitMetrics } from "./types.js";

/**
 * One judged answer (one panel, one question), already reduced to the stable
 * judge signals. The orchestrator builds these from the judge's ScoreSet; this
 * module aggregates them into per-split, per-panel metrics. Pure.
 */
export interface ScoredPanelAnswer {
  readonly panelId: string;
  readonly split: "dev" | "held-out";
  /** The judge's stable meanPreGateScore for this answer. */
  readonly meanScore: number;
  /** A reproducible grounding violation tripped the gate for this answer. */
  readonly gated: boolean;
  /** Ambiguous grounding signal (flagged, not capped). */
  readonly borderline: boolean;
  /** Per-rubric-dimension mean score for this answer. */
  readonly dimensionMeans: Readonly<Record<string, number>>;
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Aggregate a panel's answers (one split) into PanelMetrics. */
function aggregatePanel(panelId: string, answers: readonly ScoredPanelAnswer[]): PanelMetrics {
  const dimSums: Record<string, { sum: number; n: number }> = {};
  for (const a of answers) {
    for (const [dim, score] of Object.entries(a.dimensionMeans)) {
      const cur = dimSums[dim] ?? { sum: 0, n: 0 };
      cur.sum += score;
      cur.n += 1;
      dimSums[dim] = cur;
    }
  }
  const dimensionMeans: Record<string, number> = {};
  for (const [dim, { sum, n }] of Object.entries(dimSums)) {
    dimensionMeans[dim] = n === 0 ? 0 : sum / n;
  }

  return {
    panelId,
    meanScore: mean(answers.map((a) => a.meanScore)),
    gatedCount: answers.filter((a) => a.gated).length,
    borderlineCount: answers.filter((a) => a.borderline).length,
    dimensionMeans,
    questionsScored: answers.length,
  };
}

/**
 * Reduce a flat list of judged answers to per-panel metrics for ONE split.
 * Answers from the other split are excluded entirely (so a held-out score can
 * never contaminate the dev metric the loop optimizes). Pure.
 */
export function summarizeSplit(
  answers: readonly ScoredPanelAnswer[],
  split: "dev" | "held-out",
): SplitMetrics {
  const inSplit = answers.filter((a) => a.split === split);
  const byPanel = new Map<string, ScoredPanelAnswer[]>();
  for (const a of inSplit) {
    const arr = byPanel.get(a.panelId) ?? [];
    arr.push(a);
    byPanel.set(a.panelId, arr);
  }
  const panels = [...byPanel.entries()].map(([panelId, ans]) =>
    aggregatePanel(panelId, ans),
  );
  return { split, panels };
}
