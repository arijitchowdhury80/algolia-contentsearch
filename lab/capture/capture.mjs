#!/usr/bin/env node
/**
 * Live Website Search capture — Case ① "Current Website Search".
 *
 * Drives the REAL algolia.com header search (an Algolia Autocomplete widget
 * backed by app 1QDAWL72TQ / index ALGOLIA_WWW_PROD_V2) in a Playwright browser,
 * captures what a user actually sees for a given question, and returns
 * structured JSON + a full-page screenshot.
 *
 * HOW THE SEARCH IS DRIVEN
 * ------------------------
 * algolia.com's header search is the Algolia Autocomplete library (aa-* DOM
 * classes). Clicking the "Search Algolia" button opens the detached search box;
 * typing fires federated /1/indexes/-/queries XHRs to the VISIBILITY app
 * (1QDAWL72TQ). The main results index is ALGOLIA_WWW_PROD_V2 (docs + support +
 * blog + academy + product pages). The dropdown panel renders into a detached
 * portal that does NOT reliably expose aa-Item nodes under automation, so the
 * AUTHORITATIVE extraction is intercepting that XHR response (the exact hits the
 * site computed for the user). DOM scraping is attempted as a secondary signal.
 * The screenshot captures the user-facing view.
 *
 * This is BUILD/node tooling (Playwright), not a runtime dep of the web/ bundle.
 *
 * @typedef {Object} WebsiteResult
 * @property {number} rank
 * @property {string} title
 * @property {string} url
 * @property {string} snippet
 * @typedef {Object} WebsiteCapture
 * @property {string} question
 * @property {string} capturedAt    ISO timestamp
 * @property {string} url           page the search ran on
 * @property {WebsiteResult[]} results
 * @property {string} screenshotPath
 * @property {Object} [raw]         diagnostics (index, nbHits, source headers, method, blocker)
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const JSON_DIR = join(OUTPUT_DIR, 'website');
const TARGET = 'https://www.algolia.com/';
const MAIN_INDEX = 'ALGOLIA_WWW_PROD_V2';
const TOP_N = 8;

// Realistic desktop Chrome on macOS — stealth baseline to clear WAF/bot checks.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** slugify a question into a safe filename stem. */
export function slugify(question) {
  return question
    .toLowerCase()
    .replace(/[`'"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

/** Normalize a possibly-relative URL from the index to an absolute algolia.com URL. */
function absUrl(u) {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return 'https://www.algolia.com' + (u.startsWith('/') ? u : '/' + u);
}

/** Strip Algolia highlight markers and collapse whitespace. */
function clean(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/__\/?ais-highlight__/g, '')
    .replace(/<\/?(em|mark|b|strong)>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build a snippet from a hit: prefer description/abstract, fall back to highlighted title. */
function hitSnippet(hit) {
  const desc = clean(hit.description || hit.abstract || '');
  if (desc) return desc.slice(0, 240);
  const hl = hit._highlightResult || {};
  const cand = clean(hl.description?.value || hl.abstract?.value || hl.content?.value || '');
  if (cand) return cand.slice(0, 240);
  const src = hit.source ? `${hit.source}` : '';
  const cat = hit.category ? ` · ${hit.category}` : '';
  return (src + cat).trim();
}

/**
 * Drive the algolia.com header search for one question.
 * @param {string} question
 * @param {{ headless?: boolean }} [opts]
 * @returns {Promise<WebsiteCapture>}
 */
export async function captureWebsite(question, opts = {}) {
  const headless = opts.headless ?? true;
  await mkdir(JSON_DIR, { recursive: true });
  const slug = slugify(question);
  const screenshotPath = join(OUTPUT_DIR, `${slug}.png`);

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  // Mask the most common automation tell.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await ctx.newPage();

  // The search is debounced per keystroke. Early keystrokes ("h", "ho", ...)
  // match almost everything (~8012 hits on a keyword index); the SETTLED full
  // question is the most specific query, so we key the result on the actual
  // query string sent and keep the response for the longest query seen (which
  // is the full question once typing finishes).
  /** @type {any} */ let bestMain = null;
  let bestQueryLen = -1;
  const sourcesSeen = new Set();
  let xhrCount = 0;
  page.on('response', async (r) => {
    if (!/\/1\/indexes\/\*\/queries/.test(r.url())) return;
    xhrCount++;
    // Extract the query string this request actually searched for.
    let qStr = '';
    try {
      const body = r.request().postData() || '';
      const m = body.match(/[?&]?query=([^&"]*)/) || body.match(/"query"\s*:\s*"([^"]*)"/);
      if (m) qStr = decodeURIComponent(m[1].replace(/\+/g, ' '));
    } catch {
      /* ignore */
    }
    let json;
    try {
      json = await r.json();
    } catch {
      return;
    }
    for (const res of json.results || []) {
      if (res.index === MAIN_INDEX) {
        for (const h of res.hits || []) if (h.source) sourcesSeen.add(h.source);
        if (!(res.hits || []).length) continue;
        // Prefer the response for the longest (most complete) query string.
        if (qStr.length >= bestQueryLen) {
          bestQueryLen = qStr.length;
          bestMain = res;
          bestMain.__query = qStr;
        }
      }
    }
  });

  /** @type {WebsiteCapture} */
  const capture = {
    question,
    capturedAt: new Date().toISOString(),
    url: TARGET,
    results: [],
    screenshotPath,
    raw: { method: null, index: MAIN_INDEX, app: '1QDAWL72TQ' },
  };

  try {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Dismiss cookie banner if present (OneTrust).
    await page
      .locator('#onetrust-accept-btn-handler, button:has-text("Accept All")')
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
    await page.waitForTimeout(1500);

    // Open the detached search box.
    const trigger = page
      .locator('button:has-text("Search Algolia"), [class*="aa-DetachedSearchButton"]')
      .first();
    await trigger.click({ timeout: 12000 });
    await page.waitForTimeout(800);

    const input = page.locator('.aa-Input, input[type="search"]').first();
    await input.click({ timeout: 8000 });
    // Type like a human so debounced requests fire and the final query settles.
    await input.type(question, { delay: 35 });
    // Wait for the federated query to settle.
    await page.waitForResponse(
      (r) => /\/1\/indexes\/\*\/queries/.test(r.url()) && r.status() === 200,
      { timeout: 12000 }
    ).catch(() => {});
    await page.waitForTimeout(2500);

    // --- Secondary: try to scrape the rendered dropdown DOM (best-effort) ---
    let domResults = [];
    try {
      domResults = await page.$$eval('.aa-Item', (els, base) =>
        els
          .map((el) => {
            const a = el.querySelector('a') || el.closest('a');
            const titleEl = el.querySelector('[class*="title" i], .aa-ItemContentTitle, h3, h4');
            return {
              title: ((titleEl || el).textContent || '').replace(/\s+/g, ' ').trim(),
              url: a ? a.href : '',
            };
          })
          .filter((o) => o.title)
      );
    } catch {
      /* panel not rendered under automation — expected */
    }

    // --- Authoritative: structured hits from the intercepted XHR ---
    if (bestMain && (bestMain.hits || []).length) {
      capture.raw.method = 'xhr-intercept';
      capture.raw.nbHits = bestMain.nbHits;
      capture.raw.matchedQuery = bestMain.__query || question;
      capture.raw.sources = [...sourcesSeen];
      capture.raw.domItemsSeen = domResults.length;
      capture.raw.xhrCount = xhrCount;
      capture.results = bestMain.hits.slice(0, TOP_N).map((h, i) => ({
        rank: i + 1,
        title: clean(h.title || h.name || h.h1 || '(untitled)'),
        url: absUrl(h.url || h.permalink || h.link || ''),
        snippet: hitSnippet(h),
      }));
    } else if (domResults.length) {
      capture.raw.method = 'dom-scrape';
      capture.raw.xhrCount = xhrCount;
      capture.results = domResults.slice(0, TOP_N).map((o, i) => ({
        rank: i + 1,
        title: clean(o.title),
        url: o.url,
        snippet: '',
      }));
    } else {
      capture.raw.method = 'none';
      capture.raw.xhrCount = xhrCount;
      capture.raw.blocker =
        xhrCount === 0
          ? 'No federated search XHR fired — search widget may not have opened (selector drift) or requests were blocked.'
          : 'Search XHR fired but returned no usable ALGOLIA_WWW_PROD_V2 hits.';
    }

    // Screenshot of what the user sees (search box open with results state).
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  } catch (err) {
    capture.raw.method = 'error';
    capture.raw.blocker = `${err.name}: ${err.message}`.slice(0, 300);
    // Try to grab a screenshot even on failure, for diagnosis.
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  } finally {
    await browser.close();
  }

  // Persist JSON.
  const jsonPath = join(JSON_DIR, `${slug}.json`);
  await writeFile(jsonPath, JSON.stringify(capture, null, 2), 'utf8');
  capture.raw.jsonPath = jsonPath;
  return capture;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const LOCKED_PATH = resolve(
  __dirname,
  '../../docs/experiment/test-questions-locked.md'
);

/** Parse the locked questions file → array of turn-1 questions (multi-turn uses turn-1 only). */
async function loadLockedQuestions() {
  const md = await readFile(LOCKED_PATH, 'utf8');
  const out = [];
  for (const line of md.split('\n')) {
    // Lines like: - **1.2** What are ...?   or  - **8.1** ... → *follow-up*
    const m = line.match(/^\s*-\s+\*\*[\w.]+\*\*\s+(.+)$/);
    if (!m) continue;
    let q = m[1];
    // Multi-turn: keep turn-1 only (strip everything from the → arrow on).
    q = q.split('→')[0];
    // Strip trailing italic annotations like *(stress test ...)* and *(...)*.
    q = q.replace(/\*\([^)]*\)\*/g, '').replace(/\*[^*]*\*/g, '');
    q = q.replace(/\s+/g, ' ').trim();
    if (q) out.push(q);
  }
  return out;
}

function isMain() {
  return resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url));
}

async function main() {
  const argv = process.argv.slice(2);
  const headless = !argv.includes('--headed');
  const qIdx = argv.indexOf('--q');

  let questions = [];
  if (argv.includes('--all')) {
    questions = await loadLockedQuestions();
    console.log(`Loaded ${questions.length} locked questions (turn-1 only for multi-turn).`);
  } else if (qIdx !== -1 && argv[qIdx + 1]) {
    questions = [argv[qIdx + 1]];
  } else {
    console.log('Usage: node capture.mjs --all | --q "<question>" [--headed]');
    process.exit(1);
  }

  const summary = [];
  for (const q of questions) {
    process.stdout.write(`\n▶ ${q}\n`);
    const cap = await captureWebsite(q, { headless });
    const n = cap.results.length;
    console.log(`  method=${cap.raw.method} nbHits=${cap.raw.nbHits ?? '-'} extracted=${n} → ${cap.screenshotPath.split('/').slice(-1)[0]}`);
    cap.results.slice(0, 3).forEach((r) => console.log(`    ${r.rank}. ${r.title}  [${r.url}]`));
    if (cap.raw.blocker) console.log(`  ⚠ blocker: ${cap.raw.blocker}`);
    summary.push({ q, method: cap.raw.method, n, blocker: cap.raw.blocker });
  }

  console.log('\n=== SUMMARY ===');
  for (const s of summary) {
    console.log(`${s.n ? '✓' : '✗'} [${s.method}] (${s.n} results) ${s.q}${s.blocker ? ' — ' + s.blocker : ''}`);
  }
}

if (isMain()) {
  main().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  });
}
