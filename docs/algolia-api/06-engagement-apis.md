# Engagement APIs (Insights, Recommend, A/B Testing, Personalization)

The four engagement / personalization APIs that turn user behavior into smarter search. Each lives on a **different host** with a **different REST reference** — do not mix them up:

| API | Host (verified) | Auth header pair |
|-----|------|------|
| Insights / Events | `https://insights.{region}.algolia.io` (region `us` \| `de`), or `https://insights.algolia.io` | `x-algolia-application-id` + `x-algolia-api-key` |
| Recommend | Search hosts: `https://{appId}.algolia.net` (+ `-dsn` read / `-1/-2/-3.algolianet.com` fallback) | same |
| A/B Testing | `https://analytics.{region}.algolia.com` (region `us` \| `de`), or `https://analytics.algolia.com` | same |
| Personalization | `https://personalization.{region}.algolia.com` (region `us` \| `eu`) | same |

**Verification basis:** hosts and paths below were extracted from Algolia's authoritative bundled OpenAPI specs (`github.com/algolia/api-clients-automation/main/specs/bundled/{insights,recommend,abtesting,personalization}.yml`) plus the public REST references. `[UNVERIFIED]` marks anything not confirmed in those specs.

**Credential convention used in examples (no real keys):**
- CENTRAL context: `$ALGOLIA_CENTRAL_APP_ID`, `$ALGOLIA_CENTRAL_API_KEY`
- VISIBILITY context: `$VISIBILITY_APP_ID`, `$VISIBILITY_API_KEY`
- Generic placeholders elsewhere: `$ALGOLIA_APP_ID`, `$ALGOLIA_API_KEY`

> **CRITICAL MCP-tool finding.** The MCP tools `mcp__algolia__getEvent` and `mcp__algolia__listEvents` are **NOT** Insights click/conversion events. Their parameters are `runID` / `eventID` and an `EventType` enum of `fetch | record | log | transform` with statuses `created/started/retried/failed/succeeded/critical`. These are **Ingestion task-run observability events** (the audit trail of a Connectors/Ingestion task run), not behavioral analytics. The Insights `pushEvents` endpoint that powers Click Analytics, Personalization, Recommend, and Dynamic Re-Ranking has **no MCP tool** — it is REST-only. See Section A.

---

## A. Insights / Events API

**What it powers:** Click Analytics, Personalization, Recommend models (trending-items, bought-together), and Dynamic Re-Ranking all consume the events you send here. If you send nothing, those features have no signal.

**Host:** `https://insights.{region}.algolia.io` (`us` or `de`) — or the geo-routed `https://insights.algolia.io`.
**Auth:** the API key needs no special ACL for sending events, but must belong to the app. Sending is server-side or client-side.

### A.1 Send (push) events — `pushEvents`

**Purpose:** Record click, conversion, and view events for users.
**REST:** `POST /1/events`
**MCP tool:** **None.** This operation is not exposed as an `mcp__algolia__` tool — it is REST-only. (The similarly named `getEvent`/`listEvents` MCP tools are Ingestion observability, see Section E.)

**Request body shape:** `{ "events": [ <event>, ... ] }` — an array of event objects.

**Body-level constraints (verified, [send-events reference]):**
- Max **1,000** events per request.
- Max **20** `objectIDs` per event; max **10** `filters` per event (use `objectIDs` OR `filters`, not both, in one event).
- For click events with a `queryID`, **`positions` length must equal `objectIDs` length** ("one position for each objectID").
- `timestamp` may be up to **4 days in the past**. For events that carry a `queryID`, the timestamp must be **within 1 hour** of the originating search/browse request.
- The Insights API only validates *format*, not that `objectID`/`index`/`queryID` actually exist in your Search index.

#### Event object — full field table

