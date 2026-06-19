#!/usr/bin/env node
/** Phase 1 acceptance — verify the 4 CENTRAL indices. Reads ../../.env.local. */
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
const ALL = ['AC2_WWW_SINGLE_KEYWORD', 'AC2_WWW_MULTI_KEYWORD', 'AC2_WWW_SINGLE_NEURAL', 'AC2_WWW_MULTI_NEURAL'];

async function call(method, path, body) {
  const res = await fetch(`https://${APP}.algolia.net${path}`, {
    method, headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': ADMIN, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return (await res.json().catch(() => ({})));
}

console.log('index                       | records | mode        | rwInr      | src=Support');
console.log('-'.repeat(82));
for (const ix of ALL) {
  const s = await call('GET', `/1/indexes/${ix}/settings`);
  const all = await call('POST', `/1/indexes/${ix}/query`, { query: 'typo tolerance', hitsPerPage: 0 });
  const sup = await call('POST', `/1/indexes/${ix}/query`, { query: '', facetFilters: ['source:Support'], hitsPerPage: 0 });
  const total = await call('POST', `/1/indexes/${ix}/query`, { query: '', hitsPerPage: 0 });
  console.log(`${ix.padEnd(27)} | ${String(total.nbHits).padStart(7)} | ${(s.mode ?? 'keyword').padEnd(11)} | ${String(s.removeWordsIfNoResults ?? '-').padEnd(10)} | ${sup.nbHits} (q'typo tolerance' hits=${all.nbHits})`);
}
console.log('\nExpect: ~8103 records each; SINGLE_KEYWORD rwInr=allOptional; src=Support ≈1691; neural mode pending until enable_neural.');
