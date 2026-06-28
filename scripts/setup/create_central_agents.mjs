#!/usr/bin/env node
/**
 * create_central_agents.mjs — create + publish the 2×2 Agent Studio agents on
 * CENTRAL (0EXRPAXB56), all on the SAME pinned Gemini provider + model
 * (FAIRNESS INVARIANT — only architecture + retrieval vary across panels).
 *
 *   2 single agents:
 *     ac2-single-keyword  → AC2_WWW_SINGLE_KEYWORD   (instructions_single.md)
 *     ac2-single-neural   → AC2_WWW_SINGLE_NEURAL    (instructions_single.md)
 *   8 specialists (4 charters × 2 retrieval modes), each source-scoped on the
 *   shared MULTI index via a native `source` facetFilter on its search tool
 *   (instructions_specialist.md with {charter} + {sourceFilter} substituted):
 *     ac2-{tech,marketer,academy,support}-{keyword,neural}
 *     keyword set → AC2_WWW_MULTI_KEYWORD ; neural set → AC2_WWW_MULTI_NEURAL
 *   (Maverick is NOT an agent — it is the coded coordinator in
 *    lab/server/src/multiAgent.ts.)
 *
 * After creating + publishing each, it bait-tests it (the off-topic grounding
 * set) and prints refusal-vs-answer evidence, then writes every resulting agent
 * id back to ../../.env.local.
 *
 * Wire contract (Protocol Read Receipt — verified live in create_agents.py:73-91
 * + agent_admin.mjs:38-52,80):
 *   create:  POST /agent-studio/1/agents
 *            { name, instructions, model, providerId,
 *              tools:[{ name:'algolia_search_index', type:'algolia_search_index',
 *                       indices:[{ index, description, enhancedDescription, searchParameters? }] }],
 *              status:'published' }
 *   publish: POST /agent-studio/1/agents/{id}/publish {}
 *   ALL Agent Studio requests need header  User-Agent: curl/8.4.0
 *   facetFilters syntax (docs/algolia-api/01-search-api.md:392): [[a,b],c] = (a OR b) AND c.
 *
 * SAFETY: NOTHING in this script is invoked at import time except reading env.
 * It runs ONLY when executed directly (the orchestrator runs it later). It reads
 * ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY / ALGOLIA_PROVIDER_GEMINI_ID /
 * ALGOLIA_AGENT_MODEL from .env.local; it touches ONLY our ac2-* agents.
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
const PROVIDER_ID = ENV['ALGOLIA_PROVIDER_GEMINI_ID'];
const MODEL = ENV['ALGOLIA_AGENT_MODEL'] || 'gemini-2.5-pro';

if (!APP || !KEY) { console.error('Missing ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY in .env.local'); process.exit(1); }
if (!PROVIDER_ID) { console.error('Missing ALGOLIA_PROVIDER_GEMINI_ID in .env.local (run setup_providers.mjs first)'); process.exit(1); }

// --- index names (LOCKED naming AC2_WWW_<ARCH>_<RETRIEVAL>) ------------------
const IDX = {
  SINGLE_KEYWORD: 'AC2_WWW_SINGLE_KEYWORD',
  SINGLE_NEURAL: 'AC2_WWW_SINGLE_NEURAL',
  MULTI_KEYWORD: 'AC2_WWW_MULTI_KEYWORD',
  MULTI_NEURAL: 'AC2_WWW_MULTI_NEURAL',
};

// --- specialist charters + source facetFilters (LOCKED 2026-06-18) ----------
// facetFilters: OR within a charter's sources → [['source:A','source:B', ...]].
const SPECIALISTS = {
  tech: {
    sources: ['Documentation', 'Developers', 'Customer Stories'],
    charter:
      'You are the Technical specialist. Your slice is Algolia\'s technical documentation, developer/API/integration guides, and the customer stories that exemplify them. You answer how-to-configure, API, SDK, integration, architecture-of-the-product, and implementation-evidence questions from this slice.',
  },
  marketer: {
    sources: ['Website', 'Blog', 'Resources', 'Other'],
    charter:
      'You are the Marketer specialist. Your slice is Algolia\'s positioning, narrative, and resources — the website, blog, and resource pages (and other marketing content). You answer questions about value proposition, use cases, messaging, and outcomes from this slice.',
  },
  academy: {
    sources: ['Academy'],
    charter:
      'You are the Academy specialist. Your slice is Algolia\'s structured learning content (Academy). You answer questions about courses, guided learning paths, and how-to-learn-it material from this slice.',
  },
  support: {
    sources: ['Support'],
    charter:
      'You are the Support specialist. Your slice is Algolia\'s support and help content. You answer troubleshooting, error-resolution, account/billing-help, and "how do I fix / where do I get help" questions from this slice.',
  },
};

// --- instructions ------------------------------------------------------------
const SINGLE_INSTRUCTIONS = readFileSync(join(__dirname, 'instructions_single.md'), 'utf8').trim();
const SPECIALIST_TEMPLATE = readFileSync(join(__dirname, 'instructions_specialist.md'), 'utf8').trim();

/** Substitute {charter} + {sourceFilter} into the specialist template. */
function specialistInstructions(charter, sourceFilterLabel) {
  return SPECIALIST_TEMPLATE
    .split('{charter}').join(charter)
    .split('{sourceFilter}').join(sourceFilterLabel);
}

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