| Field | Type | Applies to | Required? | Notes |
|-------|------|-----------|-----------|-------|
| `eventType` | string | all | **Required** | One of `click`, `conversion`, `view`. |
| `eventSubtype` | string | conversion | Optional (recommended) | `purchase` or `addToCart`. Omitted ⇒ generic conversion. |
| `eventName` | string | all | **Required** | 1–64 chars; your own label, e.g. `"Product Clicked"`. |
| `index` | string | all | **Required** | Index name the event relates to (case-sensitive). |
| `userToken` | string | all | **Required** | Pseudonymous/anonymous user id, 1–129 ASCII chars. Same token must be used at search time for Personalization to work. |
| `authenticatedUserToken` | string | all | Optional | Stable id for a logged-in user (ties anonymous + logged-in sessions). Same format rules as `userToken`. |
| `timestamp` | int64 (ms epoch) | all | Optional | Defaults to receipt time. Subject to the 4-day / 1-hour windows above. |
| `objectIDs` | string[] | all (one of objectIDs/filters) | Conditionally **required** | Record IDs the user interacted with. Max 20. Mutually exclusive with `filters` in a single event. |
| `filters` | string[] | click / conversion / view | Conditionally **required** | Facet filters as `"facet:value"` (URL-encoded). Max 10. Use instead of `objectIDs` for category-page interactions. |
| `queryID` | string | click / conversion | Required to attribute to a search | The query id returned when the originating search ran with `clickAnalytics: true`. Turns the event into a *post-search* (attributed) event. |
| `positions` | int[] | click only | Required when `eventType=click` **and** `queryID` present | 1-based rank of each clicked object in the result list. Length must equal `objectIDs`. |
| `objectData` | object[] | conversion (purchase/addToCart) | Optional | Per-object detail; array index matches `objectIDs`. Each item: `price` (number or `{amount,currency}`), `quantity` (int), `discount`, and optional per-item `queryID`. |
| `value` | number \| object | conversion (purchase/addToCart) | Optional | Total monetary value of the event. Can be a flat number or `{amount, currency}`. |
| `currency` | string | conversion (purchase/addToCart) | Optional (required if `value` is a bare number you want priced) | ISO-4217 code, e.g. `USD`, `EUR`. |

**Required-field summary by event type:**
- **click (post-search):** `eventType`, `eventName`, `index`, `userToken`, `objectIDs`, `queryID`, `positions`.
- **click (no search):** `eventType`, `eventName`, `index`, `userToken`, and `objectIDs` **or** `filters`.
- **view:** `eventType`, `eventName`, `index`, `userToken`, and `objectIDs` **or** `filters`.
- **conversion (incl. purchase/addToCart):** `eventType`, `eventName`, `index`, `userToken`, `objectIDs`; `queryID` to attribute it to a search; `eventSubtype`+`objectData`+`value`+`currency` for purchase/cart economics.

#### Example 1 — click-after-search event (curl)

```bash
curl -X POST "https://insights.us.algolia.io/1/events" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "eventType": "click",
        "eventName": "Product Clicked",
        "index": "prod_products",
        "userToken": "user-42",
        "authenticatedUserToken": "auth-42",
        "timestamp": 1733788800000,
        "objectIDs": ["SKU-9912", "SKU-3310"],
        "queryID": "43b15df305339e827f0ac0bdc5ebcaa7",
        "positions": [1, 3]
      }
    ]
  }'
```

#### Example 2 — purchase conversion event (curl)

```bash
curl -X POST "https://insights.us.algolia.io/1/events" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "eventType": "conversion",
        "eventSubtype": "purchase",
        "eventName": "Order Completed",
        "index": "prod_products",
        "userToken": "user-42",
        "authenticatedUserToken": "auth-42",
        "timestamp": 1733789100000,
        "objectIDs": ["SKU-9912", "SKU-3310"],
        "queryID": "43b15df305339e827f0ac0bdc5ebcaa7",
        "value": 219.98,
        "currency": "USD",
        "objectData": [
          { "price": 149.99, "quantity": 1, "queryID": "43b15df305339e827f0ac0bdc5ebcaa7" },
          { "price": 69.99,  "quantity": 1 }
        ]
      }
    ]
  }'
```

**Source:** `specs/bundled/insights.yml` (servers L99-108, `POST /1/events` `pushEvents` L235); https://www.algolia.com/doc/rest-api/insights/ ; https://www.algolia.com/doc/api-reference/api-methods/send-events/ (limits: 1000 events, 20 objectIDs, 10 filters, positions==objectIDs, 4-day / 1-hour windows, purchase objectData structure).

### A.2 Related Insights endpoints (REST only, no MCP tool)

