#!/usr/bin/env node
/**
 * Phase 1 (neural) — push a substantial, RELEVANCE-FAITHFUL event stream to the two neural
 * indices to (a) open the "412 SemanticSearch: no events" gate and (b) give NeuralSearch real
 * query→result signal (clicks/conversions on the genuine top hits for real Algolia queries).
 * Run this EARLY; aggregation is async (proven Phase 0). enable_neural.mjs polls + flips the mode.
 *
 * Read receipt (docs/algolia-api/06): POST /1/events @ insights.algolia.io (06:33); click-after-
 * search needs eventType,eventName,index,userToken,objectIDs,queryID,positions with
 * positions.length===objectIDs.length (06:59,65); queryID from search w/ clickAnalytics:true;
 * <=1000 events/request, <=20 objectIDs/event (06:40). Reads ../../.env.local.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENV = {};
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('='); ENV[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const APP = ENV['ALGOLIA_APP_ID'];
const ADMIN = ENV['ALGOLIA_ADMIN_API_KEY'];
const NEURAL = ['AC2_WWW_SINGLE_NEURAL', 'AC2_WWW_MULTI_NEURAL'];

const QUERIES = [
  'typo tolerance', 'neural search', 'vector search', 'semantic search', 'faceted search',
  'query suggestions', 'autocomplete', 'personalization', 'custom ranking', 'relevance tuning',
  'instantsearch react', 'instantsearch vue', 'javascript api client', 'python api client',
  'synonyms', 'stop words', 'ignore plurals', 'query rules', 'merchandising', 'dynamic re-ranking',
  'ab testing', 'click analytics', 'send events', 'insights api', 'recommend', 'related products',
  'trending items', 'api keys', 'secured api keys', 'security best practices', 'records limit',
  'pricing plans', 'index settings', 'searchable attributes', 'attributes for faceting',
  'numeric filters', 'filtering', 'sorting results', 'pagination', 'highlighting', 'snippeting',
  'multi index search', 'federated search', 'geo search', 'distinct deduplication', 'replicas',
  'crawler', 'ingestion connectors', 'shopify integration', 'how to add search to a react app',
];
const USERS = Array.from({ length: 10 }, (_, i) => `ac2-seed-user-${i}`);

async function call(host, method, path, body) {
  const res = await fetch(`${host}${path}`, {
    method,
    headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': ADMIN, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json };
}
const SEARCH = `https://${APP}.algolia.net`;
const INSIGHTS = 'https://insights.algolia.io';

async function mapLimit(items, limit, fn) {
  const out = []; let idx = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

for (const index of NEURAL) {
  console.log(`\n=== ${index} ===`);
  const tasks = [];
  for (const u of USERS) for (const q of QUERIES) tasks.push({ u, q });
  let searched = 0;
  const events = (await mapLimit(tasks, 12, async ({ u, q }) => {
    const s = await call(SEARCH, 'POST', `/1/indexes/${index}/query`, { query: q, clickAnalytics: true, hitsPerPage: 5 });
    const qid = s.json.queryID; const hits = s.json.hits ?? [];
    if (!qid || !hits.length) return [];
    searched++;
    const ev = [];
    // click the genuine #1 result (faithful signal)
    ev.push({ eventType: 'click', eventName: 'Result Clicked', index, userToken: u, queryID: qid, objectIDs: [hits[0].objectID], positions: [1] });
    // ~40% also convert on #1; ~30% also click #2 (realistic depth)
    if (hits[0] && Math.abs(hashStr(u + q)) % 10 < 4) ev.push({ eventType: 'conversion', eventName: 'Result Saved', index, userToken: u, queryID: qid, objectIDs: [hits[0].objectID] });
    if (hits[1] && Math.abs(hashStr(q + u)) % 10 < 3) ev.push({ eventType: 'click', eventName: 'Result Clicked', index, userToken: u, queryID: qid, objectIDs: [hits[1].objectID], positions: [2] });
    return ev;
  })).flat();
  console.log(`    ${searched}/${tasks.length} searches returned hits → ${events.length} events built`);
  let pushed = 0;
  for (let i = 0; i < events.length; i += 1000) {
    const slice = events.slice(i, i + 1000);
    const ins = await call(INSIGHTS, 'POST', '/1/events', { events: slice });
    if (ins.status === 200) pushed += slice.length;
    else console.log(`    push batch → HTTP ${ins.status} ${JSON.stringify(ins.json).slice(0, 200)}`);
  }
  console.log(`    pushed ${pushed} events to ${index}`);
}

// deterministic small hash (no Math.random — reproducible)
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

console.log('\n──────── events seeded. Aggregation is async — run enable_neural.mjs to poll + flip mode:neuralSearch.');
