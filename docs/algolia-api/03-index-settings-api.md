# Index Settings API — Algolia API Reference

Deep dive on configuring an Algolia index's relevance and behavior. Covers the two operations (get settings, set settings) in both REST and MCP form, plus an exhaustive reference of every index setting grouped by category.

> **Settings vs. search parameters.** Most index settings can also be passed at query time as search parameters (they override the index default for that one request). This file documents them as *index settings* — the persisted index configuration. A subset (e.g. `searchableAttributes`, `attributesForFaceting`, `unretrievableAttributes`, `replicas`, `customNormalization`) are **settings-only** and cannot be overridden per-query.

---

## Hosts & authentication

| Item | Value |
|------|-------|
| Primary host | `https://$ALGOLIA_APP_ID.algolia.net` |
| Retry hosts | `https://$ALGOLIA_APP_ID-1.algolianet.com`, `-2`, `-3` (and `-dsn` read variant for GET) |
| Auth header (app) | `X-Algolia-Application-Id: $ALGOLIA_APP_ID` |
| Auth header (key) | `X-Algolia-API-Key: $ALGOLIA_API_KEY` |
| Get settings ACL | `settings` |
| Set settings ACL | `editSettings` |

> Header names are case-insensitive; Algolia's own curl examples use lowercase (`x-algolia-application-id`, `x-algolia-api-key`). The baseline canonical form is `X-Algolia-Application-Id` / `X-Algolia-API-Key`.

**Credential contexts** (never hardcode real keys):
- **CENTRAL** → `ALGOLIA_CENTRAL_APP_ID`, `ALGOLIA_CENTRAL_API_KEY`
- **VISIBILITY** → `VISIBILITY_APP_ID`, `VISIBILITY_API_KEY`

Examples below use the generic `$ALGOLIA_APP_ID` / `$ALGOLIA_API_KEY` placeholders — substitute the context-specific variables.

**Source (hosts/auth):** https://www.algolia.com/doc/rest-api/search/ · https://www.algolia.com/doc/rest-api/search/get-settings · https://www.algolia.com/doc/rest-api/search/set-settings

---

## Operations

### Get settings

Retrieve the full, current settings object for an index.

| | |
|---|---|
| Method | `GET` |
| Path | `/1/indexes/{indexName}/settings` |
| ACL | `settings` |

**REST (curl)** — verbatim shape from Algolia docs:

```bash
curl --request GET \
  --url 'https://$ALGOLIA_APP_ID.algolia.net/1/indexes/ALGOLIA_INDEX_NAME/settings?getVersion=1' \
  --header 'accept: application/json' \
  --header 'x-algolia-api-key: $ALGOLIA_API_KEY' \
  --header 'x-algolia-application-id: $ALGOLIA_APP_ID'
```

- `getVersion=1` (optional query param) selects the settings format version returned. `getVersion=2` returns the newer format. Most clients use the default.

**MCP — `mcp__algolia__getSettings`**

Params: `applicationId` (string, required), `indexName` (string, required).

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "ALGOLIA_INDEX_NAME"
}
```

Returns the complete settings object (every parameter below, with its current value or default).

---

### Set settings

Update one or more settings on an index. You send only the keys you want to change — omitted keys are left untouched (it's a merge/partial update of the settings object, not a full replace).

| | |
|---|---|
| Method | `PUT` |
| Path | `/1/indexes/{indexName}/settings` |
| Optional query | `?forwardToReplicas=true` |
| ACL | `editSettings` |

**REST (curl)** — verbatim shape from Algolia docs:

```bash
curl --request PUT \
  --url 'https://$ALGOLIA_APP_ID.algolia.net/1/indexes/ALGOLIA_INDEX_NAME/settings?forwardToReplicas=true' \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header 'x-algolia-api-key: $ALGOLIA_API_KEY' \
  --header 'x-algolia-application-id: $ALGOLIA_APP_ID' \
  --data '{
    "searchableAttributes": ["title", "unordered(description)", "brand"],
    "attributesForFaceting": ["brand", "filterOnly(sku)", "searchable(category)"],
    "customRanking": ["desc(popularity)", "asc(price)"],
    "hitsPerPage": 24
  }'