| Operation | REST | Purpose |
|-----------|------|---------|
| Delete user-token events | `DELETE /1/usertokens/{userToken}` | GDPR-style erase of all events for a user token. |

**Source:** `specs/bundled/insights.yml` `deleteUserToken` (L678). (A `GET /1/profiles/{userToken}` also exists in the Personalization spec — see D.3.)

---

## B. Recommend API

**Host:** the **Search hosts** — `https://{appId}.algolia.net` for writes, `https://{appId}-dsn.algolia.net` for reads, fallback `https://{appId}-{1,2,3}.algolianet.com`. (No dedicated "recommend" host.)
**Auth:** API key needs `recommendation` ACL for rule writes; `search` ACL for fetching recommendations.

**Recommendation models:** `related-products`, `bought-together`, `trending-items`, `trending-facets`, `looking-similar`.
**Rule `{model}` values (rules only):** `related-products`, `bought-together`, `trending-facets`, `trending-items`. (`looking-similar` is a recommendation model but is **not** a valid rule model path.)

### B.1 Get recommendations — `getRecommendations`

**Purpose:** Fetch recommendations for one or more models in a single batched request.
**REST:** `POST /1/indexes/*/recommendations`
**MCP tool:** `mcp__algolia__getRecommendations`

**Key params:**

| Param | Where | Notes |
|-------|-------|-------|
| `applicationId` | MCP | App id. |
| `requestBody.requests[]` | body | Array of recommendation requests. Each request varies by model. |
| `indexName` | per request | Index to recommend from. **Required.** |
| `model` | per request | `related-products` \| `bought-together` \| `trending-items` \| `trending-facets` \| `looking-similar`. **Required.** |
| `objectID` | per request | Required for `related-products`, `bought-together`, `looking-similar`. |
| `facetName` / `facetValue` | per request | Required for `trending-facets` (`facetName`); optional scoping for `trending-items`. |
| `threshold` | per request | **Required.** 0–100 min score for a rec to be returned. |
| `maxRecommendations` | per request | 1–30 (default 30). |
| `queryParameters` | per request | Standard search params to filter/rank the recs. |
| `fallbackParameters` | per request | Params for a fallback search if too few recs (related-products, trending-items, looking-similar). |

**curl — related-products + trending-items in one call:**

```bash
curl -X POST "https://$ALGOLIA_CENTRAL_APP_ID-dsn.algolia.net/1/indexes/*/recommendations" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      { "indexName": "prod_products", "model": "related-products", "objectID": "SKU-9912", "threshold": 40, "maxRecommendations": 5 },
      { "indexName": "prod_products", "model": "trending-items", "facetName": "category", "facetValue": "shoes", "threshold": 0 }
    ]
  }'
```

**MCP example:**

```jsonc
// mcp__algolia__getRecommendations
{
  "applicationId": "$ALGOLIA_CENTRAL_APP_ID",
  "requestBody": {
    "requests": [
      { "indexName": "prod_products", "model": "bought-together", "objectID": "SKU-9912", "threshold": 0 }
    ]
  }
}
```

**Source:** `specs/bundled/recommend.yml` servers (L106-121), `POST /1/indexes/*/recommendations` `getRecommendations` (L255); model enums L2927-3090; MCP schema `mcp__algolia__getRecommendations`.

### B.2 Get recommend task status — `getRecommendStatus`

**Purpose:** Check whether a Recommend-rule write (batch) has been fully applied.
**REST:** `GET /1/indexes/{indexName}/{model}/task/{taskID}`
**MCP tool:** `mcp__algolia__getRecommendStatus`

| Param | Notes |
|-------|-------|
| `applicationId`, `indexName`, `model` | model ∈ rule models. |
| `taskID` | Returned by `batchRecommendRules`. |

**curl:**

```bash
curl "https://$ALGOLIA_CENTRAL_APP_ID.algolia.net/1/indexes/prod_products/related-products/task/87654321" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY"
```

**MCP example:** `{ "applicationId": "$ALGOLIA_CENTRAL_APP_ID", "indexName": "prod_products", "model": "related-products", "taskID": 87654321 }`

**Source:** `specs/bundled/recommend.yml` `getRecommendStatus` (L364); MCP schema `mcp__algolia__getRecommendStatus`.

