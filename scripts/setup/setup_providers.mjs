#!/usr/bin/env node
/**
 * Phase 0.3 — register OUR OpenAI + Gemini providers on CENTRAL (0EXRPAXB56). Agent Studio
 * providers are per-app; the old VVKSSPDMJX provider.ts IDs are invalid here. We create our
 * own (not reuse other teams') so we control the key + quota and the FAIRNESS INVARIANT holds.
 *
 * Read receipt: create_agents.py:61-71 — POST /agent-studio/1/providers
 * {name, providerName:'openai'|'google_genai', input:{apiKey, baseUrl}} → {id}; idempotent
 * via GET /agent-studio/1/providers (reuse by name). Reads + appends ../../.env.local.
 *   --check : just print the IDs we recorded + a 1-token OpenAI health hint.
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENV_PATH = join(ROOT, '.env.local');
const ENV = {};
for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('='); ENV[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const APP = ENV['ALGOLIA_APP_ID'];
const ADMIN = ENV['ALGOLIA_ADMIN_API_KEY'];
const mask = (k) => (k ? `…${String(k).slice(-6)}` : '(none)');

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
function persist(key, val) {
  const env = readFileSync(ENV_PATH, 'utf8');
  if (new RegExp(`^${key}=`, 'm').test(env)) { console.log(`     ${key} already in .env.local`); return; }
  appendFileSync(ENV_PATH, `\n${key}=${val}\n`);
  console.log(`     wrote ${key}=${val} to .env.local`);
}

const { json: provs } = await call('GET', '/agent-studio/1/providers');
const existing = provs.data ?? [];
// Agent Studio VALIDATES the provider key on creation (test call). A dead key (e.g. OpenAI
// 429 quota) rejects the create — that is expected per the provider policy (prefer OpenAI,
// fall back to Gemini). So OpenAI is best-effort; Gemini is REQUIRED.
async function ensure(name, providerName, input, { required = true } = {}) {
  const found = existing.find((p) => p.name === name);
  if (found) { console.log(`  reuse ${name} → ${found.id}`); return found.id; }
  const { status, json } = await call('POST', '/agent-studio/1/providers', { name, providerName, input });
  if (![200, 201].includes(status)) {
    const msg = `create ${name} → HTTP ${status}: ${JSON.stringify(json).slice(0, 200)}`;
    if (required) { console.error(`  ❌ ${msg}`); process.exit(1); }
    console.log(`  ⚠ ${msg} (non-fatal — key likely dead; skipping)`);
    return null;
  }
  console.log(`  created ${name} → ${json.id} (key ${mask(input.apiKey)})`);
  return json.id;
}

console.log(`Providers on ${APP} (creating OUR ac2-* providers):`);
const openaiId = await ensure('ac2-openai', 'openai', { apiKey: ENV['OPENAI_API_KEY'], baseUrl: 'https://api.openai.com/v1' }, { required: false });
const geminiId = await ensure('ac2-gemini', 'google_genai', { apiKey: ENV['GOOGLE_API_KEY'], baseUrl: null }, { required: true });
if (openaiId) persist('ALGOLIA_PROVIDER_OPENAI_ID', openaiId);
persist('ALGOLIA_PROVIDER_GEMINI_ID', geminiId);
// Pin the working provider per FAIRNESS INVARIANT. OpenAI dead → Gemini (matches project state).
const pinnedProvider = openaiId ? 'openai' : 'gemini';
const pinnedModel = openaiId ? 'gpt-5.2' : 'gemini-2.5-pro';
persist('ALGOLIA_AGENT_PROVIDER', pinnedProvider);
persist('ALGOLIA_AGENT_MODEL', pinnedModel);
console.log(`\nac2-openai=${openaiId ?? '(unavailable — quota)'}\nac2-gemini=${geminiId}`);
console.log(`PINNED (fairness invariant — same on ALL agents + coordinator): provider=${pinnedProvider} model=${pinnedModel}`);
