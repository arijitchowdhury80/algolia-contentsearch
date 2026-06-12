/**
 * keywordSearch — Column 1 of the A/B: the live keyword search reference.
 *
 * Wraps algoliasearch v5 `searchSingleIndex` with the EXACT production filter
 * string captured from live traffic (docs/project-overview.md Appendix A). This
 * column shows the "old-world" ranked result list with NO generated answer, so
 * the agent columns (2-4) can be compared against it.
 *
 * The browser ships a search-only key; this never uses an admin key.
 */
import type { SearchClient } from 'algoliasearch';

/**
 * The Appendix-A production filter, verbatim.
 *   - `is404:true` — unquoted boolean (numeric/boolean attribute)
 *   - `algoliaDisabled:"true"` — quoted string (string attribute)
 * Quoting mirrors the incumbent exactly; do not normalize it.
 */
const KEYWORD_FILTERS = 'language_code:en AND NOT is404:true AND NOT algoliaDisabled:"true"';

export function buildKeywordFilters(): string {
    return KEYWORD_FILTERS;
}

export interface KeywordSearchOptions {
    hitsPerPage?: number;
}

export interface KeywordSearchResult {
    hits: Record<string, unknown>[];
    nbHits: number;
}

/**
 * Run a keyword search against `indexName`, applying the Appendix-A filters.
 * Returns the ranked hits and total count.
 */
export async function keywordSearch(
    client: SearchClient,
    indexName: string,
    query: string,
    opts: KeywordSearchOptions = {},
): Promise<KeywordSearchResult> {
    const res = await client.searchSingleIndex({
        indexName,
        searchParams: {
            query,
            filters: buildKeywordFilters(),
            hitsPerPage: opts.hitsPerPage ?? 10,
        },
    });
    return {
        hits: (res.hits ?? []) as Record<string, unknown>[],
        nbHits: (res as { nbHits?: number }).nbHits ?? 0,
    };
}
