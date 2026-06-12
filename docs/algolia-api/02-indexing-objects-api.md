# Indexing & Objects API — Algolia API Reference

Writing and managing records and indices: add / replace / partial-update records, batch
operations, deletes, index lifecycle (copy / move / list / delete), and the async task model
that ties it all together.

This file documents **two equivalent ways** to call every operation:

1. **Raw REST** — `METHOD /path` against the Algolia write host, with auth headers and a `curl` example.
2. **MCP tool** — the `mcp__algolia__*` tool, its parameter object, and an example call.

---

## Base hosts & authentication

| Concern | Value |
|---|---|
| **Write/indexing host** | `https://$ALGOLIA_APP_ID.algolia.net` |
| **DSN read host** | `https://$ALGOLIA_APP_ID-dsn.algolia.net` |
| **Retry fallback hosts** | `https://$ALGOLIA_APP_ID-1.algolianet.com`, `-2`, `-3` |
| **API version prefix** | `/1/` in every path |
| **App ID header** | `X-Algolia-Application-Id: $ALGOLIA_APP_ID` |
| **API key header** | `X-Algolia-API-Key: $ALGOLIA_API_KEY` |

> Header casing is not significant; the official docs render them lowercase
> (`x-algolia-application-id`, `x-algolia-api-key`). Both forms are accepted.

**Two credential contexts live in `.env.local`** (never hardcode keys — always reference the env vars):

- **CENTRAL** → `ALGOLIA_CENTRAL_APP_ID`, `ALGOLIA_CENTRAL_API_KEY`
- **VISIBILITY** → `VISIBILITY_APP_ID`, `VISIBILITY_API_KEY`

In the examples below, `$ALGOLIA_APP_ID` / `$ALGOLIA_API_KEY` stand for whichever context applies.
For MCP tools, the context is selected via the `applicationId` parameter.

**Source (base hosts + auth):** https://www.algolia.com/doc/rest-api/search/

---

## Writing records

### saveObject — add a record (auto-generated objectID)

**Purpose:** Add a brand-new record and let Algolia generate its `objectID`. Use when you do not
control / care about the record's ID.

**REST:** `POST /1/indexes/{indexName}` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `addObject`

**MCP tool:** `mcp__algolia__saveObject`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only; selects credential context) |
| `indexName` | string | yes | — | Target index (case-sensitive) |
| `requestBody` | object | yes | — | The record. Schemaless object of search/discovery attributes |

**curl example:**

```bash
curl -X POST "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Black T-shirt", "color": "#000000" }'
```

**Response (201 Created):**

```json
{ "createdAt": "2023-07-04T12:49:15Z", "taskID": 1514562690001, "objectID": "test-record-123" }
```

**MCP call example:**

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "requestBody": { "name": "Black T-shirt", "color": "#000000" }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/save-object

---

### addOrUpdateObject — add or replace a record (with objectID)

**Purpose:** Create the record if it doesn't exist, or **fully replace** it if it does. This is a full
overwrite — any attribute not present in the body is removed from the record.

**REST:** `PUT /1/indexes/{indexName}/{objectID}` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `addObject`

**MCP tool:** `mcp__algolia__addOrUpdateObject`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Target index |
| `objectID` | string | yes | — | Unique record identifier (path param) |
| `requestBody` | object | yes | — | Full record. Replaces the existing record entirely |

**curl example:**

```bash
curl -X PUT "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/blackTShirt" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "objectID": "blackTShirt", "name": "Black T-shirt", "color": "#000000" }'
```

**Response (200 OK):**

```json
{ "objectID": "blackTShirt", "taskID": 1514562690001, "updatedAt": "2023-07-04T12:49:15Z" }
```

**MCP call example:**

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "objectID": "blackTShirt",
  "requestBody": { "objectID": "blackTShirt", "name": "Black T-shirt", "color": "#000000" }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/add-or-update-object

---

### partialUpdateObject — add or update attributes

**Purpose:** Update **only the attributes you name**, leaving the rest of the record untouched.
Opposite of `addOrUpdateObject` (which replaces the whole record). Supports built-in operations on
attributes (e.g. `Increment`, `Decrement`, `Add`, `Remove`, `AddUnique`, `IncrementFrom`, `IncrementSet`).

