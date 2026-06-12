# MCP ↔ REST Tool Map

Every Algolia MCP tool connected in this session, mapped to its REST endpoint and the reference file with full params. Tool names are prefixed `mcp__algolia__` (omitted in the table for width). Hosts: see `00-index.md`. `{app}` = `$ALGOLIA_APP_ID`.

> ⚠️ Name traps (see `00-index.md`): `getStatus` = indexing task status (not monitoring); `getEvent`/`listEvents` = Ingestion run events (not Insights); `getTopUserIds` = MCM (not analytics).

## Search — `01-search-api.md`

| MCP tool | REST | Notes |
|----------|------|-------|
| `searchSingleIndex` | `POST /1/indexes/{index}/query` | one index |
| `search` | `POST /1/indexes/*/queries` | multi-index/multi-query |
| `browse` | `POST /1/indexes/{index}/browse` | paginate all records |
| `searchForFacetValues` | `POST /1/indexes/{index}/facets/{facet}/query` | facet value search |
| `getObject` | `GET /1/indexes/{index}/{objectID}` | single record |
| `getObjects` | `POST /1/indexes/*/objects` | many records cross-index |

## Indexing & Objects — `02-indexing-objects-api.md`

| MCP tool | REST | Notes |
|----------|------|-------|
| `saveObject` | `POST /1/indexes/{index}` | add (auto objectID) |
| `addOrUpdateObject` | `PUT /1/indexes/{index}/{objectID}` | add/replace with ID |
| `partialUpdateObject` | `POST /1/indexes/{index}/{objectID}/partial` | update named attrs |
| `batch` | `POST /1/indexes/{index}/batch` | bulk ops, one index |
| `multipleBatch` | `POST /1/indexes/*/batch` | bulk ops, cross-index |
| `deleteObject` | `DELETE /1/indexes/{index}/{objectID}` | |
| `deleteBy` | `POST /1/indexes/{index}/deleteByQuery` | delete by filter |
| `clearObjects` | `POST /1/indexes/{index}/clear` | empty index |
| `operationIndex` | `POST /1/indexes/{index}/operation` | copy / move |
| `listIndices` | `GET /1/indexes` | |
| `deleteIndex` | `DELETE /1/indexes/{index}` | |
| `getTask` | `GET /1/indexes/{index}/task/{taskID}` | wait-for-task polling |
| `getStatus` | indexing task status | ⚠️ not monitoring |
| `getAppTask` | app-level task status | |
| `hasPendingMappings` | `GET /1/clusters/mapping/pending` | MCM (also in `08`) |

## Index Settings — `03-index-settings-api.md`

| MCP tool | REST | Notes |
|----------|------|-------|
| `getSettings` | `GET /1/indexes/{index}/settings` | |
| `setSettings` | `PUT /1/indexes/{index}/settings` | `?forwardToReplicas` |
| `setAttributesForFaceting` | (helper → setSettings) | append by default |
| `setCustomRanking` | (helper → setSettings) | append by default |

## Relevance Config — `04-relevance-config-api.md`

**Rules**

| MCP tool | REST |
|----------|------|
| `saveRule` | `PUT /1/indexes/{index}/rules/{objectID}` |
| `saveRules` | `POST /1/indexes/{index}/rules/batch` |
| `getRule` | `GET /1/indexes/{index}/rules/{objectID}` |
| `searchRules` | `POST /1/indexes/{index}/rules/search` |
| `deleteRule` | `DELETE /1/indexes/{index}/rules/{objectID}` |
| `clearRules` | `POST /1/indexes/{index}/rules/clear` |

**Synonyms**

| MCP tool | REST |
|----------|------|
| `saveSynonym` | `PUT /1/indexes/{index}/synonyms/{objectID}` |
| `saveSynonyms` | `POST /1/indexes/{index}/synonyms/batch` |
| `getSynonym` | `GET /1/indexes/{index}/synonyms/{objectID}` |
| `searchSynonyms` | `POST /1/indexes/{index}/synonyms/search` |
| `deleteSynonym` | `DELETE /1/indexes/{index}/synonyms/{objectID}` |
| `clearSynonyms` | `POST /1/indexes/{index}/synonyms/clear` |

**Dictionaries** (app-wide, path uses literal `*`)

