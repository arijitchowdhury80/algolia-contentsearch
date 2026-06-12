# Analytics API — Algolia API Reference

The **Analytics API** returns aggregated search metrics (search analytics) and, when you opt in, click/conversion/revenue metrics. It is a **separate, region-bound REST API** — it does not live on the Search API host. Data is recomputed roughly every 5 minutes (see `GET /2/status`).

---

## Host & Region

The Analytics API is hosted **per region**. Pick the host that matches the region your Algolia application is provisioned in:

| Region | Host |
|--------|------|
| United States | `https://analytics.us.algolia.com` |
| Europe (Germany) | `https://analytics.de.algolia.com` |
| Default / US alias | `https://analytics.algolia.com` |

- Using the wrong regional host returns no data (or an error) even with valid credentials. If you are on the EU stack, you must use `analytics.de.algolia.com`.
- For the MCP tools, you pass `region` as a parameter (e.g. `"us"` or `"de"`) and the MCP server routes to the correct host.

**Source:** https://www.algolia.com/doc/rest-api/analytics/ (Base URLs section)

## Authentication

Every request requires two headers:

| Header | Value |
|--------|-------|
| `x-algolia-application-id` | Your Algolia application ID (`$ALGOLIA_APP_ID`) |
| `x-algolia-api-key` | An API key with the **`analytics`** ACL (`$ALGOLIA_API_KEY`) |

The API key must have the `analytics` ACL. Use a dedicated analytics key, not the admin key, where possible.

**Source:** https://www.algolia.com/doc/rest-api/analytics/ (Authentication section)

## Rate limit

**100 requests per minute, per application.** Responses carry `x-ratelimit-limit`, `x-ratelimit-remaining`, and `x-ratelimit-reset` headers.

**Source:** https://www.algolia.com/doc/rest-api/analytics/ (Rate Limiting section)

## Default analyzed period

If you omit `startDate` / `endDate`, most endpoints default to **the last 8 days including the current day**. Both dates use `YYYY-MM-DD` format.

---

## The Insights dependency (read this before using click/conversion metrics)

Search analytics — search counts, top searches, no-results, filters, countries — populate **automatically** from search traffic. You do not have to do anything extra.

**Click, conversion, and revenue metrics do NOT populate on their own.** They are computed entirely from **events you send to the Insights API** (`POST /1/events` on `insights.algolia.io`). Specifically:

- **Click metrics** (CTR, average click position, click positions, no-click rate) need `clicked*` events tied to a search via a `queryID`.
- **Conversion metrics** (conversion rate) need `converted*` events.
- **Add-to-cart / purchase / revenue metrics** need conversion events with `eventSubtype: "addToCart"` or `"purchase"`, and revenue requires `objectData` carrying `price` and `quantity`.

Consequences:

1. The concept of a **"tracked search"** (`trackedSearchCount`) exists only for searches sent with `clickAnalytics: true` at search time, which returns a `queryID`. Rates are computed against tracked searches, not all searches.
2. On the Analytics endpoints, a rate of `null` means **no queries were received** (nothing to divide by). A rate of `0` means queries occurred but **no matching events** were sent. These are different signals.
3. If a prospect has search analytics but every click/conversion metric is `null` or `0`, that almost always means **the Insights events integration is not wired up** — a common audit finding.

The two opt-in query flags that surface these metrics on the search-level endpoints (`/2/searches`, `/2/hits`):

- **`clickAnalytics=true`** — adds `trackedSearchCount`, `clickCount`, `clickThroughRate`, `conversionCount`, `conversionRate`, `averageClickPosition`, `clickPositions`.
- **`revenueAnalytics=true`** — adds `addToCartCount`, `addToCartRate`, `purchaseCount`, `purchaseRate`, and a `currencies` revenue breakdown. (In practice you enable both together.)

The dedicated rate endpoints (`/2/clicks/...`, `/2/conversions/...`) do not take these flags — they always return the click/conversion view and are simply empty (`null`/`0`) until events flow.

**Source:** https://www.algolia.com/doc/rest-api/analytics/ ; https://www.algolia.com/doc/rest-api/insights/

---

## Environment / credential contexts

Examples use placeholders only — **never hardcode real keys**.

