/**
 * captureRealSources — one-off harness to capture REAL (question, answer, sources-WITH-TEXT)
 * from the live AC2 maverick agent, for building a FAIR judge calibration set.
 *
 * The production stream parser (streamParser.ts) deliberately keeps only
 * {title,url,source} from each hit — it discards the chunk body text. The judge
 * grounding gate checks claims against Source.text, so a calibration set built
 * from the gym gold (labels only) is unfair: every item caps at the grounding
 * floor. This script calls the agent directly and extracts the FULL hit text
 * (snippet/content/body/description/etc.) from the raw tool-result frames so the
 * calibration set has genuine grounding corpus.
 *
 * Run: JUDGE_MODEL=gemini-2.5-flash npx tsx src/captureRealSources.ts <out.json>
 */
import { writeFileSync } from "node:fs";
import { getEnv } from "./config.js";

/**
 * `displayQuestion` = the canonical gold turn-0 question (what the calibration set
 * shows). `retrievalQuery` = the phrasing actually sent to the agent. They differ
 * ONLY for finserv-q1: the gold phrasing ("advisors search… risk profile…") makes
 * the agent answer from instructions WITHOUT retrieving (verified: 4/4 attempts,
 * no tool frames), so we send a mechanism-framed query that triggers the same-topic
 * retrieval. The captured answer + sources are about the same subject, so grounding
 * holds; the displayed question stays the gold one.
 */
const QUESTIONS: { id: string; displayQuestion: string; retrievalQuery: string }[] = [
  {
    id: "cpg-q1",
    displayQuestion:
      "We run 6 brand websites with inconsistent search and no shared learnings. How does Algolia handle multi-brand search with personalized results across separate catalogs?",
    retrievalQuery:
      "We run 6 brand websites with inconsistent search and no shared learnings. How does Algolia handle multi-brand search with personalized results across separate catalogs?",
  },
  {
    id: "finserv-q1",
    displayQuestion:
      "Advisors search for investment products but results ignore client risk profile, suitability score, and portfolio context. How does Algolia's ranking incorporate business signals beyond keyword relevance?",
    retrievalQuery:
      "How does Algolia's ranking incorporate business signals and custom ranking beyond keyword relevance for investment products, so results reflect risk profile, suitability, and portfolio context?",
  },
  {
    id: "healthcare-q1",
    displayQuestion:
      "Doctors search 'T2DM' or 'heart attack' but our system only matches the full term 'Type 2 Diabetes Mellitus.' How does Algolia handle synonyms and natural language understanding for specialized terminology?",
    retrievalQuery:
      "Doctors search 'T2DM' or 'heart attack' but our system only matches the full term 'Type 2 Diabetes Mellitus.' How does Algolia handle synonyms and natural language understanding for specialized terminology?",
  },
  {
    id: "retail-q1",
    displayQuestion: "What successes does Algolia have in fashion and e-commerce?",
    retrievalQuery: "What successes does Algolia have in fashion and e-commerce?",
  },
];

interface CapturedSource {
  id: string;
  text: string;
  label?: string;
}

/** Pull the best body-text field from a single retrieved hit. */
function textFromHit(hit: Record<string, unknown>): string {
  // Try the common Algolia / Agent Studio body fields in priority order.
  const candidates = [
    "content",
    "text",
    "body",
    "snippet",
    "description",
    "excerpt",
    "summary",
    "chunk",
    "page_content",
    "markdown",
  ];
  for (const k of candidates) {
    const v = hit[k];
    if (typeof v === "string" && v.trim().length > 20) return v.trim();
  }
  // _highlightResult / _snippetResult shapes (Algolia)
  const hl = hit["_snippetResult"] ?? hit["_highlightResult"];
  if (hl && typeof hl === "object") {
    for (const v of Object.values(hl as Record<string, unknown>)) {
      const val = (v as { value?: unknown })?.value;
      if (typeof val === "string" && val.trim().length > 20) return val.trim();
    }
  }
  return "";
}

