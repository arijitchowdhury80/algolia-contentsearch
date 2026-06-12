# Relevance Config API (Rules, Synonyms, Dictionaries, Query Suggestions)

Covers Algolia's relevance-configuration surfaces: **Query Rules** (merchandising), **Synonyms**, **Dictionaries** (stopwords / plurals / compounds), and **Query Suggestions**.

## Hosts, auth, and contexts

| Sub-API | Host | Notes |
|---|---|---|
| Rules / Synonyms / Dictionaries | `https://$ALGOLIA_APP_ID.algolia.net` | Same search/indexing host. For write reliability use the write-DSN variant `https://$ALGOLIA_APP_ID.algolia.net`; reads can use `https://$ALGOLIA_APP_ID-dsn.algolia.net`. |
| Query Suggestions | `https://query-suggestions.us.algolia.com` or `https://query-suggestions.eu.algolia.com` | **Separate regional service.** Pick the host matching your application's **analytics region** (`us` or `eu`). Paths live under `/1/configs` and `/1/logs`. |

**Auth headers (all requests, all sub-APIs):**

```
x-algolia-application-id: $ALGOLIA_APP_ID
x-algolia-api-key: $ALGOLIA_API_KEY
Content-Type: application/json
```
**Source:** https://www.algolia.com/doc/rest-api/search/ and https://www.algolia.com/doc/rest-api/query-suggestions/

**Credential contexts** (never paste real keys):
- **CENTRAL** — `ALGOLIA_CENTRAL_APP_ID` / `ALGOLIA_CENTRAL_API_KEY`
- **VISIBILITY** — `VISIBILITY_APP_ID` / `VISIBILITY_API_KEY`

Examples below use the generic `$ALGOLIA_APP_ID` / `$ALGOLIA_API_KEY` placeholders; substitute the context-prefixed variables as needed. The MCP tools take `applicationId` as a parameter (the configured API key is supplied by the MCP server, not passed inline).

> **ACL note:** Rules, Synonyms, and Dictionaries writes require the `editSettings` ACL; reads require `settings`. Query Suggestions config management requires a key with the relevant Query Suggestions ACL. `[UNVERIFIED]` exact ACL per endpoint — confirm in the dashboard's API keys view.

---

## 1. Rules (Query Rules / merchandising)

**Object shape — a Rule.** A rule has an `objectID`, an optional array of `conditions` (what triggers it) and a required `consequence` (what happens).

- **`conditions[]`** — each condition can set:
  - `pattern` — literal query string, or a facet placeholder like `{facet:genre}`.
  - `anchoring` — `is` | `startsWith` | `endsWith` | `contains` (how the pattern matches the query). Empty pattern is only valid with `anchoring: is`.
  - `alternatives` — boolean; whether the pattern also matches plurals, synonyms, typos.
  - `context` — only fires when the search passes a matching `ruleContexts` value.
  - `filters` — `facet:value` filter that triggers the rule.
- **`consequence`** — effect of the rule:
  - `params` — search params to override/inject (e.g. `query` edits, `filters`, `automaticFacetFilters`, `optionalFilters`, `aroundLatLng`, `renderingContent`).
  - `promote[]` — pin records to positions (`{objectID, position}` or `{objectIDs[], position}`); up to 300 records.
  - `hide[]` — records to hide (`{objectID}`), up to 50.
  - `filterPromotes` — boolean; promoted records must also match active filters.
  - `userData` — arbitrary JSON (≤1 kB) echoed back in the response `userData`.
- **`enabled`** (default `true`), **`description`**, and **`validity[]`** (`[{from, until}]` Unix-epoch time windows) round out the object.

`forwardToReplicas` (query param / MCP arg) propagates the write to replica indices.

**Source (object shape):** https://www.algolia.com/doc/guides/managing-results/rules/rules-overview/

### 1.1 Save (create/replace) a rule

- **Purpose:** Create a rule with the given `objectID`, or fully replace it if it exists.
- **REST:** `PUT /1/indexes/{indexName}/rules/{objectID}` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__saveRule`

| Param | Where | Required | Notes |
|---|---|---|---|
| `indexName` | path | yes | Target index. |
| `objectID` | path | yes | Rule identifier. |
| `forwardToReplicas` | query | no | Propagate to replicas. |
| `requestBody` | body | yes | Rule object (`objectID` + `consequence` required). |

```bash
curl -X PUT \
  "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/rules/promote-summer?forwardToReplicas=true" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "objectID": "promote-summer",
    "conditions": [{ "pattern": "shoes", "anchoring": "contains" }],
    "consequence": {
      "promote": [{ "objectID": "SKU-42", "position": 0 }],
      "params": { "filters": "season:summer" }
    },
    "description": "Promote summer SKU for shoe queries",
    "enabled": true
  }'