### B.3 Create/update recommend rules (batch) — `batchRecommendRules`

**Purpose:** Add or update a batch of Recommend rules (pin, hide, boost recommendations) for a given model.
**REST:** `POST /1/indexes/{indexName}/{model}/recommend/rules/batch`
**MCP tool:** `mcp__algolia__batchRecommendRules`

| Param | Notes |
|-------|-------|
| `applicationId`, `indexName` | — |
| `model` | `related-products` \| `bought-together` \| `trending-facets` \| `trending-items`. |
| `requestBody[]` | Array of RecommendRule: `objectID`, `condition` (`context`, `filters`), `consequence` (`promote[]`, `hide[]`, `params.automaticFacetFilters`/`filters`/`optionalFilters`), `enabled`, `validity[]`. |

**curl:**

```bash
curl -X POST "https://$ALGOLIA_CENTRAL_APP_ID.algolia.net/1/indexes/prod_products/related-products/recommend/rules/batch" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "objectID": "rr-boost-sale",
      "enabled": true,
      "consequence": {
        "promote": [ { "objectID": "SKU-7777", "position": 0 } ],
        "params": { "filters": "inStock:true" }
      }
    }
  ]'
```

**MCP example:**

```jsonc
// mcp__algolia__batchRecommendRules
{
  "applicationId": "$ALGOLIA_CENTRAL_APP_ID",
  "indexName": "prod_products",
  "model": "related-products",
  "requestBody": [
    { "objectID": "rr-hide-oos", "consequence": { "hide": [ { "objectID": "SKU-DEAD" } ] } }
  ]
}
```

**Source:** `specs/bundled/recommend.yml` `batchRecommendRules` (L514); MCP schema `mcp__algolia__batchRecommendRules`.

### B.4 Get one recommend rule — `getRecommendRule`

**Purpose:** Retrieve a single Recommend rule by its objectID.
**REST:** `GET /1/indexes/{indexName}/{model}/recommend/rules/{objectID}`
**MCP tool:** `mcp__algolia__getRecommendRule`

| Param | Notes |
|-------|-------|
| `applicationId`, `indexName`, `model`, `objectID` | All required. |

**curl:**

```bash
curl "https://$ALGOLIA_CENTRAL_APP_ID.algolia.net/1/indexes/prod_products/related-products/recommend/rules/rr-boost-sale" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY"
```

**MCP example:** `{ "applicationId": "$ALGOLIA_CENTRAL_APP_ID", "indexName": "prod_products", "model": "related-products", "objectID": "rr-boost-sale" }`

**Source:** `specs/bundled/recommend.yml` `getRecommendRule` (L311); MCP schema `mcp__algolia__getRecommendRule`.

### B.5 Search recommend rules — `searchRecommendRules`

**Purpose:** Search/list Recommend rules for a model, with paging and facets.
**REST:** `POST /1/indexes/{indexName}/{model}/recommend/rules/search`
**MCP tool:** `mcp__algolia__searchRecommendRules`

| Param | Notes |
|-------|-------|
| `applicationId`, `indexName`, `model` | — |
| `requestBody.query` | Free-text rule search (default ""). |
| `requestBody.context` | Filter by rule context. |
| `requestBody.enabled` | true/false to filter by status. |
| `requestBody.page`, `hitsPerPage` | Paging. |
| `requestBody.filters` | e.g. `"objectID:rr-123456"`. |

**curl:**

```bash
curl -X POST "https://$ALGOLIA_CENTRAL_APP_ID.algolia.net/1/indexes/prod_products/related-products/recommend/rules/search" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "query": "", "enabled": true, "hitsPerPage": 50 }'
```

**MCP example:** `{ "applicationId": "$ALGOLIA_CENTRAL_APP_ID", "indexName": "prod_products", "model": "related-products", "requestBody": { "query": "sale" } }`

**Source:** `specs/bundled/recommend.yml` `searchRecommendRules` (L414); MCP schema `mcp__algolia__searchRecommendRules`.

### B.6 Delete a recommend rule — `deleteRecommendRule`

**Purpose:** Delete one Recommend rule by objectID.
**REST:** `DELETE /1/indexes/{indexName}/{model}/recommend/rules/{objectID}`
**MCP tool:** `mcp__algolia__deleteRecommendRule`

