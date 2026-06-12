# Ingestion / Connectors API — Algolia API Reference

The Ingestion API (also called Data Ingestion / Connectors) is the pipeline that pulls
data from external sources into Algolia indices. You configure it once, and Algolia
handles the recurring fetch → transform → index loop for you.

**Source:** https://www.algolia.com/doc/rest-api/ingestion

---

## Host, region, and authentication

The Ingestion API runs on a **separate, region-bound host** — it is NOT on the usual
`{APP_ID}.algolia.net` search host. Pick the host that matches your analytics region:

| Region | Base URL |
|--------|----------|
| US | `https://data.us.algolia.com` |
| EU | `https://data.eu.algolia.com` |

All endpoints are versioned under `/1/` (and `/2/` for the v2 task resource). All
requests are HTTPS, send/receive JSON, and require these headers:

| Header | Value |
|--------|-------|
| `x-algolia-application-id` | Your Algolia application ID |
| `x-algolia-api-key` | An API key with the required ACLs (typically `addObject`, `deleteIndex`, `editSettings`) |

Errors come back as 4xx (client) / 5xx (server) with a `message` property explaining
what went wrong.

> **Note on the two contexts in this project's `.env.local`:** there are two credential
> sets — CENTRAL (`ALGOLIA_CENTRAL_APP_ID` / `ALGOLIA_CENTRAL_API_KEY` /
> `ALGOLIA_CENTRAL_INDEX_NAME`) and VISIBILITY (`VISIBILITY_APP_ID` / `VISIBILITY_API_KEY` /
> `VISIBILITY_INDEX_NAME`). Use whichever app owns the index you are ingesting into.
> Examples below use generic `$ALGOLIA_APP_ID` / `$ALGOLIA_API_KEY` placeholders — never
> hardcode real keys.

---

## The model — how the pieces fit together

```
                        ┌──────────────────────────────────────────┐
                        │            INGESTION TASK                  │
                        │  (the wiring + the trigger/schedule)       │
                        └──────────────────────────────────────────┘
                                          │
          ┌───────────────────────────────┼───────────────────────────────┐
          ▼                                ▼                                ▼
   ┌─────────────┐                 ┌────────────────┐                ┌──────────────┐
   │   SOURCE    │  ──fetch───►    │ TRANSFORMATION │  ──reshape──►  │ DESTINATION  │
   │ (where data │                 │ (optional code/ │                │ (the Algolia │
   │  comes from)│                 │  no-code step)  │                │  index)      │
   └─────────────┘                 └────────────────┘                └──────────────┘
          ▲                                                                  │
          │                                                                  ▼
   ┌──────────────┐                                              indexed records
   │AUTHENTICATION│  holds the credentials (API tokens, OAuth,
   │ (credentials)│  basic auth) that a Source/Destination uses
   └──────────────┘

   Each execution of a Task is a RUN. Each per-record outcome inside a run is an EVENT.
   RUNs + EVENTs are the observability layer (did it work, what failed, why).
```

Plain-English summary:
- **Source** = where your data lives (Shopify, BigQuery, a CSV/JSON URL, commercetools, etc.).
- **Destination** = the Algolia index the data lands in.
- **Transformation** = an optional step that reshapes each record on the way through (code or no-code).
- **Task** = the object that wires Source → (Transformation) → Destination and decides *when* it runs (on demand, on a schedule/cron, or streaming/subscription).
- **Authentication** = a reusable credential bundle referenced by sources/destinations.
- **Run** = one execution of a task. **Event** = the outcome for one record within a run.

---

## Sources

A source describes where data comes from and how to read it.

**Source:** https://www.algolia.com/doc/rest-api/ingestion/create-source

