/**
 * GroupedSources render tests (static markup, no DOM — like AnalysisPanel.test).
 * Collapsed state only; the popover open/close interaction is browser-proven.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GroupedSources } from './GroupedSources';
import type { Source } from '../types/chat';

const sources: Source[] = [
  { title: 'Typo tolerance', url: 'https://www.algolia.com/doc/guides/typo' },
  { title: 'Ranking', url: 'https://www.algolia.com/doc/guides/ranking' },
  { title: 'Vector launch', url: 'https://www.algolia.com/blog/vector' },
];

describe('GroupedSources', () => {
  it('renders one collapsed pill per group with counts', () => {
    const html = renderToStaticMarkup(<GroupedSources sources={sources} />);
    expect(html).toContain('Docs');
    expect(html).toContain('Blog');
    expect(html).toContain('srcpill__count');
    // collapsed by default: triggers report aria-expanded=false, no panel in markup
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('srcpop__list');
  });

  it('uses a descriptive accessible label on each pill', () => {
    const html = renderToStaticMarkup(<GroupedSources sources={sources} />);
    expect(html).toContain('Docs: 2 sources');
    expect(html).toContain('Blog: 1 source');
  });

  it('renders nothing when there are no usable sources', () => {
    expect(renderToStaticMarkup(<GroupedSources sources={[]} />)).toBe('');
    expect(renderToStaticMarkup(<GroupedSources sources={[{ summary: 'x' }]} />)).toBe('');
  });
});
