# Operations & Security API (Monitoring, Usage, MCM, API Keys, Logs)

Operational and security-control endpoints for Algolia applications. Five areas, each on its own host with its own auth model. Read the per-section host/auth note before using any endpoint.

**Conventions used throughout**

- Credentials are never hardcoded. Use environment variables:
  - CENTRAL context: `$ALGOLIA_CENTRAL_APP_ID`, `$ALGOLIA_CENTRAL_API_KEY`
  - VISIBILITY context: `$VISIBILITY_APP_ID`, `$VISIBILITY_API_KEY`
  - Generic placeholders below: `$ALGOLIA_APP_ID`, `$ALGOLIA_API_KEY`
- Every entry documents BOTH the raw REST call and the `mcp__algolia__*` MCP tool.
- `[UNVERIFIED]` marks anything not confirmed against algolia.com/doc.

**Host map at a glance**

| Area | Host | Auth |
|------|------|------|
| Monitoring | `https://status.algolia.com` | Mixed — some endpoints public (no auth), infrastructure/metrics endpoints need a Monitoring API key (Premium/Elevate plans) |
| Usage (public stats) | `https://usage.algolia.com` | `X-Algolia-Application-Id` + `X-Algolia-API-Key` (Usage key) |
| Usage/billing metrics (MCP `retrieveMetrics*`) | `[UNVERIFIED]` — likely `https://usage.algolia.com` | `[UNVERIFIED]` |
| MCM / Clusters | `https://{appId}.algolia.net` (indexing host) | `X-Algolia-Application-Id` + Admin `X-Algolia-API-Key` |
| API Keys | `https://{appId}.algolia.net` (indexing host) | `X-Algolia-Application-Id` + Admin `X-Algolia-API-Key` |
| Logs | `https://{appId}.algolia.net` (indexing host) | `X-Algolia-Application-Id` + key with `logs` ACL |

---

## A) Monitoring API

**Host:** `https://status.algolia.com`
**Auth note:** This is the key gotcha. The status/incident/latency/reachability/indexing/inventory endpoints are **public — no authentication required** (`security: []`). Only the **infrastructure metrics** endpoint (`/1/infrastructure/...`) requires a Monitoring API key (`x-algolia-application-id` + `x-algolia-api-key`), and that endpoint is only available on Premium or Elevate plans.
**Cluster format:** cluster lists are comma-separated, e.g. `c1-de,c2-de,c3-de`.

**Source (group):** https://www.algolia.com/doc/rest-api/monitoring/

### Operations table (Monitoring)

| Purpose | REST | Auth | MCP tool |
|---------|------|------|----------|
| Overall server status of all clusters | `GET /1/status` | none | `mcp__algolia__getStatus` (see note) |
| Status of all clusters | `GET /1/status` | none | `mcp__algolia__getClustersStatus` |
| Status of specific clusters | `GET /1/status/{clusters}` | none | `mcp__algolia__getClusterStatus` |
| All incidents (all clusters) | `GET /1/incidents` | none | `mcp__algolia__getIncidents` |
| Incidents for specific clusters | `GET /1/incidents/{clusters}` | none | `mcp__algolia__getClusterIncidents` |
| List of servers / inventory | `GET /1/inventory/servers` | none | `mcp__algolia__getServers` |
| Search latency per cluster | `GET /1/latency/{clusters}` | none | `mcp__algolia__getLatency` |
| Reachability probes per cluster | `GET /1/reachability/{clusters}/probes` | none | `mcp__algolia__getReachability` |
| Indexing time per cluster | `GET /1/indexing/{clusters}` | none | `mcp__algolia__getIndexingTime` |
| Infrastructure metrics | `GET /1/infrastructure/{metric}/period/{period}` | Monitoring key | `mcp__algolia__getMetrics` |

> **Naming note (ambiguity):** the MCP tool `mcp__algolia__getStatus` does **not** map to monitoring `/1/status`. Its schema requires `applicationId`, `region`, and `index` — it is the **indexing task-status** call ("Retrieve update status" for a task on an index), on the indexing host, not the monitoring status. For "is Algolia up / cluster status," use `mcp__algolia__getClustersStatus` / `getClusterStatus`. This file documents `getStatus` under Monitoring only because it shares the word "status"; treat it as an indexing-task tool.