| Operation | REST method + path | MCP tool | Purpose |
|-----------|--------------------|----------|---------|
| Create source | `POST /1/sources` | `mcp__algolia__createSource` | Register a new source |
| List sources | `GET /1/sources` | `mcp__algolia__listSources` / `mcp__algolia__getSources` | Page through all sources |
| Get source | `GET /1/sources/{sourceID}` | `mcp__algolia__getSource` | Fetch one source by ID |
| Update source | `PUT /1/sources/{sourceID}` | `mcp__algolia__updateSource` | Replace/patch a source config |
| Delete source | `DELETE /1/sources/{sourceID}` | `mcp__algolia__deleteSource` | Remove a source |
| Search sources | `GET /1/sources/search` | `mcp__algolia__searchSources` | Search/filter sources [UNVERIFIED: may be `POST` with a body in some SDKs] |
| Validate source | `POST /1/sources/validate` | `mcp__algolia__validateSource` | Dry-run validate a source payload before creating |
| Validate before update | `POST /1/sources/{sourceID}/validate` | `mcp__algolia__validateSourceBeforeUpdate` | Validate a change against an existing source |
| Trigger Docker discover | `POST /1/sources/{sourceID}/discover` | `mcp__algolia__triggerDockerSourceDiscover` | Run schema discovery for Docker/Airbyte-style connectors |
| Run source | `POST /1/sources/{sourceID}/run` | `mcp__algolia__runSource` | Trigger an ad-hoc run for this source |

> Note: `mcp__algolia__getSources` and `mcp__algolia__listSources` both map to `GET /1/sources`;
> they are alias names for the same list operation.

### Example — create a source (curl)

```bash
curl -X POST "https://data.us.algolia.com/1/sources" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "json",
    "name": "Product feed (JSON)",
    "input": {
      "url": "https://example.com/products.json"
    },
    "authenticationID": "6c02aeb1-775e-418e-870b-1faccd4b2c0f"
  }'
```

Request body fields (from `SourceCreate`): `name` (required), `type` (required — e.g.
`commercetools`, `shopify`, `bigcommerce`, `csv`, `json`, `bigquery`, `docker`),
`input` (type-specific config), `authenticationID` (optional UUID of an Authentication).

### Example — create a source (MCP)

```jsonc
// tool: mcp__algolia__createSource
{
  "type": "json",
  "name": "Product feed (JSON)",
  "input": { "url": "https://example.com/products.json" },
  "authenticationID": "6c02aeb1-775e-418e-870b-1faccd4b2c0f"
}
```

---

## Destinations

A destination is the Algolia index (plus indexing behavior) that data is written to.

**Source:** https://www.algolia.com/doc/rest-api/ingestion (Destinations section)

| Operation | REST method + path | MCP tool | Purpose |
|-----------|--------------------|----------|---------|
| Create destination | `POST /1/destinations` | `mcp__algolia__createDestination` | Register a new destination |
| List destinations | `GET /1/destinations` | `mcp__algolia__listDestinations` | Page through destinations |
| Get destination | `GET /1/destinations/{destinationID}` | `mcp__algolia__getDestination` | Fetch one destination |
| Update destination | `PUT /1/destinations/{destinationID}` | `mcp__algolia__updateDestination` | Modify a destination |
| Delete destination | `DELETE /1/destinations/{destinationID}` | `mcp__algolia__deleteDestination` | Remove a destination |
| Search destinations | `GET /1/destinations/search` | `mcp__algolia__searchDestinations` | Search/filter destinations [UNVERIFIED: method may be `POST`] |

### Example — create a destination (curl)

```bash
curl -X POST "https://data.us.algolia.com/1/destinations" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "search",
    "name": "Products index destination",
    "input": { "indexName": "products" }
  }'
```

---

## Tasks