```

Response is asynchronous: returns `{ "updatedAt": "...", "taskID": <number> }`. Use the task API to wait for `taskID` to be published if you need the change to be live before the next call.

**`forwardToReplicas`** — boolean query parameter. **Default: `false`.** When `false`, the settings change is applied **only to the target index**; replica indices keep their old settings. Set `true` to propagate the change to all *existing* replicas. Settings are only forwarded to replicas that already exist — to seed a brand-new replica you must create it first, then set settings with `forwardToReplicas=true`. **Source:** https://www.algolia.com/doc/guides/managing-results/refine-results/sorting/how-to/set-settings-and-forward-to-replicas

**MCP — `mcp__algolia__setSettings`**

Params: `applicationId` (string, required), `indexName` (string, required), `requestBody` (settings object, required), `forwardToReplicas` (boolean, optional).

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "ALGOLIA_INDEX_NAME",
  "forwardToReplicas": true,
  "requestBody": {
    "searchableAttributes": ["title", "unordered(description)", "brand"],
    "customRanking": ["desc(popularity)", "asc(price)"],
    "hitsPerPage": 24,
    "typoTolerance": "min"
  }
}
```

---

### Helper MCP tools

These two are convenience wrappers around `setSettings` for the two most common configuration tasks. Both default to a **non-destructive `append`** strategy.

**`mcp__algolia__setAttributesForFaceting`** — declare which attributes can be used as facets/filters.

Params: `applicationId` (req), `indexName` (req), `attributesForFaceting` (string[], req), `strategy` (`append` | `replace`, default `append`).

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "ALGOLIA_INDEX_NAME",
  "attributesForFaceting": ["brand", "filterOnly(sku)", "searchable(category)"],
  "strategy": "append"
}
```
- `append` adds to the existing faceting attributes (avoids clobbering). `replace` overwrites the whole list.

**`mcp__algolia__setCustomRanking`** — set the tie-breaker ranking attributes.

Params: `applicationId` (req), `indexName` (req), `customRanking` (array of `{attribute, direction}`, req), `strategy` (`append` | `replace`, default `append`).

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "ALGOLIA_INDEX_NAME",
  "customRanking": [
    { "attribute": "popularity", "direction": "desc" },
    { "attribute": "price", "direction": "asc" }
  ],
  "strategy": "replace"
}
```
- `direction` is `asc` or `desc` (default `desc`). The tool maps `{attribute:"price",direction:"asc"}` to the underlying `asc(price)` string form.

> Neither helper exposes `forwardToReplicas` in its schema. If you need to forward custom ranking / faceting to replicas, use `setSettings` directly with `forwardToReplicas=true`.

---

## Settings parameters reference

One table per category. **Type**, **Default**, and **forwardToReplicas?** ("Yes" = a typical per-replica override candidate; in practice *all* settings honor the `forwardToReplicas` flag on `setSettings`, the column flags settings you usually want to differ between replicas vs. forward). Defaults and types are taken from the Algolia `setSettings` API schema.

**Source (all tables below):** https://www.algolia.com/doc/rest-api/search/set-settings · https://www.algolia.com/doc/api-reference/api-parameters/ (linked per-parameter guide pages embedded in the schema descriptions)

### Attributes

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `searchableAttributes` | string[] | `[]` (all attributes searchable, Attribute criterion off) | Yes | Attributes searched, in priority order. Earlier = higher rank. Comma-join two in one string (`"title,alt_title"`) for equal priority. Modifier: `unordered("ATTR")` ignores match position within the attribute. Case-sensitive. |
| `attributesForFaceting` | string[] | `[]` | Yes | Attributes usable as facets/filters. Modifiers: `filterOnly("ATTR")` (filter only, no facet counts), `searchable("ATTR")` (search within facet values), `afterDistinct("ATTR")` (count facets after `distinct` dedup; combinable: `afterDistinct(searchable(ATTR))`). Case-sensitive. |
| `unretrievableAttributes` | string[] | `[]` | Yes | Attributes never returned at query time (usable for ranking / secured-API-key restriction but hidden from results). Case-sensitive. |
| `attributesToRetrieve` | string[] | `["*"]` | No (per-query common) | Which attributes appear in the response. `*` = all (except `customRanking` & `unretrievable`). Exclude one with `["*", "-ATTR"]`. `objectID` is always returned. |