- **CENTRAL context:** `$ALGOLIA_CENTRAL_APP_ID`, `$ALGOLIA_CENTRAL_API_KEY`
- **VISIBILITY context:** `$VISIBILITY_APP_ID`, `$VISIBILITY_API_KEY`

Generic examples below use `$ALGOLIA_APP_ID` / `$ALGOLIA_API_KEY`; substitute the context-specific pair as needed.

---

# Searches

## Top searches — `GET /2/searches`

**Purpose:** The most popular search queries, with the average number of hits each returns. With analytics flags on, each search also carries its click/conversion/revenue performance — this is the workhorse endpoint for "what are people searching and how well does it perform."

**REST**
- Method/path: `GET /2/searches`
- Host: regional analytics host (e.g. `https://analytics.us.algolia.com`)
- Headers: `x-algolia-application-id`, `x-algolia-api-key` (`analytics` ACL)

**MCP tool:** `mcp__algolia__getTopSearches`

**Key params**

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `index` | Yes | — | Index name |
| `startDate` / `endDate` | No | last 8 days | `YYYY-MM-DD` |
| `clickAnalytics` | No | `false` | Adds click/conversion fields |
| `revenueAnalytics` | No | `false` | Adds add-to-cart/purchase/revenue fields |
| `orderBy` | No | `searchCount` | `searchCount`, `clickThroughRate`, `conversionRate`, `averageClickPosition` (only `searchCount` is valid when `clickAnalytics=false`) |
| `direction` | No | `asc` | `asc` or `desc` |
| `limit` | No | `10` | Max `1000` |
| `offset` | No | `0` | Min `0` |
| `tags` | No | — | URL-encoded analytics segment tags |

**Response shape**
```json
{
  "searches": [
    { "search": "tshirt", "count": 1200, "nbHits": 87 }
  ]
}
```
With `clickAnalytics=true`, each item also has: `trackedSearchCount`, `clickCount`, `clickThroughRate`, `conversionCount`, `conversionRate`, `averageClickPosition`, `clickPositions`.
With `revenueAnalytics=true`, also: `addToCartCount`, `addToCartRate`, `purchaseCount`, `purchaseRate`, `currencies`.

**curl**
```bash
curl -X GET \
  "https://analytics.us.algolia.com/2/searches?index=products&clickAnalytics=true&revenueAnalytics=true&orderBy=conversionRate&direction=desc&limit=20&startDate=2026-05-01&endDate=2026-05-31" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "region": "us",
  "index": "products",
  "clickAnalytics": true,
  "revenueAnalytics": true,
  "orderBy": "conversionRate",
  "direction": "desc",
  "limit": 20,
  "startDate": "2026-05-01",
  "endDate": "2026-05-31"
}
```

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-top-searches

---

## Searches count — `GET /2/searches/count`

**Purpose:** Total number of searches over the period, broken down per day. Use it to gauge overall search volume and trends.

**REST:** `GET /2/searches/count`
**MCP tool:** `mcp__algolia__getSearchesCount`

**Key params**

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `index` | Yes | — | Index name |
| `startDate` / `endDate` | No | last 8 days | `YYYY-MM-DD` |
| `tags` | No | — | URL-encoded segments |

No `limit`/`offset`/`clickAnalytics`/`revenueAnalytics`.

**Response shape**
```json
{
  "count": 84210,
  "dates": [ { "date": "2026-05-01", "count": 2890 } ]
}
```

**curl**
```bash
curl -X GET \
  "https://analytics.us.algolia.com/2/searches/count?index=products&startDate=2026-05-01&endDate=2026-05-31" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products", "startDate": "2026-05-01", "endDate": "2026-05-31" }
```

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-searches-count

---

## Top no-results searches — `GET /2/searches/noResults`

**Purpose:** The most frequent queries that returned **zero hits**. The single highest-value audit metric — every no-result is a lost intent (missing synonym, missing product, typo not tolerated).

**REST:** `GET /2/searches/noResults`
**MCP tool:** `mcp__algolia__getSearchesNoResults`

**Key params**

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `index` | Yes | — | Index name |
| `startDate` / `endDate` | No | last 8 days | `YYYY-MM-DD` |
| `limit` | No | `10` | Max `1000` |
| `offset` | No | `0` | Min `0` |
| `tags` | No | — | URL-encoded segments |