A task wires a source, an optional transformation, and a destination together, and
controls *when* the pipeline runs. **This is the resource with a v1/v2 split** — see the
[v1 vs v2 tasks](#v1-vs-v2-tasks) section below. New integrations should use **v2** (`/2/tasks`).

**Source:** https://www.algolia.com/doc/rest-api/ingestion/create-task

### v2 tasks (current — `/2/tasks`)

| Operation | REST method + path | MCP tool | Purpose |
|-----------|--------------------|----------|---------|
| Create task | `POST /2/tasks` | `mcp__algolia__createTask` | Wire source→destination + trigger |
| List tasks | `GET /2/tasks` | `mcp__algolia__listTasks` | Page through tasks |
| Get task | `GET /2/tasks/{taskID}` | `mcp__algolia__getIngestionTask` | Fetch one task [UNVERIFIED: MCP name `getIngestionTask` assumed to map to v2 GET task] |
| Search tasks | `GET /2/tasks/search` | `mcp__algolia__searchTasks` | Search/filter tasks [UNVERIFIED: method may be `POST`] |
| Update task | `PUT /2/tasks/{taskID}` | `mcp__algolia__updateTask` | Modify a task |
| Delete task | `DELETE /2/tasks/{taskID}` | `mcp__algolia__deleteTask` | Remove a task |
| Run task | `POST /2/tasks/{taskID}/run` | `mcp__algolia__runTask` | Trigger an ad-hoc run |
| Push task | `POST /2/tasks/{taskID}/push` | `mcp__algolia__pushTask` | Push records directly through a task's transformation→destination |
| Enable task | `POST /2/tasks/{taskID}/enable` | `mcp__algolia__enableTask` | Re-enable a paused task |
| Disable task | `POST /2/tasks/{taskID}/disable` | `mcp__algolia__disableTask` | Pause a task |

### v1 tasks (legacy — `/1/tasks`)

| Operation | REST method + path | MCP tool | Purpose |
|-----------|--------------------|----------|---------|
| Create task | `POST /1/tasks` | `mcp__algolia__createTaskV1` | Legacy create |
| List tasks | `GET /1/tasks` | `mcp__algolia__listTasksV1` | Legacy list |
| Get task | `GET /1/tasks/{taskID}` | `mcp__algolia__getTaskV1` | Legacy get (docs say "use getTask instead") |
| Search tasks | `GET /1/tasks/search` | `mcp__algolia__searchTasksV1` | Legacy search [UNVERIFIED: method] |
| Update task | `PUT /1/tasks/{taskID}` | `mcp__algolia__updateTaskV1` | Legacy update |
| Delete task | `DELETE /1/tasks/{taskID}` | `mcp__algolia__deleteTaskV1` | Legacy delete |
| Run task | `POST /1/tasks/{taskID}/run` | `mcp__algolia__runTaskV1` | Legacy ad-hoc run |
| Enable task | `POST /1/tasks/{taskID}/enable` | `mcp__algolia__enableTaskV1` | Legacy enable |
| Disable task | `POST /1/tasks/{taskID}/disable` | `mcp__algolia__disableTaskV1` | Legacy disable |

> The v1 task resource has **no `/push`** endpoint. Push lives only on v2 (`/2/tasks/{taskID}/push`)
> and on the index-level push endpoint (`/1/push/{indexName}`, below).

### Example — create a task v2 (curl)

```bash
curl -X POST "https://data.us.algolia.com/2/tasks" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceID": "6c02aeb1-775e-418e-870b-1faccd4b2c0f",
    "destinationID": "c1f8c5 a8-...-...",
    "action": "replace",
    "cron": "0 2 * * *",
    "enabled": true
  }'
```

v2 create body fields: `sourceID` (UUID), `destinationID` (UUID), `action`
(`replace` | `save` | `partial` | `partialNoCreate` | `append`), `enabled` (bool),
`cron` (schedule expression — omit for on-demand), `subscriptionAction` (for
event/streaming triggers), `input` (source-type-specific), `notifications`, `policies`
(e.g. `criticalThreshold` for failure handling).

### Example — create a task v2 (MCP)

```jsonc
// tool: mcp__algolia__createTask
{
  "sourceID": "6c02aeb1-775e-418e-870b-1faccd4b2c0f",
  "destinationID": "c1f8c5a8-...",
  "action": "replace",
  "cron": "0 2 * * *",
  "enabled": true
}
```

### Example — run a task on demand (curl + MCP)

```bash
curl -X POST "https://data.us.algolia.com/2/tasks/{taskID}/run" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

```jsonc
// tool: mcp__algolia__runTask
{ "taskID": "76ab4c2a-ce17-4b92-..." }
```

The response carries a `runID` you can poll via the Observability endpoints.

### Example — push records through a task (pushTask)

`pushTask` sends records straight into a task's transformation → destination pipeline
without an external source fetch. Useful for "push" connectors where your app emits records.

```bash
curl -X POST "https://data.us.algolia.com/2/tasks/{taskID}/push" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "addObject",
    "records": [
      { "objectID": "prod-123", "name": "Yoga pants", "price": 49 }
    ]
  }'