```

```jsonc
// mcp__algolia__saveRule
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "objectID": "promote-summer",
  "forwardToReplicas": true,
  "requestBody": {
    "objectID": "promote-summer",
    "conditions": [{ "pattern": "shoes", "anchoring": "contains" }],
    "consequence": {
      "promote": [{ "objectID": "SKU-42", "position": 0 }],
      "params": { "filters": "season:summer" }
    }
  }
}
```

**Source:** https://www.algolia.com/doc/api-reference/api-methods/save-rule/ (method/path confirmed PUT via OpenAPI spec `operationId: saveRule`)

### 1.2 Save / batch rules

- **Purpose:** Create or replace multiple rules in one request; optionally clear all existing rules first.
- **REST:** `POST /1/indexes/{indexName}/rules/batch` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__saveRules`

| Param | Where | Required | Notes |
|---|---|---|---|
| `indexName` | path | yes | |
| `forwardToReplicas` | query | no | |
| `clearExistingRules` | query | no | Replace the whole rule set. |
| `requestBody` | body | yes | Array of rule objects. |

```bash
curl -X POST \
  "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/rules/batch?clearExistingRules=false&forwardToReplicas=true" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    { "objectID": "r1", "consequence": { "params": { "filters": "inStock:true" } } },
    { "objectID": "r2", "conditions": [{ "pattern": "cheap", "anchoring": "is" }],
      "consequence": { "params": { "query": { "remove": ["cheap"] } } } }
  ]'
```

```jsonc
// mcp__algolia__saveRules
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "clearExistingRules": false,
  "forwardToReplicas": true,
  "requestBody": [
    { "objectID": "r1", "consequence": { "params": { "filters": "inStock:true" } } }
  ]
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/save-rules (OpenAPI `operationId: saveRules`, POST `/1/indexes/{indexName}/rules/batch`)

### 1.3 Get a rule

- **Purpose:** Retrieve a single rule by `objectID`.
- **REST:** `GET /1/indexes/{indexName}/rules/{objectID}` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__getRule`

| Param | Where | Required |
|---|---|---|
| `indexName` | path | yes |
| `objectID` | path | yes |

```bash
curl "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/rules/promote-summer" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__getRule
{ "applicationId": "$ALGOLIA_APP_ID", "indexName": "products", "objectID": "promote-summer" }
```

**Source:** https://www.algolia.com/doc/rest-api/search/get-rule (OpenAPI `operationId: getRule`, GET)

### 1.4 Search rules

- **Purpose:** Search/list rules with filters (query text, context, anchoring, enabled state) and pagination.
- **REST:** `POST /1/indexes/{indexName}/rules/search` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__searchRules`

| Body param | Required | Notes |
|---|---|---|
| `query` | no | Free-text search over rules (default `""` = all). |
| `anchoring` | no | `is`/`startsWith`/`endsWith`/`contains`. |
| `context` | no | Exact match on rule context. |
| `enabled` | no | `true`/`false`/`null` (default all). |
| `page`, `hitsPerPage` | no | Pagination. |

```bash
curl -X POST \
  "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/rules/search" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "query": "", "enabled": true, "hitsPerPage": 50 }'
```

```jsonc
// mcp__algolia__searchRules
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "requestBody": { "query": "", "enabled": true, "hitsPerPage": 50 }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/search-rules (OpenAPI `operationId: searchRules`, POST)

### 1.5 Delete a rule

- **Purpose:** Delete a single rule by `objectID`.
- **REST:** `DELETE /1/indexes/{indexName}/rules/{objectID}` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__deleteRule`

| Param | Where | Required |
|---|---|---|
| `indexName` | path | yes |
| `objectID` | path | yes |
| `forwardToReplicas` | query | no |

```bash
curl -X DELETE \
  "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/rules/promote-summer?forwardToReplicas=true" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__deleteRule
{ "applicationId": "$ALGOLIA_APP_ID", "indexName": "products", "objectID": "promote-summer", "forwardToReplicas": true }
```

**Source:** https://www.algolia.com/doc/rest-api/search/delete-rule (OpenAPI `operationId: deleteRule`, DELETE)

### 1.6 Clear all rules

- **Purpose:** Delete every rule in the index.
- **REST:** `POST /1/indexes/{indexName}/rules/clear` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__clearRules`

