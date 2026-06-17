/**
 * incumbentSearch — ① "Current Website Search", browser-direct.
 *
 * algolia.com's header search is an Algolia Autocomplete widget backed by the
 * incumbent app (1QDAWL72TQ) / index ALGOLIA_WWW_PROD_V2, queried over the public
 * `/1/indexes/.../queries` API with a SEARCH-ONLY key. That call is CORS-safe and
 * browser-callable, so ① needs no backend and no Playwright — we reproduce the
 * same index query directly with the search-only key the app already ships.
 *
 * Faithfulness note: this returns the same main-index hits the site computes for
 * a query (same Appendix-A production filter), not the site's full autocomplete
 * federation/rules. It's the "old-world reference" result list — accurate to the
 * index, labelled as such in the UI.
 *
 * Hit → display mapping mirrors the live site (capture.mjs): title from
 * title/name/h1, url from url/permalink/link, snippet from description/abstract.
 */
import { algoliasearch, type SearchClient } from 'algoliasearch';
import { keywordSearch } from './keywordSearch';

export interface WebsiteSource {
  id: string;
  /** Display text (title — snippet). */
  text: string;
  /** Result URL. */
  label?: string;
}

export interface WebsiteResult {
  /** Rendered "top results" summary line. */
  answer: string;
  /** Ranked result hits. */
  sources: WebsiteSource[];
}

const WWW_ORIGIN = 'https://www.algolia.com';

/** Resolve a possibly root-relative site URL to an absolute algolia.com URL. */
function absUrl(u: string): string {
  if (!u) return '';
  if (/^https?:\/\//.test(u) || u.startsWith('//')) return u;
  return u.startsWith('/') ? `${WWW_ORIGIN}${u}` : u;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Map raw index hits to the ① WebsiteResult shape. Pure — unit-tested. */
export function mapHitsToWebsiteResult(
  hits: Record<string, unknown>[],
  query: string,
): WebsiteResult {
  const sources: WebsiteSource[] = hits.map((h, i) => {
    const title = str(h.title) || str(h.name) || str(h.h1) || '(untitled)';
    const url = absUrl(str(h.url) || str(h.permalink) || str(h.link));
    const snippet = (str(h.description) || str(h.abstract) || str(h.content)).slice(0, 160);
    return {
      id: str(h.objectID) || `${i}`,
      text: snippet ? `${title} — ${snippet}` : title,
      ...(url ? { label: url } : {}),
    };
  });
  const answer = sources.length
    ? `Top ${sources.length} live algolia.com result${sources.length === 1 ? '' : 's'} for “${query}”.`
    : `Live algolia.com search returned no results for “${query}”.`;
  return { answer, sources };
}

let cachedClient: SearchClient | null = null;
let cachedKey = '';

/** Search-only client for the incumbent app, memoized per (appId, key). */
function incumbentClient(appId: string, searchKey: string): SearchClient {
  const id = `${appId}:${searchKey}`;
  if (!cachedClient || cachedKey !== id) {
    cachedClient = algoliasearch(appId, searchKey);
    cachedKey = id;
  }
  return cachedClient;
}

export interface IncumbentConfig {
  appId: string;
  searchKey: string;
  indexName: string;
}

/** Run the live ① website keyword search, browser-direct. `client` injectable for tests. */
export async function searchIncumbent(
  cfg: IncumbentConfig,
  query: string,
  client: SearchClient = incumbentClient(cfg.appId, cfg.searchKey),
): Promise<WebsiteResult> {
  // Mirror algolia.com's header search, which relaxes NL queries to allOptional.
  const { hits } = await keywordSearch(client, cfg.indexName, query, {
    hitsPerPage: 8,
    removeWordsIfNoResults: 'allOptional',
  });
  return mapHitsToWebsiteResult(hits, query);
}