```

```jsonc
// tool: mcp__algolia__pushTask
{
  "taskID": "76ab4c2a-ce17-4b92-...",
  "action": "addObject",
  "records": [ { "objectID": "prod-123", "name": "Yoga pants", "price": 49 } ]
}
```

Body (`PushTaskPayload`): `action` (one of `addObject`, `updateObject`,
`partialUpdateObject`, `partialUpdateObjectNoCreate`, `deleteObject`, `delete`, `clear`)
and `records` (array; each needs an `objectID`). Optional query param `watch=true`
makes it synchronous.

### Index-level push (`/1/push/{indexName}`)

Closely related to `pushTask` but keyed by **index name** instead of `taskID`:

```bash
curl -X POST "https://data.us.algolia.com/1/push/products" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "action": "addObject", "records": [ { "objectID": "p1", "name": "Item" } ] }'
```

Optional query params: `watch=true` (synchronous), `referenceIndexName` (apply
transformations configured for another index when this index has no push connector).
[UNVERIFIED: this endpoint is not exposed under a distinct MCP tool name in the provided
list — the closest MCP push tool is `mcp__algolia__pushTask`, which targets a `taskID`.]

---

## Transformations

A transformation reshapes each record as it flows from source to destination. It can be
**code** (a JavaScript snippet) or **noCode** (a configured mapping).

**Source:** https://www.algolia.com/doc/rest-api/ingestion/get-transformation

| Operation | REST method + path | MCP tool | Purpose |
|-----------|--------------------|----------|---------|
| Create transformation | `POST /1/transformations` | `mcp__algolia__createTransformation` | Register a transformation |
| List transformations | `GET /1/transformations` | `mcp__algolia__listTransformations` | Page through transformations |
| Get transformation | `GET /1/transformations/{transformationID}` | `mcp__algolia__getTransformation` | Fetch one |
| Update transformation | `PUT /1/transformations/{transformationID}` | `mcp__algolia__updateTransformation` | Modify one |
| Delete transformation | `DELETE /1/transformations/{transformationID}` | `mcp__algolia__deleteTransformation` | Remove one |
| Search transformations | `GET /1/transformations/search` | `mcp__algolia__searchTransformations` | Search/filter [UNVERIFIED: method] |
| Try transformation | `POST /1/transformations/try` | `mcp__algolia__tryTransformation` | Dry-run a transformation against a sample record |
| Try before update | `POST /1/transformations/{transformationID}/try` | `mcp__algolia__tryTransformationBeforeUpdate` | Dry-run a proposed change against an existing transformation |

Transformation object fields: `transformationID` (UUID), `name`, `type` (`code` | `noCode`),
`input` (the code or no-code config), `description`, `authenticationIDs`, `createdAt`,
`updatedAt`. (`code` as a top-level field is deprecated in favor of `input`.)

### Example — try a transformation (curl)

```bash
curl -X POST "https://data.us.algolia.com/1/transformations/try" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "return { ...record, price: record.price_cents / 100 };",
    "sampleRecord": { "objectID": "p1", "price_cents": 4900 }
  }'
```
[UNVERIFIED: exact field names for the try payload (`code`/`input`/`sampleRecord`) —
verify against the live `tryTransformation` reference before relying on them.]

### Example — try a transformation (MCP)

```jsonc
// tool: mcp__algolia__tryTransformation
{
  "code": "return { ...record, price: record.price_cents / 100 };",
  "sampleRecord": { "objectID": "p1", "price_cents": 4900 }
}
```

---

## Authentications

An authentication is a reusable credential bundle (API token, OAuth, basic auth, etc.)
referenced by sources and destinations so you don't repeat secrets.

**Source:** https://www.algolia.com/doc/rest-api/ingestion (Authentications section)

| Operation | REST method + path | MCP tool | Purpose |
|-----------|--------------------|----------|---------|
| Create authentication | `POST /1/authentications` | `mcp__algolia__createAuthentication` | Store a credential bundle |
| List authentications | `GET /1/authentications` | `mcp__algolia__listAuthentications` | Page through them |
| Get authentication | `GET /1/authentications/{authenticationID}` | `mcp__algolia__getAuthentication` | Fetch one |
| Update authentication | `PUT /1/authentications/{authenticationID}` | `mcp__algolia__updateAuthentication` | Modify one |
| Delete authentication | `DELETE /1/authentications/{authenticationID}` | `mcp__algolia__deleteAuthentication` | Remove one |
| Search authentications | `GET /1/authentications/search` | `mcp__algolia__searchAuthentications` | Search/filter [UNVERIFIED: method] |

### Example — create an authentication (curl)

```bash
curl -X POST "https://data.us.algolia.com/1/authentications" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "oauth",
    "name": "Shopify OAuth",
    "input": {
      "url": "https://my-store.myshopify.com/admin/oauth/access_token",
      "client_id": "REPLACE_ME",
      "client_secret": "REPLACE_ME"
    }
  }'
