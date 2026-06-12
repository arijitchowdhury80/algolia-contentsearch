# Search API — Algolia API Reference

The Search API queries records in your indices. This file covers single-index search, multi-index/multi-query search, browse (paginate every record), search for facet values, retrieving records by `objectID`, and the full set of search query parameters.

## Base hosts, auth, and region

**Authentication headers** (every request):

| Header | Value |
|--------|-------|
| `X-Algolia-Application-Id` | `$ALGOLIA_APP_ID` |
| `X-Algolia-API-Key` | `$ALGOLIA_API_KEY` |

Headers are case-insensitive; Algolia docs and clients use `x-algolia-application-id` / `x-algolia-api-key` interchangeably. Search needs only a search-only (or more privileged) API key.

**Hosts:**

| Purpose | Host |
|---------|------|
| Read / search (DSN, routed to nearest server) | `https://$ALGOLIA_APP_ID-dsn.algolia.net` |
| Write (indexing, settings) | `https://$ALGOLIA_APP_ID.algolia.net` |
| Retry / fallback (randomize order) | `https://$ALGOLIA_APP_ID-1.algolianet.com`, `-2`, `-3` |

All operations in this file are reads, so the canonical host is the DSN read host `https://$ALGOLIA_APP_ID-dsn.algolia.net`. The DSN host is read-only; it does not accept writes. The official REST reference shows the plain write host (`$ALGOLIA_APP_ID.algolia.net`) in its curl examples — that host also serves reads, but for production search you should prefer the `-dsn` host and implement the retry strategy across the `algolianet.com` fallbacks. Every API client implements this retry logic automatically. Each parameter value, including `query`, must not exceed 512 bytes.
Source: https://www.algolia.com/doc/rest-api/search ; https://support.algolia.com/hc/en-us/articles/8650253375889 (hosts/DSN/retry)

**.env.local contexts** (this project): two app/key/index triples are available —
- CENTRAL: `ALGOLIA_CENTRAL_APP_ID` / `ALGOLIA_CENTRAL_API_KEY` / `ALGOLIA_CENTRAL_INDEX_NAME`
- VISIBILITY: `VISIBILITY_APP_ID` / `VISIBILITY_API_KEY` / `VISIBILITY_INDEX_NAME`

Substitute the relevant pair for `$ALGOLIA_APP_ID` / `$ALGOLIA_API_KEY` and the index name. Never paste real keys into code or docs.

**MCP note:** All `mcp__algolia__*` tools require an `applicationId` field (the app ID). The MCP server holds the API key out-of-band — you pass the app ID and the operation params, not the key.

---

## Operations

### searchSingleIndex — Search one index

**Purpose:** Run one search query against a single index and return matching records (hits) plus pagination/faceting metadata.

**REST:** `POST /1/indexes/{indexName}/query` (read host `https://$ALGOLIA_APP_ID-dsn.algolia.net`)

**MCP tool:** `mcp__algolia__searchSingleIndex`

**Key parameters** (top-level call shape; full search params live in the reference section below):

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `applicationId` | string | yes (MCP) | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Index to search (case-sensitive) |
| `requestBody` | object | yes | — | Either `{ "params": "<url-encoded string>" }` or a JSON object of search params (`query`, `hitsPerPage`, `filters`, `facets`, …) |
| `query` | string | no | `""` | The search text (inside requestBody) |
| `params` | string | no | `""` | All params as one URL-encoded query string (alternative to discrete keys) |

**Response fields:** `hits[]`, `nbHits`, `page`, `nbPages`, `hitsPerPage`, `processingTimeMS`, `query`, `params`, `exhaustiveNbHits`, plus `facets`, `facets_stats`, `queryID` (when `clickAnalytics: true`), `renderingContent`, `appliedRules` when relevant.