| Param | Where | Required |
|---|---|---|
| `indexName` | path | yes |
| `forwardToReplicas` | query | no |

```bash
curl -X POST \
  "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/rules/clear" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json"
```

```jsonc
// mcp__algolia__clearRules
{ "applicationId": "$ALGOLIA_APP_ID", "indexName": "products", "forwardToReplicas": false }
```

**Source:** https://www.algolia.com/doc/rest-api/search/clear-rules (OpenAPI `operationId: clearRules`, POST)

---

## 2. Synonyms

**Object shape — a Synonym.** Every synonym has an `objectID` and a `type`. The other fields depend on the type:

| `type` | Fields used | Meaning |
|---|---|---|
| `synonym` (multi-way) | `synonyms[]` | All listed terms are interchangeable equivalents (e.g. `["car","auto","vehicle"]`). |
| `onewaysynonym` | `input`, `synonyms[]` | Searching `input` also matches `synonyms`, but **not** the reverse. |
| `altcorrection1` / `altcorrection2` | `word`, `corrections[]` | Treat `corrections` as matches of `word` with the cost of 1 (or 2) typo(s). |
| `placeholder` | `placeholder`, `replacements[]` | A token like `<Street>` inside records is replaced/matched by any of `replacements` (e.g. `["street","st"]`). |

> The MCP `type` enum accepts both lowercase (`onewaysynonym`, `altcorrection1`) and camelCase (`oneWaySynonym`, `altCorrection1`) spellings. `forwardToReplicas` propagates writes to replicas.

**Source (object shape):** https://www.algolia.com/doc/guides/managing-results/optimize-search-results/adding-synonyms/in-depth/synonyms-api/

### 2.1 Save (create/replace) a synonym

- **Purpose:** Create or replace one synonym by `objectID`.
- **REST:** `PUT /1/indexes/{indexName}/synonyms/{objectID}` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__saveSynonym`

| Param | Where | Required | Notes |
|---|---|---|---|
| `indexName` | path | yes | |
| `objectID` | path | yes | |
| `forwardToReplicas` | query | no | |
| `requestBody` | body | yes | Synonym object (`objectID` + `type` required). |

```bash
curl -X PUT \
  "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/synonyms/syn-car?forwardToReplicas=true" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "objectID": "syn-car", "type": "synonym", "synonyms": ["car", "auto", "vehicle"] }'
```

```jsonc
// mcp__algolia__saveSynonym
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "objectID": "syn-car",
  "forwardToReplicas": true,
  "requestBody": { "objectID": "syn-car", "type": "synonym", "synonyms": ["car", "auto", "vehicle"] }
}
```

**Source:** https://www.algolia.com/doc/api-reference/api-methods/save-synonym/ (method confirmed PUT via OpenAPI `operationId: saveSynonym`)

### 2.2 Save / batch synonyms

- **Purpose:** Create or replace multiple synonyms; optionally replace the whole set.
- **REST:** `POST /1/indexes/{indexName}/synonyms/batch` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__saveSynonyms`

| Param | Where | Required | Notes |
|---|---|---|---|
| `indexName` | path | yes | |
| `forwardToReplicas` | query | no | |
| `replaceExistingSynonyms` | query | no | Replace the entire synonym set. |
| `requestBody` | body | yes | Array of synonym objects. |

```bash
curl -X POST \
  "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/synonyms/batch?replaceExistingSynonyms=false" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    { "objectID": "syn-car", "type": "synonym", "synonyms": ["car", "auto"] },
    { "objectID": "ow-tv", "type": "onewaysynonym", "input": "tv", "synonyms": ["television"] },
    { "objectID": "ph-street", "type": "placeholder", "placeholder": "<Street>", "replacements": ["street", "st"] }
  ]'
```