No analytics flags.

**Response shape**
```json
{
  "searches": [
    { "search": "blu jenz", "count": 142, "withFilterCount": 30 }
  ]
}
```
`withFilterCount` = how many of those no-result searches also had a filter applied.

**curl**
```bash
curl -X GET \
  "https://analytics.us.algolia.com/2/searches/noResults?index=products&limit=50&startDate=2026-05-01&endDate=2026-05-31" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products", "limit": 50, "startDate": "2026-05-01", "endDate": "2026-05-31" }
```

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-searches-no-results

---

## Top no-clicks searches — `GET /2/searches/noClicks`

**Purpose:** Queries that returned results but got **no clicks** — relevance is off even though hits exist. Requires click events (Insights) to be meaningful; these are counted from **tracked** searches.

**REST:** `GET /2/searches/noClicks`
**MCP tool:** `mcp__algolia__getSearchesNoClicks`

**Key params:** same as no-results — `index` (req), `startDate`/`endDate`, `limit` (10, max 1000), `offset` (0), `tags`. No analytics flags.

**Response shape**
```json
{
  "searches": [
    { "search": "summer dress", "count": 64, "nbHits": 53 }
  ]
}
```
`count` = number of tracked searches without clicks; `nbHits` = results shown but unclicked.

**curl**
```bash
curl -X GET \
  "https://analytics.us.algolia.com/2/searches/noClicks?index=products&limit=50" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products", "limit": 50 }
```

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-searches-no-clicks

---

# Hits

## Top hits — `GET /2/hits`

**Purpose:** The most frequently returned (and, with flags, clicked/converting/revenue-generating) records. Pass `search` to scope to the hits returned for a specific query.

**REST:** `GET /2/hits`
**MCP tool:** `mcp__algolia__getTopHits`

**Key params**

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `index` | Yes | — | Index name |
| `search` | No | — | Restrict to hits for this query string |
| `clickAnalytics` | No | `false` | Adds click/conversion fields |
| `revenueAnalytics` | No | `false` | Adds add-to-cart/purchase/revenue fields |
| `startDate` / `endDate` | No | last 8 days | `YYYY-MM-DD` |
| `limit` | No | `10` | Max `1000` |
| `offset` | No | `0` | Min `0` |
| `tags` | No | — | URL-encoded segments |

**Response shape**
```json
{ "hits": [ { "hit": "objectID-123", "count": 412 } ] }
```
With `clickAnalytics=true`: adds `trackedHitCount`, `clickCount`, `clickThroughRate` (nullable), `conversionCount`, `conversionRate` (nullable).
With `revenueAnalytics=true`: adds `addToCartCount`, `addToCartRate`, `purchaseCount`, `purchaseRate`, `currencies` ( `{ "USD": { "currency": "USD", "revenue": 999.98 } }` ).

**curl**
```bash
curl -X GET \
  "https://analytics.us.algolia.com/2/hits?index=products&search=tshirt&clickAnalytics=true&limit=20" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products", "search": "tshirt", "clickAnalytics": true, "limit": 20 }
```

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-top-hits

---

# Filters

## Top filter attributes — `GET /2/filters`

**Purpose:** The most-used filter/facet attributes (e.g. `brand`, `color`, `price`). Returns up to the 1,000 most frequent. `search` scopes the result to filters used alongside a specific query.

**REST:** `GET /2/filters`
**MCP tool:** `mcp__algolia__getTopFilterAttributes`

**Key params**

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `index` | Yes | — | Index name |
| `search` | No | — | Scope to filters used with this query |
| `startDate` / `endDate` | No | last 8 days | `YYYY-MM-DD` |
| `limit` | No | `10` | Max `1000` |
| `offset` | No | `0` | Min `0` |
| `tags` | No | — | URL-encoded segments |

**Response shape**
```json
{ "attributes": [ { "attribute": "brand", "count": 5821 } ] }
```

**curl**
```bash
curl -X GET \
  "https://analytics.us.algolia.com/2/filters?index=products&limit=20" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products", "limit": 20 }
```

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-top-filter-attributes

---

## Top filter values for an attribute — `GET /2/filters/{attribute}`

