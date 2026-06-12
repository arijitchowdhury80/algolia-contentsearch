#!/usr/bin/env node
/**
 * Live Ask AI capture — the "north-star" reference for the experiment.
 *
 * Drives the REAL "Search or Ask AI" widget on support.algolia.com in a
 * Playwright browser, asks one question, waits for the streamed AI answer to
 * FULLY settle, then scrapes the rendered answer + citations + related sources.
 * Returns structured JSON + a full screenshot.
 *
 * HOW THE Ask AI UI IS DRIVEN  (verified empirically 2026-06-12)
 * --------------------------------------------------------------
 * support.algolia.com/hc/en-us ships Algolia DocSearch v3 with the Ask AI
 * extension. The flow a real user follows — and the one we automate — is:
 *   1. Click  `button.DocSearch-Button`  (label "Search or Ask AI ⌘K") to open
 *      the detached search modal (`.DocSearch-Modal`).
 *   2. Type the question into `.DocSearch-Input`. The dropdown renders normal
 *      search hits PLUS a special first hit:  `LI.DocSearch-Hit` whose text is
 *      `Ask AI: <question>`.
 *   3. Click that "Ask AI" hit. This fires `POST askai.algolia.com/chat/token`
 *      then `POST askai.algolia.com/chat` (a streamed SSE response) and swaps
 *      the modal to the answer screen `.DocSearch-AskAiScreen`.
 *   4. The answer streams into a single assistant message:
 *        `.DocSearch-AskAiScreen-Message--assistant .DocSearch-AskAiScreen-MessageContent`
 *      It accumulates a "Searched for ... found N results" tool line, then the
 *      streamed markdown (headings, numbered lists, **bold**, inline doc links),
 *      then a "Related sources" block.
 *
 * The origin-bound Ask AI token is minted INSIDE the real page, so driving the
 * live UI is the supported path — no API reconstruction needed. (A Cloudflare
 * Turnstile challenge fires alongside `/chat`; it is solved transparently by the
 * page and adds a few seconds of latency before the answer begins streaming.)
 *
 * END-OF-STREAM DETECTION (robust, three converging signals)
 * ----------------------------------------------------------
 * We do NOT scrape mid-stream. We wait until the answer has SETTLED, judged by:
 *   (a) the Like / Dislike / Copy controls have rendered (they appear only when
 *       the stream finishes), AND
 *   (b) the "Related sources" list (`.DocSearch-AskAiScreen-RelatedSources`)
 *       is present, AND
 *   (c) the assistant message text length has stopped growing for ~2.5 s.
 * Empirically (typo-tolerance question) the stream starts ~3 s after the click,
 * grows until ~18 s, and is fully stable by ~18–20 s. We poll up to 60 s.
 *
 * This is BUILD/node tooling (Playwright), not a runtime dep of the web/ bundle.
 *
 * @typedef {Object} RelatedSource
 * @property {string} label
 * @property {string} [url]
 * @typedef {Object} AskAICapture
 * @property {string} question
 * @property {string} capturedAt        ISO timestamp
 * @property {string} url               page the answer was generated on
 * @property {string} answerMarkdown    answer as light markdown (headings/bullets/links preserved)
 * @property {string} answerText        answer as plain innerText (tool prefix stripped)
 * @property {RelatedSource[]} relatedSources
 * @property {string} screenshotPath
 * @property {Object} [raw]             diagnostics (citations, timings, method, blocker)
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const ASKAI_DIR = join(OUTPUT_DIR, 'askai');
const TARGET = 'https://support.algolia.com/hc/en-us';

// Realistic desktop Chrome on macOS — same stealth baseline as capture.mjs.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Selectors (verified on the live site 2026-06-12).
const SEL = {
  trigger: 'button.DocSearch-Button',
  modal: '.DocSearch-Modal',
  input: '.DocSearch-Input',
  askAiHit: '.DocSearch-Hit:has-text("Ask AI")',
  screen: '.DocSearch-AskAiScreen',
  answer:
    '.DocSearch-AskAiScreen-Message--assistant .DocSearch-AskAiScreen-MessageContent',
  relatedBlock: '.DocSearch-AskAiScreen-RelatedSources',
  relatedList: '.DocSearch-AskAiScreen-RelatedSources-List',
  relatedItem: '.DocSearch-AskAiScreen-RelatedSources-Item-Link',
  // Completion controls — present only once the stream finishes.
  // NOTE: plain CSS only (used inside page.evaluate's querySelector — no :has-text).
  doneControls:
    '.DocSearch-AskAiScreen button[aria-label="Like"], .DocSearch-AskAiScreen button[aria-label="Dislike"], .DocSearch-AskAiScreen button[aria-label="Copy"]',
};

const STREAM_MAX_MS = 60000; // hard ceiling on the whole stream
const STREAM_STABLE_MS = 2500; // text must be unchanged this long to count as settled
const POLL_MS = 500;

/** slugify a question into a safe filename stem (shared convention with capture.mjs). */
export function slugify(question) {
  return question
    .toLowerCase()
    .replace(/[`'"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

/** Collapse whitespace, trim. */
function clean(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

/**
 * Strip the leading Ask AI tool/status chatter that prefixes the streamed
 * answer (e.g. 'Searched for "x" found N results' and 'I'll quickly verify
 * this for you. One moment, please.'). Keeps the substantive answer.
 */
function stripToolPrefix(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let i = 0;
  const noise = [
    /^searched for\b/i,
    /^i'?ll quickly verify/i,
    /^one moment/i,
    /^answering\.\.\.$/i,
    /^answers are generated with ai/i,
    /^\s*$/,
  ];
  while (i < lines.length && noise.some((re) => re.test(lines[i].trim()))) i++;
  return lines.slice(i).join('\n').trim();
}

/**
 * Drive the support.algolia.com Ask AI widget for one question.
 * @param {string} question
 * @param {{ headless?: boolean }} [opts]
 * @returns {Promise<AskAICapture>}
 */
export async function captureAskAI(question, opts = {}) {
  const headless = opts.headless ?? true;
  await mkdir(ASKAI_DIR, { recursive: true });
  const slug = slugify(question);
  const screenshotPath = join(ASKAI_DIR, `${slug}.png`);

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 1200 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await ctx.newPage();

  // Diagnostics: confirm the Ask AI backend actually fired.
  let chatRequested = false;
  page.on('request', (r) => {
    if (/askai\.algolia\.com\/chat/.test(r.url())) chatRequested = true;
  });

  /** @type {AskAICapture} */
  const capture = {
    question,
    capturedAt: new Date().toISOString(),
    url: TARGET,
    answerMarkdown: '',
    answerText: '',
    relatedSources: [],
    screenshotPath,
    raw: { method: null, citations: [], timings: {} },
  };

  try {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Dismiss cookie banner (OneTrust) if present.
    await page
      .locator('#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accept")')
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
    await page.waitForTimeout(1200);

    // 1. Open the search modal.
    await page.locator(SEL.trigger).first().click({ timeout: 12000 });
    await page.locator(SEL.modal).first().waitFor({ timeout: 8000 });

    // 2. Type the question (fill is reliable; the dropdown rebuilds on input).
    const input = page.locator(SEL.input).first();
    await input.click({ timeout: 6000 });
    await input.fill(question);
    // Let the dropdown rebuild and surface the "Ask AI: <q>" hit.
    await page.locator(SEL.askAiHit).first().waitFor({ timeout: 10000 });

    // 3. Click the Ask AI hit to start the stream.
    const tClick = Date.now();
    await page.locator(SEL.askAiHit).first().click({ timeout: 8000 });
    await page.locator(SEL.screen).first().waitFor({ timeout: 12000 });

    // 4. Wait for the stream to SETTLE (do not scrape mid-stream).
    let lastLen = -1;
    let stableFor = 0;
    let firstByteAt = 0;
    let settledAt = 0;
    const tStart = Date.now();
    while (Date.now() - tStart < STREAM_MAX_MS) {
      const state = await page.evaluate(
        ({ answerSel, relatedSel, doneSel }) => {
          const ans = document.querySelector(answerSel);
          const len = ans ? (ans.innerText || '').length : 0;
          const hasRelated = !!document.querySelector(relatedSel);
          const hasControls = !!document.querySelector(doneSel);
          return { len, hasRelated, hasControls };
        },
        { answerSel: SEL.answer, relatedSel: SEL.relatedBlock, doneSel: SEL.doneControls }
      );
      if (state.len > 0 && firstByteAt === 0) firstByteAt = Date.now() - tClick;
      if (state.len === lastLen && state.len > 0) {
        stableFor += POLL_MS;
        // Settled when text quiesces AND the end-of-stream affordances exist.
        if (
          stableFor >= STREAM_STABLE_MS &&
          (state.hasControls || state.hasRelated)
        ) {
          settledAt = Date.now() - tClick;
          break;
        }
      } else {
        stableFor = 0;
        lastLen = state.len;
      }
      await page.waitForTimeout(POLL_MS);
    }
    capture.raw.timings = {
      firstByteMs: firstByteAt,
      settledMs: settledAt || STREAM_MAX_MS,
      settled: settledAt > 0,
    };

    // 5. Extract the settled answer + citations + related sources.
    const extracted = await page.evaluate((s) => {
      const ans = document.querySelector(s.answer);
      const screen = document.querySelector(s.screen);

      // Plain text answer.
      const answerText = ans ? ans.innerText : '';

      // Light markdown: headings via <h*>, list items, bold, and links → [text](href).
      let markdown = '';
      if (ans) {
        const walk = (node) => {
          let out = '';
          node.childNodes.forEach((c) => {
            if (c.nodeType === 3) {
              out += c.textContent;
            } else if (c.nodeType === 1) {
              const tag = c.tagName.toLowerCase();
              if (/^h[1-6]$/.test(tag)) out += `\n\n${'#'.repeat(+tag[1])} ${c.innerText.trim()}\n`;
              else if (tag === 'li') out += `\n- ${walk(c).trim()}`;
              else if (tag === 'a' && c.getAttribute('href'))
                out += `[${c.textContent.trim()}](${c.href})`;
              else if (tag === 'a') out += c.textContent;
              else if (tag === 'strong' || tag === 'b') out += `**${c.textContent.trim()}**`;
              else if (tag === 'p' || tag === 'div') out += `\n${walk(c)}\n`;
              else if (tag === 'br') out += '\n';
              else out += walk(c);
            }
          });
          return out;
        };
        markdown = walk(ans)
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      // Inline citations (real hrefs inside the answer body).
      const citations = ans
        ? [...ans.querySelectorAll('a[href]')].map((a) => ({
            label: (a.textContent || '').replace(/\s+/g, ' ').trim(),
            url: a.href,
          }))
        : [];

      // Related sources chips. The <a> chips are JS-handled (often no href attr),
      // so capture the label and href when present.
      const list = document.querySelector(s.relatedList);
      const relatedSources = list
        ? [...list.querySelectorAll(s.relatedItem)].map((a) => {
            const href = a.getAttribute('href') || a.href || '';
            const o = { label: (a.textContent || '').replace(/\s+/g, ' ').trim() };
            if (href && /^https?:/i.test(href)) o.url = href;
            return o;
          })
        : [];

      return {
        answerText,
        markdown,
        citations,
        relatedSources,
        screenText: screen ? screen.innerText : '',
      };
    }, SEL);

    // Keep the structural newlines from innerText; just strip the tool/status prefix.
    capture.answerText = stripToolPrefix(extracted.answerText.trim());
    capture.answerMarkdown = stripToolPrefix(extracted.markdown);
    capture.relatedSources = extracted.relatedSources.filter((r) => r.label);
    capture.raw.citations = extracted.citations;
    capture.raw.chatRequested = chatRequested;

    // Classify outcome.
    if (capture.answerText && capture.answerText.length > 40) {
      capture.raw.method = capture.raw.timings.settled ? 'streamed-settled' : 'streamed-timeout';
      if (!capture.raw.timings.settled)
        capture.raw.blocker = `Stream did not settle within ${STREAM_MAX_MS}ms; captured best-effort partial answer.`;
    } else {
      capture.raw.method = 'no-answer';
      capture.raw.blocker = chatRequested
        ? 'askai /chat fired but no answer text rendered (Turnstile challenge or selector drift on .DocSearch-AskAiScreen-MessageContent).'
        : 'askai /chat never fired — Ask AI hit may not have been clickable (selector drift on .DocSearch-Hit "Ask AI:").';
    }

    // Screenshot of the full answer screen (scroll the modal into a tall viewport).
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  } catch (err) {
    capture.raw.method = 'error';
    capture.raw.blocker = `${err.name}: ${err.message}`.slice(0, 400);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  const jsonPath = join(ASKAI_DIR, `${slug}.json`);
  await writeFile(jsonPath, JSON.stringify(capture, null, 2), 'utf8');
  capture.raw.jsonPath = jsonPath;
  return capture;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const LOCKED_PATH = resolve(__dirname, '../../docs/experiment/test-questions-locked.md');

/** Parse the locked questions file → array of turn-1 questions (multi-turn uses turn-1 only). */
async function loadLockedQuestions() {
  const md = await readFile(LOCKED_PATH, 'utf8');
  const out = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\s*-\s+\*\*[\w.]+\*\*\s+(.+)$/);
    if (!m) continue;
    let q = m[1];
    q = q.split('→')[0]; // multi-turn: turn-1 only
    q = q.replace(/\*\([^)]*\)\*/g, '').replace(/\*[^*]*\*/g, '');
    q = clean(q);
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
    console.log('Usage: node askai-capture.mjs --all | --q "<question>" [--headed]');
    process.exit(1);
  }

  const summary = [];
  for (const q of questions) {
    process.stdout.write(`\n▶ ${q}\n`);
    const cap = await captureAskAI(q, { headless });
    const t = cap.raw.timings || {};
    console.log(
      `  method=${cap.raw.method} firstByte=${t.firstByteMs ?? '-'}ms settled=${t.settledMs ?? '-'}ms ` +
        `answerLen=${cap.answerText.length} sources=${cap.relatedSources.length} citations=${(cap.raw.citations || []).length}`
    );
    if (cap.answerText) console.log(`    head: ${cap.answerText.slice(0, 120).replace(/\n/g, ' ')}…`);
    cap.relatedSources.slice(0, 4).forEach((s) => console.log(`    · ${s.label}${s.url ? '  [' + s.url + ']' : ''}`));
    if (cap.raw.blocker) console.log(`  ⚠ ${cap.raw.blocker}`);
    summary.push({ q, method: cap.raw.method, len: cap.answerText.length, blocker: cap.raw.blocker });
    // polite gap between questions to avoid hammering the live Ask AI backend
    await new Promise((r) => setTimeout(r, 2500));
  }

  console.log('\n=== SUMMARY ===');
  for (const s of summary) {
    const ok = s.len > 40 && s.method.startsWith('streamed');
    console.log(`${ok ? '✓' : '✗'} [${s.method}] (${s.len} chars) ${s.q}${s.blocker ? ' — ' + s.blocker : ''}`);
  }
}

if (isMain()) {
  main().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  });
}