### getClustersStatus / getStatus (the real monitoring status)

- **Purpose:** Health status of Algolia's infrastructure clusters.
- **REST:** `GET https://status.algolia.com/1/status` (all clusters) or `GET /1/status/{clusters}` for specific ones. No auth headers.
- **MCP tool:** `mcp__algolia__getClustersStatus` (no params — all clusters) or `mcp__algolia__getClusterStatus` (param `clusters`, comma-separated).

```bash
# REST — no auth needed
curl -s "https://status.algolia.com/1/status"

# specific clusters
curl -s "https://status.algolia.com/1/status/c1-de,c2-de"
```

MCP example:

```jsonc
// mcp__algolia__getClustersStatus
{}

// mcp__algolia__getClusterStatus
{ "clusters": "c1-de,c2-de,c3-de" }
```

**Source:** https://www.algolia.com/doc/rest-api/monitoring/

### getIncidents / getClusterIncidents

- **Purpose:** Current and recent incidents affecting Algolia infrastructure.
- **REST:** `GET https://status.algolia.com/1/incidents` (all) or `GET /1/incidents/{clusters}`. No auth.
- **MCP tools:** `mcp__algolia__getIncidents` (no params); `mcp__algolia__getClusterIncidents` (param `clusters`).

```bash
curl -s "https://status.algolia.com/1/incidents"
curl -s "https://status.algolia.com/1/incidents/c1-de"
```

```jsonc
// mcp__algolia__getIncidents
{}
// mcp__algolia__getClusterIncidents
{ "clusters": "c1-de,c2-de" }
```

**Source:** https://www.algolia.com/doc/rest-api/monitoring/get-incidents/ (incidents path verified: `GET /1/incidents`, `security: []`)

### getLatency / getReachability / getIndexingTime

| Tool | REST | Param |
|------|------|-------|
| `mcp__algolia__getLatency` | `GET /1/latency/{clusters}` | `clusters` (comma-separated) |
| `mcp__algolia__getReachability` | `GET /1/reachability/{clusters}/probes` | `clusters` |
| `mcp__algolia__getIndexingTime` | `GET /1/indexing/{clusters}` | `clusters` |

```bash
curl -s "https://status.algolia.com/1/latency/c1-de,c2-de"
curl -s "https://status.algolia.com/1/reachability/c1-de,c2-de/probes"
curl -s "https://status.algolia.com/1/indexing/c1-de,c2-de"
```

```jsonc
// mcp__algolia__getLatency
{ "clusters": "c1-de,c2-de,c3-de" }
```

**Source:** https://www.algolia.com/doc/rest-api/monitoring/

### getServers (inventory)

- **Purpose:** List of servers and their cluster/region assignment.
- **REST:** `GET https://status.algolia.com/1/inventory/servers`. No auth on the monitoring inventory endpoint.
- **MCP tool:** `mcp__algolia__getServers` — param `applicationId` (the MCP wrapper scopes inventory to your app).

```bash
curl -s "https://status.algolia.com/1/inventory/servers"
```

```jsonc
// mcp__algolia__getServers
{ "applicationId": "$ALGOLIA_APP_ID" }
```

**Source:** https://www.algolia.com/doc/rest-api/monitoring/

### getMetrics (infrastructure metrics — auth required)

- **Purpose:** Time-series infrastructure metrics (CPU, RAM, SSD, build time) for your servers. **Premium/Elevate plans only.**
- **REST:** `GET https://status.algolia.com/1/infrastructure/{metric}/period/{period}`
- **Auth:** `x-algolia-application-id` + `x-algolia-api-key` (Monitoring API key).

**Key params**

| Param | Where | Allowed values |
|-------|-------|----------------|
| `metric` | path | `avg_build_time`, `ssd_usage`, `ram_search_usage`, `ram_indexing_usage`, `cpu_usage`, `*` |
| `period` | path | `minute`, `hour`, `day`, `week`, `month` |

```bash
curl -s "https://status.algolia.com/1/infrastructure/cpu_usage/period/week" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__getMetrics  (note: schema takes only metric + period)
{ "metric": "*", "period": "week" }
```

**Source:** https://www.algolia.com/doc/rest-api/monitoring/get-metrics/ (path + metric/period enums verified)