**curl example:**
```bash
curl --request POST \
  --url https://$ALGOLIA_APP_ID-dsn.algolia.net/1/indexes/$ALGOLIA_CENTRAL_INDEX_NAME/query \
  --header 'content-type: application/json' \
  --header "x-algolia-application-id: $ALGOLIA_APP_ID" \
  --header "x-algolia-api-key: $ALGOLIA_API_KEY" \
  --data '{
    "query": "laptop",
    "hitsPerPage": 10,
    "filters": "price < 1000 AND inStock:true",
    "facets": ["brand", "category"],
    "attributesToRetrieve": ["name", "price", "brand"]
  }'
```

Equivalent with the URL-encoded `params` form:
```bash
curl --request POST \
  --url https://$ALGOLIA_APP_ID-dsn.algolia.net/1/indexes/$ALGOLIA_CENTRAL_INDEX_NAME/query \
  --header 'content-type: application/json' \
  --header "x-algolia-application-id: $ALGOLIA_APP_ID" \
  --header "x-algolia-api-key: $ALGOLIA_API_KEY" \
  --data '{ "params": "query=laptop&hitsPerPage=2&getRankingInfo=1" }'
```

**MCP call example:**
```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "$ALGOLIA_CENTRAL_INDEX_NAME",
  "requestBody": {
    "query": "laptop",
    "hitsPerPage": 10,
    "filters": "price < 1000 AND inStock:true",
    "facets": ["brand", "category"]
  }
}
```

Source: https://www.algolia.com/doc/rest-api/search/search-single-index

---

### search — Search multiple indices / multiple queries

**Purpose:** Run several queries in one HTTP round-trip. The queries can target different indices, or the same index with different params (e.g. federated search, multiple facet drill-downs). Results are returned in request order. Also used to combine hit searches with facet-value searches (`type: "default"` vs `type: "facet"`).

**REST:** `POST /1/indexes/*/queries` (read host `https://$ALGOLIA_APP_ID-dsn.algolia.net`)

**MCP tool:** `mcp__algolia__search`

**Key parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `applicationId` | string | yes (MCP) | — | Algolia app ID (MCP only) |
| `requestBody.requests` | array | yes | — | Array of query objects. Each has `indexName` plus search params (`query`/`params`/discrete keys), and optionally `type` (`default` for hits, `facet` for facet values). For `type: "facet"`, also requires `facet` and may include `facetQuery`. |
| `requestBody.strategy` | string | no | `none` | `none` = run all queries; `stopIfEnoughMatches` = run sequentially, stop once a query returns at least `hitsPerPage` hits |

**Response:** `{ "results": [ ... ] }` — one search result object per request, in the same order as the requests.

**curl example:**
```bash
curl --request POST \
  --url 'https://$ALGOLIA_APP_ID-dsn.algolia.net/1/indexes/*/queries' \
  --header 'content-type: application/json' \
  --header "x-algolia-application-id: $ALGOLIA_APP_ID" \
  --header "x-algolia-api-key: $ALGOLIA_API_KEY" \
  --data '{
    "requests": [
      { "indexName": "products", "query": "shoes", "hitsPerPage": 5, "type": "default" },
      { "indexName": "articles", "query": "shoes", "hitsPerPage": 3, "type": "default" }
    ],
    "strategy": "none"
  }'
```

**MCP call example:**
```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "requestBody": {
    "requests": [
      { "indexName": "$ALGOLIA_CENTRAL_INDEX_NAME", "query": "shoes", "hitsPerPage": 5, "type": "default" },
      { "indexName": "$VISIBILITY_INDEX_NAME", "query": "shoes", "hitsPerPage": 3, "type": "default" }
    ],
    "strategy": "stopIfEnoughMatches"
  }
}
```

Source: https://www.algolia.com/doc/rest-api/search/search

---

### browse — Paginate through every record

**Purpose:** Retrieve all records in an index without the 1,000-hit pagination cap of `query`. Used for exports, reindexing, and bulk processing. Browse ignores `page`/`hitsPerPage` ranking-based pagination and instead returns a `cursor` to fetch the next batch. Browse does not apply Rules, distinct deduplication, or relevance optimizations the way `query` does — it is built for completeness, not ranked search.

**REST:** `POST /1/indexes/{indexName}/browse` (read host `https://$ALGOLIA_APP_ID-dsn.algolia.net`)

