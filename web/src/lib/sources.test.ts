/** sources — pure grouping/classification tests (no DOM). */
import { describe, it, expect } from 'vitest';
import {
  classifySource,
  groupSources,
  totalSources,
  sourceTitle,
  sourceUrl,
  sourceSummary,
} from './sources';
import type { Source } from '../types/chat';

describe('classifySource', () => {
  it('prefers an explicit source_type over the URL', () => {
    expect(classifySource({ source_type: 'blog', url: 'https://algolia.com/doc/x' })).toBe('blog');
  });

  it('normalizes aliases', () => {
    expect(classifySource({ source_type: 'documentation' })).toBe('doc');
    expect(classifySource({ source_type: 'case_study' })).toBe('customer_story');
    expect(classifySource({ source_type: 'FAQ' })).toBe('support');
  });

  it('infers from the URL path when source_type is absent (the live path)', () => {
    expect(classifySource({ url: 'https://www.algolia.com/doc/guides/typo' })).toBe('doc');
    expect(classifySource({ url: 'https://www.algolia.com/blog/vector' })).toBe('blog');
    expect(classifySource({ url: 'https://www.algolia.com/customers/acme' })).toBe('customer_story');
    expect(classifySource({ url: 'https://academy.algolia.com/lesson' })).toBe('academy');
  });

  it('falls back to "other" for unknown URLs and bare sources', () => {
    expect(classifySource({ url: 'https://example.com/random' })).toBe('other');
    expect(classifySource({ title: 'No URL' })).toBe('other');
  });
});

describe('groupSources', () => {
  const sources: Source[] = [
    { title: 'Typo', url: 'https://algolia.com/doc/guides/typo' },
    { title: 'Ranking', url: 'https://algolia.com/doc/guides/ranking' },
    { title: 'Vector launch', url: 'https://algolia.com/blog/vector' },
    { title: 'Typo dup', url: 'https://algolia.com/doc/guides/typo' }, // dup url
    { summary: 'no url no title' }, // dropped
  ];

  it('buckets by type, dedups within a group, drops empty sources', () => {
    const groups = groupSources(sources);
    expect(groups.map((g) => g.key)).toEqual(['doc', 'blog']); // doc before blog (display order)
    expect(groups[0].sources).toHaveLength(2); // typo dedup'd
    expect(groups[1].sources).toHaveLength(1);
    expect(totalSources(groups)).toBe(3);
  });

  it('returns display order regardless of input order', () => {
    const groups = groupSources([
      { title: 'b', url: 'https://algolia.com/blog/a' },
      { title: 'd', url: 'https://algolia.com/doc/a' },
    ]);
    expect(groups.map((g) => g.key)).toEqual(['doc', 'blog']);
  });

  it('returns [] for no usable sources', () => {
    expect(groupSources([])).toEqual([]);
    expect(groupSources([{ summary: 'x' }])).toEqual([]);
  });

  it('carries label/icon/accent metadata for each group', () => {
    const [docs] = groupSources([{ url: 'https://algolia.com/doc/a' }]);
    expect(docs.label).toBe('Docs');
    expect(docs.icon).toBe('📄');
    expect(docs.accentVar).toBe('--algolia-blue');
  });
});

describe('display helpers', () => {
  it('reads title/url/summary across both field shapes', () => {
    expect(sourceTitle({ doc_title: 'Atlas' })).toBe('Atlas');
    expect(sourceUrl({ doc_url: 'https://x' })).toBe('https://x');
    expect(sourceSummary({ chunk_text: 'body' })).toBe('body');
    expect(sourceTitle({})).toBe('Source');
  });

  it('repairs root-relative source URLs to the canonical algolia.com origin', () => {
    // The tuned index stores path-only URLs; left raw they 404 against the app origin.
    expect(sourceUrl({ url: '/about/news/x' })).toBe('https://www.algolia.com/about/news/x');
    expect(sourceUrl({ doc_url: '/fr/resources/asset/y' })).toBe('https://www.algolia.com/fr/resources/asset/y');
  });

  it('leaves absolute and protocol-relative URLs untouched', () => {
    expect(sourceUrl({ url: 'https://academy.algolia.com/training/z' })).toBe('https://academy.algolia.com/training/z');
    expect(sourceUrl({ url: '//cdn.example.com/a' })).toBe('//cdn.example.com/a');
    expect(sourceUrl({})).toBeUndefined();
  });
});
