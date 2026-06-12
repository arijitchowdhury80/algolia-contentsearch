#!/usr/bin/env node
/**
 * Apply the v0 Case-3 index optimization to `visibility_www_tuned` on VVKSSPDMJX.
 * This is the STARTING config the Autocorrect loop will later mutate. v0 targets
 * the known keyword-retrieval weakness (strict AND-match → thin recall on NL):
 *   - removeStopWords / ignorePlurals / queryLanguages: better NL keyword matching
 *   - removeWordsIfNoResults: allOptional: recover when a strict match yields nothing
 *   - domain synonyms: map Algolia vocabulary (typo↔typing mistakes, vector↔neural, …)
 *
 * Admin key, node fetch (trusts the cert chain python's bundle rejects). Reads ../../.env.local.
 * READ-ONLY on the live incumbent app — only writes our own visibility_www_tuned on VVKSSPDMJX.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENV = {};
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('='); ENV[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const APP = ENV['ARIJIT-TEST_APP_ID'];
const KEY = ENV['ARIJIT-TEST_ADMIN_API_KEY'];
const INDEX = 'visibility_www_tuned';

async function call(method, path, body) {
  const res = await fetch(`https://${APP}.algolia.net${path}`, {
    method,
    headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': KEY, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function waitTask(taskID) {
  for (let i = 0; i < 60; i++) {
    const { json } = await call('GET', `/1/indexes/${INDEX}/task/${taskID}`);
    if (json.status === 'published') return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

const SETTINGS = {
  removeStopWords: ['en'],
  ignorePlurals: ['en'],
  queryLanguages: ['en'],
  removeWordsIfNoResults: 'allOptional',
};

const SYNONYMS = [
  ['typo tolerance', 'typing mistakes', 'typos', 'misspellings'],
  ['vector search', 'neural search', 'neuralsearch', 'semantic search'],
  ['documentation', 'docs'],
  ['recommendations', 'recommend', 'recommended items'],
  ['query suggestions', 'suggested searches', 'autocomplete suggestions'],
  ['personalization', 'personalisation'],
  ['ranking', 'relevance', 'sorting results'],
].map((syns, n) => ({ objectID: `v0-syn-${n}`, type: 'synonym', synonyms: syns }));

console.log(`[1/4] PUT settings on ${INDEX} ...`);
const s = await call('PUT', `/1/indexes/${INDEX}/settings`, SETTINGS);
console.log(`  HTTP ${s.status}`);
if (s.status !== 200) { console.log(JSON.stringify(s.json).slice(0, 800)); process.exit(1); }
await waitTask(s.json.taskID);

console.log(`[2/4] batch ${SYNONYMS.length} synonyms ...`);
const sy = await call('POST', `/1/indexes/${INDEX}/synonyms/batch?replaceExistingSynonyms=false`, SYNONYMS);
console.log(`  HTTP ${sy.status}`);
if (sy.status !== 200) { console.log(JSON.stringify(sy.json).slice(0, 800)); process.exit(1); }
await waitTask(sy.json.taskID);

console.log(`[3/4] confirm settings ...`);
const g = await call('GET', `/1/indexes/${INDEX}/settings`);
console.log(`  removeStopWords=${JSON.stringify(g.json.removeStopWords)} ignorePlurals=${JSON.stringify(g.json.ignorePlurals)} removeWordsIfNoResults=${g.json.removeWordsIfNoResults}`);

console.log(`[4/4] retrieval probe (full-NL queries that strict-match drops) ...`);
for (const q of ['how do I handle typing errors in search', 'does algolia do semantic vector search']) {
  const r = await call('POST', `/1/indexes/${INDEX}/query`, { query: q, hitsPerPage: 3 });
  console.log(`  "${q}" → nbHits=${r.json.nbHits} top=${(r.json.hits?.[0]?.title ?? '-').slice(0, 60)}`);
}
console.log('Done. visibility_www_tuned optimized (v0).');
