#!/usr/bin/env node
/**
 * Phase 0 — does a query-attributed event stream flip the "412 SemanticSearch: no events"
 * gate, and how fast? Decisive test for whether neural (P3/P4) is buildable on fresh indices.
 *
 * Read receipt (docs/algolia-api/06): POST /1/events @ insights.algolia.io (06:33); body
 * {events:[...]} (06:36); click-after-search needs eventType,eventName,index,userToken,
 * objectIDs,queryID,positions, positions.length===objectIDs.length (06:59,65); queryID from a
 * search with clickAnalytics:true; query-attributed event timestamp within 1h (06:42).
 * Touches only AC2_PROBE_DELETEME (left in place for a delayed retry; delete manually after).
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
const PROBE = 'AC2_PROBE_DELETEME';

async function search(method, path, body, host = `https://${APP}.algolia.net`) {
  const res = await fetch(`${host}${path}`, {
    method,
    headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': ADMIN, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function waitTask(ix, taskID) {
  for (let i = 0; i < 60; i++) {
    const { json } = await search('GET', `/1/indexes/${ix}/task/${taskID}`);
    if (json.status === 'published') return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// 1) (re)create a small populated index ---------------------------------------
await search('DELETE', `/1/indexes/${PROBE}`);
const RECORDS = [
  { objectID: 'r1', title: 'Typo tolerance', body: 'How Algolia handles typing mistakes', source: 'Documentation' },
  { objectID: 'r2', title: 'NeuralSearch', body: 'Semantic vector search in Algolia', source: 'Documentation' },
  { objectID: 'r3', title: 'Faceted search', body: 'Filtering with facets', source: 'Developers' },
  { objectID: 'r4', title: 'Query suggestions', body: 'Autocomplete and suggested searches', source: 'Developers' },
  { objectID: 'r5', title: 'Personalization', body: 'Per-user ranking from events', source: 'Customer Stories' },
];
const batch = await search('POST', `/1/indexes/${PROBE}/batch`, { requests: RECORDS.map((r) => ({ action: 'addObject', body: r })) });
console.log(`[1] seed ${RECORDS.length} records → HTTP ${batch.status}`);
if (batch.json.taskID) await waitTask(PROBE, batch.json.taskID);

// 2) generate query-attributed click + conversion events ----------------------
const QUERIES = ['typo tolerance', 'neural search', 'faceted search', 'query suggestions', 'personalization', 'semantic', 'autocomplete', 'filtering'];
const USERS = ['u-a', 'u-b', 'u-c', 'u-d', 'u-e'];
const events = [];
let withQid = 0;
for (const u of USERS) {
  for (const q of QUERIES) {
    const s = await search('POST', `/1/indexes/${PROBE}/query`, { query: q, clickAnalytics: true, hitsPerPage: 3 });
    const qid = s.json.queryID;
    const hits = s.json.hits ?? [];
    if (!qid || !hits.length) continue;
    withQid++;
    events.push({ eventType: 'click', eventName: 'Result Clicked', index: PROBE, userToken: u, queryID: qid, objectIDs: [hits[0].objectID], positions: [1] });
    events.push({ eventType: 'conversion', eventName: 'Result Saved', index: PROBE, userToken: u, queryID: qid, objectIDs: [hits[0].objectID] });
  }
}
console.log(`[2] built ${events.length} events (${withQid} searches w/ queryID)`);
// push in batches of 1000 (limit)
let pushed = 0;
for (let i = 0; i < events.length; i += 1000) {
  const slice = events.slice(i, i + 1000);
  const ins = await search('POST', `/1/events`, { events: slice }, 'https://insights.algolia.io');
  console.log(`    push ${slice.length} → HTTP ${ins.status} ${ins.status !== 200 ? JSON.stringify(ins.json).slice(0, 200) : ''}`);
  if (ins.status === 200) pushed += slice.length;
}
console.log(`    pushed ${pushed} events total`);

// 3) immediately retry neural enablement --------------------------------------
const put = await search('PUT', `/1/indexes/${PROBE}/settings`, { mode: 'neuralSearch' });
console.log(`\n[3] retry PUT mode:neuralSearch → HTTP ${put.status} ${put.status !== 200 ? JSON.stringify(put.json).slice(0, 300) : ''}`);
if (put.json.taskID) await waitTask(PROBE, put.json.taskID);
const get = await search('GET', `/1/indexes/${PROBE}/settings`);
console.log('\n──────── VERDICT');
if (put.status === 200 && get.json.mode === 'neuralSearch') {
  console.log('✅ events IMMEDIATELY flip the gate — neural enablable right after pushing events.');
} else if (put.status === 412) {
  console.log('⏳ still 412 right after push → events need PROCESSING TIME before the gate opens.');
  console.log(`   Re-run only step 3 in a few minutes: PUT mode:neuralSearch on ${PROBE}. (index left in place w/ events.)`);
} else {
  console.log(`⚠ unexpected: HTTP ${put.status}, mode=${get.json.mode}. raw: ${JSON.stringify(put.json).slice(0, 300)}`);
}
console.log(`(NOTE: ${PROBE} left in place with events for delayed retry — delete with DELETE /1/indexes/${PROBE} when done.)`);
