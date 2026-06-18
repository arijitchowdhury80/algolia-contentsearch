/**
 * AnalysisRail render tests (static markup, no DOM). Collapsed → strip; open+idle
 * → call-to-action (NO fake scores); open+judging → status line; open+done →
 * real 3-dimension data; pinned → collapse button disabled.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisRail, type AnalysisData } from './AnalysisRail';

const noop = () => {};
const base = {
  pinned: false,
  width: 380,
  onToggleOpen: noop,
  onTogglePin: noop,
  onResizeStart: noop,
};

const liveData: AnalysisData = {
  synthesizedScore: 5.9,
  gateTripped: false,
  borderline: false,
  dimensions: [
    { id: 'grounding', label: 'Grounding', score: 7 },
    { id: 'confidence', label: 'Answer confidence', score: 6 },
    { id: 'breadth_depth', label: 'Breadth & depth', score: 8 },
  ],
  floorScore: 4.4,
  floorGateTripped: true,
  judges: [
    { role: 'skeptic', score: 6.5, note: 'grounded but thin' },
    { role: 'referee', score: 7.8, note: 'on topic' },
    { role: 'advocate', score: 8.4, note: 'strong synthesis' },
  ],
  configDiff: [{ dimension: 'Index', askAi: 'mirror', ourSystem: 'tuned' }],
  synthesis: 'live synthesis text',
  laneScores: {
    tuned: { score: 5.9, gateTripped: false, borderline: false },
    mirror: { score: 4.4, gateTripped: true, borderline: false },
  },
};

describe('AnalysisRail', () => {
  it('collapsed renders the strip (expandable), not the full grid', () => {
    const html = renderToStaticMarkup(<AnalysisRail open={false} {...base} state="done" data={liveData} />);
    expect(html).toContain('arail--collapsed');
    expect(html).toContain('Expand analysis rail');
    expect(html).not.toContain('arail__grid');
  });

  it('open + idle shows a call-to-action, NOT fake scores', () => {
    const html = renderToStaticMarkup(<AnalysisRail open {...base} state="idle" />);
    expect(html).toContain('arail--open');
    expect(html).toContain('Judges run here');
    expect(html).not.toContain('arail__grid');
  });

  it('open + judging shows streamed progress (count + per-panel scores), not the grid', () => {
    const html = renderToStaticMarkup(
      <AnalysisRail
        open
        {...base}
        state="judging"
        progress={{ total: 2, done: [{ panelId: 'mirror', score: 4.4, gateTripped: true }] }}
      />,
    );
    expect(html).toContain('Judging on the fast panel');
    expect(html).toContain('1/2'); // 1 of 2 panels judged so far
    expect(html).toContain('4.4'); // the landed ② score
    expect(html).not.toContain('arail__grid');
  });

  it('open + done renders the 3-dimension breakdown, judges, margin and synthesis', () => {
    const html = renderToStaticMarkup(<AnalysisRail open {...base} state="done" data={liveData} />);
    expect(html).toContain('arail__grid');
    expect(html).toContain('Grounding');
    expect(html).toContain('Answer confidence');
    expect(html).toContain('Breadth &amp; depth');
    expect(html).toContain('grounded but thin');
    expect(html).toContain('Margin vs'); // ②-vs-③ section present (floorScore set)
    expect(html).toContain('live synthesis text');
  });

  it('open + error surfaces the message', () => {
    const html = renderToStaticMarkup(<AnalysisRail open {...base} state="error" error="backend down" />);
    expect(html).toContain('Judge error');
    expect(html).toContain('backend down');
  });

  it('pinned disables the collapse button', () => {
    const html = renderToStaticMarkup(<AnalysisRail open {...base} pinned state="idle" />);
    expect(html).toContain('aria-label="Collapse analysis rail"');
    expect(html).toMatch(/Collapse analysis rail[^>]*disabled|disabled[^>]*Collapse analysis rail/);
  });
});