/** Build the search tool config for one agent (optionally source-scoped). */
function searchTool(index, sources) {
  const tool = {
    name: 'algolia_search_index',
    type: 'algolia_search_index',
    indices: [
      {
        index,
        description: `Search the Algolia website corpus (${index}).`,
        enhancedDescription: '',
      },
    ],
  };
  if (sources && sources.length) {
    // Native source scoping via the `filters` STRING param. Proven shape:
    // rc3 elena-solutions-engineer.json:27-40 uses searchParameters.filters (a
    // string), NOT facetFilters — Agent Studio 422s a raw facetFilters array
    // ("Input should be a valid dictionary or object"). Quote values so multi-word
    // sources (e.g. "Customer Stories") parse correctly.
    tool.indices[0].searchParameters = {
      filters: sources.map((s) => `source:"${s}"`).join(' OR '),
    };
  }
  return tool;
}

// Idempotency: existing ac2-* agents (name → id), populated in main() so a re-run
// after a partial failure REUSES already-created agents instead of duplicating them.
let EXISTING = {};
async function listExistingAgents() {
  const r = await call('GET', '/agent-studio/1/agents');
  const arr = r.json.data ?? r.json.agents ?? r.json.items ?? [];
  const map = {};
  for (const a of arr) { const id = a.id ?? a.objectID ?? a.agentId; if (a.name && id) map[a.name] = id; }
  return map;
}

/** Create + publish ONE agent. Returns its id (or throws). Reuses if it already exists. */
async function createAgent({ name, instructions, index, sources }) {
  if (EXISTING[name]) {
    console.log(`      ${name} → ${EXISTING[name]}  (already exists — reuse, skip create)`);
    return EXISTING[name];
  }
  const body = {
    name,
    instructions,
    model: MODEL,
    providerId: PROVIDER_ID,
    tools: [searchTool(index, sources)],
    status: 'published',
  };
  const c = await call('POST', '/agent-studio/1/agents', body);
  if (![200, 201].includes(c.status)) {
    throw new Error(`create ${name} → HTTP ${c.status}: ${JSON.stringify(c.json).slice(0, 400)}`);
  }
  const id = c.json.id ?? c.json.objectID ?? c.json.agentId;
  // Publish is a separate action.
  const p = await call('POST', `/agent-studio/1/agents/${id}/publish`, {});
  console.log(`      ${name} → ${id}  (index ${index}${sources ? `, source IN [${sources.join(', ')}]` : ''})  publish_http=${p.status}`);
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
  console.log(`[create_central_agents] app=${APP}  model=${MODEL}  provider=${PROVIDER_ID}`);
  console.log(`[create_central_agents] FAIRNESS: every agent uses this identical model + provider.\n`);
  EXISTING = await listExistingAgents();
  const reused = Object.keys(EXISTING).filter((n) => n.startsWith('ac2-'));
  if (reused.length) console.log(`[create_central_agents] idempotent: ${reused.length} existing ac2-* agent(s) will be reused: ${reused.join(', ')}\n`);
  const ids = {};

  console.log('[1/3] Single agents (P1 keyword, P3 neural) ...');
  ids.ALGOLIA_AGENT_P1_ID = await createAgent({
    name: 'ac2-single-keyword', instructions: SINGLE_INSTRUCTIONS, index: IDX.SINGLE_KEYWORD,
  });
  ids.ALGOLIA_AGENT_P3_ID = await createAgent({
    name: 'ac2-single-neural', instructions: SINGLE_INSTRUCTIONS, index: IDX.SINGLE_NEURAL,
  });

  console.log('\n[2/3] Specialists (8 = 4 charters × {keyword,neural}) ...');
  const ROLE_ENV = { tech: 'TECH', marketer: 'MARKETER', academy: 'ACADEMY', support: 'SUPPORT' };
  for (const [role, spec] of Object.entries(SPECIALISTS)) {
    const label = spec.sources.map((s) => `source:${s}`).join(' OR ');
    const instructions = specialistInstructions(spec.charter, label);
    for (const mode of ['keyword', 'neural']) {
      const index = mode === 'keyword' ? IDX.MULTI_KEYWORD : IDX.MULTI_NEURAL;
      const id = await createAgent({
        name: `ac2-${role}-${mode}`, instructions, index, sources: spec.sources,
      });
      ids[`ALGOLIA_AGENT_${ROLE_ENV[role]}_${mode.toUpperCase()}_ID`] = id;
    }
  }

  // Persist ids BEFORE bait — bait is 50 slow Gemini calls; a timeout/rate-limit
  // must never lose the just-created agent ids.
  upsertEnv(ids);

  console.log('\n[3/3] Bait-testing every agent (grounding proof) ...');
  for (const [k, id] of Object.entries(ids)) {
    await bait(id, k.replace(/^ALGOLIA_AGENT_|_ID$/g, ''));
  }

  console.log('\n[create_central_agents] DONE. Add the same ids to the Render backend env for deploy.');
}

main().catch((e) => {
  console.error('\n[create_central_agents] FAILED:', e.message);
  process.exit(1);
});
