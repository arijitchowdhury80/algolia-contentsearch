import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SampleQuestions } from './SampleQuestions';

describe('SampleQuestions', () => {
  it('collapsed (default): shows the toggle + count, not the grouped panel', () => {
    const html = renderToStaticMarkup(<SampleQuestions onSelect={() => {}} />);
    expect(html).toContain('Sample questions');
    expect(html).toContain('27'); // count badge
    expect(html).not.toContain('sampleq__panel'); // panel collapsed
    expect(html).not.toContain('Factual lookup');
  });

  it('expanded: renders all 8 category labels and question labels', () => {
    const html = renderToStaticMarkup(<SampleQuestions onSelect={() => {}} defaultOpen />);
    for (const label of [
      'Factual lookup',
      'How-to / implementation',
      'Conceptual explainer',
      'Broad / exploratory',
      'Troubleshooting',
      'Comparison',
      'Grounding stress-tests',
      'Multi-turn (two-way)',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('What is vector search?');
    expect(html).toContain('Typo tolerance →');
  });
});