**REST:** `POST /1/indexes/{indexName}/{objectID}/partial` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `addObject`
Query param: `createIfNotExists` (boolean, default `true`) — if `false`, the call is a no-op when the record doesn't exist.

**MCP tool:** `mcp__algolia__partialUpdateObject`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Target index |
| `objectID` | string | yes | — | Record to update (path param) |
| `requestBody` | object | yes | — | Attributes to update (only these change) |
| `createIfNotExists` | boolean | no | `true` | Create the record if it doesn't exist; `false` = update-only |

**curl example:**

```bash
curl -X POST "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/blackTShirt/partial?createIfNotExists=true" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "price": 29, "stock": { "_operation": "Increment", "value": 10 } }'
```

**Response (200 OK):**

```json
{ "objectID": "blackTShirt", "taskID": 1514562690001, "updatedAt": "2023-07-04T12:49:15Z" }
```

**MCP call example:**

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "objectID": "blackTShirt",
  "createIfNotExists": true,
  "requestBody": { "price": 29 }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/add-or-update-object (related: https://www.algolia.com/doc/api-reference/api-methods/partial-update-objects/)

---

## Batch operations

### batch — multiple operations on ONE index

**Purpose:** Add, update, partially-update, or delete many records in a single index in one request.
This is the workhorse for bulk indexing — far faster than per-record calls.

**REST:** `POST /1/indexes/{indexName}/batch` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `addObject`

**MCP tool:** `mcp__algolia__batch`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Target index |
| `requestBody.requests` | array | yes | — | List of `{ action, body }` operations |
| `requests[].action` | enum | yes | — | One of the action types below |
| `requests[].body` | object | yes | — | Operation arguments (shape depends on `action`) |

**Action types** (same set for `batch` and `multipleBatch`):

| Action | Effect |
|---|---|
| `addObject` | Add a record (auto objectID if none given) |
| `updateObject` | Add or fully replace a record (objectID required) |
| `partialUpdateObject` | Update named attributes; **creates** record if missing |
| `partialUpdateObjectNoCreate` | Update named attributes; **does not** create if missing |
| `deleteObject` | Delete a record by objectID |
| `delete` | Delete the entire index |
| `clear` | Delete all records from the index |

**curl example:**

```bash
curl -X POST "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/batch" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      { "action": "addObject", "body": { "name": "Betty Jane McCamey", "company": "Vita Foods Inc." } },
      { "action": "updateObject", "body": { "objectID": "p2", "name": "Gayla Geimer" } },
      { "action": "deleteObject", "body": { "objectID": "p3" } }
    ]
  }'
```

**Response (200 OK):**

```json
{ "taskID": 1514562690001, "objectIDs": ["p1", "p2", "p3"] }
```

**MCP call example:**

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "requestBody": {
    "requests": [
      { "action": "addObject", "body": { "name": "Betty Jane McCamey" } },
      { "action": "deleteObject", "body": { "objectID": "p3" } }
    ]
  }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/multiple-batch (action set), https://www.algolia.com/doc/api-reference/api-methods/batch/

---

### multipleBatch — operations across MULTIPLE indices

**Purpose:** Same as `batch`, but each operation names its own `indexName`, so one request can touch
many indices at once.

**REST:** `POST /1/indexes/*/batch` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `addObject`

**MCP tool:** `mcp__algolia__multipleBatch`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `requestBody.requests` | array | yes | — | List of `{ action, indexName, body }` operations |
| `requests[].action` | enum | yes | — | Same action set as `batch` (see table above) |
| `requests[].indexName` | string | yes | — | Index this operation applies to |
| `requests[].body` | object | no | — | Operation arguments (varies with `action`) |

**curl example:**

```bash
curl -X POST "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/*/batch" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      { "action": "addObject", "indexName": "products", "body": { "name": "Shirt" } },
      { "action": "addObject", "indexName": "categories", "body": { "name": "Apparel" } }
    ]
  }'
```

**Response (200 OK)** — note `taskID` is an object keyed by index name:

```json
{ "taskID": { "products": 1514562690001, "categories": 1514562690002 }, "objectIDs": ["..."] }
```

**MCP call example:**

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "requestBody": {
    "requests": [
      { "action": "addObject", "indexName": "products", "body": { "name": "Shirt" } },
      { "action": "addObject", "indexName": "categories", "body": { "name": "Apparel" } }
    ]
  }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/multiple-batch

---

## Deleting records

### deleteObject — delete one record

**Purpose:** Delete a single record by its `objectID`.

**REST:** `DELETE /1/indexes/{indexName}/{objectID}` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `deleteObject`

**MCP tool:** `mcp__algolia__deleteObject`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Target index |
| `objectID` | string | yes | — | Record to delete (path param) |

**curl example:**

```bash
curl -X DELETE "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/blackTShirt" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"
```

**Response (200 OK):**

```json
{ "taskID": 1514562690001, "deletedAt": "2023-06-27T14:42:38.831Z" }
```

**MCP call example:**

```json
{ "applicationId": "$ALGOLIA_APP_ID", "indexName": "products", "objectID": "blackTShirt" }
```

**Source:** https://www.algolia.com/doc/rest-api/search/delete-object

---

### deleteBy — delete records matching a filter

**Purpose:** Delete every record that matches a filter expression. Useful for bulk cleanup without
listing objectIDs. **Cannot be empty** (no "delete everything" via empty filters — use `clearObjects` for that).

> Resource-intensive. Algolia recommends `browse`-ing to collect objectIDs, then `batch`-deleting,
> when the matched set is large.

**REST:** `POST /1/indexes/{indexName}/deleteByQuery` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `deleteIndex`

**MCP tool:** `mcp__algolia__deleteBy`

**Key parameters** (at least one filter required):

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Target index |
| `requestBody.filters` | string | no* | — | Filter expression (`AND`/`OR`/`NOT`, ranges, facet/tag filters) |
| `requestBody.facetFilters` | array/string | no* | — | Facet-value filters |
| `requestBody.numericFilters` | array/string | no* | — | Numeric comparisons / ranges |
| `requestBody.tagFilters` | array/string | no* | — | `_tags` filters |
| `requestBody.aroundLatLng` | string | no | `""` | Center point for geo filtering (`"lat,lng"`) |
| `requestBody.aroundRadius` | int \| `"all"` | no | — | Geo radius in meters, or `"all"` |
| `requestBody.insideBoundingBox` | array | no | — | Rectangular geo area |
| `requestBody.insidePolygon` | array | no | — | Polygon geo area |

\* At least one filter must be provided — empty filters are rejected.

**curl example:**

```bash
curl -X POST "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/deleteByQuery" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "filters": "category:discontinued AND price < 5" }'
```

**Response (200 OK):**

```json
{ "taskID": 1514562690001, "updatedAt": "2023-07-04T12:49:15Z" }
```

**MCP call example:**

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "requestBody": { "filters": "category:discontinued AND price < 5" }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/delete-by

---

### clearObjects — delete ALL records (keep settings)

**Purpose:** Empty an index of all records while preserving its settings, synonyms, and rules.

**REST:** `POST /1/indexes/{indexName}/clear` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `deleteIndex`. No request body.

**MCP tool:** `mcp__algolia__clearObjects`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Index to empty |

**curl example:**

```bash
curl -X POST "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products/clear" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"
```

**Response (200 OK):**

```json
{ "taskID": 1514562690001, "updatedAt": "2023-07-04T12:49:15Z" }
```

**MCP call example:**

```json
{ "applicationId": "$ALGOLIA_APP_ID", "indexName": "products" }
```

**Source:** https://www.algolia.com/doc/rest-api/search/clear-objects

---

## Reading records

### getObject — retrieve one record

**Purpose:** Fetch a single record by `objectID`, optionally limiting which attributes come back.

**REST:** `GET /1/indexes/{indexName}/{objectID}` (host `https://$ALGOLIA_APP_ID-dsn.algolia.net` for reads)
ACL required: `search`
Optional query param: `attributesToRetrieve` (comma-separated list).

**MCP tool:** `mcp__algolia__getObject`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Source index |
| `objectID` | string | yes | — | Record to fetch (path param) |
| `attributesToRetrieve` | string[] | no | all retrievable | Limit returned attributes |

> Attributes listed in `unretrievableAttributes` only come back when the request is authenticated with admin credentials.

**curl example:**

```bash
curl "https://$ALGOLIA_APP_ID-dsn.algolia.net/1/indexes/products/blackTShirt?attributesToRetrieve=name,price" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"
```

**Response (200 OK):** the record object (always includes `objectID`):

```json
{ "objectID": "blackTShirt", "name": "Black T-shirt", "price": 29 }
```

**MCP call example:**

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "objectID": "blackTShirt",
  "attributesToRetrieve": ["name", "price"]
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/get-object

---

### getObjects — retrieve many records (cross-index)

**Purpose:** Fetch multiple records in one round-trip; each request line can target a different index.

**REST:** `POST /1/indexes/*/objects` (host `https://$ALGOLIA_APP_ID-dsn.algolia.net`)
ACL required: `search`

**MCP tool:** `mcp__algolia__getObjects`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `requestBody.requests` | array | yes | — | List of records to fetch |
| `requests[].objectID` | string | yes | — | Record ID |
| `requests[].indexName` | string | yes | — | Index to fetch from |
| `requests[].attributesToRetrieve` | string[] | no | all retrievable | Limit returned attributes |

**curl example:**

```bash
curl -X POST "https://$ALGOLIA_APP_ID-dsn.algolia.net/1/indexes/*/objects" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      { "indexName": "products", "objectID": "blackTShirt" },
      { "indexName": "categories", "objectID": "apparel", "attributesToRetrieve": ["name"] }
    ]
  }'
```

**Response (200 OK):** results in the same order as requests (missing records appear as `null`):

```json
{ "results": [ { "objectID": "blackTShirt", "name": "Black T-shirt" }, { "objectID": "apparel", "name": "Apparel" } ] }
```

**MCP call example:**

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "requestBody": {
    "requests": [
      { "indexName": "products", "objectID": "blackTShirt" },
      { "indexName": "categories", "objectID": "apparel", "attributesToRetrieve": ["name"] }
    ]
  }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/get-objects

---

## Index management

### operationIndex — copy or move an index

**Purpose:** Copy or rename (move) an index. **Move** = rename, overwriting the destination.
**Copy** = duplicate records + settings + synonyms + rules into the destination (or a subset via `scope`).

**REST:** `POST /1/indexes/{indexName}/operation` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `addObject`

**MCP tool:** `mcp__algolia__operationIndex`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | **Source** index (path param) |
| `requestBody.operation` | enum | yes | — | `"move"` or `"copy"` |
| `requestBody.destination` | string | yes | — | Target index name |
| `requestBody.scope` | string[] | no | all | **Copy only.** Any of `settings`, `synonyms`, `rules`. Omit = copy everything (records + all three) |

**Behavior notes:**
- **Copy** creates or overwrites the destination and merges API keys; it **cannot** copy `enableReRanking`, `mode`, or `replicas`. If `scope` is set, only those scopes are copied — records stay unchanged.
- **Move** renames the index; ignored if the source doesn't exist. Analytics under the old name are retained; new analytics start under the new name.

**curl example (move):**

```bash
curl -X POST "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products_tmp/operation" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "operation": "move", "destination": "products" }'
```

**Response (200 OK):**

```json
{ "taskID": 1514562690001, "updatedAt": "2023-07-04T12:49:15Z" }
```

**MCP call example (copy, settings only):**

```json
{
  "applicationId": "$ALGOLIA_APP_ID",
  "indexName": "products",
  "requestBody": { "operation": "copy", "destination": "products_staging", "scope": ["settings"] }
}
```

**Source:** https://www.algolia.com/doc/rest-api/search/operation-index

---

### listIndices — list all indices

**Purpose:** List every index in the application, with metadata (size, entry count, pending tasks, replica links).

**REST:** `GET /1/indexes` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `listIndexes`
Query params: `page` (int ≥ 0, or `null` for non-paginated), `hitsPerPage` (int, default 100).

**MCP tool:** `mcp__algolia__listIndices`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `page` | integer | no | — | Page of the response; `null`/omit = not paginated |
| `hitsPerPage` | integer | no | `100` | Indices per page |

**curl example:**

```bash
curl "https://$ALGOLIA_APP_ID.algolia.net/1/indexes?hitsPerPage=100" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"
```

**Response (200 OK):**

```json
{
  "items": [
    {
      "name": "products",
      "createdAt": "2022-09-19T16:36:44.471Z",
      "updatedAt": "2023-07-04T12:49:15Z",
      "entries": 100,
      "dataSize": 48450,
      "fileSize": 112927,
      "lastBuildTimeS": 3,
      "numberOfPendingTasks": 0,
      "pendingTask": false,
      "primary": "products",
      "replicas": ["products_price_asc"]
    }
  ],
  "nbPages": 100
}
```

> `pendingTask` / `numberOfPendingTasks` tell you whether the index still has indexing work queued —
> handy as a coarse "is everything applied?" check (see Async tasks below for the precise method).

**MCP call example:**

```json
{ "applicationId": "$ALGOLIA_APP_ID", "hitsPerPage": 100, "page": 0 }
```

**Source:** https://www.algolia.com/doc/rest-api/search/list-indices

---

### deleteIndex — delete an index

**Purpose:** Permanently delete an index (records + settings + synonyms + rules). Analytics data is preserved.

**REST:** `DELETE /1/indexes/{indexName}` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `deleteIndex`

**MCP tool:** `mcp__algolia__deleteIndex`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Index to delete |

**Behavior notes:** Deleting a non-existent index is silently ignored. Deleting a primary makes its
replicas independent. Replicas must be unlinked before they can be deleted.

**curl example:**

```bash
curl -X DELETE "https://$ALGOLIA_APP_ID.algolia.net/1/indexes/products_tmp" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"
```

**Response (200 OK):**

```json
{ "taskID": 1514562690001, "deletedAt": "2023-06-27T14:42:38.831Z" }
```

**MCP call example:**

```json
{ "applicationId": "$ALGOLIA_APP_ID", "indexName": "products_tmp" }
```

**Source:** https://www.algolia.com/doc/rest-api/search/delete-index

---

## Async tasks & waiting

**The core fact:** Every write operation (save, update, delete, batch, clear, copy/move, delete-index)
returns a **`taskID`** and a success status that means *"the task was accepted into a queue"* — **not**
that the change is live yet. Indexing is asynchronous. To know a change has actually applied (e.g.
before reading it back or running a dependent step), you **poll the task** until its status is `published`.

This is the "waitTask" pattern that Algolia's official SDKs implement under the hood.

### getTask — index-level task status

**Purpose:** Check whether an index-scoped task (save/update/delete/batch/clear/operation/delete-index)
has finished.

**REST:** `GET /1/indexes/{indexName}/task/{taskID}` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `addObject`

**MCP tool:** `mcp__algolia__getTask`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `indexName` | string | yes | — | Index the task belongs to |
| `taskID` | integer (int64) | yes | — | Task ID returned by the write operation |

**Response (200 OK):**

```json
{ "status": "published" }
```

`status` is one of `published` (done — change is live) or `notPublished` (still processing).

**waitTask polling loop (pseudocode):**

```
resp = POST .../batch            # returns { taskID }
do {
  sleep(retryDelayMs)            # SDKs back off, e.g. start ~100ms growing to ~5s
  status = GET /1/indexes/{indexName}/task/{taskID}.status
} while (status != "published")
# safe to read the data now
```

**MCP call example:**

```json
{ "applicationId": "$ALGOLIA_APP_ID", "indexName": "products", "taskID": 1514562690001 }
```

**Source:** https://www.algolia.com/doc/rest-api/search/get-task

---

### getAppTask — application-level task status

**Purpose:** Wait on **application-scoped** tasks (those not tied to a single index, e.g. some
multi-index / app-wide operations). Same `published` / `notPublished` model.

**REST:** `GET /1/task/{taskID}` (host `https://$ALGOLIA_APP_ID.algolia.net`)
ACL required: `editSettings`

**MCP tool:** `mcp__algolia__getAppTask`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID (MCP only) |
| `taskID` | integer (int64) | yes | — | Application task ID |

**curl example:**

```bash
curl "https://$ALGOLIA_APP_ID.algolia.net/1/task/1506303845001" \
  -H "X-Algolia-Application-Id: $ALGOLIA_APP_ID" \
  -H "X-Algolia-API-Key: $ALGOLIA_API_KEY"
```

**Response (200 OK):**

```json
{ "status": "published" }
```

**MCP call example:**

```json
{ "applicationId": "$ALGOLIA_APP_ID", "taskID": 1506303845001 }
```

**Source:** https://www.algolia.com/doc/rest-api/search/get-app-task

---

### getStatus — ingestion/event run status (region-scoped) `[UNVERIFIED]`

**Purpose:** Retrieve update/run status. Unlike `getTask`, this MCP tool requires a **`region`**
parameter, which indicates it targets a regional service host (the Ingestion / Events / Observability
API family, e.g. `https://data.{region}.algolia.com`) rather than the standard search write host.
The exact REST path and response shape were **not confirmed** against a Search-API doc page.

**MCP tool:** `mcp__algolia__getStatus`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID |
| `region` | string | yes | — | Regional host selector (e.g. `us`, `eu`) |
| `index` | string | yes | — | Index name |

**Source:** `[UNVERIFIED]` — not located on the Search REST reference; parameter shape from MCP tool schema only.

---

### hasPendingMappings — cluster mapping migration status `[UNVERIFIED]`

**Purpose:** Check whether a Multi-Cluster Management (MCM) user-ID mapping migration is still pending
across clusters. This belongs to the **MCM / clusters** API, not the records API.

**REST (per MCM docs):** `GET /1/clusters/mapping/pending` (with optional `getClusters` query param) `[UNVERIFIED — path not re-confirmed in this pass]`

**MCP tool:** `mcp__algolia__hasPendingMappings`

**Key parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `applicationId` | string | yes | — | Algolia app ID |
| `getClusters` | boolean | no | — | If true, also return the list of clusters with pending mappings |

**Response (per MCM docs):** `{ "pending": true|false, "clusters": { ... } }` `[UNVERIFIED]`

**Source:** `[UNVERIFIED]` — MCM/clusters API, exact path/response not re-verified in this pass.

---

## Coverage notes

- **All Search-API record + index endpoints verified** against dedicated `algolia.com/doc/rest-api/search/*`
  pages: save-object, add-or-update-object (covers PUT replace + the partial endpoint), multiple-batch
  (covers the action enum + cross-index batch), delete-object, delete-by, clear-objects, get-object,
  get-objects, operation-index, list-indices, delete-index, get-task, get-app-task. Methods, paths,
  ACLs, and response shapes are taken directly from those pages.
- **Single-index `batch` path** (`POST /1/indexes/{indexName}/batch`) is the baseline-confirmed
  companion to the documented cross-index `POST /1/indexes/*/batch`; the action enum is shared and
  taken verbatim from the multiple-batch page and the MCP tool schema. Treated as verified.
- **`partialUpdateObject` operation objects** (`Increment`, `Add`, `Remove`, etc.) are summarized from
  the API-methods reference, not the per-endpoint REST page — the endpoint, path, and `createIfNotExists`
  param are verified.
- **`getStatus`** and **`hasPendingMappings`** are MCP tools whose REST surfaces live **outside** the
  Search records API (regional Ingestion/Events host and the MCM/clusters API respectively). Their
  REST paths/responses are marked `[UNVERIFIED]` here — document them fully in the dedicated
  Ingestion and MCM/Clusters reference files.
- **Read host vs write host:** writes go to `https://$ALGOLIA_APP_ID.algolia.net`; reads (`getObject`,
  `getObjects`) are shown against the DSN host `https://$ALGOLIA_APP_ID-dsn.algolia.net`. Both resolve
  through the same retry fallback chain (`-1/-2/-3.algolianet.com`).
- **Async is the #1 gotcha:** a 200/201 means *queued*, not *applied*. Always `waitTask` (poll `getTask`)
  before reading back or chaining dependent operations.
- **Timestamps** are RFC 3339. **`taskID`** is an int64; for `multipleBatch` it's an **object keyed by
  index name**, for everything else a single integer.
- **No real keys** appear anywhere — all examples use `$ALGOLIA_APP_ID` / `$ALGOLIA_API_KEY` (CENTRAL or
  VISIBILITY context from `.env.local`).