---

## B) Usage / Metrics API

There are **two distinct surfaces** here. Don't conflate them.

### B1) Public Usage statistics — VERIFIED

**Host:** `https://usage.algolia.com`
**Auth:** `X-Algolia-Application-Id` + `X-Algolia-API-Key` (use a key from the **Usage** section of the API Keys page).

| Purpose | REST |
|---------|------|
| One/more usage statistics across the whole application | `GET /1/usage/{statistic}` |
| Usage statistics for a specific index | `GET /1/usage/{statistic}/{index}` |

**Key params (query)**

| Param | Required | Notes |
|-------|----------|-------|
| `startDate` | yes | Lower bound, ISO ts e.g. `2026-01-02T00:00:00.000Z` |
| `endDate` | yes | Upper bound, ISO ts |
| `granularity` | no | `daily` (default, max 365 days) or `hourly` (max 7 days) |
| `statistic` (path) | yes | Comma-separated metric names, e.g. `records`, `queries_operations`, `max_qps` |
| `index` (path) | only for per-index variant | Index name |

```bash
curl -s -G "https://usage.algolia.com/1/usage/records,queries_operations" \
  --data-urlencode "startDate=2026-05-01T00:00:00.000Z" \
  --data-urlencode "endDate=2026-05-31T23:59:59.999Z" \
  --data-urlencode "granularity=daily" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"
```

**Source:** https://www.algolia.com/doc/rest-api/usage/

### B2) Billing metrics (the MCP `retrieveMetrics*` tools) — PATHS UNVERIFIED

These MCP tools return **billing metrics** (per-day / per-hour) and a registry of available metric names. The MCP schemas are confirmed, but I could **not** confirm their exact REST paths against algolia.com/doc — the public Usage reference (B1) does not list `retrieveMetricsDaily` / `retrieveApplicationMetricsHourly` / `retrieveMetricsRegistry` as operationIds. They are most likely served on `https://usage.algolia.com` under `/1/...`, but the exact paths are `[UNVERIFIED]`.

| Purpose | MCP tool | REST path | Status |
|---------|----------|-----------|--------|
| Billing metrics per **day** for one or more apps | `mcp__algolia__retrieveMetricsDaily` | `[UNVERIFIED]` (likely `https://usage.algolia.com/1/...`) | UNVERIFIED |
| Billing metrics per **hour** for one app | `mcp__algolia__retrieveApplicationMetricsHourly` | `[UNVERIFIED]` | UNVERIFIED |
| List of available metric names | `mcp__algolia__retrieveMetricsRegistry` | `[UNVERIFIED]` | UNVERIFIED |

**retrieveMetricsDaily — params (from MCP schema, confirmed)**

| Param | Required | Type / notes |
|-------|----------|--------------|
| `applicationId` | yes | Your Algolia app ID |
| `application` | yes | Array of app IDs (pattern `^[_a-zA-Z0-9]{1,30}$`) — supports multiple apps |
| `name` | yes | Array of metric names to retrieve |
| `startDate` | yes | `date` format (YYYY-MM-DD) |
| `endDate` | no | `date` format |

```jsonc
// mcp__algolia__retrieveMetricsDaily
{
  "applicationId": "$ALGOLIA_APP_ID",
  "application": ["$ALGOLIA_APP_ID"],
  "name": ["records", "total_search_operations"],
  "startDate": "2026-05-01",
  "endDate": "2026-05-31"
}
```

**retrieveApplicationMetricsHourly — params (confirmed):** `applicationId` (req), `application` (req, single string), `name` (req, array), `startTime` (req, date-time), `endTime` (optional, date-time).

```jsonc
// mcp__algolia__retrieveApplicationMetricsHourly
{
  "applicationId": "$ALGOLIA_APP_ID",
  "application": "$ALGOLIA_APP_ID",
  "name": ["total_search_operations"],
  "startTime": "2026-06-08T00:00:00Z",
  "endTime": "2026-06-09T00:00:00Z"
}
```

**retrieveMetricsRegistry — params (confirmed):** `applicationId` (req), `application` (req, array).

```jsonc
// mcp__algolia__retrieveMetricsRegistry
{ "applicationId": "$ALGOLIA_APP_ID", "application": ["$ALGOLIA_APP_ID"] }
```

