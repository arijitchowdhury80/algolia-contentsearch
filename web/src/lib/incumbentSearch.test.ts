import { describe, it, expect } from 'vitest';
import { mapHitsToWebsiteResult, searchIncumbent } from './incumbentSearch';
import type { SearchClient } from 'algoliasearch';

describe('mapHitsToWebsiteResult', () => {
  it('maps title/url/snippet the way the live site does, with title fallbacks', () => {
    const r = mapHitsToWebsiteResult(
      [
        { objectID: 'a', title: 'NeuralSearch', url: 'https://www.algolia.com/x', description: 'AI search.' },
        { objectID: 'b', name: 'By name', permalink: 'https://p/y' },
        { h1: 'By h1' },
      ],
      'neuralsearch',
    );
    expect(r.sources[0]).toEqual({ id: 'a', text: 'NeuralSearch — AI search.', label: 'https://www.algolia.com/x' });
    expect(r.sources[1]).toEqual({ id: 'b', text: 'By name', label: 'https://p/y' });
    expect(r.sources[2].text).toBe('By h1'); // no url → no label
    expect(r.sources[2].label).toBeUndefined();
  });

  it('absolutizes root-relative site URLs to www.algolia.com', () => {
    const r = mapHitsToWebsiteResult([{ objectID: 'c', title: 'Feature', url: '/products/features/neuralsearch' }], 'q');
    expect(r.sources[0].label).toBe('https://www.algolia.com/products/features/neuralsearch');
  });

  it('summarizes the result count in the answer line', () => {
    expect(mapHitsToWebsiteResult([{ objectID: '1', title: 't' }], 'foo').answer).toContain('1 live algolia.com result');
    expect(mapHitsToWebsiteResult([], 'foo').answer).toContain('no results');
  });
});

describe('searchIncumbent', () => {
  it('runs a keyword search via the injected client and maps the hits', async () => {
    let calledIndex = '';
    const fake = {
      searchSingleIndex: async ({ indexName }: { indexName: string }) => {
        calledIndex = indexName;
        return { hits: [{ objectID: 'z', title: 'Hit', url: 'https://www.algolia.com/z' }], nbHits: 1 };
      },
    } as unknown as SearchClient;

    const res = await searchIncumbent(
      { appId: 'APP', searchKey: 'KEY', indexName: 'ALGOLIA_WWW_PROD_V2' },
      'vector search',
      fake,
    );
    expect(calledIndex).toBe('ALGOLIA_WWW_PROD_V2');
    expect(res.sources).toHaveLength(1);
    expect(res.sources[0].label).toBe('https://www.algolia.com/z');
  });
});
