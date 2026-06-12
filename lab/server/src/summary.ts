/**
 * summary — per-question + aggregate score table for a scored run.
 */
import { loadScores, type ScoreSet } from "./store.js";

function fmt(n: number): string {
  return n.toFixed(2).padStart(6);
}

export function summarize(runId: string): void {
  const scores: ScoreSet = loadScores(runId);

  // Collect panel ids in first-seen order.
  const panelIds: string[] = [];
  for (const q of scores.questions) {
    for (const p of q.panels) {
      if (!panelIds.includes(p.panelId)) panelIds.push(p.panelId);
    }
  }

  console.log(`\n===== SUMMARY  runId=${runId}  judge=${scores.judgeModel} =====\n`);

  // Per-question table.
  const header = ["Q".padEnd(6), "cat", "split".padEnd(8), ...panelIds.map((p) => p.padStart(8))];
  console.log(header.join(" | "));
  console.log("-".repeat(header.join(" | ").length));

  const totals: Record<string, { sum: number; n: number; gated: number }> = {};
  for (const id of panelIds) totals[id] = { sum: 0, n: 0, gated: 0 };

  for (const q of scores.questions) {
    const byId = new Map(q.panels.map((p) => [p.panelId, p]));
    const cells = panelIds.map((id) => {
      const p = byId.get(id);
      if (!p) return "    -".padStart(8);
      if (p.error) return "  ERR".padStart(8);
      totals[id].sum += p.finalScore;
      totals[id].n += 1;
      if (p.gateTripped) totals[id].gated += 1;
      return (fmt(p.finalScore) + (p.gateTripped ? "*" : " ")).padStart(8);
    });
    console.log(
      [
        q.questionId.padEnd(6),
        String(q.category).padStart(3),
        q.split.padEnd(8),
        ...cells,
      ].join(" | "),
    );
  }

  // Aggregate.
  console.log("-".repeat(header.join(" | ").length));
  const aggCells = panelIds.map((id) => {
    const t = totals[id];
    const mean = t.n ? t.sum / t.n : 0;
    return fmt(mean).padStart(8);
  });
  console.log(
    ["MEAN".padEnd(6), "   ", "".padEnd(8), ...aggCells].join(" | "),
  );

  console.log("\nPer-panel aggregate:");
  for (const id of panelIds) {
    const t = totals[id];
    const mean = t.n ? t.sum / t.n : 0;
    console.log(
      `  ${id.padEnd(8)} mean=${mean.toFixed(2)}  scored=${t.n}  gated=${t.gated}`,
    );
  }
  console.log("\n* = grounding hard-gate tripped (final score capped)\n");
}