### getApplications (account-level)

- **Purpose:** Paginated list of Algolia applications for the current user/account.
- **REST:** `[UNVERIFIED]` (account/dashboard API, not in the public Usage reference).
- **MCP tool:** `mcp__algolia__getApplications` — no params.

```jsonc
// mcp__algolia__getApplications
{}
```

**Source (B1 verified):** https://www.algolia.com/doc/rest-api/usage/ | B2 + getApplications REST paths `[UNVERIFIED]`.

---

## C) Multi-Cluster Management (MCM) / Clusters

**Host:** `https://{appId}.algolia.net` (the standard search/indexing host; retry variants `-1/-2/-3.algolianet.com` and `-dsn`).
**Auth:** `X-Algolia-Application-Id` + **Admin** `X-Algolia-API-Key`.
**Special header:** assign/move and batch-assign require `X-Algolia-User-ID` (the user being mapped).
**userID pattern:** `^[a-zA-Z0-9 \-*.]+$`.

### Operations table (MCM)

| Purpose | REST | MCP tool |
|---------|------|----------|
| List clusters in the app | `GET /1/clusters` | `mcp__algolia__listClusters` |
| Assign / move one userID to a cluster | `POST /1/clusters/mapping` | `mcp__algolia__assignUserId` |
| Assign many userIDs to a cluster | `POST /1/clusters/mapping/batch` | `mcp__algolia__batchAssignUserIds` |
| Get the cluster a userID is on | `GET /1/clusters/mapping/{userID}` | `mcp__algolia__getUserId` |
| Remove a userID mapping | `DELETE /1/clusters/mapping/{userID}` | `mcp__algolia__removeUserId` |
| List all userIDs (paginated) | `GET /1/clusters/mapping` | `mcp__algolia__listUserIds` |
| Search userIDs | `POST /1/clusters/mapping/search` | `mcp__algolia__searchUserIds` |
| Top userIDs (largest) per cluster | `GET /1/clusters/mapping/top` | `mcp__algolia__getTopUserIds` |
| Pending mapping/migration status | `GET /1/clusters/mapping/pending` | `mcp__algolia__hasPendingMappings` |

### assignUserId (detailed)

- **Purpose:** Assign or move a single userID to a specific cluster (multi-cluster sharding of users).
- **REST:** `POST https://{appId}.algolia.net/1/clusters/mapping`
- **Auth:** Admin key + `X-Algolia-User-ID` header.

**Key params**

| Param | Where | Notes |
|-------|-------|-------|
| `X-Algolia-User-ID` | header | userID to assign (required) |
| `cluster` | body | Target cluster name, e.g. `c11-test` (required) |

```bash
curl -s -X POST "https://$ALGOLIA_APP_ID.algolia.net/1/clusters/mapping" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "X-Algolia-User-ID: user42" \
  -H "Content-Type: application/json" \
  -d '{"cluster":"c11-test"}'
```

```jsonc
// mcp__algolia__assignUserId
{
  "applicationId": "$ALGOLIA_APP_ID",
  "X-Algolia-User-ID": "user42",
  "requestBody": { "cluster": "c11-test" }
}
```

Response (200): `{"createdAt":"2026-06-09T12:49:15Z"}`

**Source:** https://www.algolia.com/doc/rest-api/search/assign-user-id/ (method/path/host/header/body verified)

### batchAssignUserIds

- **REST:** `POST /1/clusters/mapping/batch` — body `{ "cluster": "...", "users": ["...", ...] }`, plus `X-Algolia-User-ID` header.

```jsonc
// mcp__algolia__batchAssignUserIds
{
  "applicationId": "$ALGOLIA_APP_ID",
  "X-Algolia-User-ID": "admin-actor",
  "requestBody": { "cluster": "c11-test", "users": ["einstein", "bohr", "feynman"] }
}
```

### getUserId / removeUserId

```bash
curl -s "https://$ALGOLIA_APP_ID.algolia.net/1/clusters/mapping/user42" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"

curl -s -X DELETE "https://$ALGOLIA_APP_ID.algolia.net/1/clusters/mapping/user42" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "X-Algolia-User-ID: user42"
```

