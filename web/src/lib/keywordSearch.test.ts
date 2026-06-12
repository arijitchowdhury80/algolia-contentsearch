/**
 * keywordSearch — Column 1 (live keyword search) contract.
 *
 * The filter string is an Algolia API contract captured verbatim from production
 * traffic (docs/project-overview.md Appendix A, lines 271-272). It MUST match the
 * incumbent exactly so column 1 is a faithful "old-world" reference in the A/B.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildKeywordFilters, keywordSearch } from './keywordSearch';

describe('buildKeywordFilters', () => {
    it('returns the exact Appendix-A production filter string', () => {
        // Verbatim from production: is404 is an unquoted boolean; algoliaDisabled
        // is a quoted string. Do not "tidy" the quoting — it mirrors the incumbent.
        expect(buildKeywordFilters()).toBe(
            'language_code:en AND NOT is404:true AND NOT algoliaDisabled:"true"'
        );
    });
});

describe('keywordSearch', () => {
    it('calls searchSingleIndex with the index, query, and Appendix-A filters', async () => {
        const hits = [{ objectID: '1', title: 'Faceting', url: 'https://www.algolia.com/doc' }];
        const searchSingleIndex = vi.fn().mockResolvedValue({ hits, nbHits: 1 });
        const fakeClient = { searchSingleIndex } as any;

        const result = await keywordSearch(fakeClient, 'ALGOLIA_WWW_PROD_V2', 'faceted search');

        expect(searchSingleIndex).toHaveBeenCalledWith({
            indexName: 'ALGOLIA_WWW_PROD_V2',
            searchParams: {
                query: 'faceted search',
                filters: 'language_code:en AND NOT is404:true AND NOT algoliaDisabled:"true"',
                hitsPerPage: 10,
            },
        });
        expect(result.hits).toEqual(hits);
        expect(result.nbHits).toBe(1);
    });

    it('passes through caller overrides for hitsPerPage', async () => {
        const searchSingleIndex = vi.fn().mockResolvedValue({ hits: [], nbHits: 0 });
        const fakeClient = { searchSingleIndex } as any;

        await keywordSearch(fakeClient, 'visibility_www_tuned', 'q', { hitsPerPage: 20 });

        expect(searchSingleIndex).toHaveBeenCalledWith(
            expect.objectContaining({
                indexName: 'visibility_www_tuned',
                searchParams: expect.objectContaining({ hitsPerPage: 20 }),
            })
        );
    });
});
