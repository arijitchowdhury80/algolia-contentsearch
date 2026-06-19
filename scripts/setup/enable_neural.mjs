#!/usr/bin/env node
/**
 * Phase 1 (deferred) — flip mode:neuralSearch on the two neural indices once events aggregate.
 * NeuralSearch gates on aggregated events (proven Phase 0: 412 "SemanticSearch: no events" on a
 * fresh index). seed_neural_events.mjs pushed the signal; aggregation is async. This polls/flips:
 *   PUT /1/indexes/{ix}/settings {mode:'neuralSearch'} → 200 = enabled; 412 = still aggregating.
 * Re-run periodically until both report enabled. exit 0 iff both neural. Reads ../../.env.local.
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
  if (!taskID) return;
  for (let i = 0; i < 60; i++) {
    const { json } = await call('GET', `/1/indexes/${ix}/task/${taskID}`);
    if (json.status === 'published') return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

let allOk = true;
for (const ix of NEURAL) {
  const cur = await call('GET', `/1/indexes/${ix}/settings`);
  if (cur.json.mode === 'neuralSearch') { console.log(`✅ ${ix}: already neuralSearch`); continue; }
  const put = await call('PUT', `/1/indexes/${ix}/settings`, { mode: 'neuralSearch' });
  if (put.status === 200) {
    await waitTask(ix, put.json.taskID);
    const get = await call('GET', `/1/indexes/${ix}/settings`);
    if (get.json.mode === 'neuralSearch') console.log(`✅ ${ix}: neuralSearch ENABLED`);
    else { console.log(`⚠ ${ix}: PUT 200 but mode=${get.json.mode}`); allOk = false; }
  } else if (put.status === 412) {
    console.log(`⏳ ${ix}: still aggregating (412 "${put.json.message}") — re-run later`);
    allOk = false;
  } else {
    console.log(`❌ ${ix}: HTTP ${put.status} ${JSON.stringify(put.json).slice(0, 200)}`);
    allOk = false;
  }
}
process.exit(allOk ? 0 : 2);