### Ranking & sorting

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `ranking` | string[] | `["typo","geo","words","filters","proximity","attribute","exact","custom"]` | Yes (replicas reorder for sort) | Ordered tie-breaking criteria. For attribute-sort replicas put `asc("ATTR")`/`desc("ATTR")` at the top of the list. |
| `customRanking` | string[] | `[]` | Yes | Final tie-breakers, e.g. `["desc(popularity)","asc(price)"]`. Records missing the attribute sort last; booleans sort alphabetically. Reduce precision of leading attributes or later ones never apply. |
| `relevancyStrictness` | integer | `100` | Yes | Relevancy threshold; results below it are dropped. **Only settable on virtual replica indices.** Lower = more results, less strict relevance. |
| `replicas` | string[] | `[]` | n/a (defines the replica graph) | Creates replica indices (copies with different ranking/sort/synonyms/rules). Must list the *complete* set each time — omitting one detaches it into a standalone index. Modifier: `virtual("REPLICA")` for relevant-sort virtual replicas (no extra records). |
| primary | (read-only) | — | n/a | A replica's settings expose a `primary` reference back to its primary index. Not set directly via `setSettings`; established by listing the index under a primary's `replicas`. |

### Faceting

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `maxValuesPerFacet` | integer | `100` (max `1000`) | Yes | Max facet values returned per facet. |
| `sortFacetValuesBy` | string | `"count"` | Yes | `count` (by descending match count) or `alpha` (alphabetical). Display order is controlled separately by `renderingContent`. |
| `attributesForFaceting` modifiers | — | — | — | `filterOnly(...)`, `searchable(...)`, `afterDistinct(...)` — see Attributes table above. |

### Highlighting & snippeting

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `attributesToHighlight` | string[] | all searchable attributes | No (per-query common) | Attributes to wrap matches in highlight tags. `*` = all, `[]` = off. |
| `attributesToSnippet` | string[] | `[]` | No (per-query common) | Attributes to snippet. `ATTR:N` sets word count (default 10 words incl. the match). |
| `highlightPreTag` | string | `"<em>"` | Yes | Tag inserted before each highlighted part. |
| `highlightPostTag` | string | `"</em>"` | Yes | Tag inserted after each highlighted part. |
| `snippetEllipsisText` | string | `"…"` (`"..."`) | Yes | Ellipsis string for truncated snippets. |
| `restrictHighlightAndSnippetArrays` | boolean | `false` | Yes | If `true`, only highlight/snippet array items that actually matched. |
| `replaceSynonymsInHighlight` | boolean | `false` | Yes | If `true`, replaces a matched word with the matched synonym in highlights (see Advanced too). |

### Pagination

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `hitsPerPage` | integer | `20` (1–1000) | Yes | Hits returned per page. |
| `paginationLimitedTo` | integer | `1000` (max `20000`) | Yes | Max results reachable via pagination. Higher = slower; beyond 1000 the ordering past hit #1000 isn't guaranteed. |

### Typo tolerance

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `typoTolerance` | boolean \| `"min"` \| `"strict"` | `true` | Yes | `true`/`min`/`strict` also enable word splitting & concatenation. `min` = fewest-typo matches only; `strict` = two lowest typo counts and applies Typo criterion first. |
| `minWordSizefor1Typo` | integer | `4` | Yes | Min word length before 1 typo is allowed. |
| `minWordSizefor2Typos` | integer | `8` | Yes | Min word length before 2 typos are allowed. |
| `allowTyposOnNumericTokens` | boolean | `true` | Yes | Allow typos on numbers. Turn off to reduce noise across similar numbers. |
| `disableTypoToleranceOnAttributes` | string[] | `[]` | Yes | Attributes where typo tolerance is off (exact only). Case-sensitive. |
| `disableTypoToleranceOnWords` | string[] | `[]` | Yes | Words requiring exact match; also disables splitting/concatenation for them. |

### Languages

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `queryLanguages` | string[] (ISO codes) | `[]` | Yes | Languages for query-time processing (plurals, stop words, CJK word detection). Place CJK language first. Always set this. |
| `indexLanguages` | string[] (ISO codes) | `[]` | Yes | Languages for indexing-time steps (word detection, dictionaries). Always set this. |
| `ignorePlurals` | boolean \| `"true"`/`"false"` \| string[] (ISO codes) | `false` | Yes | Treat singular/plural/declensions as equivalent. Array of ISO codes overrides `queryLanguages`. |
| `removeStopWords` | boolean \| string[] (ISO codes) | `false` | Yes | Remove stop words ("the", "a", "and"…). Array of ISO codes overrides `queryLanguages`. |
| `decompoundQuery` | boolean | `true` | Yes | Split compound words in the query (de, nl, fi, sv, no). Requires matching `indexLanguages` / `decompoundedAttributes` to be useful. |
| `keepDiacriticsOnCharacters` | string | `""` | Yes | Characters whose diacritics are preserved (Algolia normalizes diacritics away by default, e.g. `é`→`e`). |
| `customNormalization` | object (map of maps) | `{}` | Yes | Override default normalization, e.g. `{"default":{"ä":"ae","ü":"ue"}}`. |
| `decompoundedAttributes` | object | `{}` | Yes | Per-language list of attributes to decompound, e.g. `{"de":["name"]}`. |
| `attributesToTransliterate` | string[] | (none / `[]`) | Yes | Attributes supporting Japanese transliteration; requires Japanese indexing language. |
| `camelCaseAttributes` | string[] | `[]` | Yes | Attributes whose camelCase words are split. Case-sensitive. |
| `separatorsToIndex` | string | `""` | Yes | Non-alphanumeric characters to index as separate tokens (e.g. `"+#"` so "Disney+" splits). |

