#!/usr/bin/env node
/**
 * Phase 1.2 — seed the 4 CENTRAL indices from Visibility's ALGOLIA_WWW_PROD_V2.
 *
 *   AC2_WWW_SINGLE_KEYWORD (P1) · AC2_WWW_MULTI_KEYWORD (P2)
 *   AC2_WWW_SINGLE_NEURAL  (P3) · AC2_WWW_MULTI_NEURAL  (P4)
 *
 * Seed rule (LOCKED §9): language_code:en, dedup by url keeping latest lastUpdated, ≈8,100.
 * Identical record set to all 4 (keyword vs neural differ only by config). objectID = sha1(url)
 * → idempotent + identical objectIDs across indices.
 *
 * Per-index config: all 4 inherit Visibility searchable/faceting(+source filterable)/ranking +
 * 7 synonym groups. SINGLE_KEYWORD additionally gets the Case-3 levers. NEURAL indices are
 * seeded data-only — mode:neuralSearch is set LATER by enable_neural.mjs once events aggregate
 * (PUT mode:neuralSearch 412s "no events" on a fresh index — proven Phase 0).
 *
 * Read receipt (docs/algolia-api/): browse 02/migrate pattern (POST /1/indexes/{ix}/browse cursor);
 * batch addObject (POST /1/indexes/{ix}/batch {requests:[{action:'addObject',body}]}); set settings
 * 03:78-99 (PUT /1/indexes/{ix}/settings, editSettings, async taskID); synonyms batch from
 * optimize_index.mjs:71-75. Source is READ-ONLY (browse only; never a write op).
 * Reads ../../.env.local. Node fetch + User-Agent.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { filterEnglish, dedupeByUrl, objectIdForUrl } from './seed_dedup.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENV = {};
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('='); ENV[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const SRC_APP = ENV['VISIBILITY_APP_ID'];
// search key may lack 'browse'; the write key has it. We only ever READ (browse) the source.
const SRC_KEY = ENV['VISIBILITY_WRITE_API_KEY'] || ENV['VISIBILITY_API_KEY'];
const SRC_IDX = ENV['VISIBILITY_INDEX_NAME'] || 'ALGOLIA_WWW_PROD_V2';
const DST_APP = ENV['ALGOLIA_APP_ID'];
const DST_KEY = ENV['ALGOLIA_ADMIN_API_KEY'];

const INDICES = {
  SINGLE_KEYWORD: 'AC2_WWW_SINGLE_KEYWORD',
  MULTI_KEYWORD: 'AC2_WWW_MULTI_KEYWORD',
  SINGLE_NEURAL: 'AC2_WWW_SINGLE_NEURAL',
  MULTI_NEURAL: 'AC2_WWW_MULTI_NEURAL',
};
const ALL = Object.values(INDICES);

// Case-3 keyword levers (port to SINGLE_KEYWORD only — brief §6)
const CASE3 = { removeStopWords: ['en'], ignorePlurals: ['en'], queryLanguages: ['en'], removeWordsIfNoResults: 'allOptional' };
// 7 synonym groups (from optimize_index.mjs:55-63) — may carry to every index
const SYNONYMS = [
  ['typo tolerance', 'typing mistakes', 'typos', 'misspellings'],
  ['vector search', 'neural search', 'neuralsearch', 'semantic search'],
  ['documentation', 'docs'],
  ['recommendations', 'recommend', 'recommended items'],
  ['query suggestions', 'suggested searches', 'autocomplete suggestions'],
  ['personalization', 'personalisation'],
  ['ranking', 'relevance', 'sorting results'],
].map((syns, n) => ({ objectID: `ac2-syn-${n}`, type: 'synonym', synonyms: syns }));

async function call(app, key, method, path, body) {
  const res = await fetch(`https://${app}.algolia.net${path}`, {
    method,
    headers: { 'X-Algolia-Application-Id': app, 'X-Algolia-API-Key': key, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function waitTask(app, key, index, taskID) {
  if (!taskID) return;
  for (let i = 0; i < 90; i++) {
    const { json } = await call(app, key, 'GET', `/1/indexes/${index}/task/${taskID}`);
    if (json.status === 'published') return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// 1) browse source -----------------------------------------------------------
console.log(`[1/6] browse source ${SRC_IDX} on ${SRC_APP} (READ-ONLY) …`);
let raw = [], cursor = null;
do {
  const { status, json } = await call(SRC_APP, SRC_KEY, 'POST', `/1/indexes/${SRC_IDX}/browse`, cursor ? { cursor } : { hitsPerPage: 1000 });
  if (status !== 200) { console.error(`browse failed HTTP ${status}: ${JSON.stringify(json).slice(0, 300)}`); process.exit(1); }
  raw.push(...(json.hits ?? []));
  cursor = json.cursor;
} while (cursor);
console.log(`      browsed ${raw.length} physical records`);
const hasLastUpdated = raw.some((r) => r.lastUpdated != null);
console.log(`      lastUpdated present on source records: ${hasLastUpdated} (dedup tiebreak ${hasLastUpdated ? 'uses it' : 'keeps any per url'})`);

// 2) en-filter + url-dedup + stamp objectID ----------------------------------
const en = filterEnglish(raw);
const deduped = dedupeByUrl(en).map((r) => ({ ...r, objectID: objectIdForUrl(r.url) }));
console.log(`[2/6] en=${en.length} → url-deduped=${deduped.length}`);
if (deduped.length < 7800 || deduped.length > 8400) {
  console.error(`SEED-RULE DRIFT: deduped count ${deduped.length} outside [7800, 8400]. STOP.`);
  process.exit(1);
}
const bySource = deduped.reduce((m, r) => ((m[r.source ?? '(none)'] = (m[r.source ?? '(none)'] || 0) + 1), m), {});
console.log(`      by source: ${JSON.stringify(bySource)}`);

// 3) inherit source settings, ensure `source` facetable ----------------------
console.log(`[3/6] read source settings, build base config …`);
const { json: srcSettings } = await call(SRC_APP, SRC_KEY, 'GET', `/1/indexes/${SRC_IDX}/settings`);
const base = {};
for (const k of ['searchableAttributes', 'attributesForFaceting', 'customRanking', 'ranking']) {
  if (srcSettings[k]) base[k] = srcSettings[k];
}
base.attributesForFaceting = base.attributesForFaceting ? [...base.attributesForFaceting] : [];
if (!base.attributesForFaceting.some((a) => /(^|\()source(\)|$)/.test(a))) {
  base.attributesForFaceting.push('source'); // filterable + facetable for specialist scoping + verification
}
console.log(`      base keys: ${Object.keys(base).join(', ')}; faceting includes source: ${JSON.stringify(base.attributesForFaceting).includes('source')}`);

// 4) verify-before-create on shared tenant -----------------------------------
console.log(`[4/6] verify our 4 names are free (or already ours) on ${DST_APP} …`);
const { json: idxList } = await call(DST_APP, DST_KEY, 'GET', '/1/indexes?hitsPerPage=1000');
const existingNames = new Set((idxList.items ?? []).map((i) => i.name));
for (const name of ALL) {
  if (existingNames.has(name)) console.log(`      ⚠ ${name} already exists — will UPSERT (idempotent objectIDs).`);
  else console.log(`      ✓ ${name} free`);
}

// 5) push identical record set to all 4 --------------------------------------
console.log(`[5/6] push ${deduped.length} records → 4 indices (batches of 1000) …`);
for (const name of ALL) {
  let last;
  for (let i = 0; i < deduped.length; i += 1000) {
    const slice = deduped.slice(i, i + 1000);
    const { status, json } = await call(DST_APP, DST_KEY, 'POST', `/1/indexes/${name}/batch`, { requests: slice.map((b) => ({ action: 'addObject', body: b })) });
    if (status !== 200) { console.error(`batch ${name} failed HTTP ${status}: ${JSON.stringify(json).slice(0, 200)}`); process.exit(1); }
    last = json.taskID;
  }
  await waitTask(DST_APP, DST_KEY, name, last);
  console.log(`      ${name}: ${deduped.length} records pushed`);
}

// 6) per-index config --------------------------------------------------------
console.log(`[6/6] apply per-index config …`);
for (const name of ALL) {
  const isSingleKeyword = name === INDICES.SINGLE_KEYWORD;
  const settings = isSingleKeyword ? { ...base, ...CASE3 } : { ...base };
  const { status, json } = await call(DST_APP, DST_KEY, 'PUT', `/1/indexes/${name}/settings`, settings);
  if (status !== 200) { console.error(`settings ${name} failed HTTP ${status}: ${JSON.stringify(json).slice(0, 200)}`); process.exit(1); }
  await waitTask(DST_APP, DST_KEY, name, json.taskID);
  const sy = await call(DST_APP, DST_KEY, 'POST', `/1/indexes/${name}/synonyms/batch?replaceExistingSynonyms=true`, SYNONYMS);
  await waitTask(DST_APP, DST_KEY, name, sy.json.taskID);
  console.log(`      ${name}: settings${isSingleKeyword ? ' +Case-3 levers' : ''} + ${SYNONYMS.length} synonyms${name.endsWith('NEURAL') ? '  (neural mode deferred → enable_neural.mjs)' : ''}`);
}

console.log('\n──────── seed complete. Verify with: node scripts/setup/verify_seed.mjs');