| Param | Notes |
|-------|-------|
| `applicationId`, `indexName`, `model`, `objectID` | All required. |

**curl:**

```bash
curl -X DELETE "https://$ALGOLIA_CENTRAL_APP_ID.algolia.net/1/indexes/prod_products/related-products/recommend/rules/rr-boost-sale" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY"
```

**MCP example:** `{ "applicationId": "$ALGOLIA_CENTRAL_APP_ID", "indexName": "prod_products", "model": "related-products", "objectID": "rr-boost-sale" }`

**Source:** `specs/bundled/recommend.yml` `deleteRecommendRule` (L311, DELETE method); MCP schema `mcp__algolia__deleteRecommendRule`.

---

## C. A/B Testing API

**Host:** `https://analytics.{region}.algolia.com` (`us` or `de`), or `https://analytics.algolia.com`.
**Auth:** API key needs `analytics` ACL. **API version is `/2/`** (not `/1/`).
**Rate limit:** ~100 requests/minute/app. Premium/Elevate plans.

### C.1 Create an A/B test — `addABTests`

**Purpose:** Start an A/B test between two index variants.
**REST:** `POST /2/abtests`
**MCP tool:** `mcp__algolia__addABTests`

| Param | Notes |
|-------|-------|
| `applicationId`, `region` | region `us`/`de`. |
| `requestBody.name` | **Required.** Test name. |
| `requestBody.variants[]` | **Exactly 2.** Each: `index` (**req**), `trafficPercentage` (**req**, 0–100), optional `description`, optional `customSearchParameters` (only if both variants share an index). |
| `requestBody.endAt` | **Required.** RFC 3339 end datetime. |

**curl:**

```bash
curl -X POST "https://analytics.us.algolia.com/2/abtests" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom ranking sales rank test",
    "variants": [
      { "index": "prod_products", "trafficPercentage": 50, "description": "Control" },
      { "index": "prod_products_v2", "trafficPercentage": 50, "description": "New ranking" }
    ],
    "endAt": "2026-07-01T00:00:00Z"
  }'
```

**MCP example:**

```jsonc
// mcp__algolia__addABTests
{
  "applicationId": "$ALGOLIA_CENTRAL_APP_ID",
  "region": "us",
  "requestBody": {
    "name": "Custom ranking sales rank test",
    "variants": [
      { "index": "prod_products", "trafficPercentage": 50 },
      { "index": "prod_products_v2", "trafficPercentage": 50 }
    ],
    "endAt": "2026-07-01T00:00:00Z"
  }
}
```

**Source:** `specs/bundled/abtesting.yml` servers (L89-98), `POST /2/abtests` `addABTests` (L224); MCP schema `mcp__algolia__addABTests`.

### C.2 List A/B tests — `listABTests`

**Purpose:** List all A/B tests for the app.
**REST:** `GET /2/abtests`
**MCP tool:** `mcp__algolia__listABTests`

| Param | Notes |
|-------|-------|
| `applicationId`, `region` | — |
| `offset`, `limit`, `indexPrefix`, `indexSuffix` | Optional query params (paging/filtering). `[UNVERIFIED]` exact query-param names beyond offset/limit. |

**curl:** `curl "https://analytics.us.algolia.com/2/abtests" -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY"`
**MCP example:** `{ "applicationId": "$ALGOLIA_CENTRAL_APP_ID", "region": "us" }`

**Source:** `specs/bundled/abtesting.yml` `listABTests` (L224, GET); MCP schema `mcp__algolia__listABTests`.

### C.3 Get an A/B test — `getABTest`

**Purpose:** Retrieve one test's config and results.
**REST:** `GET /2/abtests/{id}`
**MCP tool:** `mcp__algolia__getABTest`

| Param | Notes |
|-------|-------|
| `applicationId`, `region`, `id` | `id` = integer A/B test id. |

**curl:** `curl "https://analytics.us.algolia.com/2/abtests/224" -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY"`
**MCP example:** `{ "applicationId": "$ALGOLIA_CENTRAL_APP_ID", "region": "us", "id": 224 }`

