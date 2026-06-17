/**
 * analysis — map a live JudgeResult into the AnalysisDrawer's AnalysisData.
 * Pure. The ③ Our System panel drives the judges + headline score; the ② Ask AI
 * panel (the floor) is folded into the synthesis as the real margin. Every judged
 * panel's score is also surfaced in `laneScores` for the always-visible lane pills.
 */
import type { AnalysisData } from '../components/AnalysisDrawer';
import type { LaneScore } from './score';
import type { JudgeResult } from './judgeClient';

/** Static config context (genuinely fixed — not judge output). */
const CONFIG_DIFF = [
  { dimension: 'Index', askAi: 'mirror (faithful)', ourSystem: 'tuned (optimized)' },
  { dimension: 'Prompt', askAi: 'Ask-AI default', ourSystem: 'Hardened grounded prompt' },
  { dimension: 'Retrieval', askAi: 'Default ranking', ourSystem: 'Tuned ranking + synonyms' },
];

function gateNote(tripped: boolean, borderline: boolean): string {
  if (tripped) return 'grounding gate TRIPPED (unsupported claim)';
  if (borderline) return 'grounding borderline';
  return 'grounding clean';
}

export function toAnalysisData(
  result: JudgeResult,
  oursPanelId: string,
  floorPanelId: string,
): AnalysisData {
  const ours = result.panels.find((p) => p.panelId === oursPanelId);
  if (!ours) {
    throw new Error(`live judge result missing the "${oursPanelId}" panel`);
  }
  const floor = result.panels.find((p) => p.panelId === floorPanelId);

  const marginBits: string[] = [
    `③ Our System scored ${ours.synthesizedScore.toFixed(1)}/10 (${gateNote(ours.gateTripped, ours.borderline)})`,
  ];
  if (floor && !floor.error) {
    const delta = ours.synthesizedScore - floor.synthesizedScore;
    const verb = delta >= 0 ? 'ahead of' : 'behind';
    marginBits.push(
      `② Ask AI scored ${floor.synthesizedScore.toFixed(1)} — ③ is ${Math.abs(delta).toFixed(1)} ${verb} the floor.`,
    );
  }
  const synthesis = `${marginBits.join(' ')} ${ours.rationale}`.trim();

  // Surface every judged panel's score for the always-visible lane pills.
  const laneScores: Record<string, LaneScore> = {};
  for (const p of result.panels) {
    if (p.error) continue; // a panel that failed to judge has no headline
    laneScores[p.panelId] = {
      score: p.synthesizedScore,
      gateTripped: p.gateTripped,
      borderline: p.borderline,
    };
  }

  return {
    synthesizedScore: ours.synthesizedScore,
    judges: ours.judges.map((j) => ({ role: j.role, score: j.score, note: j.note })),
    configDiff: CONFIG_DIFF,
    synthesis,
    laneScores,
  };
}