```

Body fields: `type` (e.g. `oauth`, `basic`, `apiKey`, `algolia`, `googleServiceAccount`),
`name`, `input` (type-specific credential payload). [UNVERIFIED: exact `input` shape varies
by `type` — verify per source/destination connector docs.]

### Example — create an authentication (MCP)

```jsonc
// tool: mcp__algolia__createAuthentication
{
  "type": "oauth",
  "name": "Shopify OAuth",
  "input": { "url": "https://my-store.myshopify.com/admin/oauth/access_token",
             "client_id": "REPLACE_ME", "client_secret": "REPLACE_ME" }
}
```

---

## Observability — Runs and Events

A **run** is one execution of a task. An **event** is the outcome for a single record (or
batch step) inside that run — this is where you see what succeeded, what failed, and why.

**Source:** https://www.algolia.com/doc/rest-api/ingestion/get-run

| Operation | REST method + path | MCP tool | Purpose |
|-----------|--------------------|----------|---------|
| List runs | `GET /1/runs` | `mcp__algolia__listRuns` | Page through task runs |
| Get run | `GET /1/runs/{runID}` | `mcp__algolia__getRun` | Status/summary of one run |
| List events | `GET /1/runs/{runID}/events` | `mcp__algolia__listEvents` | Per-record events for a run |
| Get event | `GET /1/runs/{runID}/events/{eventID}` | `mcp__algolia__getEvent` | One event's detail |

> Events are nested under their run (`/1/runs/{runID}/events/...`). [UNVERIFIED: some SDK
> surfaces expose `getEvent`/`listEvents` without requiring the `runID` in the path — verify
> the exact MCP parameter shape against the live reference.]

### Example — poll a run and inspect failures

```bash
# 1. Check the run status
curl "https://data.us.algolia.com/1/runs/{runID}" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"

# 2. List per-record events for that run (filter to failures in your client)
curl "https://data.us.algolia.com/1/runs/{runID}/events" \
  -H "x-algolia-application-id: $ALGOLIA_APP_ID" \
  -H "x-algolia-api-key: $ALGOLIA_API_KEY"
