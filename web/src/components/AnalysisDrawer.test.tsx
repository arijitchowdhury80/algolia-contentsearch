/**
 * AnalysisDrawer render tests (static markup, no DOM — like GroupedSources.test).
 * Closed → renders nothing; open shows the dialog; idle shows a call-to-action;
 * done renders real judge data. Esc/focus behaviour is browser-proven (Step 10).
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisDrawer, type AnalysisData } from './AnalysisDrawer';

const noop = () => {};

const liveData: AnalysisData = {
  synthesizedScore: 5.9,
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

describe('AnalysisDrawer', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(<AnalysisDrawer open={false} onClose={noop} />);
    expect(html).toBe('');
  });

  it('open + idle shows the dialog with a call-to-action, NOT fake scores', () => {
    const html = renderToStaticMarkup(<AnalysisDrawer open onClose={noop} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Judges run here');
    expect(html).not.toContain('analysis__grid'); // no score grid before a run
  });

  it('open + judging shows a scoring status line, not the grid', () => {
    const html = renderToStaticMarkup(<AnalysisDrawer open onClose={noop} state="judging" />);
    expect(html).toContain('Judges scoring');
    expect(html).not.toContain('analysis__grid');
  });

  it('open + done renders the real judge data and a Live judged badge', () => {
    const html = renderToStaticMarkup(
      <AnalysisDrawer open onClose={noop} state="done" data={liveData} />,
    );
    expect(html).toContain('Live judged');
    expect(html).toContain('grounded but thin');
    expect(html).toContain('live synthesis text');
  });

  it('open + error surfaces the message', () => {
    const html = renderToStaticMarkup(
      <AnalysisDrawer open onClose={noop} state="error" error="backend down" />,
    );
    expect(html).toContain('Judge error');
    expect(html).toContain('backend down');
  });
});
