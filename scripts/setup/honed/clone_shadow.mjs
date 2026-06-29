/**
 * clone_shadow — clone a LIVE specialist agent into a SHADOW twin for autonomous honing.
 *
 * Why: the autonomous honing gym must NEVER mutate a live shared agent (SOP §9 autonomy
 * boundary — irreversible blast radius). The gym deploys candidate prompts to a SHADOW
 * (`ac2-<role>-shadow`) that is a config-faithful clone of the live `ac2-<role>-neural`:
 * same model, provider, and retrieval tool (the source-scoping that makes the eval valid).
 * Only the winning prompt is later PROMOTED to live, as one gated batch via push_honed.
 *
 * Clone is by full-config copy: GET /agents/{liveId} → POST /agents with the same
 * {instructions, model, providerId, tools}, renamed. No re-derivation of sources — the
 * clone inherits exactly what live has, so the shadow's retrieval == live's retrieval.
 *
 * Usage:
 *   node clone_shadow.mjs <role>            # role ∈ support|tech|academy|marketer
 *   node clone_shadow.mjs support           # clones ac2-support-neural → ac2-support-shadow
 *   node clone_shadow.mjs --all             # clone all four
 *   node clone_shadow.mjs --list            # show live → shadow mapping, create nothing
 *
 * Idempotent: if ac2-<role>-shadow already exists, reuse (skip create).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

const ENV = {};
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  ENV[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const APP = ENV['ALGOLIA_APP_ID'];
const KEY = ENV['ALGOLIA_ADMIN_API_KEY'];
if (!APP || !KEY) { console.error('Missing ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY in .env.local'); process.exit(1); }

const BASE = `https://${APP}.algolia.net/agent-studio/1`;
const HEADERS = {
  'X-Algolia-Application-Id': APP,
  'X-Algolia-API-Key': KEY,
  'Content-Type': 'application/json',
  'User-Agent': 'curl/8.4.0', // /agent-studio/* rejects non-curl clients without a UA
};

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

/** name → id over all agents (list paginates at 10 without ?limit). */
async function listAgents() {
  const r = await call('GET', '/agents?limit=100');
  const arr = r.json.data ?? r.json.agents ?? r.json.items ?? [];
  const map = {};
  for (const a of arr) {
    const id = a.id ?? a.objectID ?? a.agentId;
    if (a.name && id) map[a.name] = id;
  }
  return map;
}

/** Clone live `ac2-<role>-neural` → `ac2-<role>-shadow`. Returns {shadowName, shadowId, reused}. */
async function cloneRole(role, existing) {
  const liveName = `ac2-${role}-neural`;
  const shadowName = `ac2-${role}-shadow`;
  const liveId = existing[liveName];
  if (!liveId) throw new Error(`live agent ${liveName} not found (have: ${Object.keys(existing).join(', ')})`);

  if (existing[shadowName]) {
    console.log(`  ${shadowName} → ${existing[shadowName]}  (already exists — reuse)`);
    return { shadowName, shadowId: existing[shadowName], reused: true };
  }

  // Full-config GET of the live agent — the source of truth for the clone.
  const g = await call('GET', `/agents/${liveId}`);
  if (g.status !== 200) throw new Error(`GET ${liveName} → HTTP ${g.status}: ${JSON.stringify(g.json).slice(0, 300)}`);
  const live = g.json.agent ?? g.json.data ?? g.json;

  // Copy exactly what create accepts; omit nothing that affects retrieval/grounding.
  const body = {
    name: shadowName,
    instructions: live.instructions,
    model: live.model,
    providerId: live.providerId ?? live.provider_id,
    tools: live.tools,
    status: 'published',
  };
  for (const k of ['instructions', 'model', 'providerId', 'tools']) {
    if (body[k] === undefined || body[k] === null) {
      throw new Error(`live ${liveName} GET missing "${k}" — cannot make a faithful clone (got keys: ${Object.keys(live).join(', ')})`);
    }
  }

  const c = await call('POST', '/agents', body);
  if (![200, 201].includes(c.status)) {
    throw new Error(`create ${shadowName} → HTTP ${c.status}: ${JSON.stringify(c.json).slice(0, 400)}`);
  }
  const shadowId = c.json.id ?? c.json.objectID ?? c.json.agentId;
  const p = await call('POST', `/agents/${shadowId}/publish`, {});
  console.log(`  ${shadowName} → ${shadowId}  (clone of ${liveName} @ ${liveId}; model=${body.model}; publish_http=${p.status})`);
  return { shadowName, shadowId, reused: false };
}

async function main() {
  const args = process.argv.slice(2);
  const ROLES = ['support', 'tech', 'academy', 'marketer'];
  const existing = await listAgents();

  if (args.includes('--list')) {
    console.log(`[clone_shadow] app=${APP}  live → shadow mapping:`);
    for (const role of ROLES) {
      const live = `ac2-${role}-neural`, shadow = `ac2-${role}-shadow`;
      console.log(`  ${live} (${existing[live] ?? 'MISSING'})  →  ${shadow} (${existing[shadow] ?? 'not created'})`);
    }
    return;
  }

  const roles = args.includes('--all') ? ROLES : args.filter((a) => ROLES.includes(a));
  if (!roles.length) {
    console.error(`usage: clone_shadow.mjs <role|--all|--list>   role ∈ ${ROLES.join('|')}`);
    process.exit(1);
  }

  console.log(`[clone_shadow] app=${APP}  cloning: ${roles.join(', ')}`);
  for (const role of roles) await cloneRole(role, existing);
  console.log('[clone_shadow] done.');
}

main().catch((e) => { console.error(`[clone_shadow] FAILED: ${e.message}`); process.exit(1); });