### Query strategy

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `queryType` | string | `"prefixLast"` | Yes | Prefix interpretation: `prefixLast` (last word is prefix), `prefixNone` (off), `prefixAll` (all words prefix — avoid; slow/odd results). |
| `removeWordsIfNoResults` | string | `"none"` | Yes | Word-dropping strategy on empty results: `none`, `lastWords`, `firstWords`, `allOptional`. |
| `advancedSyntax` | boolean | `false` | Yes | Enable phrase matching (`"..."`) and word exclusion (`-word`). |
| `advancedSyntaxFeatures` | string[] | `["exactPhrase","excludeWords"]` | Yes | Which advanced-syntax features are on. Only matters when `advancedSyntax` is `true`. |
| `optionalWords` | string \| string[] \| null | `[]` | Yes | Words treated as optional, widening results. Complex match-count escalation applies for 4+ all-optional words. |
| `disablePrefixOnAttributes` | string[] | `[]` | Yes | Attributes where prefix matching is off (e.g. `sku`). Case-sensitive. |
| `disableExactOnAttributes` | string[] | `[]` | Yes | Attributes excluded from the Exact criterion (e.g. long `description`). Case-sensitive. |
| `exactOnSingleWordQuery` | string | `"attribute"` | Yes | Single-word Exact computation: `attribute` (whole value equals query), `none` (ignore Exact), `word` (query word found in value; ≥3 chars, non-stop-word). |
| `alternativesAsExact` | string[] | `["ignorePlurals","singleWordSynonym"]` | Yes | Which alternatives count as exact: `ignorePlurals`, `singleWordSynonym`, `multiWordsSynonym`, `ignoreConjugations`. |
| `mode` | string | `"keywordSearch"` | Yes | `keywordSearch` or `neuralSearch`. **`neuralSearch` only works on indices where Algolia has enabled NeuralSearch for you.** |
| `semanticSearch` | object | (unset) | Yes | NeuralSearch semantic config; only used when `mode` is `neuralSearch`. `eventSources` = indices to collect click/conversion events from (null = current index + replicas). |

### Rules & personalization

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `enableRules` | boolean | `true` | Yes | Whether query rules are applied. |
| `enablePersonalization` | boolean | `false` | Yes | Whether Personalization is applied. |
| `enableReRanking` | boolean | `true` | Yes | Whether Dynamic Re-Ranking applies (only effective if Re-Ranking is enabled for the index in the dashboard). |
| `reRankingApplyFilter` | string \| string[] \| null | (unset) | Yes | Restrict Dynamic Re-Ranking to records matching these filters. |

### Performance

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `numericAttributesForFiltering` | string[] | `[]` (all numeric attributes filterable) | Yes | Numeric attributes usable as numeric filters. Modifier: `equalOnly("ATTR")` allows only `=`/`!=`. To disable all numeric filtering, pass a non-existent attribute like `NO_NUMERIC_FILTERING`. Reducing this speeds indexing. |
| `allowCompressionOfIntegerArray` | boolean | `false` | Yes | Compress arrays of exclusively non-negative integers for performance. If `true`, compressed arrays may be reordered. |

### Geo

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| Geo ranking via `_geoloc` | record data + `geo` ranking criterion | `geo` is present in the default `ranking` | Yes | Geo search is driven by an `_geoloc` attribute on records plus the `geo` entry in `ranking`; geo filtering uses query-time params (`aroundLatLng`, `aroundRadius`, `insideBoundingBox`, etc.), which are search parameters rather than index settings. `[UNVERIFIED]` — no dedicated geo *index setting* appears in the `setSettings` schema; geo is configured via record data and search params. |

### Advanced