**MCP tool:** `mcp__algolia__browse`

**Key parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `applicationId` | string | yes (MCP) | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Index to browse |
| `requestBody` | object | yes | — | Search params object (plus `cursor`) or `{ "params": "..." }` |
| `cursor` | string | no | — | Cursor returned by the previous browse response. Pass it to get the next page. The last page omits `cursor`. |
| `query` | string | no | `""` | Optional query to browse a filtered subset |
| `filters` | string | no | — | Filter expression to browse a subset |

**Pagination flow:** (1) initial request with no cursor; (2) read `cursor` from the response; (3) repeat with that `cursor`; (4) stop when the response has no `cursor`.

**Response fields:** `hits[]`, `cursor` (absent on final page), `nbHits`, `page`, `nbPages`, `hitsPerPage`, `processingTimeMS`, `query`, `params`.

**curl example (first page):**
```bash
curl --request POST \
  --url https://$ALGOLIA_APP_ID-dsn.algolia.net/1/indexes/$ALGOLIA_CENTRAL_INDEX_NAME/browse \
  --header 'content-type: application/json' \
  --header "x-algolia-application-id: $ALGOLIA_APP_ID" \
  --header "x-algolia-api-key: $ALGOLIA_API_KEY" \
  --data '{ "query": "" }'
```

**curl example (next page):**
```bash
curl --request POST \
  --url https://$ALGOLIA_APP_ID-dsn.algolia.net/1/indexes/$ALGOLIA_CENTRAL_INDEX_NAME/browse \
  --header 'content-type: application/json' \
  --header "x-algolia-application-id: $ALGOLIA_APP_ID" \
  --header "x-algolia-api-key: $ALGOLIA_API_KEY" \
  --data '{ "cursor": "ARJmaWx0ZXJzABJxdWVyeQ..." }'
```

**MCP call example:**
```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "$ALGOLIA_CENTRAL_INDEX_NAME",
  "requestBody": { "query": "", "filters": "inStock:true" }
}
```

Source: https://www.algolia.com/doc/rest-api/search/browse

---

### searchForFacetValues — Search inside one facet's values

**Purpose:** Find values of a single faceted attribute that match a query string, with their record counts. Powers "search within a filter" UI (e.g. typing in a brand filter box). The attribute must be declared in `attributesForFaceting` with `searchable(...)`.

**REST:** `POST /1/indexes/{indexName}/facets/{facetName}/query` (read host `https://$ALGOLIA_APP_ID-dsn.algolia.net`)

**MCP tool:** `mcp__algolia__searchForFacetValues`

**Key parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `applicationId` | string | yes (MCP) | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Index name |
| `facetName` | string | yes | — | The faceted attribute to search within |
| `requestBody.facetQuery` | string | no | `""` | Text to search inside the facet's values |
| `requestBody.maxFacetHits` | integer | no | `10` | Max facet values to return (max 100) |
| `requestBody.params` | string | no | `""` | Additional search params as a URL-encoded string (e.g. to scope by `filters`) |

**Response fields:** `facetHits[]` — each with `value`, `highlighted` (with `<em>` tags around the match), `count`; plus `exhaustiveFacetsCount` (boolean) and `processingTimeMS`.

**curl example:**
```bash
curl --request POST \
  --url https://$ALGOLIA_APP_ID-dsn.algolia.net/1/indexes/$ALGOLIA_CENTRAL_INDEX_NAME/facets/brand/query \
  --header 'content-type: application/json' \
  --header "x-algolia-application-id: $ALGOLIA_APP_ID" \
  --header "x-algolia-api-key: $ALGOLIA_API_KEY" \
  --data '{
    "facetQuery": "sam",
    "maxFacetHits": 10,
    "params": "filters=inStock:true"
  }'
```

**MCP call example:**
```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "$ALGOLIA_CENTRAL_INDEX_NAME",
  "facetName": "brand",
  "requestBody": { "facetQuery": "sam", "maxFacetHits": 10 }
}
```

Source: https://www.algolia.com/doc/rest-api/search/search-for-facet-values

---

