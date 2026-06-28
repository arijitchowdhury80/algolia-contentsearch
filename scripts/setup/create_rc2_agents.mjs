#!/usr/bin/env node
/**
 * create_rc2_agents.mjs — create + publish the 3 RC2-cast neural agents on
 * CENTRAL (0EXRPAXB56), all on the SAME pinned Gemini provider + model
 * (FAIRNESS INVARIANT — only architecture + retrieval vary across panels).
 *
 *   3 RC2-cast agents on the MULTI_NEURAL index (multi panel P4):
 *     ac2-maverick-neural  → AC2_WWW_MULTI_NEURAL (instructions_maverick.md)
 *     ac2-elena-neural     → AC2_WWW_MULTI_NEURAL (instructions_elena.md)
 *     ac2-bruno-neural     → AC2_WWW_MULTI_NEURAL (instructions_bruno.md)
 *
 * Each agent is source-scoped to its charter via a native `filters` string on
 * the search tool (same pattern as create_central_agents.mjs). Charter sources
 * come from lab/server/src/charters.ts.
 *
 * Wire contract (Protocol Read Receipt — verified in create_central_agents.mjs):
 *   create:  POST /agent-studio/1/agents
 *            { name, instructions, model, providerId,
 *              tools:[{ name:'algolia_search_index', type:'algolia_search_index',
 *                       indices:[{ index, description, enhancedDescription, searchParameters? }] }],
 *              status:'published' }
 *   publish: POST /agent-studio/1/agents/{id}/publish {}
 *   ALL Agent Studio requests need header  User-Agent: curl/8.4.0
 *   filters string (proven shape, create_central_agents.mjs:143-151):
 *     sources.map(s => `source:"${s}"`).join(' OR ')
 *
 * SAFETY: NOTHING in this script is invoked at import time except reading env.
 * Idempotent: re-running reuses already-created ac2-*-neural agents by name.
 * Reads ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY / ALGOLIA_PROVIDER_GEMINI_ID /
 * ALGOLIA_AGENT_MODEL from .env.local; touches ONLY our ac2-*-neural agents.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENV_PATH = join(ROOT, '.env.local');

// --- env --------------------------------------------------------------------
function loadEnv() {
  const env = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const ENV = loadEnv();
const APP = ENV['ALGOLIA_APP_ID'];
const KEY = ENV['ALGOLIA_ADMIN_API_KEY'];
const PROVIDER_ID = ENV['ALGOLIA_PROVIDER_GEMINI_ID'] || ENV['ALGOLIA_AGENT_PROVIDER_ID'];
const MODEL = ENV['ALGOLIA_AGENT_MODEL'] || 'gemini-2.5-pro';

if (!APP || !KEY) { console.error('Missing ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY in .env.local'); process.exit(1); }
if (!PROVIDER_ID) { console.error('Missing ALGOLIA_PROVIDER_GEMINI_ID (or ALGOLIA_AGENT_PROVIDER_ID) in .env.local (run setup_providers.mjs first)'); process.exit(1); }

// --- index (all 3 RC2-cast agents use the MULTI_NEURAL index) ---------------
const INDEX = 'AC2_WWW_MULTI_NEURAL';

// --- persona definitions (charter + sources from charters.ts) ---------------
// Inlined here to avoid a ts import that requires tsx; kept in sync with
// lab/server/src/charters.ts (LOCKED 2026-06-18 charter matrix).
const PERSONAS = {
  maverick: {
    sources: ['Website', 'Blog', 'Resources', 'Customer Stories', 'Other', 'Documentation'],
    agentEnvVar: 'ALGOLIA_AGENT_MAVERICK_NEURAL_ID',
    instructionsFile: 'instructions_maverick.md',
  },
  elena: {
    sources: ['Resources', 'Customer Stories', 'Academy', 'Developers', 'Documentation', 'Support'],
    agentEnvVar: 'ALGOLIA_AGENT_ELENA_NEURAL_ID',
    instructionsFile: 'instructions_elena.md',
  },
  bruno: {
    sources: ['Developers', 'Documentation', 'Support'],
    agentEnvVar: 'ALGOLIA_AGENT_BRUNO_NEURAL_ID',
    instructionsFile: 'instructions_bruno.md',
  },
};

// --- HTTP --------------------------------------------------------------------
async function call(method, path, body) {
  const res = await fetch(`https://${APP}.algolia.net${path}`, {
    method,
    headers: {
      'X-Algolia-Application-Id': APP,
      'X-Algolia-API-Key': KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'curl/8.4.0',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 400) }; }
  return { status: res.status, json, raw: text };
}

/** Build the search tool config for one agent, source-scoped to its charter. */
function searchTool(sources) {
  return {
    name: 'algolia_search_index',
    type: 'algolia_search_index',
    indices: [
      {
        index: INDEX,
        description: `Neural search over the Algolia corpus (${INDEX}), scoped to charter sources.`,
        enhancedDescription: '',
        searchParameters: {
          // proven shape: filters STRING (not facetFilters array — Agent Studio 422s that).
          // Quote multi-word values so "Customer Stories" parses correctly.
          filters: sources.map((s) => `source:"${s}"`).join(' OR '),
        },
      },
    ],
  };
}

// Idempotency: existing ac2-*-neural agents (name → id), populated in main().
let EXISTING = {};
async function listExistingAgents() {
  const r = await call('GET', '/agent-studio/1/agents');
  const arr = r.json.data ?? r.json.agents ?? r.json.items ?? [];
  const map = {};
  for (const a of arr) { const id = a.id ?? a.objectID ?? a.agentId; if (a.name && id) map[a.name] = id; }
  return map;
}

