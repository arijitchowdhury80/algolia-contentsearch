/**
 * summary — per-question table + the 1×2 (single vs multi) leaderboard for a scored run.
 *
 *   | Architecture | Neural        |
 *   | Single       | P3            |
 *   | Multi        | P4            |
 *
 * The argument is the one delta:
 *   multi-lift  = P4 − P3 (multi neural vs single neural)
 */
import { loadScores, type ScoreSet } from "./store.js";

function fmt(n: number): string {
  return n.toFixed(2).padStart(6);
}

/** Canonical 1×2 placement for the two neural panels (matches panels.ts). */
const PANEL_GRID: Record<string, { arch: "single" | "multi"; retrieval: "keyword" | "neural" }> = {
  P3: { arch: "single", retrieval: "neural" },
  P4: { arch: "multi", retrieval: "neural" },
};

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

  // Aggregate row.
  console.log("-".repeat(header.join(" | ").length));
  const mean = (id: string): number => {
    const t = totals[id];
    return t && t.n ? t.sum / t.n : 0;
  };
  const aggCells = panelIds.map((id) => fmt(mean(id)).padStart(8));
  console.log(["MEAN".padEnd(6), "   ", "".padEnd(8), ...aggCells].join(" | "));

  // Neural-only leaderboard: single vs multi.
  const have = (id: string) => panelIds.includes(id);
  if (have("P3") || have("P4")) {
    console.log("\nLEADERBOARD (neural only, mean composite):");
    console.log("              Single        Multi");
    const row = (label: string, single: string, multi: string) =>
      console.log(
        `  ${label.padEnd(10)} ${(have(single) ? mean(single).toFixed(2) : "  -").padStart(8)} (${single})  ${(have(multi) ? mean(multi).toFixed(2) : "  -").padStart(8)} (${multi})`,
      );
    row("neural", "P3", "P4");

    // The one delta.
    const delta = (a: string, b: string): string =>
      have(a) && have(b) ? (mean(a) - mean(b) >= 0 ? "+" : "") + (mean(a) - mean(b)).toFixed(2) : "n/a";
    console.log("\nDELTA (single vs multi):");
    console.log(`  multi-lift = P4−P3 = ${delta("P4", "P3")}`);
  }

  console.log("\nPer-panel aggregate:");
  for (const id of panelIds) {
    const t = totals[id];
    const grid = PANEL_GRID[id];
    const tag = grid ? ` [${grid.arch}/${grid.retrieval}]` : "";
    console.log(
      `  ${id.padEnd(4)}${tag.padEnd(20)} mean=${mean(id).toFixed(2)}  scored=${t.n}  gated=${t.gated}`,
    );
  }
  console.log("\n* = grounding hard-gate tripped (final score capped)\n");
}