**Purpose:** The most-used values for one filter attribute (e.g. for `brand`: Nike, Adidas …), including the comparison operator used.

**REST:** `GET /2/filters/{attribute}` (attribute name in the path, e.g. `/2/filters/brand`)
**MCP tool:** `mcp__algolia__getTopFilterForAttribute`

**Key params**

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `attribute` | Yes | — | Path segment — the attribute to inspect |
| `index` | Yes | — | Index name |
| `search` | No | — | Scope to filters used with this query |
| `startDate` / `endDate` | No | last 8 days | `YYYY-MM-DD` |
| `limit` | No | `10` | Max `1000` |
| `offset` | No | `0` | Min `0` |
| `tags` | No | — | URL-encoded segments |

**Response shape**
```json
{
  "values": [
    { "attribute": "brand", "value": "Nike", "operator": ":", "count": 1203 }
  ]
}
```
`operator` is one of `:`, `<`, `<=`, `=`, `!=`, `>`, `>=`.

**curl**
```bash
curl -X GET \
  "https://analytics.us.algolia.com/2/filters/brand?index=products&limit=20" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products", "attribute": "brand", "limit": 20 }
```

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-top-filter-for-attribute

---

## Top filters for no-results searches — `GET /2/filters/noResults`

**Purpose:** Which filter combinations are being applied on searches that return **zero hits** — pinpoints over-restrictive filtering (e.g. "size 13 + red" yields nothing).

**REST:** `GET /2/filters/noResults`
**MCP tool:** `mcp__algolia__getTopFiltersNoResults`

**Key params**

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `index` | Yes | — | Index name |
| `search` | No | — | Scope to a specific no-results query |
| `startDate` / `endDate` | No | last 8 days | `YYYY-MM-DD` |
| `limit` | No | `10` | Max `1000` |
| `offset` | No | `0` | Min `0` |
| `tags` | No | — | URL-encoded segments |

**Response shape** (note the nested `values` — each entry is a filter *combination*)
```json
{
  "values": [
    {
      "count": 88,
      "values": [
        { "attribute": "size", "operator": "=", "value": "13" },
        { "attribute": "color", "operator": "=", "value": "red" }
      ]
    }
  ]
}
```
The top-level `values` may be `null` if the term isn't actually a no-results query.

**curl**
```bash
curl -X GET \
  "https://analytics.us.algolia.com/2/filters/noResults?index=products&limit=20" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products", "limit": 20 }
```

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-top-filters-no-results

---

# Countries & Users

## Top countries — `GET /2/countries`

**Purpose:** Where searches come from, by country code. Users are distinguished by IP unless a `userToken` is supplied at search time.

**REST:** `GET /2/countries`
**MCP tool:** `mcp__algolia__getTopCountries`

**Key params:** `index` (req), `startDate`/`endDate`, `limit` (10, max 1000), `offset` (0), `tags`. No analytics flags.

**Response shape**
```json
{ "countries": [ { "country": "US", "count": 51200 } ] }
```

**curl**
```bash
curl -X GET \
  "https://analytics.us.algolia.com/2/countries?index=products&limit=20" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products", "limit": 20 }
```

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-top-countries

---

## Users count — `GET /2/users/count`

**Purpose:** Number of distinct users who searched, per day. Distinct = by IP unless a `userToken` was sent with the search.

**REST:** `GET /2/users/count`
**MCP tool:** `mcp__algolia__getUsersCount`

**Key params:** `index` (req), `startDate`/`endDate`, `tags`. No `limit`/`offset`, no analytics flags.

**Response shape**
```json
{
  "count": 18342,
  "dates": [ { "date": "2026-05-01", "count": 740 } ]
}
```

**curl**
```bash
curl -X GET \
  "https://analytics.us.algolia.com/2/users/count?index=products&startDate=2026-05-01&endDate=2026-05-31" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products", "startDate": "2026-05-01", "endDate": "2026-05-31" }
```

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-users-count

---

## Top user IDs — `GET /1/clusters/mapping/top` *(NOT an Analytics-API metric)*

**Purpose:** The IDs of users with the most **records** per cluster. This is **multi-cluster management**, not search analytics — it tells you who has the largest data footprint in a multi-cluster (MCM) setup, not who searches the most.