```jsonc
// mcp__algolia__saveSynonyms
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "replaceExistingSynonyms": false,
  "forwardToReplicas": true,
  "requestBody": [
    { "objectID": "syn-car", "type": "synonym", "synonyms": ["car", "auto"] }
  ]
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/save-synonyms (OpenAPI `operationId: saveSynonyms`, POST)

### 2.3 Get a synonym

- **Purpose:** Retrieve one synonym by `objectID`.
- **REST:** `GET /1/indexes/{indexName}/synonyms/{objectID}` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__getSynonym`

| Param | Where | Required |
|---|---|---|
| `indexName` | path | yes |
| `objectID` | path | yes |

```bash
curl "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/synonyms/syn-car" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__getSynonym
{ "applicationId": "$ALGOLIA_APP_ID", "indexName": "products", "objectID": "syn-car" }
```

**Source:** https://www.algolia.com/doc/rest-api/search/get-synonym (OpenAPI `operationId: getSynonym`, GET)

### 2.4 Search synonyms

- **Purpose:** Search/list synonyms, optionally filtered by `type`, with pagination.
- **REST:** `POST /1/indexes/{indexName}/synonyms/search` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__searchSynonyms`

| Body param | Required | Notes |
|---|---|---|
| `query` | no | Free-text search (default `""` = all). |
| `type` | no | Filter by synonym type. |
| `page`, `hitsPerPage` | no | Pagination. |

```bash
curl -X POST \
  "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/synonyms/search" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "query": "car", "type": "synonym", "hitsPerPage": 20 }'
```

```jsonc
// mcp__algolia__searchSynonyms
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "requestBody": { "query": "car", "type": "synonym", "hitsPerPage": 20 }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/search-synonyms (OpenAPI `operationId: searchSynonyms`, POST)

### 2.5 Delete a synonym

- **Purpose:** Delete one synonym by `objectID`.
- **REST:** `DELETE /1/indexes/{indexName}/synonyms/{objectID}` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__deleteSynonym`

| Param | Where | Required |
|---|---|---|
| `indexName` | path | yes |
| `objectID` | path | yes |
| `forwardToReplicas` | query | no |

```bash
curl -X DELETE \
  "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/synonyms/syn-car?forwardToReplicas=true" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__deleteSynonym
{ "applicationId": "$ALGOLIA_APP_ID", "indexName": "products", "objectID": "syn-car", "forwardToReplicas": true }
```

**Source:** https://www.algolia.com/doc/rest-api/search/delete-synonym (OpenAPI `operationId: deleteSynonym`, DELETE)

### 2.6 Clear all synonyms

- **Purpose:** Delete every synonym in the index.
- **REST:** `POST /1/indexes/{indexName}/synonyms/clear` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__clearSynonyms`

| Param | Where | Required |
|---|---|---|
| `indexName` | path | yes |
| `forwardToReplicas` | query | no |

```bash
curl -X POST \
  "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/synonyms/clear" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json"
```

```jsonc
// mcp__algolia__clearSynonyms
{ "applicationId": "$ALGOLIA_APP_ID", "indexName": "products", "forwardToReplicas": false }
```

**Source:** https://www.algolia.com/doc/rest-api/search/clear-synonyms (OpenAPI `operationId: clearSynonyms`, POST)

---

## 3. Dictionaries (stopwords / plurals / compounds)

**Object shape — a dictionary entry.** Dictionaries are **application-level** (not per-index). The dictionary name is one of `stopwords`, `plurals`, or `compounds`. Each entry has:

- `objectID` (required) — unique entry id.
- `language` — ISO code (e.g. `en`, `de`, `fr`).
- `type` — `custom` (added by you) vs `standard` (Algolia-provided).
- `state` — `enabled` | `disabled`.
- Dictionary-specific words:
  - **stopwords:** `word` — a single stop word (e.g. `"the"`).
  - **plurals:** `words[]` — equivalent declensions (e.g. `["cheval","chevaux"]`).
  - **compounds:** `word` + `decomposition[]` — a compound and its building blocks (e.g. word `"kopfschmerztablette"`, decomposition `["kopf","schmerz","tablette"]`).

Dictionary endpoints use the search/indexing host. Unlike rules/synonyms there is **no `forwardToReplicas`** — dictionaries are app-wide.

**Source (object shape):** https://www.algolia.com/doc/guides/managing-results/optimize-search-results/manage-your-dictionaries/

### 3.1 Batch dictionary entries (add / delete)

