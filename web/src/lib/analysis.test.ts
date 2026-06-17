import { describe, it, expect } from 'vitest';
import { toAnalysisData } from './analysis';
import type { JudgeResult } from './judgeClient';

const result: JudgeResult = {
  rounds: 2,
  panels: [
    {
      panelId: 'mirror',
      judges: [{ role: 'referee', score: 4.4, note: 'floor' }],
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

  it('includes the ②-vs-③ margin and gate state in the synthesis text', () => {
    const data = toAnalysisData(result, 'tuned', 'mirror');
    expect(data.synthesis).toContain('5.9'); // ours
    expect(data.synthesis).toContain('4.4'); // floor
    expect(data.synthesis.toLowerCase()).toContain('ours rationale'.toLowerCase());
  });

  it('throws if the ours panel is missing from the result', () => {
    expect(() => toAnalysisData({ rounds: 2, panels: [] }, 'tuned', 'mirror')).toThrow();
  });
});
