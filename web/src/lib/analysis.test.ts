import { describe, it, expect } from 'vitest';
import { toAnalysisData } from './analysis';
import type { JudgeResult } from './judgeClient';

const result: JudgeResult = {
  rounds: 2,
  panels: [
    {
      panelId: 'mirror',
      judges: [{ role: 'referee', score: 4.4, note: 'floor' }],
      dimensions: [{ id: 'grounding', label: 'Grounding', score: 4 }],
      violations: [{ claim: 'floor claim', reason: 'unsupported', confidence: 0.8 }],
      synthesizedScore: 4.4,
      preGateScore: 4.6,
      gateTripped: true,
      borderline: false,
      rationale: 'floor rationale',
    },
    {
      panelId: 'tuned',
      judges: [
        { role: 'skeptic', score: 6.5, note: 'grounded but thin' },
        { role: 'referee', score: 7.8, note: 'on topic' },
        { role: 'advocate', score: 8.4, note: 'strong synthesis' },
      ],
      dimensions: [
        { id: 'grounding', label: 'Grounding', score: 7 },
        { id: 'confidence', label: 'Answer confidence', score: 6 },
        { id: 'breadth_depth', label: 'Breadth & depth', score: 8 },
      ],
      violations: [{ claim: 'ours claim', reason: 'not in sources', confidence: 0.85 }],
      synthesizedScore: 5.9,
      preGateScore: 6.4,
      gateTripped: false,
      borderline: false,
      rationale: 'ours rationale',
    },
  ],
};

describe('toAnalysisData', () => {
  it('maps the ours panel to live analysis data', () => {
    const data = toAnalysisData(result, 'tuned', 'mirror');
    expect(data.synthesizedScore).toBe(5.9);
    expect(data.judges.map((j) => j.role).sort()).toEqual(['advocate', 'referee', 'skeptic']);
    expect(data.judges.find((j) => j.role === 'advocate')!.score).toBe(8.4);
  });

  it('carries the ③ 3-dimension breakdown and the ② floor score', () => {
    const data = toAnalysisData(result, 'tuned', 'mirror');
    expect(data.dimensions.map((d) => d.id)).toEqual(['grounding', 'confidence', 'breadth_depth']);
    expect(data.gateTripped).toBe(false);
    expect(data.floorScore).toBe(4.4);
    expect(data.floorGateTripped).toBe(true);
    expect(data.violations).toEqual([
      { claim: 'ours claim', reason: 'not in sources', confidence: 0.85 },
    ]);
  });

  it('includes the ②-vs-③ margin and gate state in the synthesis text', () => {
    const data = toAnalysisData(result, 'tuned', 'mirror');
    expect(data.synthesis).toContain('5.9'); // ours
    expect(data.synthesis).toContain('4.4'); // floor
    expect(data.synthesis.toLowerCase()).toContain('ours rationale'.toLowerCase());
  });

  it('surfaces every judged panel in laneScores (both ② and ③), with gate state', () => {
    const data = toAnalysisData(result, 'tuned', 'mirror');
    expect(Object.keys(data.laneScores).sort()).toEqual(['mirror', 'tuned']);
    expect(data.laneScores.tuned).toEqual({ score: 5.9, gateTripped: false, borderline: false });
    expect(data.laneScores.mirror).toEqual({ score: 4.4, gateTripped: true, borderline: false });
  });

  it('omits a panel from laneScores when its judging errored', () => {
    const withError: JudgeResult = {
      rounds: 1,
      panels: [
        result.panels[1], // tuned, ok
        { ...result.panels[0], error: 'judge failed' }, // mirror errored
      ],
    };
    const data = toAnalysisData(withError, 'tuned', 'mirror');
    expect(Object.keys(data.laneScores)).toEqual(['tuned']);
  });

  it('throws if the ours panel is missing from the result', () => {
    expect(() => toAnalysisData({ rounds: 2, panels: [] }, 'tuned', 'mirror')).toThrow();
  });
});