**Source:** `specs/bundled/abtesting.yml` `getABTest` (L359); MCP schema `mcp__algolia__getABTest`.

### C.4 Stop an A/B test — `stopABTest`

**Purpose:** Stop a running test (keeps it for review; does not delete).
**REST:** `POST /2/abtests/{id}/stop`
**MCP tool:** `mcp__algolia__stopABTest`

| Param | Notes |
|-------|-------|
| `applicationId`, `region`, `id` | — |

**curl:** `curl -X POST "https://analytics.us.algolia.com/2/abtests/224/stop" -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY"`
**MCP example:** `{ "applicationId": "$ALGOLIA_CENTRAL_APP_ID", "region": "us", "id": 224 }`

**Source:** `specs/bundled/abtesting.yml` `stopABTest` (L424); MCP schema `mcp__algolia__stopABTest`.

### C.5 Delete an A/B test — `deleteABTest`

**Purpose:** Permanently delete a test.
**REST:** `DELETE /2/abtests/{id}`
**MCP tool:** `mcp__algolia__deleteABTest`

| Param | Notes |
|-------|-------|
| `applicationId`, `region`, `id` | — |

**curl:** `curl -X DELETE "https://analytics.us.algolia.com/2/abtests/224" -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY"`
**MCP example:** `{ "applicationId": "$ALGOLIA_CENTRAL_APP_ID", "region": "us", "id": 224 }`

**Source:** `specs/bundled/abtesting.yml` `deleteABTest` (L359, DELETE); MCP schema `mcp__algolia__deleteABTest`.

### C.6 Estimate an A/B test — `estimateABTest`

**Purpose:** Estimate the sample size and duration needed to detect a target effect, before launching.
**REST:** `POST /2/abtests/estimate`
**MCP tool:** `mcp__algolia__estimateABTest`

| Param | Notes |
|-------|-------|
| `applicationId`, `region` | — |
| `requestBody.configuration.minimumDetectableEffect` | **Required.** `{ size: 0–1, metric: addToCartRate \| clickThroughRate \| conversionRate \| purchaseRate }`. |
| `requestBody.configuration.outliers` | `{ exclude: bool }` (default exclude=true). |
| `requestBody.configuration.emptySearch` | `{ exclude: bool }`. |
| `requestBody.variants[]` | Exactly 2 variants (same shape as create). |

**curl:**

```bash
curl -X POST "https://analytics.us.algolia.com/2/abtests/estimate" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "configuration": {
      "minimumDetectableEffect": { "size": 0.1, "metric": "conversionRate" },
      "outliers": { "exclude": true }
    },
    "variants": [
      { "index": "prod_products", "trafficPercentage": 50 },
      { "index": "prod_products_v2", "trafficPercentage": 50 }
    ]
  }'
```

**MCP example:** same body under `requestBody`, plus `applicationId` + `region`.

**Source:** `specs/bundled/abtesting.yml` `estimateABTest` (L460); MCP schema `mcp__algolia__estimateABTest`.

### C.7 Schedule an A/B test — `scheduleABTest`

**Purpose:** Create a test that starts at a future time instead of immediately.
**REST:** `POST /2/abtests/schedule` `[UNVERIFIED]`
**MCP tool:** `mcp__algolia__scheduleABTest`

> **[UNVERIFIED] / gotcha:** The `schedule` path is **absent** from the current bundled `abtesting.yml` OpenAPI spec on `main` (which only defines `/2/abtests`, `/2/abtests/{id}`, `/2/abtests/{id}/stop`, `/2/abtests/estimate`). The operation is confirmed only via the MCP tool `mcp__algolia__scheduleABTest` and the public REST reference. The path `POST /2/abtests/schedule` is the documented endpoint but is not corroborated by the bundled spec — verify against your account's API version before relying on it.

| Param | Notes |
|-------|-------|
| `applicationId`, `region` | — |
| `requestBody.name` | **Required.** |
| `requestBody.variants[]` | Exactly 2 (same shape as create). |
| `requestBody.scheduledAt` | **Required.** RFC 3339 start datetime. |
| `requestBody.endAt` | **Required.** RFC 3339 end datetime. |

**curl:**

