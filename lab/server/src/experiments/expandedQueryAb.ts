/**
 * expandedQueryAb — the LIVE scored A/B for Backlog A (SESSION.md): does
 * `brain.expandedQuery` (the LLM rephrase before retrieval) actually improve
 * answer quality over sending the RAW user turn to the agent? If not, it's safe
 * to delete (the highest-cost, highest-risk coordinator piece — it also causes
 * the documented false-refusal bug).
 *
 * Method — isolates EXACTLY the variable being dropped:
 *   For each locked test question, run the SAME Maverick neural agent (P3 single)
 *   twice on the same CENTRAL app:
 *     RAW arm     → send the raw user prompt        (the proposed behavior)
 *     REWRITE arm → runBrain → send brain.expandedQuery (today's single-panel path)
 *   Then judge BOTH answers as two panels of the same question with the live
 *   judge, and compare the 4-dim "Confidence" composite. aggregateAb() turns the
 *   paired verdicts into a keep/drop decision (changed-subset, noise-banded).
 *
 * HONEST CAVEATS (printed in the report):
 *   - Agent sources carry only {title,url} (no body text — agentRunner discards
 *     it), so grounding is THIN. BUT both arms get identical thin sources, so the
 *     RAW-vs-REWRITE *relative* comparison is unbiased (the absolute grounding
 *     number is not meaningful; the delta is). This is the same INDICATIVE judge
 *     the live UI uses, not the authoritative full-source batch.
 *   - Single-turn only: expandedQuery's residual value is multi-turn coreference
 *     ("what about pricing?"), which this opener-only set does not exercise. The
 *     findings doc already proposes keeping a thin coref rewrite regardless.
 *
 *   Usage (smoke first!):
 *     npx tsx src/experiments/expandedQueryAb.ts --limit 1
 *     npx tsx src/experiments/expandedQueryAb.ts --split dev --concurrency 3
 *     npx tsx src/experiments/expandedQueryAb.ts --ids 3.1,7.1 --rounds 3
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { getEnv, REPO_ROOT } from "../config.js";
import { makePinnedLlm, makeAnswerDeps } from "../answerService.js";
import { makeActiveJudgeLlm } from "../activeJudgeLlm.js";
import { runBrain } from "../brain.js";
import { emptyDossier } from "../discovery.js";
import { parseQuestions, type TestQuestion, type Split } from "../questions.js";
import { mapWithConcurrency } from "../concurrency.js";
import {
  judgeLive,
  makeLlmScorer,
  type LiveJudgeRequest,
  type LiveSource,
} from "../judge/liveJudge.js";
import type { StreamSource } from "../agentRunner.js";
import {
  aggregateAb,
  normalizeQuery,
  type AbRow,
  type AbArm,
} from "./expandedQueryAgg.js";

interface Flags {
  limit?: number;
  ids?: string[];
  split?: Split;
  rounds?: number;
  concurrency: number;
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = { concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") f.limit = Number(argv[++i]);
    else if (a === "--ids") f.ids = argv[++i]?.split(",").map((s) => s.trim());
    else if (a === "--rounds") f.rounds = Number(argv[++i]);
    else if (a === "--concurrency") f.concurrency = Math.max(1, Number(argv[++i]) || 3);
    else if (a === "--split") {
      const v = argv[++i];
      if (v === "dev" || v === "held-out") f.split = v;
    }
  }
  return f;
}

/** Agent {title,url} hits → thin LiveSource for the judge (text falls back to title). */
function toLiveSources(sources: StreamSource[]): LiveSource[] {
  return sources.map((s, i) => ({
    id: `S${i + 1}`,
    title: s.title,
    url: s.url,
    text: s.title, // no body text available from the stream; symmetric across arms
  }));
}

const EMPTY_ARM: AbArm = {
  composite: 0,
  dims: { grounding: 0, coverage: 0, depth: 0, relevance: 0 },
  gateTripped: false,
};