```jsonc
// mcp__algolia__getUserId
{ "applicationId": "$ALGOLIA_APP_ID", "userID": "user42" }
// mcp__algolia__removeUserId
{ "applicationId": "$ALGOLIA_APP_ID", "userID": "user42" }
```

### listUserIds / searchUserIds / getTopUserIds / hasPendingMappings / listClusters

```jsonc
// mcp__algolia__listClusters
{ "applicationId": "$ALGOLIA_APP_ID" }

// mcp__algolia__listUserIds   (page, hitsPerPage default 100)
{ "applicationId": "$ALGOLIA_APP_ID", "page": 0, "hitsPerPage": 100 }

// mcp__algolia__searchUserIds  (POST /1/clusters/mapping/search)
{
  "applicationId": "$ALGOLIA_APP_ID",
  "requestBody": { "query": "user", "clusterName": "c11-test", "page": 0, "hitsPerPage": 20 }
}

// mcp__algolia__getTopUserIds
{ "applicationId": "$ALGOLIA_APP_ID" }

// mcp__algolia__hasPendingMappings   (getClusters=true also returns cluster list)
{ "applicationId": "$ALGOLIA_APP_ID", "getClusters": true }
```

**Source (MCM group):** https://www.algolia.com/doc/rest-api/search/ (Clusters / Multi-cluster operations); assign endpoint verified at the assign-user-id page above. Sibling MCM paths (`/batch`, `/{userID}`, `/search`, `/top`, `/pending`, `GET /1/clusters`) match the documented MCM scheme and the MCP schemas; the individual sub-pages were not separately opened — treat the exact sub-paths as documented-consistent.

---

## D) API Keys / Security

**Host:** `https://{appId}.algolia.net` (search/indexing host).
**Auth:** `X-Algolia-Application-Id` + **Admin** `X-Algolia-API-Key`. Managing keys requires the Admin key — you cannot create/edit keys with a search-only key.

### Operations table (API Keys)

| Purpose | REST | MCP tool |
|---------|------|----------|
| Create a key | `POST /1/keys` | `mcp__algolia__addApiKey` |
| Get a key's permissions | `GET /1/keys/{key}` | `mcp__algolia__getApiKey` |
| Update a key | `PUT /1/keys/{key}` | `mcp__algolia__updateApiKey` |
| Delete a key | `DELETE /1/keys/{key}` | `mcp__algolia__deleteApiKey` |
| Restore a deleted key | `POST /1/keys/{key}/restore` | `mcp__algolia__restoreApiKey` |
| List all keys | `GET /1/keys` | `mcp__algolia__listApiKeys` |

### ACL list (the `acl` array values)

Permissions that determine what a key can do. The required ACL is listed per endpoint in Algolia's reference.

| ACL | Grants |
|-----|--------|
| `search` | Run search queries |
| `browse` | Browse the entire index (retrieve all records, bypassing pagination limits) |
| `addObject` | Add or update records (also covers partial updates / save) |
| `deleteObject` | Delete individual records |
| `deleteIndex` | Delete a whole index |
| `settings` | Read index settings |
| `editSettings` | Modify index settings (and synonyms/rules config) |
| `analytics` | Access the Analytics API |
| `recommendation` | Access Recommend (Recommendation) API |
| `usage` | Access the Usage API |
| `logs` | Read the API logs (`GET /1/logs`) |
| `seeUnretrievableAttributes` | Retrieve `unretrievableAttributes` for all operations |
| `listIndexes` | List the indices in the application |
| `personalization` | Access the Personalization API |
| `inference` | Access inference (AI) features |

> The MCP `addApiKey`/`updateApiKey` schema enumerates exactly these ACL values: `addObject, analytics, browse, deleteObject, deleteIndex, editSettings, inference, listIndexes, logs, personalization, recommendation, search, seeUnretrievableAttributes, settings, usage`.

### Key restriction parameters

