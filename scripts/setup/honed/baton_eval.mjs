/**
 * baton_eval — run the warm-baton for ONE question against an agent and emit a
 * judge-ready request (answer + RETRIEVED SOURCE BODIES) on stdout.
 *
 * This is the gym's EVALUATE primitive. run_baton.mjs keeps only urls/titles
 * (lossy — fine for an eyeball pass), but the @lab/judge grounding dimension
 * checks each claim against the retrieved source TEXT, so the honing loop needs
 * the bodies. baton_eval captures the full hit objects from the `a:` frames and
 * shapes a LiveJudgeRequest: { question, panels:[{panelId, answer, sources}] }.
 *
 * Pipe straight into the judge CLI:
 *   node baton_eval.mjs support_question_bank.json ac2-support-shadow SUP-1 \
 *     | ( cd ../../../lab/server && npx tsx src/judge/judgeCli.ts )
 *
 * Usage: node baton_eval.mjs <bankFile> <agentName> <questionId> [panelId]
 * stdout = LiveJudgeRequest JSON (only). stderr = progress. Never touches live
 * unless you name a live agent — the gym always passes an ac2-*-shadow.
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
if (!APP || !KEY) { console.error('Missing ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY'); process.exit(1); }

const [bankArg, agentName, qId, panelId = 'shadow'] = process.argv.slice(2);
if (!bankArg || !agentName || !qId) {
  console.error('usage: baton_eval.mjs <bankFile> <agentName> <questionId> [panelId]');
  process.exit(1);
}
const bank = JSON.parse(readFileSync(join(__dirname, bankArg), 'utf8'));
const q = bank.questions.find((x) => x.id === qId);
if (!q) { console.error(`question ${qId} not found in ${bankArg}`); process.exit(1); }

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

/** Pull the most body-like text off a hit, so the judge can verify grounding. */
function hitText(h) {
  const cand = h.text ?? h.content ?? h.snippet ?? h.body ?? h.description ?? h.summary ?? h.excerpt;
  if (typeof cand === 'string' && cand.trim()) return cand;
  // Strip Algolia housekeeping fields, stringify the rest as a last resort.
  const { _highlightResult, _snippetResult, objectID, ...rest } = h;
  return JSON.stringify(rest).slice(0, 1500);
}

function parseStream(raw) {
  let content = '', error, toolCalls = 0; const hits = [];
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t) continue;
    const i = t.indexOf(':'); if (i === -1) continue;
    const p = t.slice(0, i), pl = t.slice(i + 1);
    if (p === '0') { try { content += JSON.parse(pl); } catch { /**/ } }
    else if (p === '3') { try { error = JSON.parse(pl); } catch { error = pl; } }
    else if (p === '9') { toolCalls++; }
    else if (p === 'a') {
      try {
        const r = JSON.parse(pl).result;
        const a = Array.isArray(r) ? r : (r?.hits ?? []);
        if (Array.isArray(a)) for (const h of a) { if (h && (h.url || h.title || h.objectID)) hits.push(h); }
      } catch { /**/ }
    }
  }
  return { content, error, toolCalls, hits };
}

async function completeOnce(messages) {
  const res = await fetch(`https://${APP}.algolia.net/agent-studio/1/agents/${ID}/completions?compatibilityMode=ai-sdk-4`, {
    method: 'POST',
    headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': KEY, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: JSON.stringify({ messages }),
  });
  return parseStream(await res.text());
}

async function complete(messages) {
  try {
    let r = await completeOnce(messages);
    if (!r.content && !r.error) { process.stderr.write('    (empty — retry once)\n'); r = await completeOnce(messages); }
    return r;
  } catch (e) {
    process.stderr.write(`    (socket error: ${e.message} — retry once)\n`);
    return await completeOnce(messages);
  }
}

// stateless warm-baton replay; accumulate sources across turns, keep last answer
const messages = [{ role: 'user', content: renderDossier(q.dossier) }];
messages.push({ role: 'assistant', content: 'Understood — I have the context. How can I help?' });
const allHits = [];
let lastAnswer = '', lastUser = '', searchedAny = false;
for (let ti = 0; ti < q.turns.length; ti++) {
  messages.push({ role: 'user', content: q.turns[ti] });
  process.stderr.write(`  ${q.id} turn ${ti + 1}/${q.turns.length} → ${agentName} ...\n`);
  const { content, error, toolCalls, hits } = await complete(messages);
  if (error) process.stderr.write(`    turn error: ${JSON.stringify(error).slice(0, 160)}\n`);
  if (toolCalls > 0) searchedAny = true;
  allHits.push(...hits);
  lastAnswer = content.trim() || '(empty)';
  lastUser = q.turns[ti];
  messages.push({ role: 'assistant', content: lastAnswer });
}

// dedup sources by url|objectID|title; cap to keep the judge prompt bounded
const seen = new Set();
const sources = [];
for (const h of allHits) {
  const key = h.url ?? h.objectID ?? h.title;
  if (!key || seen.has(key)) continue;
  seen.add(key);
  sources.push({
    id: `S${sources.length + 1}`,
    title: h.title ?? h.name ?? '(untitled)',
    ...(h.url ? { url: h.url } : {}),
    text: hitText(h),
  });
  if (sources.length >= 12) break;
}

process.stderr.write(`  searched=${searchedAny ? 'YES' : 'NO ⚠️'} | sources=${sources.length} | answer=${lastAnswer.length} chars\n`);

const request = {
  question: lastUser,
  panels: [{ panelId, label: agentName, answer: lastAnswer, sources }],
  rounds: 3,
};
process.stdout.write(JSON.stringify(request, null, 2) + '\n');