function selectQuestions(f: Flags): TestQuestion[] {
  let qs = parseQuestions();
  if (f.ids) {
    const want = new Set(f.ids);
    qs = qs.filter((q) => want.has(q.id));
  } else if (f.split) {
    qs = qs.filter((q) => q.split === f.split);
  }
  if (f.limit !== undefined) qs = qs.slice(0, f.limit);
  return qs;
}

async function main(): Promise<void> {
  const f = parseFlags(process.argv.slice(2));
  const env = getEnv();

  // Build the live seams — identical to the production single-panel path.
  const deps = await makeAnswerDeps(env);
  const maverickId = deps.agentIds.maverick;
  if (!maverickId) throw new Error("ALGOLIA_AGENT_MAVERICK_NEURAL_ID is empty — agent not created.");
  const { llm: brainLlm, provider, model } = await makePinnedLlm(env);
  const judge = await makeActiveJudgeLlm({ fastLive: true });
  const scorer = makeLlmScorer(judge.llm);
  const rounds = f.rounds ?? 1;

  const questions = selectQuestions(f);
  process.stderr.write(
    `[expandedquery-ab] ${questions.length} question(s) · agent provider ${provider}/${model} · judge ${judge.provider}/${judge.model} · rounds=${rounds} · concurrency=${f.concurrency}\n`,
  );

  const rows: AbRow[] = await mapWithConcurrency(questions, f.concurrency, async (q) => {
    // RAW arm — bypass brain, send the user turn straight to the agent.
    const rawRun = await deps.runAgent(maverickId, q.prompt, []);

    // REWRITE arm — today's path: brain rephrases, agent answers the rephrase.
    let expandedQuery = q.prompt;
    try {
      const brain = await runBrain(q.prompt, emptyDossier(), brainLlm);
      expandedQuery = brain.expandedQuery || q.prompt;
    } catch (e) {
      process.stderr.write(`[expandedquery-ab] brain failed on ${q.id}: ${(e as Error).message}\n`);
    }
    const rewriteRun = await deps.runAgent(maverickId, expandedQuery, []);

    // Judge both answers as two panels of the SAME question.
    const req: LiveJudgeRequest = {
      question: q.prompt,
      ...(q.isRefusalTest ? { isRefusalTest: true } : {}),
      rounds,
      panels: [
        { panelId: "RAW", answer: rawRun.answer, sources: toLiveSources(rawRun.sources) },
        { panelId: "REWRITE", answer: rewriteRun.answer, sources: toLiveSources(rewriteRun.sources) },
      ],
    };

    let raw: AbArm = { ...EMPTY_ARM };
    let rewrite: AbArm = { ...EMPTY_ARM };
    try {
      const res = await judgeLive(req, scorer);
      const byId = new Map(res.panels.map((p) => [p.panelId, p]));
      const rv = byId.get("RAW");
      const wv = byId.get("REWRITE");
      if (rv) raw = { composite: rv.composite, dims: rv.dims, gateTripped: rv.gateTripped, ...(rv.error ? { error: rv.error } : {}) };
      if (wv) rewrite = { composite: wv.composite, dims: wv.dims, gateTripped: wv.gateTripped, ...(wv.error ? { error: wv.error } : {}) };
    } catch (e) {
      const msg = (e as Error).message;
      raw = { ...EMPTY_ARM, error: msg };
      rewrite = { ...EMPTY_ARM, error: msg };
    }

    // Carry agent errors into the arm so aggregateAb excludes them.
    if (rawRun.error && !raw.error) raw = { ...raw, error: rawRun.error };
    if (rewriteRun.error && !rewrite.error) rewrite = { ...rewrite, error: rewriteRun.error };

    const queryChanged = normalizeQuery(expandedQuery) !== normalizeQuery(q.prompt);
    process.stderr.write(
      `[expandedquery-ab] ${q.id} raw=${raw.composite.toFixed(1)} rewrite=${rewrite.composite.toFixed(1)} Δ=${(rewrite.composite - raw.composite).toFixed(1)} changed=${queryChanged}\n`,
    );

    return { id: q.id, category: q.category, isRefusalTest: q.isRefusalTest, rawPrompt: q.prompt, expandedQuery, queryChanged, raw, rewrite };
  });

  const agg = aggregateAb(rows);

  // --- Write artifacts ---
  const outDir = resolve(REPO_ROOT, "docs", "experiment");
  mkdirSync(outDir, { recursive: true });
  const meta = {
    generatedBy: "expandedQueryAb.ts",
    agentProvider: `${provider}/${model}`,
    judgeProvider: `${judge.provider}/${judge.model}`,
    rounds,
    nQuestions: rows.length,
  };
  writeFileSync(
    resolve(outDir, "expandedquery-ab-results.json"),
    JSON.stringify({ meta, aggregate: agg, rows }, null, 2) + "\n",
  );
  writeFileSync(resolve(outDir, "expandedquery-ab-summary.md"), renderMarkdown(meta, agg, rows));

  process.stdout.write(JSON.stringify({ meta, aggregate: agg }, null, 2) + "\n");
  process.stderr.write(`[expandedquery-ab] VERDICT: ${agg.verdict.toUpperCase()} — ${agg.rationale}\n`);
}

