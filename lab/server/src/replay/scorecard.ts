export interface ScorecardTurn {
  scenarioId: string;
  mode: "single" | "multi";
  turnIndex: number;
  pctOfFloor: number;
  gated: boolean;
  retrievalGaps: number;
  generationGaps: number;
}

export function summarize(turns: ScorecardTurn[]) {
  const mean = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

  const perScenario: Record<string, number> = {};
  const byScenario = new Map<string, number[]>();

  for (const t of turns) {
    if (!byScenario.has(t.scenarioId)) byScenario.set(t.scenarioId, []);
    byScenario.get(t.scenarioId)!.push(t.pctOfFloor);
  }

  for (const [k, v] of byScenario) {
    perScenario[k] = mean(v);
  }

  return {
    meanPctOfFloor: mean(turns.map((t) => t.pctOfFloor)),
    gatedCount: turns.filter((t) => t.gated).length,
    perScenario,
  };
}