**Important corrections (verified):**
- This endpoint lives on the **Search API host** (`https://{appId}.algolia.net`), **not** the analytics host, and under **`/1/`**, not `/2/`.
- It takes **no** `index`, `startDate`, `endDate`, `region`, `limit`, or `tags` params. The MCP tool `mcp__algolia__getTopUserIds` accordingly accepts only `applicationId`.
- It requires an **Admin** API key and is marked **deprecated**.
- There is **no analytics "top users by search volume" endpoint** — the closest analytics signals are Top countries and Users count above.

**REST:** `GET /1/clusters/mapping/top` (Search API host)
**MCP tool:** `mcp__algolia__getTopUserIds` — param: `applicationId` only.

**Response shape**
```json
{
  "topUsers": [
    { "c1-cluster": [ { "userID": "u-123", "clusterName": "c1-cluster", "nbRecords": 5000, "dataSize": 102400 } ] }
  ]
}
```

**curl**
```bash
curl -X GET \
  "https://$ALGOLIA_APP_ID.algolia.net/1/clusters/mapping/top" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

**MCP example**
```json
{ "applicationId": "$ALGOLIA_APP_ID" }
```

**Source:** https://www.algolia.com/doc/rest-api/search/get-top-user-ids

---

# Rates

> All rate endpoints below return a top-level summary plus a per-day `dates` array. `rate` is `null` when no queries were received, and `0` when queries occurred but no matching events were sent. None of these take `clickAnalytics`/`revenueAnalytics`/`limit`/`offset` — they accept only `index` (req), `startDate`/`endDate`, and `tags`.

## No-results rate — `GET /2/searches/noResultRate`

**Purpose:** Share of searches returning zero hits = `noResultCount / count`. Pure search analytics (no Insights needed).

**REST:** `GET /2/searches/noResultRate` · **MCP tool:** `mcp__algolia__getNoResultsRate`

**Response shape**
```json
{
  "rate": 0.072, "count": 84210, "noResultCount": 6063,
  "dates": [ { "date": "2026-05-01", "rate": 0.07, "count": 2890, "noResultCount": 202 } ]
}
```

**curl**
```bash
curl -X GET "https://analytics.us.algolia.com/2/searches/noResultRate?index=products" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```
**MCP example:** `{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products" }`

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-no-results-rate

---

## No-click rate — `GET /2/searches/noClickRate`

**Purpose:** Share of **tracked** searches with no clicks = `noClickCount / count`. Requires click events (Insights).

**REST:** `GET /2/searches/noClickRate` · **MCP tool:** `mcp__algolia__getNoClickRate`

**Response shape**
```json
{
  "rate": 0.31, "count": 40000, "noClickCount": 12400,
  "dates": [ { "date": "2026-05-01", "rate": 0.30, "count": 1400, "noClickCount": 420 } ]
}
```

**curl**
```bash
curl -X GET "https://analytics.us.algolia.com/2/searches/noClickRate?index=products" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```
**MCP example:** `{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products" }`

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-no-click-rate

---

## Click-through rate — `GET /2/clicks/clickThroughRate`

**Purpose:** Share of tracked searches with ≥1 click = `clickCount / trackedSearchCount`. **Requires click events (Insights).**

**REST:** `GET /2/clicks/clickThroughRate` · **MCP tool:** `mcp__algolia__getClickThroughRate`

**Response shape**
```json
{
  "rate": 0.49, "clickCount": 19600, "trackedSearchCount": 40000,
  "dates": [ { "date": "2026-05-01", "rate": 0.48, "clickCount": 672, "trackedSearchCount": 1400 } ]
}
```
`rate` is `null` if no queries; `0` if queries but no click events.

**curl**
```bash
curl -X GET "https://analytics.us.algolia.com/2/clicks/clickThroughRate?index=products" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```
**MCP example:** `{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products" }`

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-click-through-rate

---

## Conversion rate — `GET /2/conversions/conversionRate`

**Purpose:** Share of tracked searches with ≥1 conversion = `conversionCount / trackedSearchCount`. **Requires conversion events (Insights).**

**REST:** `GET /2/conversions/conversionRate` · **MCP tool:** `mcp__algolia__getConversionRate`

**Response shape**
```json
{
  "rate": 0.05, "trackedSearchCount": 40000, "conversionCount": 2000,
  "dates": [ { "date": "2026-05-01", "rate": 0.05, "trackedSearchCount": 1400, "conversionCount": 70 } ]
}
```

**curl**
```bash
curl -X GET "https://analytics.us.algolia.com/2/conversions/conversionRate?index=products" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```
**MCP example:** `{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products" }`

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-conversion-rate

---

## Purchase rate — `GET /2/conversions/purchaseRate`

**Purpose:** Share of tracked searches leading to a purchase = `purchaseCount / trackedSearchCount`. **Requires `purchase` conversion events (Insights).**

**REST:** `GET /2/conversions/purchaseRate` · **MCP tool:** `mcp__algolia__getPurchaseRate`

**Response shape**
```json
{
  "rate": 0.02, "trackedSearchCount": 40000, "purchaseCount": 800,
  "dates": [ { "date": "2026-05-01", "rate": 0.02, "trackedSearchCount": 1400, "purchaseCount": 28 } ]
}
```

**curl**
```bash
curl -X GET "https://analytics.us.algolia.com/2/conversions/purchaseRate?index=products" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```
**MCP example:** `{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products" }`

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-purchase-rate

---

## Add-to-cart rate — `GET /2/conversions/addToCartRate`

**Purpose:** Share of tracked searches leading to an add-to-cart = `addToCartCount / trackedSearchCount`. **Requires `addToCart` conversion events (Insights).**

**REST:** `GET /2/conversions/addToCartRate` · **MCP tool:** `mcp__algolia__getAddToCartRate`

**Response shape**
```json
{
  "rate": 0.08, "trackedSearchCount": 40000, "addToCartCount": 3200,
  "dates": [ { "date": "2026-05-01", "rate": 0.08, "trackedSearchCount": 1400, "addToCartCount": 112 } ]
}
```

**curl**
```bash
curl -X GET "https://analytics.us.algolia.com/2/conversions/addToCartRate?index=products" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```
**MCP example:** `{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products" }`

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-add-to-cart-rate

---

# Click metrics

## Average click position — `GET /2/clicks/averageClickPosition`

**Purpose:** Average rank of clicked results. Lower is better (1 = top result). A high number means users scroll past top results to find what they want — a relevance signal. **Requires click events (Insights).**

**REST:** `GET /2/clicks/averageClickPosition` · **MCP tool:** `mcp__algolia__getAverageClickPosition`

**Key params:** `index` (req), `startDate`/`endDate`, `tags`.

**Response shape**
```json
{
  "average": 2.7, "clickCount": 19600,
  "dates": [ { "date": "2026-05-01", "average": 2.6, "clickCount": 672 } ]
}
```
`average` is `null` when no click events were received.

**curl**
```bash
curl -X GET "https://analytics.us.algolia.com/2/clicks/averageClickPosition?index=products" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```
**MCP example:** `{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products" }`

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-average-click-position

---

## Click positions — `GET /2/clicks/positions`

**Purpose:** Distribution of clicks across result-rank buckets. Returns exactly 12 buckets: positions 1–10 individually, then 11–20, then 21+ summed (`-1` = end of list). Shows whether clicks cluster at the top or spread down the page. **Requires click events (Insights).**

**REST:** `GET /2/clicks/positions` · **MCP tool:** `mcp__algolia__getClickPositions`

**Key params:** `index` (req), `startDate`/`endDate`, `tags`.

**Response shape**
```json
{
  "positions": [
    { "position": [1, 1], "clickCount": 24 },
    { "position": [2, 2], "clickCount": 18 },
    { "position": [21, -1], "clickCount": 5 }
  ]
}
```

**curl**
```bash
curl -X GET "https://analytics.us.algolia.com/2/clicks/positions?index=products" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```
**MCP example:** `{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products" }`

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-click-positions

---

# Revenue

## Revenue — `GET /2/conversions/revenue`

**Purpose:** Total revenue attributed to search, broken down by currency and by day. Computed from purchase conversion events (`eventSubtype: "purchase"`) as `price × quantity` per object in the event's `objectData`. **Requires revenue-bearing purchase events (Insights).**

**REST:** `GET /2/conversions/revenue` · **MCP tool:** `mcp__algolia__getRevenue`

**Key params:** `index` (req), `startDate`/`endDate`, `tags`.

**Response shape**
```json
{
  "currencies": {
    "USD": { "currency": "USD", "revenue": 152340.50 }
  },
  "dates": [
    { "date": "2026-05-01", "currencies": { "USD": { "currency": "USD", "revenue": 5120.00 } } }
  ]
}
```

**curl**
```bash
curl -X GET "https://analytics.us.algolia.com/2/conversions/revenue?index=products&startDate=2026-05-01&endDate=2026-05-31" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```
**MCP example:** `{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products", "startDate": "2026-05-01", "endDate": "2026-05-31" }`

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-revenue

---

# Status

## Analytics status — `GET /2/status`

**Purpose:** When the analytics data for an index was last updated. Analytics recompute roughly every 5 minutes; use this to know whether the numbers you're reading are fresh.

**REST:** `GET /2/status` · **MCP tool:** `mcp__algolia__getStatus`

**Key params:** `index` (req) only. **No dates, no tags, no limit.**

**Response shape**
```json
{ "updatedAt": "2026-06-09T12:49:15Z" }
```
`updatedAt` is `null` for a freshly created index with no search activity yet.

**curl**
```bash
curl -X GET "https://analytics.us.algolia.com/2/status?index=products" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```
**MCP example:** `{ "applicationId": "$ALGOLIA_APP_ID", "region": "us", "index": "products" }`

**Source:** https://www.algolia.com/doc/rest-api/analytics/get-status

---

## Coverage notes

- **21 metric endpoints documented** plus the cross-API `getTopUserIds`. Every endpoint here was verified against its individual page on `algolia.com/doc/rest-api/analytics/...`. No fields are invented; example numeric values are illustrative, the field names and shapes are from the docs.
- **Host is region-bound and verified:** `analytics.us.algolia.com` (US), `analytics.de.algolia.com` (EU/Germany), `analytics.algolia.com` (default US alias). Match it to your app's region or you get no data. The MCP tools take a `region` param instead of a host.
- **Baseline paths corrected:** the prompt's baseline listed `/2/conversions/conversionRate` and `/2/clicks/...` correctly. Additional verified paths the baseline did not list: purchase rate = `/2/conversions/purchaseRate`, add-to-cart rate = `/2/conversions/addToCartRate`, revenue = `/2/conversions/revenue`, top filters no-results = `/2/filters/noResults`, top filter value = `/2/filters/{attribute}`.
- **`getTopUserIds` is the one off-API tool.** It is NOT an analytics metric — it is Search-API multi-cluster management (`GET /1/clusters/mapping/top`, Search host, Admin key, deprecated, no index/date params). It returns top users by **record count per cluster**, not by search volume. There is no analytics endpoint for "top users by searches"; use Top countries + Users count for user-level search analytics.
- **Insights dependency (the big gotcha):** search analytics (counts, top searches, no-results, filters, countries, users) populate automatically. **Click, conversion, add-to-cart, purchase, and revenue metrics are computed only from Insights API events** (`POST /1/events`). Without that integration, CTR / conversion / ACP / click-positions / rates / revenue all sit at `null` or `0`. The `clickAnalytics=true` / `revenueAnalytics=true` flags on `/2/searches` and `/2/hits` surface those columns; the dedicated rate endpoints always expose them but stay empty until events flow.
- **`null` vs `0` distinction:** across all rate and average endpoints, `null` = no queries received (nothing to divide by), `0` = queries happened but no matching events. In an audit, widespread `0` is the fingerprint of "events not wired up."
- **Default window** is the last 8 days including today when `startDate`/`endDate` are omitted. Rate limit: 100 req/min/app. All endpoints require the `analytics` ACL (except `getTopUserIds`, which needs Admin).
- **`[UNVERIFIED]`:** none. Every path, param, and response field was confirmed against a live `algolia.com/doc` page. The two pages that initially 404'd (`get-conversation-rate` typo, `get-top-user-ids` under analytics) were resolved to their correct URLs (`get-conversion-rate`; `rest-api/search/get-top-user-ids`).