### getObject — Retrieve one record by objectID

**Purpose:** Fetch a single record directly by its `objectID` (no search). Useful for detail pages or verifying a record's stored content.

**REST:** `GET /1/indexes/{indexName}/{objectID}` (read host `https://$ALGOLIA_APP_ID-dsn.algolia.net`)

**MCP tool:** `mcp__algolia__getObject`

**Key parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `applicationId` | string | yes (MCP) | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Index name |
| `objectID` | string | yes | — | Unique record identifier |
| `attributesToRetrieve` | array/string | no | all | Which attributes to return (REST: comma-separated query param; MCP: array). `objectID` is always included. |

**Response:** the record object (always includes `objectID`).

**curl example:**
```bash
curl --request GET \
  --url 'https://$ALGOLIA_APP_ID-dsn.algolia.net/1/indexes/$ALGOLIA_CENTRAL_INDEX_NAME/test-record-123?attributesToRetrieve=name,price' \
  --header "x-algolia-application-id: $ALGOLIA_APP_ID" \
  --header "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP call example:**
```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "$ALGOLIA_CENTRAL_INDEX_NAME",
  "objectID": "test-record-123",
  "attributesToRetrieve": ["name", "price"]
}
```

Source: https://www.algolia.com/doc/rest-api/search/get-object

---

### getObjects — Retrieve multiple records (across indices)

**Purpose:** Fetch many records by `objectID` in one request, optionally from different indices. Results come back in request order.

**REST:** `POST /1/indexes/*/objects` (read host `https://$ALGOLIA_APP_ID-dsn.algolia.net`)

**MCP tool:** `mcp__algolia__getObjects`

**Key parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `applicationId` | string | yes (MCP) | — | Algolia app ID (MCP only) |
| `requestBody.requests` | array | yes | — | Array of `{ objectID, indexName, attributesToRetrieve? }` objects |
| `requests[].objectID` | string | yes | — | Record ID to retrieve |
| `requests[].indexName` | string | yes | — | Index to retrieve from |
| `requests[].attributesToRetrieve` | array | no | all | Fields to return for that record |

**Response:** `{ "results": [ ... ] }` — records in the same order as the requests.

**curl example:**
```bash
curl --request POST \
  --url 'https://$ALGOLIA_APP_ID-dsn.algolia.net/1/indexes/*/objects' \
  --header 'content-type: application/json' \
  --header "x-algolia-application-id: $ALGOLIA_APP_ID" \
  --header "x-algolia-api-key: $ALGOLIA_API_KEY" \
  --data '{
    "requests": [
      { "indexName": "$ALGOLIA_CENTRAL_INDEX_NAME", "objectID": "product-1", "attributesToRetrieve": ["name", "price"] },
      { "indexName": "$VISIBILITY_INDEX_NAME", "objectID": "doc-42" }
    ]
  }'
