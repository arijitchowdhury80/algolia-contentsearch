/**
 * create_allsource_agent — create ONE all-source neural agent for the routing spike's
 * airtight baseline.
 *
 * Why: the routing spike's first run used ac2-maverick-neural (6-source charter) as the
 * baseline, which is BLIND to Academy/Support/Developers — confounding "honing helps"
 * with "baseline can't see that content". The fair baseline is an agent on the SAME
 * index the specialists use (AC2_WWW_MULTI_NEURAL) with NO source filter — so the only
 * variable vs a specialist is the source scope itself.
 *
 * Idempotent: reuses ac2-allsource-neural if it already exists. No bait calls, no
 * .env.local mutation — prints the id; the harness resolves it by name from the live list.
 *
 * Run: node scripts/setup/create_allsource_agent.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENV_PATH = join(ROOT, '.env.local');

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
const INDEX = 'AC2_WWW_MULTI_NEURAL'; // SAME index the neural specialists use
const NAME = 'ac2-allsource-neural';

if (!APP || !KEY) { console.error('Missing ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY'); process.exit(1); }
if (!PROVIDER_ID) { console.error('Missing ALGOLIA_PROVIDER_GEMINI_ID'); process.exit(1); }

const SINGLE_INSTRUCTIONS = readFileSync(join(__dirname, 'instructions_single.md'), 'utf8').trim();

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

async function main() {
  console.log(`[create_allsource_agent] app=${APP} model=${MODEL} index=${INDEX}`);

  // Idempotency: reuse if it already exists.
  const list = await call('GET', '/agent-studio/1/agents');
  const arr = list.json.data ?? list.json.agents ?? list.json.items ?? [];
  const existing = arr.find((a) => a.name === NAME);
  if (existing) {
    const id = existing.id ?? existing.objectID ?? existing.agentId;
    console.log(`${NAME} already exists → ${id} (reuse)`);
    return;
  }

  const body = {
    name: NAME,
    instructions: SINGLE_INSTRUCTIONS,
    model: MODEL,
    providerId: PROVIDER_ID,
    // No source filter → all 9 sources on the SAME index the specialists search.
    tools: [{
      name: 'algolia_search_index',
      type: 'algolia_search_index',
      indices: [{ index: INDEX, description: `Search the Algolia website corpus (${INDEX}).`, enhancedDescription: '' }],
    }],
    status: 'published',
  };
  const c = await call('POST', '/agent-studio/1/agents', body);
  if (![200, 201].includes(c.status)) {
    throw new Error(`create ${NAME} → HTTP ${c.status}: ${JSON.stringify(c.json).slice(0, 400)}`);
  }
  const id = c.json.id ?? c.json.objectID ?? c.json.agentId;
  const p = await call('POST', `/agent-studio/1/agents/${id}/publish`, {});
  console.log(`${NAME} → ${id} (index ${INDEX}, NO source filter = all 9 sources) publish_http=${p.status}`);
}

main().catch((e) => { console.error('[create_allsource_agent] FAILED:', e.message); process.exit(1); });