function renderMarkdown(
  meta: Record<string, unknown>,
  agg: ReturnType<typeof aggregateAb>,
  rows: AbRow[],
): string {
  const s = agg.changed;
  const a = agg.all;
  const line = (r: AbRow) =>
    `| ${r.id} | ${r.queryChanged ? "yes" : "no"} | ${r.raw.composite.toFixed(1)} | ${r.rewrite.composite.toFixed(1)} | ${(r.rewrite.composite - r.raw.composite).toFixed(1)} | ${r.raw.error || r.rewrite.error ? "err" : ""} |`;
  return `# expandedQuery drop — scored A/B (Backlog A)

_Generated by \`expandedQueryAb.ts\`. Agent: ${meta.agentProvider}. Judge: ${meta.judgeProvider} (INDICATIVE, fastLive). Rounds: ${meta.rounds}. Questions: ${meta.nQuestions}._

## Verdict: **${agg.verdict.toUpperCase()}**
${agg.rationale}

## Stats (changed = rows where expandedQuery actually rewrote the prompt)
| Set | n | mean RAW | mean REWRITE | Δ (rewrite−raw) | wins | ties | losses |
|---|---|---|---|---|---|---|---|
| changed | ${s.n} | ${s.meanRaw} | ${s.meanRewrite} | ${s.meanDelta} | ${s.wins} | ${s.ties} | ${s.losses} |
| all | ${a.n} | ${a.meanRaw} | ${a.meanRewrite} | ${a.meanDelta} | ${a.wins} | ${a.ties} | ${a.losses} |

Errored rows excluded: ${agg.errored}.

### Dimension means (changed subset)
| dim | RAW | REWRITE |
|---|---|---|
| grounding | ${s.dimMeansRaw.grounding} | ${s.dimMeansRewrite.grounding} |
| coverage | ${s.dimMeansRaw.coverage} | ${s.dimMeansRewrite.coverage} |
| depth | ${s.dimMeansRaw.depth} | ${s.dimMeansRewrite.depth} |
| relevance | ${s.dimMeansRaw.relevance} | ${s.dimMeansRewrite.relevance} |

## Per-question
| id | rewritten? | RAW | REWRITE | Δ | err |
|---|---|---|---|---|---|
${rows.map(line).join("\n")}

## Caveats
- **Thin sources:** agent stream gives only {title,url}; grounding is indicative, but the bias is symmetric across both arms, so the Δ is the trustworthy signal.
- **Single-turn only:** multi-turn coreference (the one residual value of expandedQuery) is not exercised by this opener set; keep a thin coref rewrite regardless of this verdict.
`;
}

main().catch((e) => {
  process.stderr.write(`[expandedquery-ab] error: ${(e as Error).message}\n`);
  process.exit(1);
});
