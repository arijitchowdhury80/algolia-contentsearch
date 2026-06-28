/**
 * push_honed — snapshot the 4 live specialists, then (on demand) push a honed prompt.
 *
 * App = CENTRAL 0EXRPAXB56 (ALGOLIA_*). Resolves agents BY NAME from the live list
 * (.env.local specialist ids are stale). Snapshot is the reversible-restore artifact.
 *
 * Usage:
 *   node push_honed.mjs snapshot            → write snapshot_<name>.txt for all 4 specialists
 *   node push_honed.mjs push <name> <file>  → substitute [[SHARED_GROUNDING]], PATCH + publish
 *   node push_honed.mjs restore <name>      → PATCH back from snapshot_<name>.txt + publish
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
if (!APP || !KEY) { console.error('Missing ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY'); process.exit(1); }

const SPECIALISTS = ['ac2-support-neural', 'ac2-tech-neural', 'ac2-academy-neural', 'ac2-marketer-neural'];

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

async function resolveByName() {
  const list = await call('GET', '/agent-studio/1/agents?limit=100');
  const arr = list.json.data ?? list.json.agents ?? list.json.items ?? [];
  const map = {};
  for (const a of arr) map[a.name] = a.id ?? a.objectID ?? a.agentId;
  return map;
}

function snapPath(name) { return join(__dirname, `snapshot_${name}.txt`); }

const [cmd, name, file] = process.argv.slice(2);
const map = await resolveByName();

if (cmd === 'snapshot') {
  for (const n of SPECIALISTS) {
    const id = map[n];
    if (!id) { console.log(`SKIP ${n} — not found`); continue; }
    const { status, json } = await call('GET', `/agent-studio/1/agents/${id}`);
    if (status !== 200) { console.log(`FAIL ${n} HTTP ${status}`); continue; }
    const instr = json.instructions ?? '';
    writeFileSync(snapPath(n), instr);
    console.log(`snapshot ${n} (${id}) → ${instr.length} chars → snapshot_${n}.txt`);
  }
} else if (cmd === 'push') {
  if (!name || !file) { console.error('usage: push <agentName> <instructionsFile>'); process.exit(1); }
  const id = map[name];
  if (!id) { console.error(`agent ${name} not found`); process.exit(1); }
  let instructions = readFileSync(file, 'utf8');
  if (instructions.includes('[[SHARED_GROUNDING]]')) {
    const shared = readFileSync(join(__dirname, '_shared_grounding.md'), 'utf8').trim();
    instructions = instructions.replace('[[SHARED_GROUNDING]]', shared);
  }
  if (!existsSync(snapPath(name))) { console.error(`NO snapshot for ${name} — run snapshot first`); process.exit(1); }
  console.log(`[push] ${name} (${id}) ← ${instructions.length} chars`);
  const patch = await call('PATCH', `/agent-studio/1/agents/${id}`, { instructions });
  console.log(`  PATCH → HTTP ${patch.status}`);
  if (patch.status !== 200) { console.log(JSON.stringify(patch.json).slice(0, 800)); process.exit(1); }
  const pub = await call('POST', `/agent-studio/1/agents/${id}/publish`, {});
  console.log(`  PUBLISH → HTTP ${pub.status}`);
  const check = await call('GET', `/agent-studio/1/agents/${id}`);
  console.log(`  CONFIRM → status=${check.json.status} instructions=${(check.json.instructions ?? '').length} chars`);
} else if (cmd === 'restore') {
  if (!name) { console.error('usage: restore <agentName>'); process.exit(1); }
  const id = map[name];
  if (!id || !existsSync(snapPath(name))) { console.error(`missing id or snapshot for ${name}`); process.exit(1); }
  const instructions = readFileSync(snapPath(name), 'utf8');
  const patch = await call('PATCH', `/agent-studio/1/agents/${id}`, { instructions });
  const pub = await call('POST', `/agent-studio/1/agents/${id}/publish`, {});
  console.log(`restore ${name} → PATCH ${patch.status} PUBLISH ${pub.status} (${instructions.length} chars)`);
} else {
  console.error('commands: snapshot | push <name> <file> | restore <name>');
  process.exit(1);
}