```

---

## v1 vs v2 tasks

The task resource is the one place where Ingestion exposes two API versions. They model
the **same idea** (wire a source to a destination and decide when it runs) but differ in how
the trigger is expressed:

- **v1 (`/1/tasks`, the `*V1` MCP tools):** older shape. The trigger was carried in a
  single `trigger` object with a `type` of `onDemand`, `schedule`, or `subscription`.
  Docs explicitly mark v1 getters as deprecated ("use `getTask` instead"). No `/push`
  endpoint on v1.
- **v2 (`/2/tasks`, the non-suffixed MCP tools):** current shape. The trigger is split into
  discrete, explicit fields on the task itself — `cron` for scheduled runs and
  `subscriptionAction` for event/streaming runs, with `enabled` controlling active state.
  v2 adds `/2/tasks/{taskID}/push` for push connectors, plus `policies` (e.g.
  `criticalThreshold`) and `notifications`.

**Guidance:** use v2 for anything new. The `*V1` tools/endpoints exist for backward
compatibility with tasks created under the old model.

[UNVERIFIED: the precise field-by-field migration mapping (v1 `trigger.type` →
v2 `cron`/`subscriptionAction`) is inferred from the v2 create-task schema and the v1
deprecation notice. Confirm against the live create-task / create-task-v1 reference before
writing a migration.]

---

## Collections (separate product)

The MCP "collections" tools — `mcp__algolia__listCollections`,
`mcp__algolia__getCollection`, `mcp__algolia__upsertCollection`,
`mcp__algolia__commitCollection`, `mcp__algolia__deleteCollection` — are **NOT part of the
Ingestion API.** They belong to Algolia's **Collections** feature, which is a
**merchandising / browse** capability for ecommerce (part of the Merchandising Studio
family), not a data-pipeline capability.

**What Collections actually are:** a way for merchandisers to curate groups of products —
either a handpicked set (e.g. "Best sellers", an editorial theme) or a rule-based set
(e.g. "Under $50", "Brand = Nike"). When a collection is created or changed, Algolia's
transformation engine evaluates the collection's conditions, tags matching records with a
`_collections` attribute, and writes them back to your index. At query time a collection
page is just a facet filter on `_collections`, so it behaves like any other facet in
InstantSearch. Collections also support "Smart Group" injections for boosting priority items.

**Source:** https://www.algolia.com/doc/guides/solutions/ecommerce/browse/tutorials/collections
**Source (MCP tool catalog confirming "collections" is its own tool category alongside `recommend`, `search`, `analytics`, etc.):** https://www.algolia.com/doc/guides/algolia-ai/agent-studio/how-to/tools/mcp-tools

Why the confusion is understandable: Collections happen to *use* the same transformation
engine that Ingestion uses, and the changelog notes you can now manage collection data via
the Ingestion `pushTask` flow through supported API clients. But the *resource* — a curated
group of products tied to a search index — is a merchandising concept, not a source/task/
destination pipeline object.

[UNVERIFIED: the Collections operations do **not** appear in either the Ingestion OpenAPI
spec or the Recommend OpenAPI spec. The REST method+path and request-body shape for
`upsertCollection` / `commitCollection` / etc. could not be confirmed from a public REST
reference and are therefore left undocumented here rather than guessed. The
`upsert` → `commit` two-step naming strongly implies a staging-then-publish lifecycle, but
that is inferred, not verified.]

---

## Coverage notes

- **Host/region:** Verified — Ingestion runs on the region-bound host
  `https://data.us.algolia.com` or `https://data.eu.algolia.com` (NOT the standard search
  host), versioned under `/1/` and (for tasks only) `/2/`. Auth via
  `x-algolia-application-id` + `x-algolia-api-key`.
- **Endpoint paths:** All Sources, Destinations, Tasks (v1 + v2), Transformations,
  Authentications, Runs, and Events paths were verified against the Algolia Ingestion
  OpenAPI spec (`specs/ingestion/spec.yml` in `algolia/api-clients-automation`), cross-checked
  with the public REST reference pages.
- **HTTP method on `/search` endpoints:** Marked `[UNVERIFIED]`. The OpenAPI path listing
  shows them as `GET /1/{resource}/search`, but several Algolia SDK surfaces expose
  "search" as a `POST` with a request body. Confirm per language client before use.
- **`getIngestionTask` mapping:** Marked `[UNVERIFIED]`. The MCP name is `getIngestionTask`
  rather than `getTask`; it is assumed to map to the v2 `GET /2/tasks/{taskID}` get-task
  operation.
- **`/1/push/{indexName}`:** Verified as a real endpoint. It has no dedicated MCP tool in
  the provided list — the closest MCP push tool is `pushTask` (which targets a `taskID`).
- **Events nesting:** The OpenAPI spec nests events under runs
  (`/1/runs/{runID}/events/{eventID}`); whether the MCP `getEvent`/`listEvents` tools require
  `runID` is `[UNVERIFIED]`.
- **Request-body field shapes** for `createAuthentication.input`, the `tryTransformation`
  payload, and per-connector `source.input` vary by type and were only partially confirmed;
  treat those examples as illustrative and verify against the specific connector's reference.
- **Collections:** Confirmed to be a **separate merchandising/browse product**, not
  Ingestion. Its REST contract could not be located in a public spec and is left
  `[UNVERIFIED]` rather than invented.
- **No real credentials** appear anywhere in this file; all examples use
  `$ALGOLIA_APP_ID` / `$ALGOLIA_API_KEY` placeholders.