| Param | Type | Meaning |
|-------|------|---------|
| `acl` | array (required) | Permissions, from the ACL table above |
| `description` | string | Human label to identify the key |
| `indexes` | array | Index names/patterns the key can access (wildcards: `dev_*`, `*_dev`, `*_products_*`). Default: all indices |
| `referers` | array | Allowed HTTP referrers (wildcards). Spoofable — not a real security boundary |
| `validity` | integer (seconds) | Key expires after this many seconds. `0`/unset = never expires |
| `maxQueriesPerIPPerHour` | integer | Rate cap per IP / user token per hour; over limit returns `429`. `0` = no limit |
| `maxHitsPerQuery` | integer | Max results returnable in one query. `0` = no limit |
| `queryParameters` | string | URL-encoded query params forced on every request with this key (e.g. `typoTolerance=strict&restrictSources=192.168.1.0/24`). `restrictSources` here pins the key to an IP/CIDR range |

### addApiKey (detailed)

- **REST:** `POST https://{appId}.algolia.net/1/keys`, Admin key.

```bash
curl -s -X POST "https://$ALGOLIA_APP_ID.algolia.net/1/keys" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "acl": ["search","browse"],
        "description": "Frontend search key — prod catalog",
        "indexes": ["prod_en_products"],
        "referers": ["*algolia.com*"],
        "validity": 86400,
        "maxQueriesPerIPPerHour": 10000,
        "maxHitsPerQuery": 50,
        "queryParameters": "typoTolerance=strict"
      }'
```

```jsonc
// mcp__algolia__addApiKey
{
  "applicationId": "$ALGOLIA_APP_ID",
  "requestBody": {
    "acl": ["search", "browse"],
    "description": "Frontend search key — prod catalog",
    "indexes": ["prod_en_products"],
    "referers": ["*algolia.com*"],
    "validity": 86400,
    "maxQueriesPerIPPerHour": 10000,
    "maxHitsPerQuery": 50,
    "queryParameters": "typoTolerance=strict"
  }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/add-api-key/ (method/path/host/body params verified)

### updateApiKey (detailed)

- **REST:** `PUT https://{appId}.algolia.net/1/keys/{key}` — same body shape as create.

```bash
curl -s -X PUT "https://$ALGOLIA_APP_ID.algolia.net/1/keys/THE_KEY_VALUE" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"acl":["search"],"maxHitsPerQuery":20}'
```

```jsonc
// mcp__algolia__updateApiKey
{
  "applicationId": "$ALGOLIA_APP_ID",
  "key": "THE_KEY_VALUE",
  "requestBody": { "acl": ["search"], "maxHitsPerQuery": 20 }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/ (Keys); body params mirror addApiKey (MCP schema confirmed).

### getApiKey / deleteApiKey / restoreApiKey / listApiKeys

```bash
curl -s "https://$ALGOLIA_APP_ID.algolia.net/1/keys/THE_KEY_VALUE" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"

curl -s -X DELETE "https://$ALGOLIA_APP_ID.algolia.net/1/keys/THE_KEY_VALUE" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"

curl -s -X POST "https://$ALGOLIA_APP_ID.algolia.net/1/keys/THE_KEY_VALUE/restore" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"

curl -s "https://$ALGOLIA_APP_ID.algolia.net/1/keys" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__getApiKey
{ "applicationId": "$ALGOLIA_APP_ID", "key": "THE_KEY_VALUE" }
// mcp__algolia__deleteApiKey
{ "applicationId": "$ALGOLIA_APP_ID", "key": "THE_KEY_VALUE" }
// mcp__algolia__restoreApiKey
{ "applicationId": "$ALGOLIA_APP_ID", "key": "THE_KEY_VALUE" }
// mcp__algolia__listApiKeys
{ "applicationId": "$ALGOLIA_APP_ID" }
```

### Secured API Keys (concept)

A **secured API key** is **not** created through the REST API — it is **generated client-side / server-side from an existing search-only API key** by hashing it with a set of query-time restrictions. There is **no MCP tool and no `/1/keys` endpoint** for this; the official Algolia API clients expose a local helper (e.g. `generateSecuredApiKey(parentKey, restrictions)`).

How it works:

- You take a **search API key** as the parent and attach restrictions: `validUntil` (unix expiry), `restrictIndices`, `restrictSources` (IP/CIDR), `userToken`, `filters`, etc.
- The client computes an HMAC-SHA256 of the restrictions using the parent key as the secret, then base64-encodes `{hmac}{urlEncodedRestrictions}`. The result is the secured key.
- It is generated **without any network call** — purely local crypto. Algolia validates the HMAC server-side at query time.
- Primary use case: **per-user filtering / multi-tenancy** — e.g. embed `filters=user_id:42` and a short `validUntil` so a browser client can only ever see its own data, and the key auto-expires.
- The embedded `filters` cannot be overridden by the client; `restrictIndices`/`restrictSources` further lock it down.

**Source:** https://www.algolia.com/doc/guides/security/api-keys/ (ACL list + secured key concept). `validUntil`, `restrictIndices`, `restrictSources` semantics per the same security guide.

---

## E) Logs

**Host:** `https://{appId}.algolia.net` (search/indexing host).
**Auth:** `X-Algolia-Application-Id` + key with the `logs` ACL.

