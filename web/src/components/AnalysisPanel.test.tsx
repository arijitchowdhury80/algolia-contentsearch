/**
 * AnalysisPanel state tests — idle shows the labelled mock preview; the
 * non-terminal states show a status line; 'done' renders real judge data.
 * Uses renderToStaticMarkup (no DOM, no new libs) like Markdown.test.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisPanel, type AnalysisData } from './AnalysisPanel';

const liveData: AnalysisData = {
  synthesizedScore: 5.9,
  judges: [
    { role: 'skeptic', score: 6.5, note: 'grounded but thin' },
    { role: 'referee', score: 7.8, note: 'on topic' },
    { role: 'advocate', score: 8.4, note: 'strong synthesis' },
  ],
  configDiff: [{ dimension: 'Index', askAi: 'mirror', ourSystem: 'tuned' }],
  synthesis: 'live synthesis text',
};

describe('AnalysisPanel', () => {
  it('idle (default) shows a call-to-action, NOT fake scores', () => {
    const html = renderToStaticMarkup(<AnalysisPanel />);
    expect(html).toContain('Judges run here');
    expect(html).not.toContain('Mock'); // no placeholder label
    expect(html).not.toContain('7.6'); // no fabricated score
    expect(html).not.toContain('analysis__grid'); // no score grid before a run
  });

  it('judging shows a scoring status line, not the grid', () => {
    const html = renderToStaticMarkup(<AnalysisPanel state="judging" />);
    expect(html).toContain('Judges scoring');
    expect(html).not.toContain('Mock preview');
    expect(html).not.toContain('analysis__grid');
  });

  it('done renders the real judge data and a Live judged badge', () => {
    const html = renderToStaticMarkup(<AnalysisPanel state="done" data={liveData} />);
    expect(html).toContain('Live judged');
    expect(html).toContain('grounded but thin');
    expect(html).toContain('live synthesis text');
    expect(html).not.toContain('Mock preview');
  });

  it('error surfaces the message', () => {
    const html = renderToStaticMarkup(<AnalysisPanel state="error" error="backend down" />);
    expect(html).toContain('Judge error');
    expect(html).toContain('backend down');
  });
});
