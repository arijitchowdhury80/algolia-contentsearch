/**
 * run_ac2 — query ac2-allsource-neural (CENTRAL) for the 12 head-to-head questions,
 * capturing the full answer AND full source objects (description/title/url text from
 * the `a:` frames — the judge needs source TEXT, not just title/url). Writes
 * ac2_answers.json. Mirrors the 12 questions in eval/h2h-rc2.ts exactly.
 *
 * Run: node scripts/setup/h2h/run_ac2.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
const APP = ENV['ALGOLIA_APP_ID'], KEY = ENV['ALGOLIA_ADMIN_API_KEY'];
const AGENT = 'ac2-allsource-neural';

const QUESTIONS = [
  "We're evaluating Algolia vs building search in-house on Elasticsearch — why Algolia for a B2C retail catalog?",
  "What measurable business results do companies see from improving site search?",
  "How does Algolia help with merchandising and personalization for a fashion brand?",
  "Doctors search 'T2DM' or 'heart attack' but our system only matches the full term — how does Algolia handle synonyms and natural-language understanding for specialized terminology?",
  "What's the difference between Algolia's keyword search and NeuralSearch?",
  "How do I implement faceted search and filtering with InstantSearch?",
  "Advisors search for investment products but results ignore client risk profile and portfolio context — how does Algolia's ranking incorporate business signals beyond text relevance?",
  "My searches return no results after I indexed my data — what are the likely causes?",
  "I'm getting a 403 Forbidden when indexing records — how do I fix it?",
  "Where do I start learning to build search with Algolia as a new developer?",
  "We run 6 brand websites with inconsistent search and no shared learnings — how does Algolia handle multi-brand search with personalized results across separate catalogs?",
  "What successes does Algolia have in fashion and e-commerce, with proof?",
];

async function call(method, path, body) {
  const res = await fetch(`https://${APP}.algolia.net${path}`, {
    method,
    headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': KEY, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res;
}

function parseStream(raw) {
  let content = '', error, finished = false, toolCalls = 0;
  const sources = []; const seen = new Set();
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t) continue;
    const i = t.indexOf(':'); if (i === -1) continue;
    const p = t.slice(0, i), pl = t.slice(i + 1);
    if (p === '0') { try { content += JSON.parse(pl); } catch { /**/ } }
    else if (p === '3') { try { error = JSON.parse(pl); } catch { error = pl; } }
    else if (p === 'd') { finished = true; }
    else if (p === '9') { toolCalls++; }
    else if (p === 'a') {
      try {
        const r = JSON.parse(pl).result; const arr = Array.isArray(r) ? r : (r?.hits ?? []);
        if (Array.isArray(arr)) for (const h of arr) {
          if (!h) continue;
          const url = h.url || '';
          const title = h.title || '';
          const text = (h.description || h.abstract || h.summary || title || '').toString();
          const dedup = url || title || text.slice(0, 60);
          if (seen.has(dedup)) continue; seen.add(dedup);
          sources.push({ title, url, text, source: h.source ?? null, category: h.category ?? null });
        }
      } catch { /**/ }
    }
  }
  return { content, error, finished, toolCalls, sources };
}

async function completeOnce(messages) {
  const res = await call('POST', `/agent-studio/1/agents/${ID}/completions?compatibilityMode=ai-sdk-4`, { messages });
  return parseStream(await res.text());
}
async function complete(messages) {
  let r;
  try { r = await completeOnce(messages); if (!r.finished && !r.error) r = await completeOnce(messages); }
  catch (e) { try { r = await completeOnce(messages); } catch (e2) { return { content: `(request failed: ${e2.message})`, error: e2.message, sources: [], toolCalls: 0 }; } }
  return r;
}

// resolve agent id
const list = await (await call('GET', '/agent-studio/1/agents?limit=100')).json();
const arr = list.data ?? list.agents ?? list.items ?? [];
const ag = arr.find((a) => a.name === AGENT);
if (!ag) { console.error(`${AGENT} not found`); process.exit(1); }
const ID = ag.id ?? ag.objectID;

const OUT = __dirname;
mkdirSync(OUT, { recursive: true });
const out = [];
for (let qi = 0; qi < QUESTIONS.length; qi++) {
  process.stderr.write(`AC2 Q${qi + 1}/${QUESTIONS.length} ...\n`);
  const { content, error, sources, toolCalls } = await complete([{ role: 'user', content: QUESTIONS[qi] }]);
  out.push({ qi, question: QUESTIONS[qi], system: 'ac2', answer: (content || '').trim(), sources, sourceCount: sources.length, toolCalls, error: error ?? null });
}
writeFileSync(join(OUT, 'ac2_answers.json'), JSON.stringify(out, null, 2));
console.log(`wrote ${join(OUT, 'ac2_answers.json')} (${out.length} answers; ${out.filter(o => o.error).length} errors; avg sources ${(out.reduce((s, o) => s + o.sourceCount, 0) / out.length).toFixed(1)})`);