| MCP tool | REST |
|----------|------|
| `batchDictionaryEntries` | `POST /1/dictionaries/{dictionary}/batch` |
| `searchDictionaryEntries` | `POST /1/dictionaries/{dictionary}/search` |
| `getDictionaryLanguages` | `GET /1/dictionaries/*/languages` |
| `getDictionarySettings` | `GET /1/dictionaries/*/settings` |
| `setDictionarySettings` | `PUT /1/dictionaries/*/settings` |

**Query Suggestions** (host `query-suggestions.{region}.algolia.com`, needs `region`)

| MCP tool | REST |
|----------|------|
| `createQuerySuggestionsConfig` | `POST /1/configs` |
| `getQuerySuggestionsConfig` | `GET /1/configs/{indexName}` |
| `listQuerySuggestionsConfigs` | `GET /1/configs` |
| `updateQuerySuggestionConfig` | `PUT /1/configs/{indexName}` |
| `deleteQuerySuggestionConfig` | `DELETE /1/configs/{indexName}` |
| `getQuerySuggestionConfigStatus` | `GET /1/configs/{indexName}/status` |
| `getQuerySuggestionLogFile` | `GET /1/logs/{indexName}` |
| `customQuerySuggestionGet/Post/Put/Delete` | passthrough | `[UNVERIFIED]` |

## Analytics — `05-analytics-api.md` (host `analytics.{region}.algolia.com`, `/2/`)

| MCP tool | REST |
|----------|------|
| `getTopSearches` | `GET /2/searches` |
| `getSearchesCount` | `GET /2/searches/count` |
| `getSearchesNoResults` | `GET /2/searches/noResults` |
| `getSearchesNoClicks` | `GET /2/searches/noClicks` |
| `getTopHits` | `GET /2/hits` |
| `getTopFilterAttributes` | `GET /2/filters` |
| `getTopFilterForAttribute` | `GET /2/filters/{attribute}` |
| `getTopFiltersNoResults` | `GET /2/filters/noResults` |
| `getTopCountries` | `GET /2/countries` |
| `getUsersCount` | `GET /2/users/count` |
| `getNoResultsRate` | `GET /2/searches/noResultRate` |
| `getNoClickRate` | `GET /2/searches/noClickRate` |
| `getClickThroughRate` | `GET /2/clicks/clickThroughRate` |
| `getConversionRate` | `GET /2/conversions/conversionRate` |
| `getPurchaseRate` | `GET /2/conversions/purchaseRate` |
| `getAddToCartRate` | `GET /2/conversions/addToCartRate` |
| `getAverageClickPosition` | `GET /2/clicks/averageClickPosition` |
| `getClickPositions` | `GET /2/clicks/positions` |
| `getRevenue` | `GET /2/conversions/revenue` |
| `getStatus` (analytics) | `GET /2/status` |
| `getTopUserIds` | ⚠️ MCM `GET /1/clusters/mapping/top`, not analytics |

## Engagement — `06-engagement-apis.md`

**Insights / Events** (host `insights.{region}.algolia.io`)

| MCP tool | REST |
|----------|------|
| *(none — no MCP tool)* | `POST /1/events` ← send click/conversion/view |

**Recommend** (Search hosts)

| MCP tool | REST |
|----------|------|
| `getRecommendations` | `POST /1/indexes/*/recommendations` |
| `getRecommendStatus` | `GET /1/indexes/{index}/recommend/task/{taskID}` |
| `batchRecommendRules` | `POST /1/indexes/{index}/{model}/recommend/rules/batch` |
| `getRecommendRule` | `GET .../recommend/rules/{objectID}` |
| `searchRecommendRules` | `POST .../recommend/rules/search` |
| `deleteRecommendRule` | `DELETE .../recommend/rules/{objectID}` |

**A/B Testing** (host `analytics.algolia.com`, `/2/abtests`)

| MCP tool | REST |
|----------|------|
| `addABTests` | `POST /2/abtests` |
| `listABTests` | `GET /2/abtests` |
| `getABTest` | `GET /2/abtests/{id}` |
| `stopABTest` | `POST /2/abtests/{id}/stop` |
| `deleteABTest` | `DELETE /2/abtests/{id}` |
| `estimateABTest` | `POST /2/abtests/estimate` |
| `scheduleABTest` | `POST /2/abtests/schedule` `[UNVERIFIED]` |

**Personalization** (host `personalization.{region}.algolia.com`)