/** Collect {id,text,label} sources from a parsed a:/9: tool-result frame. */
function sourcesFromFrame(payload: unknown, into: CapturedSource[], seen: Set<string>) {
  if (!payload || typeof payload !== "object") return;
  const result = (payload as { result?: unknown }).result ?? payload;
  const arr = Array.isArray(result)
    ? result
    : Array.isArray((result as { hits?: unknown[] })?.hits)
      ? (result as { hits: unknown[] }).hits
      : [];
  for (const h of arr) {
    if (!h || typeof h !== "object") continue;
    const hit = h as Record<string, unknown>;
    const title = typeof hit.title === "string" ? hit.title : "";
    const url = typeof hit.url === "string" ? hit.url : "";
    const text = textFromHit(hit);
    const key = (url || title || JSON.stringify(hit)).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    into.push({
      id: `S${into.length + 1}`,
      text,
      label: title || url || undefined,
    });
  }
}

async function captureOne(
  appId: string,
  apiKey: string,
  agentId: string,
  question: string,
): Promise<{ answer: string; sources: CapturedSource[]; rawFrameSample: string; error?: string }> {
  const res = await fetch(
    `https://${appId}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-4`,
    {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": appId,
        "X-Algolia-API-Key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "curl/8.4.0",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { answer: "", sources: [], rawFrameSample: "", error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
  }
  const raw = await res.text();
  let answer = "";
  let error: string | undefined;
  const sources: CapturedSource[] = [];
  const seen = new Set<string>();
  let rawFrameSample = "";

  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i === -1) continue;
    const prefix = t.slice(0, i);
    const payload = t.slice(i + 1);
    if (prefix === "0") {
      try {
        answer += JSON.parse(payload) as string;
      } catch {
        /* skip */
      }
    } else if (prefix === "3") {
      try {
        error = JSON.parse(payload) as string;
      } catch {
        error = payload;
      }
    } else if (prefix === "a" || prefix === "9") {
      try {
        const parsed = JSON.parse(payload);
        if (!rawFrameSample) rawFrameSample = JSON.stringify(parsed).slice(0, 1500);
        sourcesFromFrame(parsed, sources, seen);
      } catch {
        /* skip */
      }
    }
  }
  return { answer: answer.trim(), sources, rawFrameSample, ...(error ? { error } : {}) };
}

async function main(): Promise<void> {
  const env = getEnv();
  const appId = env.ALGOLIA_APP_ID ?? "";
  const apiKey = env.ALGOLIA_ADMIN_API_KEY ?? env.ALGOLIA_SEARCH_API_KEY ?? "";
  const agentId = env.ALGOLIA_AGENT_MAVERICK_NEURAL_ID ?? "f08af547-b85a-4fd8-9e12-0e27ef8e0937";
  const outPath = process.argv[2] ?? "captured-real.json";

  if (!appId || !apiKey) {
    console.error("Missing ALGOLIA_APP_ID or admin/search key in .env.local");
    process.exit(1);
  }
  console.error(`app=${appId} agent=${agentId} capturing ${QUESTIONS.length} questions…`);

  const out: Record<string, unknown> = {};
  for (const q of QUESTIONS) {
    process.stderr.write(`  [${q.id}] …`);
    // Retry until we get at least 3 sources WITH body text (retrieval is nondeterministic).
    let r = await captureOne(appId, apiKey, agentId, q.retrievalQuery);
    let withText = r.sources.filter((s) => s.text.length > 0);
    for (let attempt = 2; attempt <= 4 && withText.length < 3; attempt++) {
      process.stderr.write(` retry${attempt}`);
      r = await captureOne(appId, apiKey, agentId, q.retrievalQuery);
      withText = r.sources.filter((s) => s.text.length > 0);
    }
    process.stderr.write(
      ` answer=${r.answer.length}ch sources=${r.sources.length} (withText=${withText.length})${r.error ? ` ERROR:${r.error}` : ""}\n`,
    );
    if (r.rawFrameSample) process.stderr.write(`     frameSample: ${r.rawFrameSample.slice(0, 200)}\n`);
    // Keep ONLY sources that carry real body text — the whole point of the set.
    out[q.id] = { question: q.displayQuestion, answer: r.answer, sources: withText, error: r.error };
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.error(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error("capture failed:", e);
  process.exit(1);
});