```

**MCP call example:**
```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "requestBody": {
    "requests": [
      { "indexName": "$ALGOLIA_CENTRAL_INDEX_NAME", "objectID": "product-1", "attributesToRetrieve": ["name", "price"] },
      { "indexName": "$VISIBILITY_INDEX_NAME", "objectID": "doc-42" }
    ]
  }
}
```

Source: https://www.algolia.com/doc/rest-api/search/get-objects

---

## Search query parameters — full reference

These parameters are accepted in the body of `query`, `browse`, and (where applicable) each entry of a multi-query `requests` array, either as discrete JSON keys or inside the URL-encoded `params` string. Defaults and descriptions below are taken from the Algolia OpenAPI search-params schema (as exposed by the MCP `searchSingleIndex` / `search` tool schemas) and the search-parameters reference. Many of these can also be set as index settings; when sent at query time they override the index setting for that request.

### Search behavior / core

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `query` | string | `""` | The search text. Each value must be ≤ 512 bytes. |
| `params` | string | `""` | All search parameters as a single URL-encoded query string (alternative to discrete keys). |
| `similarQuery` | string | `""` | Broad "more like this" keywords used instead of `query`. Sets `queryType=prefixNone`, `removeStopWords=true`, `words` first in ranking, remaining words optional. Combine with `filters`. |
| `synonyms` | boolean | `true` | Whether the index's synonyms apply to this search. |
| `enableRules` | boolean | `true` | Whether Rules (query rules) are applied. |
| `enableABTest` | boolean | `true` | Whether A/B testing applies to this search. |
| `enableReRanking` | boolean | `true` | Whether Dynamic Re-Ranking applies (only if enabled for the index in the dashboard). |
| `getRankingInfo` | boolean | `false` | Include detailed ranking info in the response. |
| `percentileComputation` | boolean | `true` | Include this search in processing-time percentile stats. |
| `responseFields` | array | `["*"]` | Which top-level response properties to include. Cannot exclude `message`, `warning`, `cursor`, `abTestVariantID`, or ranking-info fields. Omitting `hits` returns no results. |

### Attributes (what to return)

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `attributesToRetrieve` | array | `["*"]` | Attributes to include in each hit. `objectID` is always returned. Use `["*", "-attr"]` to return all except one. Excludes `unretrievableAttributes` and `customRanking`-only attrs. |
| `restrictSearchableAttributes` | array | `[]` | Limit the search to a subset of `searchableAttributes` (case-sensitive). |

### Ranking / sorting

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `ranking` | array | `["typo","geo","words","filters","proximity","attribute","exact","custom"]` | Ordered tie-breaking ranking criteria. Use `asc("attr")` / `desc("attr")` modifiers to sort by an attribute (usually placed first on a replica). |
| `relevancyStrictness` | integer | `100` | Relevancy threshold below which less-relevant results are dropped. Only on virtual replicas. |
| `customRanking` | array | (index setting) | Tie-breaker attributes via `asc(...)`/`desc(...)`. Normally an index setting; documented here as it drives the `custom` ranking step. |

### Filtering

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `filters` | string | — | Full filter expression. Supports numeric (`<,<=,=,!=,>,>=`), ranges (`attr:lo TO hi`), facet (`attr:value`), tag (`_tags:value`), boolean filters, combined with `AND`/`OR`/`NOT` (with restrictions: only same-type with `OR`; no `NOT` over combinations; no mixing `AND` with `OR`). Preferred over the array filters below. |
| `facetFilters` | array/string | — | Filter by facet values. `[a,b]` = AND; `[[a,b],c]` = (a OR b) AND c; `facet:-value` = NOT. |
| `numericFilters` | array/string | — | Numeric comparisons/ranges; same combination rules as `facetFilters`. Precise to 3 decimals. |
| `tagFilters` | array/string | — | Filter on the special `_tags` attribute (no facet count). |
| `optionalFilters` | array/string | — | Promote/demote (don't exclude) matching records. Applied after sort-by, before custom ranking. Don't work on virtual replicas or numeric attrs. |
| `sumOrFiltersScores` | boolean | `false` | Sum all filter scores instead of keeping the max. |
| `reRankingApplyFilter` | array/string/null | — | Restrict Dynamic Re-Ranking to records matching these filters. |

### Faceting

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `facets` | array | `[]` | Facets to compute values/counts for. Use `["*"]` for all declared facets. |
| `maxValuesPerFacet` | integer | `100` | Max facet values returned per facet (max 1000). |
| `sortFacetValuesBy` | string | `count` | `count` or `alpha` ordering of facet values. |
| `facetingAfterDistinct` | boolean | `false` | Compute facet counts after `distinct` deduplication. |
| `maxFacetHits` | integer | `10` | Max values returned by search-for-facet-values (max 100). |
| `renderingContent.facetOrdering` | object | — | UI ordering of facet names/values without code changes. |

### Highlighting / snippeting

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `attributesToHighlight` | array | all searchable | Attributes to highlight. `["*"]` = all; `[]` = off. |
| `attributesToSnippet` | array | `[]` | Attributes to snippet, `attr:N` for N words (default 10). |
| `highlightPreTag` | string | `<em>` | Opening tag for highlights. |
| `highlightPostTag` | string | `</em>` | Closing tag for highlights. |
| `snippetEllipsisText` | string | `...` | Ellipsis indicator for truncated snippets. |
| `restrictHighlightAndSnippetArrays` | boolean | `false` | Only highlight/snippet array items that matched. |
| `replaceSynonymsInHighlight` | boolean | `false` | Replace highlighted word with the matched synonym. |

### Pagination

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `page` | integer | `0` | Page of results to retrieve. |
| `hitsPerPage` | integer | `20` | Hits per page (max 1000). |
| `offset` | integer | — | Position of the first hit (used with `length`). |
| `length` | integer | — | Number of hits to return (0–1000, used with `offset`). |
| `cursor` | string | — | (browse only) Cursor for the next page. |

### Typo tolerance

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `typoTolerance` | boolean/enum | `true` | `true`/`false`, or `min` (lowest typo count), or `strict` (two lowest, applies Typo first in ranking). |
| `minWordSizefor1Typo` | integer | `4` | Min word length to allow 1 typo. |
| `minWordSizefor2Typos` | integer | `8` | Min word length to allow 2 typos. |
| `allowTyposOnNumericTokens` | boolean | `true` | Allow typos on numbers. |
| `disableTypoToleranceOnAttributes` | array | `[]` | Attributes where typo tolerance is off. |

### Languages / natural language

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `queryLanguages` | array | `[]` | Languages for plurals, stop-word removal, CJK word detection (put CJK first). Always set one. |
| `naturalLanguages` | array | `[]` | ISO codes that tune settings for NL queries: sets `removeStopWords`+`ignorePlurals` to these languages, `removeWordsIfNoResults=allOptional`, and adds a `natural_language` ruleContext/analyticsTag. |
| `ignorePlurals` | array/bool/`"true"`/`"false"` | `false` | Treat singular/plural/declensions as equivalent (optionally per-language). |
| `removeStopWords` | array/boolean | `false` | Remove stop words (optionally per-language). |
| `decompoundQuery` | boolean | `true` | Split compound words (de, nl, fi, sv, no). |

### Query strategy

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `queryType` | enum | `prefixLast` | `prefixLast` (last word is prefix), `prefixAll` (all words prefixes), `prefixNone` (no prefixing). |
| `removeWordsIfNoResults` | enum | `none` | `none`, `lastWords`, `firstWords`, `allOptional` — how to drop words to avoid empty results. |
| `mode` | enum | `keywordSearch` | `keywordSearch` or `neuralSearch` (NeuralSearch must be enabled for the index). |
| `advancedSyntax` | boolean | `false` | Enable phrase matching (`"..."`) and word exclusion (`-word`). |
| `advancedSyntaxFeatures` | array | `["exactPhrase","excludeWords"]` | Which advanced-syntax features are active (requires `advancedSyntax`). |
| `optionalWords` | array/string/null | `[]` | Words treated as optional to widen results. With 4+ all-optional words, required-match count scales with result depth. |
| `exactOnSingleWordQuery` | enum | `attribute` | `attribute`, `none`, or `word` — how the Exact criterion is computed for one-word queries. |
| `alternativesAsExact` | array | `["ignorePlurals","singleWordSynonym"]` | Which alternatives count as exact: `ignorePlurals`, `singleWordSynonym`, `multiWordsSynonym`, `ignoreConjugations`. |
| `disableExactOnAttributes` | array | `[]` | Attributes where the Exact criterion is turned off. |
| `minProximity` | integer | `1` | Min proximity score (1–7) treating nearby matches as equal. |
| `attributeCriteriaComputedByMinProximity` | boolean | `false` | Pick best-matching attribute by min proximity. |
| `distinct` | boolean/integer | `0` | Dedup/group by `attributeForDistinct`: `true`/`false`, or 0–4 members per group. |

### Geo search

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `aroundLatLng` | string | `""` | Center coords `"lat,lng"` for a radius search. Ignored if `insidePolygon`/`insideBoundingBox` set. |
| `aroundLatLngViaIP` | boolean | `false` | Derive center from request IP. |
| `aroundRadius` | integer/`"all"` | auto | Search radius in meters, or `"all"` for all geo records (no distance filter). |
| `aroundPrecision` | integer/array | `10` | Group results by similar distance (meters), or custom range objects. |
| `minimumAroundRadius` | integer | — | Min radius (meters) when `aroundRadius` is auto. |
| `insideBoundingBox` | string/array/null | — | Rectangle(s): `[p1lat,p1lng,p2lat,p2lng]`, nested for multiple. |
| `insidePolygon` | array | — | Polygon(s) of 3–10000 points; ignored if `insideBoundingBox` set. |

### Query rules

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `ruleContexts` | array | `[]` | Rule context strings used to trigger matching Rules. |
| `enableRules` | boolean | `true` | (also listed above) Toggle Rules for this search. |

### Personalization

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `enablePersonalization` | boolean | `false` | Enable Personalization for this search. |
| `personalizationImpact` | integer | `100` | 0–100 weight of Personalization vs other ranking factors. |
| `userToken` | string | — | Pseudonymous user identifier for analytics, events, and personalization. |

### AI / NeuralSearch

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | enum | `keywordSearch` | (also under Query strategy) Set `neuralSearch` to use NeuralSearch (semantic + keyword). Requires enablement by Algolia. |
| `semanticSearch` | object | — | NeuralSearch semantic settings; `eventSources` = indices to collect click/conversion events from (null = current index + replicas). Only used when `mode=neuralSearch`. |
| `enableReRanking` | boolean | `true` | (also above) Dynamic Re-Ranking (AI re-ranking) toggle. |
| `reRankingApplyFilter` | array/string/null | — | Restrict AI re-ranking to records matching these filters. |

### Analytics tagging

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `analytics` | boolean | `true` | Include this search in Analytics. |
| `analyticsTags` | array | `[]` | Tags for segmenting analytics data. |
| `clickAnalytics` | boolean | `false` | Return a `queryID` (required to track click/conversion events). |

### Advanced / UI

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `renderingContent` | object | — | Extra data for the search UI (e.g. `facetOrdering`, `redirect`, `widgets`/banners from Merchandising Studio) without frontend changes. |

Source: https://www.algolia.com/doc/api-reference/search-api-parameters/ (search parameters reference) ; Algolia OpenAPI search-params schema as exposed by `mcp__algolia__searchSingleIndex` and `mcp__algolia__search` tool definitions.

---

## Coverage notes

- **Hosts:** Read (`-dsn.algolia.net`), write (`.algolia.net`), and retry (`-{1,2,3}.algolianet.com`) hosts are all verified (Algolia support/DSN docs + REST examples). The official REST reference curl examples use the plain `.algolia.net` host for both reads and writes; this file uses the `-dsn` read host per Algolia's documented best practice for search. Canonical search/read host: `https://$ALGOLIA_APP_ID-dsn.algolia.net`.
- **All 6 endpoints verified** against the algolia.com/doc REST API reference pages (method, path, host, body, response) — single-index query, multi-query, browse, search-for-facet-values, get-object, get-objects.
- **Search-parameters table** is sourced from the live Algolia OpenAPI schema (via the MCP tool definitions, which embed the same `searchParams` `$defs` Algolia publishes) plus the parameters reference page. Defaults and enums are authoritative from that schema.
- `[UNVERIFIED]` — `customRanking` is documented here as a ranking-related parameter for completeness, but it is primarily an **index setting**, not in the per-request search-params schema; sending it at query time is not confirmed against the search-params schema.
- `[UNVERIFIED]` — Exact full set of top-level **response** fields (e.g. `facets_stats`, `appliedRules`, `abTestVariantID`, `serverUsed`, `index`) was not exhaustively pulled from a single response-schema page; the fields listed per operation come from the REST reference summaries and may not be complete.
- `[UNVERIFIED]` — `mcp__algolia__getObjects` and `mcp__algolia__getObject` map to REST `POST /1/indexes/*/objects` and `GET /1/indexes/{indexName}/{objectID}` respectively; this mapping is inferred from matching schemas (the MCP tools were not executed against a live index to confirm).