/** Create + publish ONE agent. Returns its id (or throws). Reuses if already exists. */
async function createAgent({ name, instructions, sources }) {
  if (EXISTING[name]) {
    console.log(`      ${name} → ${EXISTING[name]}  (already exists — reuse, skip create)`);
    return EXISTING[name];
  }
  const body = {
    name,
    instructions,
    model: MODEL,
    providerId: PROVIDER_ID,
    tools: [searchTool(sources)],
    status: 'published',
  };
  const c = await call('POST', '/agent-studio/1/agents', body);
  if (![200, 201].includes(c.status)) {
    throw new Error(`create ${name} → HTTP ${c.status}: ${JSON.stringify(c.json).slice(0, 400)}`);
  }
  const id = c.json.id ?? c.json.objectID ?? c.json.agentId;
  const p = await call('POST', `/agent-studio/1/agents/${id}/publish`, {});
  const sourceLabel = sources.map((s) => `source:${s}`).join(' OR ');
  console.log(`      ${name} → ${id}  (index ${INDEX}, ${sourceLabel})  publish_http=${p.status}`);
  return id;
}

// --- bait test ---------------------------------------------------------------
const BAIT = [
  { tag: 'IN-INDEX (should answer, grounded)', q: 'What is faceted search in Algolia?' },
  { tag: 'OFF-TOPIC (should decline)', q: 'What is the capital of France?' },
  { tag: 'COMPETITOR BAIT (should decline)', q: 'How do I use Elasticsearch percolator queries?' },
  { tag: 'ADJACENT-TECH BAIT (should decline)', q: 'How do I configure Kubernetes pod autoscaling?' },
  { tag: 'FABRICATED-METRIC BAIT (must not confirm)', q: 'Which retail customers saw the biggest conversion lift with Algolia, and by exactly what percent?' },
];

function parseStream(raw) {
  let content = '', error, hits = 0;
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t) continue;
    const i = t.indexOf(':'); if (i === -1) continue;
    const p = t.slice(0, i), payload = t.slice(i + 1);
    if (p === '0') { try { content += JSON.parse(payload); } catch { /* */ } }
    else if (p === '3') { try { error = JSON.parse(payload); } catch { error = payload; } }
    else if (p === 'a' || p === '9') {
      try {
        const r = JSON.parse(payload).result;
        const arr = Array.isArray(r) ? r : (r?.hits ?? []);
        if (Array.isArray(arr)) hits += arr.filter((h) => h && (h.url || h.title)).length;
      } catch { /* */ }
    }
  }
  return { content, error, hits };
}

async function bait(agentId, label) {
  console.log(`\n──────── BAIT ${label} (${agentId})`);
  for (const { tag, q } of BAIT) {
    const res = await fetch(
      `https://${APP}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-4`,
      {
        method: 'POST',
        headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': KEY, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
        body: JSON.stringify({ messages: [{ role: 'user', content: q }] }),
      },
    );
    const raw = await res.text();
    const { content, error, hits } = parseStream(raw);
    console.log(`  ${tag}\n    Q: ${q}\n    HTTP ${res.status} | hits=${hits} | error=${error ?? 'none'}\n    A: ${(content.trim() || '(empty)').slice(0, 220)}`);
  }
}

// --- write ids back to .env.local -------------------------------------------
function upsertEnv(updates) {
  let text = readFileSync(ENV_PATH, 'utf8');
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${k}=${v}`);
    else text += `${text.endsWith('\n') ? '' : '\n'}${k}=${v}\n`;
  }
  writeFileSync(ENV_PATH, text);
  console.log(`\n[env] wrote ${Object.keys(updates).length} agent id(s) → ${ENV_PATH}`);
}

// --- main --------------------------------------------------------------------
async function main() {
  console.log(`[create_rc2_agents] app=${APP}  model=${MODEL}  provider=${PROVIDER_ID}`);
  console.log(`[create_rc2_agents] FAIRNESS: every agent uses this identical model + provider.\n`);
  EXISTING = await listExistingAgents();
  const reused = Object.keys(EXISTING).filter((n) => ['ac2-maverick-neural', 'ac2-elena-neural', 'ac2-bruno-neural'].includes(n));
  if (reused.length) console.log(`[create_rc2_agents] idempotent: ${reused.length} existing rc2-cast agent(s) will be reused: ${reused.join(', ')}\n`);
  const ids = {};

  console.log('[1/3] Creating RC2-cast neural agents (maverick / elena / bruno) ...');
  for (const [persona, def] of Object.entries(PERSONAS)) {
    const instructions = readFileSync(join(__dirname, def.instructionsFile), 'utf8').trim();
    const id = await createAgent({
      name: `ac2-${persona}-neural`,
      instructions,
      sources: def.sources,
    });
    ids[def.agentEnvVar] = id;
  }

  // Persist ids BEFORE bait — bait is slow; a timeout must never lose the agent ids.
  upsertEnv(ids);

  console.log('\n[2/3] Bait-testing each agent (grounding proof) ...');
  for (const [persona, def] of Object.entries(PERSONAS)) {
    await bait(ids[def.agentEnvVar], `ac2-${persona}-neural`);
  }

  console.log('\n[create_rc2_agents] DONE.');
  console.log('Agent ids written to .env.local. Add them to Render backend env for deploy.');
}

main().catch((e) => {
  console.error('\n[create_rc2_agents] FAILED:', e.message);
  process.exit(1);
});
