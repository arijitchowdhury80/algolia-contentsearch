#!/usr/bin/env node
/**
 * Phase 0 Task 0.1 — CENTRAL (0EXRPAXB56) capability probe.
 *
 * Verifies the build can proceed BEFORE any irreversible work:
 *   (a) admin key ACL ⊇ {addObject, editSettings, deleteIndex}     [GET /1/keys/{key}]
 *   (b) NeuralSearch entitlement + write  [PUT settings mode:neuralSearch → read back → delete]
 *   (c) Agent Studio reachable             [GET /agent-studio/1/agents, 200]
 *   (d) browser search-only key            [POST /1/keys; on 403 fall back to ALGOLIA_SEARCH_API_KEY]
 *
 * Read receipt (docs/algolia-api/): set settings 03:78-99 (PUT /1/indexes/{ix}/settings, ACL
 * editSettings, async taskID); mode 03:254 ("neuralSearch only works where Algolia enabled it");
 * keys 08:387,431-469 (GET /1/keys/{key}, POST /1/keys {acl,indexes,description}); Agent Studio
 * GET /agent-studio/1/agents/{id} + User-Agent header from the live agent_admin.mjs:58,106.
 *
 * Touches ONLY its throwaway index AC2_PROBE_DELETEME. Uses node fetch (trusts the cert chain
 * python's bundle rejects). Reads ../../.env.local. NEVER prints a full key value.
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENV_PATH = join(ROOT, '.env.local');
const ENV = {};
for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('='); ENV[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const APP = ENV['ALGOLIA_APP_ID'];
const ADMIN = ENV['ALGOLIA_ADMIN_API_KEY'];
const READ = ENV['ALGOLIA_SEARCH_API_KEY']; // existing read/search key (plan calls it ALGOLIA_API_KEY)
const PROBE_INDEX = 'AC2_PROBE_DELETEME';
const TARGET_INDICES = [
  'AC2_WWW_SINGLE_KEYWORD', 'AC2_WWW_MULTI_KEYWORD',
  'AC2_WWW_SINGLE_NEURAL', 'AC2_WWW_MULTI_NEURAL',
];
const REQUIRED_ACL = ['addObject', 'editSettings', 'deleteIndex'];

if (!APP || !ADMIN) {
  console.error('FATAL: missing ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY in .env.local');
  process.exit(1);
}
const mask = (k) => (k ? `…${k.slice(-4)}` : '(none)');

async function call(method, path, body, { host = `https://${APP}.algolia.net`, key = ADMIN } = {}) {
  const res = await fetch(`${host}${path}`, {
    method,
    headers: {
      'X-Algolia-Application-Id': APP,
      'X-Algolia-API-Key': key,
      'Content-Type': 'application/json',
      'User-Agent': 'curl/8.4.0',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function waitTask(taskID) {
  for (let i = 0; i < 60; i++) {
    const { json } = await call('GET', `/1/indexes/${PROBE_INDEX}/task/${taskID}`);
    if (json.status === 'published') return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const results = [];
const pass = (k, msg) => { results.push({ k, ok: true, msg }); console.log(`  ✅ ${k}: ${msg}`); };
const fail = (k, msg) => { results.push({ k, ok: false, msg }); console.log(`  ❌ ${k}: ${msg}`); };

console.log(`CENTRAL probe · app=${APP} · adminKey=${mask(ADMIN)}\n`);

// (a) admin key ACL ----------------------------------------------------------
console.log('[a] admin key ACL …');
{
  const { status, json } = await call('GET', `/1/keys/${ADMIN}`);
  if (status !== 200) {
    fail('admin-acl', `GET /1/keys/{admin} → HTTP ${status} ${JSON.stringify(json).slice(0, 200)}`);
  } else {
    const acl = json.acl ?? [];
    const missing = REQUIRED_ACL.filter((a) => !acl.includes(a));
    if (missing.length) fail('admin-acl', `missing required ACL: ${missing.join(', ')} (have: ${acl.join(', ')})`);
    else pass('admin-acl', `has ${REQUIRED_ACL.join(', ')} (addApiKey present: ${acl.includes('addApiKey')})`);
  }
}

// (b) NeuralSearch entitlement + write ---------------------------------------
console.log('[b] NeuralSearch + write (throwaway index) …');
{
  const put = await call('PUT', `/1/indexes/${PROBE_INDEX}/settings`, { mode: 'neuralSearch' });
  if (put.status !== 200) {
    fail('neural', `PUT settings → HTTP ${put.status} ${JSON.stringify(put.json).slice(0, 200)}`);
  } else {
    await waitTask(put.json.taskID);
    const get = await call('GET', `/1/indexes/${PROBE_INDEX}/settings`);
    if (get.json.mode === 'neuralSearch') pass('neural', `mode persisted as neuralSearch → entitlement confirmed`);
    else fail('neural', `mode read back as "${get.json.mode}" (expected neuralSearch) → NeuralSearch NOT entitled on this app`);
    const del = await call('DELETE', `/1/indexes/${PROBE_INDEX}`);
    console.log(`     (cleanup: DELETE ${PROBE_INDEX} → HTTP ${del.status})`);
  }
}

// (c) Agent Studio reachable --------------------------------------------------
console.log('[c] Agent Studio reachability …');
{
  const { status, json } = await call('GET', `/agent-studio/1/agents`);
  if (status === 200) {
    const n = Array.isArray(json) ? json.length : Array.isArray(json?.agents) ? json.agents.length : '?';
    pass('agent-studio', `GET /agent-studio/1/agents → 200 (existing agents: ${n})`);
  } else {
    fail('agent-studio', `GET /agent-studio/1/agents → HTTP ${status} ${JSON.stringify(json).slice(0, 200)}`);
  }
}

// (d) browser search-only key (mint or fall back) ----------------------------
console.log('[d] browser search-only key …');
let browserKeyChosen = null, browserKeySource = null;
{
  const add = await call('POST', `/1/keys`, {
    acl: ['search'],
    indexes: TARGET_INDICES,
    description: 'AC2 lab browser search-only',
  });
  if (add.status === 200 && add.json.key) {
    browserKeyChosen = add.json.key; browserKeySource = 'minted (scoped to 4 AC2 indices)';
    pass('browser-key', `minted search-only key ${mask(browserKeyChosen)} scoped to 4 indices`);
  } else if (READ) {
    browserKeyChosen = READ; browserKeySource = `fallback ALGOLIA_SEARCH_API_KEY (addApiKey → HTTP ${add.status})`;
    pass('browser-key', `addApiKey unavailable (HTTP ${add.status}) → fallback to existing read key ${mask(READ)} [TODO: mint tighter key in dashboard]`);
  } else {
    fail('browser-key', `addApiKey → HTTP ${add.status} and no ALGOLIA_SEARCH_API_KEY fallback present`);
  }
}
// persist VITE_ALGOLIA_SEARCH_API_KEY (append if absent) — value stays out of transcript
if (browserKeyChosen) {
  const env = readFileSync(ENV_PATH, 'utf8');
  if (!/^VITE_ALGOLIA_SEARCH_API_KEY=/m.test(env)) {
    appendFileSync(ENV_PATH, `\nVITE_ALGOLIA_SEARCH_API_KEY=${browserKeyChosen}\n`);
    console.log(`     wrote VITE_ALGOLIA_SEARCH_API_KEY=${mask(browserKeyChosen)} to .env.local (${browserKeySource})`);
  } else {
    console.log(`     VITE_ALGOLIA_SEARCH_API_KEY already present — left as-is`);
  }
}

// summary --------------------------------------------------------------------
const critical = results.filter((r) => ['admin-acl', 'neural', 'agent-studio'].includes(r.k));
const allCriticalOk = critical.every((r) => r.ok);
console.log('\n' + '─'.repeat(60));
if (allCriticalOk) {
  console.log(`CENTRAL OK · admin write ACL sufficient · neuralSearch provisioned · Agent Studio 200 · browser key set (${browserKeySource?.startsWith('minted') ? 'minted' : 'fallback'})`);
  process.exit(0);
} else {
  console.log('CENTRAL PROBE FAILED — build-critical check(s) failed:');
  for (const r of critical.filter((x) => !x.ok)) console.log(`  • ${r.k}: ${r.msg}`);
  console.log('STOP. Do not proceed to seed/agents until resolved.');
  process.exit(1);
}