| MCP tool | REST |
|----------|------|
| `getUserInfo` | `GET /1/profiles/personalization/{userToken}` `[UNVERIFIED shape]` |
| *(set/get strategy — see file)* | `GET\|POST /1/strategies/personalization` |

## Ingestion / Connectors — `07-ingestion-connectors-api.md` (host `data.{region}.algolia.com`)

**Sources:** `createSource` `getSource` `getSources` `listSources` `updateSource` `deleteSource` `searchSource s` `validateSource` `validateSourceBeforeUpdate` `triggerDockerSourceDiscover` `runSource` → `/1/sources*`
**Destinations:** `createDestination` `getDestination` `listDestinations` `updateDestination` `deleteDestination` `searchDestinations` → `/1/destinations*`
**Tasks (v2):** `createTask` `listTasks` `searchTasks` `updateTask` `deleteTask` `runTask` `enableTask` `disableTask` `pushTask` `getIngestionTask` → `/2/tasks*`
**Tasks (v1):** `createTaskV1` `listTasksV1` `searchTasksV1` `updateTaskV1` `deleteTaskV1` `runTaskV1` `enableTaskV1` `disableTaskV1` → `/1/tasks*` `[some UNVERIFIED]`
**Transformations:** `createTransformation` `getTransformation` `listTransformations` `searchTransformations` `updateTransformation` `deleteTransformation` `tryTransformation` `tryTransformationBeforeUpdate` → `/1/transformations*`
**Authentications:** `createAuthentication` `getAuthentication` `listAuthentications` `searchAuthentications` `updateAuthentication` `deleteAuthentication` → `/1/authentications*`
**Observability:** `getRun` `listRuns` → `/1/runs*`; `getEvent` `listEvents` → `/1/runs/{runID}/events*` ⚠️ Ingestion, not Insights
**Collections** (separate merchandising product, not Ingestion): `listCollections` `getCollection` `upsertCollection` `commitCollection` `deleteCollection` `[UNVERIFIED REST]`

## Operations & Security — `08-ops-security-api.md`

**Monitoring** (host `status.algolia.com`, mostly public)

| MCP tool | REST |
|----------|------|
| `getClustersStatus` | `GET /1/status` |
| `getClusterStatus` | `GET /1/status/{cluster}` |
| `getIncidents` | `GET /1/incidents` |
| `getClusterIncidents` | `GET /1/incidents/{cluster}` |
| `getServers` | `GET /1/inventory/servers` |
| `getLatency` | `GET /1/latency/{servers}` |
| `getReachability` | `GET /1/reachability/{servers}/probes` |
| `getIndexingTime` | `GET /1/indexing/{servers}` |
| `getMetrics` | `GET /1/infrastructure/{metric}/period/{period}` (key) |

**Usage / Metrics** (host `usage.algolia.com`)

| MCP tool | REST |
|----------|------|
| `retrieveMetricsDaily` | `/1/usage/...` `[UNVERIFIED path]` |
| `retrieveApplicationMetricsHourly` | `[UNVERIFIED path]` |
| `retrieveMetricsRegistry` | `[UNVERIFIED path]` |
| `getApplications` | `[UNVERIFIED]` |

**Multi-Cluster Management** (indexing host, `/1/clusters`)

| MCP tool | REST |
|----------|------|
| `listClusters` | `GET /1/clusters` |
| `assignUserId` | `POST /1/clusters/mapping` |
| `batchAssignUserIds` | `POST /1/clusters/mapping/batch` |
| `getUserId` | `GET /1/clusters/mapping/{userID}` |
| `removeUserId` | `DELETE /1/clusters/mapping/{userID}` |
| `listUserIds` | `GET /1/clusters/mapping` |
| `searchUserIds` | `POST /1/clusters/mapping/search` |
| `getTopUserIds` | `GET /1/clusters/mapping/top` |
| `hasPendingMappings` | `GET /1/clusters/mapping/pending` |

**API Keys** (indexing host, `/1/keys`)

| MCP tool | REST |
|----------|------|
| `addApiKey` | `POST /1/keys` |
| `getApiKey` | `GET /1/keys/{key}` |
| `updateApiKey` | `PUT /1/keys/{key}` |
| `deleteApiKey` | `DELETE /1/keys/{key}` |
| `restoreApiKey` | `POST /1/keys/{key}/restore` |
| `listApiKeys` | `GET /1/keys` |

**Logs**

| MCP tool | REST |
|----------|------|
| `getLogs` | `GET /1/logs` |