- **Purpose:** Add or delete multiple custom entries; optionally clear existing custom entries first.
- **REST:** `POST /1/dictionaries/{dictionaryName}/batch` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__batchDictionaryEntries`

| Param | Where | Required | Notes |
|---|---|---|---|
| `dictionaryName` | path | yes | `stopwords` / `plurals` / `compounds`. |
| `requestBody.requests[]` | body | yes | Each is `{action, body}` where `action` is `addEntry` or `deleteEntry`. |
| `requestBody.clearExistingDictionaryEntries` | body | no | Replace all custom entries (default `false`). |

```bash
curl -X POST \
  "https://$ALGOLIA_APP_ID.algolia.net/1/dictionaries/stopwords/batch" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clearExistingDictionaryEntries": false,
    "requests": [
      { "action": "addEntry",
        "body": { "objectID": "sw-en-the", "language": "en", "word": "the", "state": "enabled" } }
    ]
  }'
```

```jsonc
// mcp__algolia__batchDictionaryEntries
{
  "applicationId": "$ALGOLIA_APP_ID",
  "dictionaryName": "stopwords",
  "requestBody": {
    "clearExistingDictionaryEntries": false,
    "requests": [
      { "action": "addEntry",
        "body": { "objectID": "sw-en-the", "language": "en", "word": "the", "state": "enabled" } }
    ]
  }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/batch-dictionary-entries (OpenAPI `operationId: batchDictionaryEntries`, POST)

### 3.2 Search dictionary entries

- **Purpose:** Search custom + standard entries within one dictionary.
- **REST:** `POST /1/dictionaries/{dictionaryName}/search` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__searchDictionaryEntries`

| Body param | Required | Notes |
|---|---|---|
| `query` | yes | Search text (required for this op). |
| `language` | no | Restrict to one ISO language. |
| `page`, `hitsPerPage` | no | Pagination. |

```bash
curl -X POST \
  "https://$ALGOLIA_APP_ID.algolia.net/1/dictionaries/stopwords/search" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "query": "the", "language": "en", "hitsPerPage": 20 }'
