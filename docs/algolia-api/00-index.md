# Algolia API Reference — Local Index

> **This folder is the canonical local reference for every Algolia API used in this project.**
> Built by reading the live Algolia docs (`https://www.algolia.com/doc/rest-api` and the API parameter references). Every operation documents **two calling styles** — the live MCP tool (`mcp__algolia__*`, already connected in this session) **and** the raw REST request (method, path, host, headers, `curl`). No real API keys live in these files; they use placeholders that map to `.env.local`.

---

## How to use this reference

1. **Find the operation** — start with `99-mcp-tool-map.md` (every `mcp__algolia__*` tool → API group → REST endpoint → which file documents it).
2. **Open the group file** for full parameter tables, defaults, `curl`, and MCP examples.
3. **Call it** — prefer the MCP tool in-session; drop to REST when scripting our own HTTP client.

## Files

| File | Covers |
|------|--------|
| `00-index.md` | This overview: hosts, auth, regions, app contexts, cross-API gotchas |
| `01-search-api.md` | Search (single/multi-index), browse, facet-value search, **full search-parameter reference** |
| `02-indexing-objects-api.md` | Save/partial-update/batch/delete records, copy/move/list/delete indices, async task waiting |
| `03-index-settings-api.md` | Get/set index settings, **exhaustive settings-parameter reference** |
| `04-relevance-config-api.md` | Query Rules, Synonyms, Dictionaries, Query Suggestions |
| `05-analytics-api.md` | Search + click/conversion analytics metrics |
| `06-engagement-apis.md` | Insights/Events, Recommend, A/B Testing, Personalization |
| `07-ingestion-connectors-api.md` | Sources, Destinations, Tasks, Transformations, Authentications, Runs/Events |
| `08-ops-security-api.md` | Monitoring, Usage/Metrics, Multi-Cluster Mgmt, API Keys, Logs |
| `99-mcp-tool-map.md` | Master table: every MCP tool → REST endpoint → reference file |

---

## Authentication

Two headers on (almost) every request:

```
X-Algolia-Application-Id: $ALGOLIA_APP_ID
X-Algolia-API-Key:        $ALGOLIA_API_KEY
```

- **Admin key** — full read/write (indexing, settings, keys). Server-side only.
- **Search-only key** — querying only. Safe for clients.
- **Secured API keys** — generated **client-side via HMAC-SHA256** from a parent search key (no endpoint / no MCP tool); used to scope a query to a `userToken` or filter.
- The **Monitoring** API's status/incidents/latency/reachability/indexing/inventory endpoints are **public — no auth header needed**. Only the infrastructure-metrics endpoints require a key.

## App contexts (from `.env.local`)

This project carries **two** Algolia applications. Never hardcode keys — read these env vars.

| Context | App ID var | API key var | Index var |
|---------|-----------|-------------|-----------|
| **CENTRAL** | `ALGOLIA_CENTRAL_APP_ID` | `ALGOLIA_CENTRAL_API_KEY` | `ALGOLIA_CENTRAL_INDEX_NAME` |
| **VISIBILITY** | `VISIBILITY_APP_ID` | `VISIBILITY_API_KEY` | `VISIBILITY_INDEX_NAME` |

When calling MCP tools, pass the matching `applicationId` / index for the context you intend.

---

## Hosts & regions (cheat sheet)

Many Algolia APIs are **region-bound** (`us` / `eu`/`de`). MCP tools for those take a `region` argument; REST calls hit the regional host.

| API | Host(s) | Path prefix | Auth |
|-----|---------|-------------|------|
| **Search (read)** | `https://$ALGOLIA_APP_ID-dsn.algolia.net` | `/1/indexes/...` | key |
| **Indexing/Settings/Rules/Synonyms/Dictionaries/Keys/Logs/MCM (write)** | `https://$ALGOLIA_APP_ID.algolia.net` (retry `-1/-2/-3.algolianet.com`) | `/1/...` | admin key |
| **Recommend** | Search hosts (`$ALGOLIA_APP_ID-dsn.algolia.net`) | `/1/indexes/*/recommendations` | key |
| **Analytics** | `https://analytics.us.algolia.com` · `https://analytics.de.algolia.com` (default `analytics.algolia.com`) | `/2/...` | key |
| **A/B Testing** | `https://analytics.algolia.com` (regional variants) | `/2/abtests` | admin key |
| **Insights / Events** | `https://insights.us.algolia.io` · `https://insights.de.algolia.io` | `/1/events` | key |
| **Personalization** | `https://personalization.us.algolia.com` · `https://personalization.eu.algolia.com` | `/1/strategies` · `/1/profiles` | admin key |
| **Query Suggestions** | `https://query-suggestions.us.algolia.com` · `https://query-suggestions.eu.algolia.com` | `/1/configs` | admin key |
| **Ingestion / Connectors** | `https://data.us.algolia.com` · `https://data.eu.algolia.com` | `/1/...`, `/2/tasks` | admin key |
| **Monitoring** | `https://status.algolia.com` | `/1/status`, `/1/incidents`, `/1/inventory/servers`, ... | **public** (metrics need key) |
| **Usage / Metrics** | `https://usage.algolia.com` | `/1/usage/{statistic}` | admin key |

---

## Cross-API gotchas (learned while building this reference)

These are the traps where a tool name or metric does **not** mean what it looks like. Read before wiring anything up.

1. **`mcp__algolia__getStatus` is NOT the Monitoring status.** It returns the **indexing task status** for a `taskID`. For platform/cluster health use `getClustersStatus` / `getClusterStatus` or REST `GET https://status.algolia.com/1/status`.
2. **`mcp__algolia__getEvent` / `listEvents` are Ingestion run observability** (per-record outcomes of a connector run — `fetch`/`record`/`transform`/`log`), **NOT** Insights analytics events.
3. **Insights `pushEvents` (`POST /1/events`) has NO MCP tool.** Click/conversion/view events must be sent via REST/SDK. Without them, all click/conversion/purchase/revenue analytics stay null.
4. **`mcp__algolia__getTopUserIds` is Multi-Cluster Management**, not analytics — it returns top users by *record count* on a cluster (`GET /1/clusters/mapping/top`), not by search volume.
5. **Indexing is asynchronous.** A `200/201` means "task queued," not "applied." Poll `getTask` until `status: published` before reading records back.
6. **`forwardToReplicas` defaults to `false`** on settings/rules/synonyms writes — replica indices won't get the change unless you opt in, and it only reaches *existing* replicas.
7. **`relevancyStrictness` only affects virtual replicas.** `mode: neuralSearch` / `semanticSearch` only work where Algolia has enabled NeuralSearch on the app.
8. **`replicas` must be the full list** on every `setSettings` call — omitting a replica detaches it.
9. **Region matters.** Analytics/Insights/Personalization/Query Suggestions/Ingestion each have their own regional host; pass the right `region`.
10. **Secured API keys are HMAC-generated client-side** — there is no endpoint and no MCP tool to mint them.

---

## Provenance & maintenance

- Sourced from `https://www.algolia.com/doc` (REST API reference + API parameters). Each group file carries per-operation **Source:** URLs and a **Coverage notes** section listing anything marked `[UNVERIFIED]`.
- Known `[UNVERIFIED]` clusters to confirm before relying on them: a few Ingestion `/search` GET-vs-POST methods and v1→v2 task mappings (`07`), the Usage-metrics `retrieveMetrics*` REST paths (`08`), `scheduleABTest` path and `getUserInfo` response shape (`06`). See each file's Coverage notes.
- To refresh: re-fetch the relevant doc page, update the group file, and keep the tool map (`99`) in sync.
