#!/usr/bin/env node
/**
 * Phase 0.3 discovery — learn the Agent Studio wire protocol on CENTRAL (0EXRPAXB56)
 * so we can CREATE agents + register/reference providers. READ-ONLY: lists existing
 * agents/providers and dumps one agent's full shape (the create-body template).
 * Touches nothing. Reads ../../.env.local. Other teams' agents are inspected read-only only.
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

async function call(method, path, body) {
  const res = await fetch(`https://${APP}.algolia.net${path}`, {
    method,
    headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': ADMIN, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : { raw: text }; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

// providers ------------------------------------------------------------------
console.log('=== GET /agent-studio/1/providers ===');
for (const p of ['/agent-studio/1/providers', '/agent-studio/1/llm-providers', '/agent-studio/1/models']) {
  const r = await call('GET', p);
  console.log(`${p} → HTTP ${r.status}`);
  if (r.status === 200) { console.log(JSON.stringify(r.json, null, 2).slice(0, 1500)); break; }
}

// agents list ----------------------------------------------------------------
console.log('\n=== GET /agent-studio/1/agents ===');
const list = await call('GET', '/agent-studio/1/agents');
console.log(`HTTP ${list.status}`);
const arr = Array.isArray(list.json) ? list.json : (list.json.agents ?? list.json.items ?? list.json.results ?? []);
console.log(`top-level keys: ${Object.keys(list.json).join(', ') || '(array)'}; agent count: ${arr.length}`);
const first = arr[0];
if (first) {
  const id = first.id ?? first.objectID ?? first.agentId;
  console.log(`first agent: id=${id} name=${first.name} keys=[${Object.keys(first).join(', ')}]`);
  // full shape of one agent = the create-body template
  console.log('\n=== GET /agent-studio/1/agents/{id} (full shape — create-body template) ===');
  const full = await call('GET', `/agent-studio/1/agents/${id}`);
  console.log(`HTTP ${full.status}`);
  // redact instructions body (can be long); show structure
  const redacted = { ...full.json };
  if (typeof redacted.instructions === 'string') redacted.instructions = `<${redacted.instructions.length} chars>`;
  console.log(JSON.stringify(redacted, null, 2).slice(0, 2500));
}