```

```jsonc
// mcp__algolia__searchDictionaryEntries
{
  "applicationId": "$ALGOLIA_APP_ID",
  "dictionaryName": "stopwords",
  "requestBody": { "query": "the", "language": "en", "hitsPerPage": 20 }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/search-dictionary-entries (OpenAPI `operationId: searchDictionaryEntries`, POST)

### 3.3 Get dictionary languages

- **Purpose:** List supported languages and how many custom/standard entries exist per dictionary.
- **REST:** `GET /1/dictionaries/*/languages` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__getDictionaryLanguages`

| Param | Where | Required |
|---|---|---|
| `applicationId` | MCP arg | yes |

> The literal `*` in the path is intentional — this endpoint reports across all dictionaries at once.

```bash
curl "https://$ALGOLIA_APP_ID.algolia.net/1/dictionaries/*/languages" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__getDictionaryLanguages
{ "applicationId": "$ALGOLIA_APP_ID" }
```

**Source:** https://www.algolia.com/doc/rest-api/search/get-dictionary-languages (OpenAPI path `/1/dictionaries/*/languages`, GET `operationId: getDictionaryLanguages`)

### 3.4 Get dictionary settings

- **Purpose:** Retrieve which standard (built-in) dictionary entries are disabled per language.
- **REST:** `GET /1/dictionaries/*/settings` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__getDictionarySettings`

| Param | Where | Required |
|---|---|---|
| `applicationId` | MCP arg | yes |

```bash
curl "https://$ALGOLIA_APP_ID.algolia.net/1/dictionaries/*/settings" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__getDictionarySettings
{ "applicationId": "$ALGOLIA_APP_ID" }
```

**Source:** https://www.algolia.com/doc/rest-api/search/get-dictionary-settings (OpenAPI path `/1/dictionaries/*/settings`, GET `operationId: getDictionarySettings`)

### 3.5 Set dictionary settings

- **Purpose:** Turn Algolia's built-in (standard) dictionary entries on or off per language.
- **REST:** `PUT /1/dictionaries/*/settings` — host `https://$ALGOLIA_APP_ID.algolia.net`
- **MCP tool:** `mcp__algolia__setDictionarySettings`

> **Correction to baseline:** the verified method is **PUT**, not POST (OpenAPI `operationId: setDictionarySettings`).

| Param | Where | Required | Notes |
|---|---|---|---|
| `requestBody.disableStandardEntries` | body | yes | Object keyed by dictionary (`stopwords`/`plurals`/`compounds`), each a map of `{ langCode: boolean }`. |

```bash
curl -X PUT \
  "https://$ALGOLIA_APP_ID.algolia.net/1/dictionaries/*/settings" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "disableStandardEntries": { "stopwords": { "fr": true } } }'
```

```jsonc
// mcp__algolia__setDictionarySettings
{
  "applicationId": "$ALGOLIA_APP_ID",
  "requestBody": { "disableStandardEntries": { "stopwords": { "fr": true } } }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/set-dictionary-settings (OpenAPI path `/1/dictionaries/*/settings`, PUT)

---

## 4. Query Suggestions

> **Separate service.** Host is `https://query-suggestions.us.algolia.com` or `https://query-suggestions.eu.algolia.com` — choose the region matching your analytics region. All MCP Query Suggestions tools therefore require a **`region`** argument (`us` or `eu`). Paths are under `/1/configs` and `/1/logs`.

**Object shape — a Query Suggestions configuration.** A config is identified by `indexName` (the **output** suggestions index it builds) plus a `Configuration` body:

- **`sourceIndices[]`** (required, ≥1) — each source index defines:
  - `indexName` — the source Algolia index whose popular searches feed suggestions.
  - `minHits` (default 5) — min search results a query must produce to qualify.
  - `minLetters` (default 4) — min query length to qualify.
  - `replicas` (default false) — also mine replica indices.
  - `analyticsTags[]` — restrict to tagged analytics segments.
  - `facets[]` — `{attribute, amount}` top facet values to attach to each suggestion (categories).
  - `generate[][]` — facet combinations to synthesize suggestions from (e.g. `[["color","brand"]]`).
  - `external[]` — Algolia indices holding externally-sourced popular searches (records need `query` + `count`).
- **`languages`** — array of ISO codes, or `true`/`false`, to deduplicate singular/plural suggestion forms.
- **`exclude[]`** — words / regexes to drop from suggestions.
- **`enablePersonalization`** (default false), **`allowSpecialCharacters`** (default false).

**Source (object shape):** https://www.algolia.com/doc/rest-api/query-suggestions/

### 4.1 Create a configuration

- **Purpose:** Create a new Query Suggestions config (max 100 per app), schedules the first build.
- **REST:** `POST /1/configs` — host `https://query-suggestions.{us|eu}.algolia.com`
- **MCP tool:** `mcp__algolia__createQuerySuggestionsConfig`

| Param | Where | Required | Notes |
|---|---|---|---|
| `region` | MCP arg | yes | `us` or `eu`. |
| `requestBody.indexName` | body | yes | Output suggestions index name. |
| `requestBody.sourceIndices` | body | yes | ≥1 source index config. |

```bash
curl -X POST \
  "https://query-suggestions.us.algolia.com/1/configs" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "indexName": "products_query_suggestions",
    "sourceIndices": [
      { "indexName": "products", "minHits": 5, "minLetters": 4,
        "facets": [{ "attribute": "category", "amount": 3 }] }
    ],
    "languages": ["en"],
    "exclude": ["test"]
  }'
```

```jsonc
// mcp__algolia__createQuerySuggestionsConfig
{
  "applicationId": "$ALGOLIA_APP_ID",
  "region": "us",
  "requestBody": {
    "indexName": "products_query_suggestions",
    "sourceIndices": [{ "indexName": "products", "minHits": 5, "minLetters": 4 }],
    "languages": ["en"]
  }
}
```

**Source:** https://www.algolia.com/doc/rest-api/query-suggestions/create-a-configuration/ (OpenAPI `operationId: createConfig`, POST `/1/configs`)

### 4.2 List all configurations

- **Purpose:** List every Query Suggestions config for the app/region.
- **REST:** `GET /1/configs` — host `https://query-suggestions.{us|eu}.algolia.com`
- **MCP tool:** `mcp__algolia__listQuerySuggestionsConfigs`

| Param | Where | Required |
|---|---|---|
| `region` | MCP arg | yes |

```bash
curl "https://query-suggestions.us.algolia.com/1/configs" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__listQuerySuggestionsConfigs
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us" }
```

**Source:** https://www.algolia.com/doc/rest-api/query-suggestions/ (OpenAPI `operationId: getAllConfigs`, GET `/1/configs`)

### 4.3 Get a configuration

- **Purpose:** Retrieve one config by `indexName`.
- **REST:** `GET /1/configs/{indexName}` — host `https://query-suggestions.{us|eu}.algolia.com`
- **MCP tool:** `mcp__algolia__getQuerySuggestionsConfig`

| Param | Where | Required |
|---|---|---|
| `region` | MCP arg | yes |
| `indexName` | path | yes |

```bash
curl "https://query-suggestions.us.algolia.com/1/configs/products_query_suggestions" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__getQuerySuggestionsConfig
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "indexName": "products_query_suggestions" }
```

**Source:** https://www.algolia.com/doc/rest-api/query-suggestions/ (OpenAPI `operationId: getConfig`, GET `/1/configs/{indexName}`)

### 4.4 Update a configuration

- **Purpose:** Replace an existing config and schedule a new build.
- **REST:** `PUT /1/configs/{indexName}` — host `https://query-suggestions.{us|eu}.algolia.com`
- **MCP tool:** `mcp__algolia__updateQuerySuggestionConfig`

| Param | Where | Required | Notes |
|---|---|---|---|
| `region` | MCP arg | yes | |
| `indexName` | path | yes | |
| `requestBody.sourceIndices` | body | yes | Full config (no `indexName` inside body for update). |

```bash
curl -X PUT \
  "https://query-suggestions.us.algolia.com/1/configs/products_query_suggestions" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "sourceIndices": [{ "indexName": "products", "minHits": 10 }], "languages": true }'
```

```jsonc
// mcp__algolia__updateQuerySuggestionConfig
{
  "applicationId": "$ALGOLIA_APP_ID",
  "region": "us",
  "indexName": "products_query_suggestions",
  "requestBody": { "sourceIndices": [{ "indexName": "products", "minHits": 10 }], "languages": true }
}
```

**Source:** https://www.algolia.com/doc/rest-api/query-suggestions/ (OpenAPI `operationId: updateConfig`, PUT `/1/configs/{indexName}`)

### 4.5 Delete a configuration

- **Purpose:** Delete a config and stop updates to its suggestions index (the index itself is not deleted).
- **REST:** `DELETE /1/configs/{indexName}` — host `https://query-suggestions.{us|eu}.algolia.com`
- **MCP tool:** `mcp__algolia__deleteQuerySuggestionConfig`

| Param | Where | Required |
|---|---|---|
| `region` | MCP arg | yes |
| `indexName` | path | yes |

```bash
curl -X DELETE \
  "https://query-suggestions.us.algolia.com/1/configs/products_query_suggestions" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__deleteQuerySuggestionConfig
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "indexName": "products_query_suggestions" }
```

**Source:** https://www.algolia.com/doc/rest-api/query-suggestions/ (OpenAPI `operationId: deleteConfig`, DELETE `/1/configs/{indexName}`)

### 4.6 Get configuration status

- **Purpose:** Report build status of a suggestions index (whether the config is running, last build time, etc.).
- **REST:** `GET /1/configs/{indexName}/status` — host `https://query-suggestions.{us|eu}.algolia.com`
- **MCP tool:** `mcp__algolia__getQuerySuggestionConfigStatus`

| Param | Where | Required |
|---|---|---|
| `region` | MCP arg | yes |
| `indexName` | path | yes |

```bash
curl "https://query-suggestions.us.algolia.com/1/configs/products_query_suggestions/status" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__getQuerySuggestionConfigStatus
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "indexName": "products_query_suggestions" }
```

**Source:** https://www.algolia.com/doc/rest-api/query-suggestions/ (OpenAPI `operationId: getConfigStatus`, GET `/1/configs/{indexName}/status`)

### 4.7 Get log file

- **Purpose:** Retrieve build logs (errors/warnings) for a suggestions index — useful for debugging why suggestions aren't generated.
- **REST:** `GET /1/logs/{indexName}` — host `https://query-suggestions.{us|eu}.algolia.com`
- **MCP tool:** `mcp__algolia__getQuerySuggestionLogFile`

| Param | Where | Required |
|---|---|---|
| `region` | MCP arg | yes |
| `indexName` | path | yes |

```bash
curl "https://query-suggestions.us.algolia.com/1/logs/products_query_suggestions" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__getQuerySuggestionLogFile
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "indexName": "products_query_suggestions" }
```

**Source:** https://www.algolia.com/doc/rest-api/query-suggestions/ (OpenAPI `operationId: getLogFile`, GET `/1/logs/{indexName}`)

### 4.8 Custom Query Suggestions requests (escape hatches)

These MCP tools send raw requests to the Query Suggestions REST API for endpoints not covered by a dedicated tool. You supply the `path` and (for POST/PUT) a `requestBody`; the tool prepends the regional host.

| MCP tool | HTTP verb | Notes |
|---|---|---|
| `mcp__algolia__customQuerySuggestionGet` | GET | `path` + optional `parameters` (query string). |
| `mcp__algolia__customQuerySuggestionPost` | POST | `path` + `requestBody`. |
| `mcp__algolia__customQuerySuggestionPut` | PUT | `path` + `requestBody`. |
| `mcp__algolia__customQuerySuggestionDelete` | DELETE | `path` + optional `parameters`. |

All require `applicationId`, `region`, and `path`.

```jsonc
// mcp__algolia__customQuerySuggestionGet — equivalent to "list all configs"
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "path": "/1/configs" }
```

```jsonc
// mcp__algolia__customQuerySuggestionPost — equivalent to "create config"
{
  "applicationId": "$ALGOLIA_APP_ID",
  "region": "us",
  "path": "/1/configs",
  "requestBody": {
    "indexName": "products_query_suggestions",
    "sourceIndices": [{ "indexName": "products" }]
  }
}
```

**Source:** Tool schemas (`customQuerySuggestionGet/Post/Put/Delete`). The exact path/verb you pass must still match a real Query Suggestions endpoint from the sections above. `[UNVERIFIED]` — there is no separate doc page for these passthrough tools; they wrap the documented REST API.

---

## Coverage notes

- **Operations documented:** 28 across the 4 sub-APIs — Rules (6), Synonyms (6), Dictionaries (5), Query Suggestions (11: 7 dedicated config/status/log operations + 4 custom passthrough tools).
- **Verified vs baseline corrections:**
  - **`saveRule` is PUT** `/1/indexes/{indexName}/rules/{objectID}` (OpenAPI `operationId: saveRule`), **not POST** as the baseline stated. Rules batch/search/clear are POST.
  - **`saveSynonym` is PUT** `/1/indexes/{indexName}/synonyms/{objectID}` (confirmed). Synonyms batch/search/clear are POST.
  - **`setDictionarySettings` is PUT** `/1/dictionaries/*/settings`, **not POST** as the baseline stated. `getDictionarySettings` and `getDictionaryLanguages` are GET on `/1/dictionaries/*/...` (literal `*` is part of the path).
  - **Query Suggestions host verified:** `https://query-suggestions.us.algolia.com` / `https://query-suggestions.eu.algolia.com`. Paths verified from the OpenAPI spec: `/1/configs` (GET list / POST create), `/1/configs/{indexName}` (GET / PUT / DELETE), `/1/configs/{indexName}/status` (GET), `/1/logs/{indexName}` (GET).
- **Gotchas:**
  - Query Suggestions is a **separate regional service** — every call needs the right region host, and the MCP tools need a `region` arg. Wrong region = config not found.
  - Dictionaries are **application-wide**, not per-index, and have **no `forwardToReplicas`**.
  - Rules and Synonyms writes accept `forwardToReplicas`; forgetting it means replicas drift out of sync.
  - QS `indexName` in a config is the **output** suggestions index Algolia builds; `sourceIndices[].indexName` are the **input** indices.
  - QS config `languages` does double duty: an array of ISO codes, or a boolean to toggle dedup for all languages.
- **`[UNVERIFIED]` items:** exact per-endpoint ACL requirements (stated generally as `editSettings`/`settings`); the custom QS passthrough tools have no dedicated doc page. Method/path for every named operation was confirmed against the Algolia `api-clients-automation` OpenAPI specs (search + query-suggestions).
- **Method confirmation source:** OpenAPI path files under `github.com/algolia/api-clients-automation/main/specs/{search,query-suggestions}/` — operationIds and HTTP verbs read directly (saveRule=PUT, saveRules=POST, saveSynonym=PUT, saveSynonyms=POST, setDictionarySettings=PUT, batchDictionaryEntries=POST, getConfigStatus=GET, getLogFile=GET, etc.).