- **Purpose:** Retrieve recent API log entries (queries, builds, errors) for debugging and audit. Most recent entries first.
- **REST:** `GET https://{appId}.algolia.net/1/logs`
- **MCP tool:** `mcp__algolia__getLogs`

**Key params (query)**

| Param | Default | Max | Notes |
|-------|---------|-----|-------|
| `offset` | 0 | — | First entry to retrieve (most recent first) |
| `length` | 10 | 1000 | Max entries to return |
| `indexName` | all | — | Restrict to one index (nullable) |
| `type` | `all` | — | One of `all`, `query`, `build`, `error` |

```bash
curl -s -G "https://$ALGOLIA_APP_ID.algolia.net/1/logs" \
  --data-urlencode "offset=0" \
  --data-urlencode "length=100" \
  --data-urlencode "type=error" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"
```

```jsonc
// mcp__algolia__getLogs
{
  "applicationId": "$ALGOLIA_APP_ID",
  "offset": 0,
  "length": 100,
  "type": "error",
  "indexName": null
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/get-logs/ (method/path/auth/ACL `logs`/params all verified)

---

## Coverage notes

- **Operations documented:** ~36 across the five areas — Monitoring 10 (`getStatus`*, `getClustersStatus`, `getClusterStatus`, `getIncidents`, `getClusterIncidents`, `getServers`, `getLatency`, `getReachability`, `getIndexingTime`, `getMetrics`), Usage/Metrics 6 (public `GET /1/usage/{statistic}` + per-index, `retrieveMetricsDaily`, `retrieveApplicationMetricsHourly`, `retrieveMetricsRegistry`, `getApplications`), MCM 9, API Keys 6 + secured-key concept, Logs 1.
- **VERIFIED against algolia.com/doc:** Monitoring host + `/1/incidents` (public, no auth) + `/1/infrastructure/{metric}/period/{period}` (metric & period enums); Usage host `https://usage.algolia.com` + `/1/usage/{statistic}` and `/1/usage/{statistic}/{index}`; API Keys `POST /1/keys` body params; Logs `GET /1/logs` params + `logs` ACL; MCM `POST /1/clusters/mapping` with `X-Algolia-User-ID` + `cluster` body; ACL list + secured-key concept from the security guide.
- **UNVERIFIED items (4):** (1) exact REST paths for `retrieveMetricsDaily`, (2) `retrieveApplicationMetricsHourly`, (3) `retrieveMetricsRegistry` — the public Usage reference doesn't list these operationIds, though params are confirmed from MCP schemas and the host is almost certainly `usage.algolia.com`; (4) REST path for `getApplications` (account/dashboard API). MCM sibling sub-paths (`/batch`, `/{userID}`, `/search`, `/top`, `/pending`, `GET /1/clusters`) are documented-consistent and schema-confirmed but their individual reference pages were not separately opened.
- **`getStatus` naming gotcha:** `mcp__algolia__getStatus` (params `applicationId`/`region`/`index`) is an **indexing task-status** call, NOT monitoring `/1/status`. For infra status use `getClustersStatus`/`getClusterStatus`.
- **Auth model differs per area** — Monitoring's status/incidents/latency/reachability/indexing/inventory are **public (no key)**; only Monitoring infrastructure metrics, plus all of Usage/MCM/Keys/Logs, require keys. Key management needs the **Admin** key. Logs needs the `logs` ACL.
- **No real credentials anywhere** — only `$ALGOLIA_APP_ID` / `$ALGOLIA_API_KEY` (and CENTRAL/VISIBILITY env vars).
