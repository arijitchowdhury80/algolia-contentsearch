/**
 * run_baton — warm-baton multi-turn test runner for a honed specialist.
 *
 * Warm baton (per ADR-002, native memory does NOT carry): the coordinator hands off
 * a DOSSIER preamble (industry/product/stack/original ask) + full history. We simulate
 * that statelessly — the dossier is a deterministic test fixture (NOT a fact source),
 * injected as the first user turn, then prior turns are REPLAYED in messages[] each call.
 *
 * Isolates the specialist PROMPT as the only variable (no coordinator LLM in the loop).
 *
 * Usage:
 *   node run_baton.mjs <bankFile> [agentName] [questionId]
 *   node run_baton.mjs support_question_bank.json ac2-support-neural          # all
 *   node run_baton.mjs support_question_bank.json ac2-support-neural SUP-1     # one
 */
import { readFileSync, writeFileSync } from 'node:fs';
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

const [bankArg, agentName = 'ac2-support-neural', onlyId] = process.argv.slice(2);
if (!bankArg) { console.error('usage: run_baton.mjs <bankFile> [agentName] [questionId]'); process.exit(1); }
const bank = JSON.parse(readFileSync(join(__dirname, bankArg), 'utf8'));

// resolve agent id by name
const list = await (await fetch(`https://${APP}.algolia.net/agent-studio/1/agents?limit=100`, {
  headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': KEY, 'User-Agent': 'curl/8.4.0' },
})).json();
const arr = list.data ?? list.agents ?? list.items ?? [];
const agent = arr.find((a) => a.name === agentName);
if (!agent) { console.error(`agent ${agentName} not found`); process.exit(1); }
const ID = agent.id ?? agent.objectID;

function renderDossier(d) {
  const lines = Object.entries(d).map(([k, v]) => `- ${k}: ${v}`);
  return `[COORDINATOR HANDOFF — customer context for framing only, do NOT repeat this back, do NOT treat as an Algolia fact source]\n${lines.join('\n')}\n[End handoff context. Now answer the user's message below.]`;
}

function parseStream(raw) {
  let content = '', error, hits = 0, finished = false, toolCalls = 0; const titles = [];
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t) continue;
    const i = t.indexOf(':'); if (i === -1) continue;
    const p = t.slice(0, i), pl = t.slice(i + 1);
    if (p === '0') { try { content += JSON.parse(pl); } catch { /**/ } }
    else if (p === '3') { try { error = JSON.parse(pl); } catch { error = pl; } }
    else if (p === 'd') { finished = true; } // 'd:' = final finishReason frame
    else if (p === '9') { toolCalls++; } // '9:' = tool-call frame = the TRUSTWORTHY grounding signal
    else if (p === 'a') {
      // hit-count is best-effort: large payloads don't surface url/title at top level,
      // so this undercounts. toolCalls (above) is the real grounding signal — trust the frame, not the count.
      try {
        const r = JSON.parse(pl).result; const a = Array.isArray(r) ? r : (r?.hits ?? []);
        if (Array.isArray(a)) for (const h of a) { const u = h && (h.url || h.title); if (u) { hits++; titles.push(u); } }
      } catch { /**/ }
    }
  }
  return { content, error, hits, titles, finished, toolCalls };
}

async function completeOnce(messages) {
  const res = await fetch(`https://${APP}.algolia.net/agent-studio/1/agents/${ID}/completions?compatibilityMode=ai-sdk-4`, {
    method: 'POST',
    headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': KEY, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: JSON.stringify({ messages }),
  });
  return parseStream(await res.text());
}

// Retry once if the stream ended without a finish frame (the transient pre-tool truncation),
// and catch transient socket errors (UND_ERR_SOCKET / "terminated") so one blip doesn't
// kill the whole run — retry once, then record an error marker and continue.
async function complete(messages) {
  let r;
  try {
    r = await completeOnce(messages);
    if (!r.finished && !r.error) { process.stderr.write('    (no finish frame — retrying once)\n'); r = await completeOnce(messages); }
  } catch (e) {
    process.stderr.write(`    (socket error: ${e.message} — retrying once)\n`);
    try { r = await completeOnce(messages); }
    catch (e2) { return { content: `(request failed: ${e2.message})`, error: e2.message, hits: 0, titles: [], finished: false, toolCalls: 0 }; }
  }
  return r;
}

const out = [];
const dest = join(__dirname, `baton_run_${agentName}.md`);
const flush = () => writeFileSync(dest, out.join('\n')); // incremental: survive a late crash
out.push(`# Warm-baton run — ${agentName} (${ID})\n`);
for (const q of bank.questions) {
  if (onlyId && q.id !== onlyId) continue;
  out.push(`\n${'═'.repeat(70)}\n## ${q.id}  axes=[${q.axes.join(',')}]  trap: ${q.trap}`);
  out.push(`**Discriminator:** ${q.discriminator}`);
  out.push(`**Pass criteria:**\n${q.pass_criteria.map((c) => `  - [ ] ${c}`).join('\n')}`);
  out.push(`**Dossier (warm baton):** ${JSON.stringify(q.dossier)}`);

  // stateless replay: rebuild messages[] each turn, dossier as first user message
  const messages = [{ role: 'user', content: renderDossier(q.dossier) }];
  // dossier handoff needs an assistant ack so the next user turn reads naturally
  messages.push({ role: 'assistant', content: 'Understood — I have the context. How can I help?' });
  for (let ti = 0; ti < q.turns.length; ti++) {
    messages.push({ role: 'user', content: q.turns[ti] });
    process.stderr.write(`  ${q.id} turn ${ti + 1}/${q.turns.length} ...\n`);
    const { content, error, hits, titles, toolCalls } = await complete(messages);
    out.push(`\n### Turn ${ti + 1} — USER: ${q.turns[ti]}`);
    out.push(`searched=${toolCalls > 0 ? `YES (${toolCalls})` : 'NO ⚠️'} | hits≈${hits} (lossy) | error=${error ?? 'none'} | urls=${JSON.stringify([...new Set(titles)].slice(0, 8))}`);
    out.push(`\n${content.trim() || '(empty)'}`);
    messages.push({ role: 'assistant', content: content.trim() || '(empty)' });
    flush();
  }
}

flush();
console.log(`\nwrote ${dest}`);