```bash
curl -X POST "https://analytics.us.algolia.com/2/abtests/schedule" \
  -H "x-algolia-application-id: $ALGOLIA_CENTRAL_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_CENTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Scheduled ranking test",
    "variants": [
      { "index": "prod_products", "trafficPercentage": 50 },
      { "index": "prod_products_v2", "trafficPercentage": 50 }
    ],
    "scheduledAt": "2026-06-20T09:00:00Z",
    "endAt": "2026-07-20T09:00:00Z"
  }'
```

**MCP example:** same body under `requestBody`, plus `applicationId` + `region`.

**Source:** MCP schema `mcp__algolia__scheduleABTest`; https://www.algolia.com/doc/rest-api/abtesting/ (path listed). Not in `specs/bundled/abtesting.yml` → `[UNVERIFIED]`.

---

## D. Personalization API

**Host:** `https://personalization.{region}.algolia.com` (`us` or `eu` — note **eu**, not `de`).
**Auth:** API key needs `recommendation`/`personalization` ACL (the dashboard "Personalization" ACL).
**Rate limit:** ~40 calls/sec/app.

**How it ties to Insights:** Personalization builds per-user affinity profiles from the **Insights events** in Section A. The `strategy` (below) defines which `eventName`s and facets contribute to a profile and how strongly. At search time you set `enablePersonalization: true` + the same `userToken` you used when sending events; the engine then re-ranks using that user's profile. No events ⇒ empty profiles ⇒ no personalization.

### D.1 Get personalization strategy — `getPersonalizationStrategy`

**Purpose:** Read the current personalization strategy (scoring config).
**REST:** `GET /1/strategies/personalization`
**MCP tool:** **None dedicated.** Use the generic REST passthrough if needed (e.g. `mcp__algolia__customQuerySuggestionGet`-style passthrough is for Query Suggestions; for Personalization there is no first-class MCP tool). Treat as **REST-only / no MCP tool**.

**curl:**

```bash
curl "https://personalization.us.algolia.com/1/strategies/personalization" \
  -H "x-algolia-application-id: $VISIBILITY_APP_ID" \
  -H "x-algolia-api-key: $VISIBILITY_API_KEY"
```

**Source:** `specs/bundled/personalization.yml` servers (L89-97), `GET /1/strategies/personalization` (L342).

### D.2 Set personalization strategy — `setPersonalizationStrategy`

**Purpose:** Configure how events and facets build user profiles.
**REST:** `POST /1/strategies/personalization`
**MCP tool:** None (REST-only).

**Body schema:**

| Field | Type | Notes |
|-------|------|-------|
| `eventScoring[]` | array | Each: `{ eventName, eventType (click/conversion/view), score (int) }`. Weights how much each event contributes. |
| `facetScoring[]` | array | Each: `{ facetName, score (int) }`. Weights which facets define affinity. |
| `personalizationImpact` | int 0–100 | Global strength of personalization on ranking. |

**curl:**

```bash
curl -X POST "https://personalization.us.algolia.com/1/strategies/personalization" \
  -H "x-algolia-application-id: $VISIBILITY_APP_ID" \
  -H "x-algolia-api-key: $VISIBILITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "eventScoring": [
      { "eventName": "Product Purchased", "eventType": "conversion", "score": 50 },
      { "eventName": "Product Clicked",   "eventType": "click",      "score": 10 }
    ],
    "facetScoring": [
      { "facetName": "brand",    "score": 30 },
      { "facetName": "category", "score": 20 }
    ],
    "personalizationImpact": 80
  }'
```

**Source:** `specs/bundled/personalization.yml` `POST /1/strategies/personalization` (L342); https://www.algolia.com/doc/rest-api/personalization/.

### D.3 Get a user profile — `getUserTokenProfile`

**Purpose:** Fetch the computed personalization profile (affinity scores) for a single user token.
**REST:** `GET /1/profiles/personalization/{userToken}`
**MCP tool:** None dedicated (REST-only).

> The spec also exposes `GET /1/profiles/{userToken}` (a broader profile fetch). The personalization-scoped profile is `/1/profiles/personalization/{userToken}`. Returns the user's scored facet affinities and last-update time built from their Insights events.

**curl:**

