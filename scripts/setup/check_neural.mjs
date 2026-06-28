#!/usr/bin/env node
/**
 * Phase 0 — NeuralSearch enablement investigation (gates Phase 1 P3/P4).
 * The capability probe hit: "an existing index with events is required to enable
 * Neural Search". Determine the REAL requirement empirically:
 *   (1) list indices; find any already in mode:neuralSearch (proves entitlement + shows pattern)
 *   (2) create a real index WITH a record, wait, then try mode:neuralSearch, read back
 *   (3) report whether records-only is enough, or events are truly required
 * Touches only AC2_PROBE_DELETEME. Reads ../../.env.local.
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

async function call(method, path, body) {
  const res = await fetch(`https://${APP}.algolia.net${path}`, {
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
    const { json } = await call('GET', `/1/indexes/${ix}/task/${taskID}`);
    if (json.status === 'published') return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// (1) which existing indices are neural? -------------------------------------
console.log('[1] scanning existing indices for mode:neuralSearch …');
const list = await call('GET', '/1/indexes?hitsPerPage=1000');
const items = list.json.items ?? [];
console.log(`    ${items.length} indices total on app ${APP}`);
let neuralFound = 0, checked = 0;
for (const it of items) {
  const name = it.name;
  // only sample likely-neural / reference indices to limit calls
  if (!/atlas|ledger|neural|enterprise|central/i.test(name)) continue;
  checked++;
  const s = await call('GET', `/1/indexes/${name}/settings`);
  const mode = s.json.mode ?? '(unset=keyword)';
  console.log(`    • ${name}: mode=${mode}${s.json.semanticSearch ? ' semanticSearch=' + JSON.stringify(s.json.semanticSearch) : ''}`);
  if (mode === 'neuralSearch') neuralFound++;
}
console.log(`    checked ${checked} candidate indices; ${neuralFound} in neuralSearch mode`);

// (2) records-first enablement test ------------------------------------------
console.log(`\n[2] create ${PROBE} WITH a record, then try mode:neuralSearch …`);
await call('DELETE', `/1/indexes/${PROBE}`); // clean any leftover
const add = await call('PUT', `/1/indexes/${PROBE}/probe1`, { objectID: 'probe1', title: 'typo tolerance', body: 'Algolia typo tolerance docs', source: 'Documentation' });
console.log(`    add record → HTTP ${add.status}`);
if (add.json.taskID) await waitTask(PROBE, add.json.taskID);
const put = await call('PUT', `/1/indexes/${PROBE}/settings`, { mode: 'neuralSearch' });
console.log(`    PUT mode:neuralSearch → HTTP ${put.status} ${put.status !== 200 ? JSON.stringify(put.json).slice(0, 300) : ''}`);
if (put.json.taskID) await waitTask(PROBE, put.json.taskID);
const get = await call('GET', `/1/indexes/${PROBE}/settings`);
console.log(`    read back: mode=${get.json.mode ?? '(unset)'}`);

console.log('\n──────── VERDICT');
if (put.status === 200 && get.json.mode === 'neuralSearch') {
  console.log('✅ records-only is ENOUGH: a populated index can enable neuralSearch (no events needed).');
} else {
  console.log('⚠ records-only NOT enough — neural enablement needs more (events?). Detail above.');
  console.log(`   raw PUT response: ${JSON.stringify(put.json).slice(0, 400)}`);
}
const del = await call('DELETE', `/1/indexes/${PROBE}`);
console.log(`(cleanup: DELETE ${PROBE} → HTTP ${del.status})`);