| Setting | Type | Default | forwardToReplicas? | Description |
|---------|------|---------|--------------------|-------------|
| `attributeForDistinct` | string | (unset) | Yes | Attribute defining record groups for de-duplication. Pairs with `distinct`. For faceting on the same attribute use the `afterDistinct(...)` faceting modifier. |
| `distinct` | boolean \| integer (0–4) | `0` | Yes | Members of each `attributeForDistinct` group to keep. `true`/`1` = dedup to one. `>1`: `hitsPerPage` then counts *groups*. Ignored if `attributeForDistinct` is unset. |
| `replaceSynonymsInHighlight` | boolean | `false` | Yes | (Also listed under Highlighting.) Replace highlighted word with the matched synonym. |
| `minProximity` | integer | `1` (1–7) | Yes | Min proximity score between two matched words; scores neighboring and slightly-separated matches equally up to this distance. |
| `responseFields` | string[] | `["*"]` | No (per-query common) | Top-level response properties to include. Empty list can yield a near-empty response. Cannot exclude: `message`, `warning`, `cursor`, `abTestVariantID`, ranking-info fields. Omitting `hits` returns no results. |
| `maxFacetHits` | integer | `10` (max `100`) | Yes | Max facet values returned when *searching for facet values*. |
| `attributeCriteriaComputedByMinProximity` | boolean | `false` | Yes | If `true`, best-matching attribute chosen by min proximity instead of `searchableAttributes` order. Only matters if Attribute precedes Proximity in `ranking`. |
| `renderingContent` | object | (unset) | Yes | UI-control data: `facetOrdering` (facet name/value order), `redirect`, `widgets` (e.g. merchandising `banners`). Lets the frontend reorder facets without code changes. |
| `userData` | object | `{}` | Yes | Arbitrary custom data, up to 32 kB. |

---

## Coverage notes

- **Source of truth.** Endpoint shape, host, headers, and the two curl examples are verbatim from the Algolia REST API reference (`/doc/rest-api/search/get-settings`, `/doc/rest-api/search/set-settings`). Every setting's type, default, and category is taken directly from the live `mcp__algolia__setSettings` JSON Schema (`$defs`), which mirrors the Algolia API parameters reference. No defaults were invented.
- **`forwardToReplicas` default = `false`** — confirmed by Algolia's "Manage multiple indices" guide. The Set settings REST page itself does not state the default; the guide does. Forwarding only reaches *existing* replicas; create a replica first, then forward.
- **Biggest gotchas:**
  - `replicas` must always be sent as the *complete* list — dropping a replica from the list detaches it into a standalone index.
  - `relevancyStrictness` is settable **only on virtual replica indices**.
  - `mode: "neuralSearch"` (and `semanticSearch`) only function on indices where Algolia has explicitly enabled NeuralSearch — setting it otherwise has no effect.
  - The two helper tools (`setAttributesForFaceting`, `setCustomRanking`) default to `append`, so they *add* to existing config unless you pass `strategy: "replace"`; and neither exposes `forwardToReplicas`.
- **forwardToReplicas? column** is a usage heuristic (which settings you typically forward vs. let differ per replica). Mechanically, the `forwardToReplicas` flag on `setSettings` governs *all* keys in a given request — it is request-level, not per-setting.
- **`[UNVERIFIED]`:** Geo has no dedicated *index setting* in the `setSettings` schema; it is configured via the `_geoloc` record attribute, the `geo` entry in `ranking`, and query-time geo search parameters. Marked unverified as an index *setting* specifically.
- **Not exhaustively defaulted:** `attributesToTransliterate` shows no explicit default in the schema (treated as empty/none). `semanticSearch`, `reRankingApplyFilter`, `attributeForDistinct`, and `renderingContent` have no default value (unset) in the schema.
- **Related settings present in schema but outside the requested scope:** `enableReRanking` / `reRankingApplyFilter` (Dynamic Re-Ranking), `camelCaseAttributes`, `separatorsToIndex`, `decompoundedAttributes`, `attributesToTransliterate`, `userData`, `restrictHighlightAndSnippetArrays`, `snippetEllipsisText`, and merchandising `renderingContent.widgets.banners` — documented above where they fall into a category.

**Primary sources:**
- https://www.algolia.com/doc/rest-api/search/get-settings
- https://www.algolia.com/doc/rest-api/search/set-settings
- https://www.algolia.com/doc/api-reference/api-methods/get-settings/
- https://www.algolia.com/doc/api-reference/api-methods/set-settings/
- https://www.algolia.com/doc/guides/managing-results/refine-results/sorting/how-to/set-settings-and-forward-to-replicas
- `mcp__algolia__setSettings` / `getSettings` / `setAttributesForFaceting` / `setCustomRanking` tool schemas (live MCP, June 2026)