```bash
curl "https://personalization.us.algolia.com/1/profiles/personalization/user-42" \
  -H "x-algolia-application-id: $VISIBILITY_APP_ID" \
  -H "x-algolia-api-key: $VISIBILITY_API_KEY"
```

**Source:** `specs/bundled/personalization.yml` `GET /1/profiles/personalization/{userToken}` (L231) and `GET /1/profiles/{userToken}` (L288).

### D.4 `mcp__algolia__getUserInfo` — what it actually returns

**Purpose:** This MCP tool returns **information about the current MCP/Algolia user (the authenticated operator)** — i.e. the account/user in the Algolia system, *not* a personalization end-user profile. Its schema takes **no parameters** (`{}`). It is unrelated to the Personalization profile endpoints above.

**MCP example:** `mcp__algolia__getUserInfo` with `{}` (no params).

**Source:** MCP schema `mcp__algolia__getUserInfo` (description: "Get information about the user in the Algolia system"; empty parameter object). `[UNVERIFIED]` exact response shape — not backed by a public REST reference.

---

## E. The Ingestion-events MCP tools (NOT Insights)

These two MCP tools share the word "event" with Insights but are a different API — **Ingestion (Connectors) task-run observability**, on the Ingestion host `https://data.{region}.algolia.com` (region `us`/`eu`). Documented here only to prevent confusion.

| MCP tool | Purpose | Key params | Not the same as |
|----------|---------|-----------|-----------------|
| `mcp__algolia__listEvents` | List the events emitted during one Ingestion **task run** | `applicationId`, `region` (eu/us), `runID` (UUID, **required**), `type[]` (`fetch`/`record`/`log`/`transform`), `status[]`, paging/sort | Insights `pushEvents` |
| `mcp__algolia__getEvent` | Retrieve one Ingestion run event | `applicationId`, `region`, `runID`, `eventID` (UUID) | Insights `pushEvents` |

**Why this matters:** if you want to record a click/conversion/view for analytics or personalization, you call the **REST** `POST /1/events` on `insights.{region}.algolia.io` (Section A). `getEvent`/`listEvents` will never send or read behavioral events.

**Source:** MCP schemas `mcp__algolia__listEvents` (EventType enum `fetch/record/log/transform`, `runID` required) and `mcp__algolia__getEvent`.

---

## Coverage notes

- **getEvent / listEvents are Ingestion observability, confirmed** — their schemas use `runID`/`eventID` and an `EventType` of `fetch/record/log/transform`, the Connectors task-run audit trail. They are **not** Insights click/conversion events. The Insights `pushEvents` endpoint (`POST /1/events`) has **no MCP tool** and is documented REST-only.
- **getUserInfo** returns info about the authenticated Algolia account/operator (no params), **not** a personalization end-user profile. To read an end-user's affinity profile use the REST `GET /1/profiles/personalization/{userToken}`.
- **Personalization & Insights have no first-class MCP tools** for strategy/profile/push — those four operations (push events, get/set strategy, get profile) are REST-only here.
- **Hosts differ per API and were verified from the bundled OpenAPI specs:** Insights `insights.{us,de}.algolia.io`; Recommend = Search hosts `{appId}.algolia.net`; A/B Testing `analytics.{us,de}.algolia.com` on **`/2/`**; Personalization `personalization.{us,eu}.algolia.com` (note **eu**, not de).
- **Recommend rule models** are only `related-products`, `bought-together`, `trending-facets`, `trending-items`; `looking-similar` is a recommendation model but **not** a rule-path model.
- **`[UNVERIFIED]` items:** (1) `scheduleABTest` path `POST /2/abtests/schedule` — present in the MCP tool + REST docs but **absent from the bundled `abtesting.yml` spec on main**; (2) `listABTests` optional query-param names beyond offset/limit; (3) exact JSON response shape of `getUserInfo`.
- **Top gotchas:** (a) click events with a `queryID` must include `positions` of equal length to `objectIDs`; (b) events older than 4 days are dropped, and query-attributed events must be within 1 hour of the search; (c) A/B Testing uses `/2/` and the `analytics.*` host, not the Search host; (d) Personalization region enum is `us`/`eu` while Insights/AB use `us`/`de`; (e) Personalization only works if you send Insights events with the *same* `userToken` you pass at search time with `enablePersonalization: true`.
