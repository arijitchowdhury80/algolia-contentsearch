/**
 * sourceRoutingAb — the LIVE scored A/B/C for the content-source routing spike.
 *
 * Question: does routing a question to a content-source-honed specialist beat ONE
 * all-source generalist on answer quality — or is multi-agent just overhead?
 *
 * Per question, three panels are produced and judged blind in one request:
 *   A baseline — `ac2-allsource-neural`: SAME index the specialists use
 *                (AC2_WWW_MULTI_NEURAL) with NO source filter → all 9 sources. 1 hop.
 *                The only variable vs a specialist is the source scope itself.
 *   B oracle   — hand-labeled source → that specialist directly, no router. 1 hop.
 *                Isolates "does source-honing help" from "can the router classify".
 *   C real     — Maverick answers → LLM source-classifier → specialist. 2 hops + classifier.
 *                Adds router-error cost on top of B; judged answer = the specialist.
 *
 * aggregateRouting() turns the paired verdicts into kill / router-bottleneck /
 * multi-agent-wins (decision rule + bands in routingAgg.ts).
 *
 * Agent ids (baseline + specialists) are resolved BY NAME from the live
 * /agent-studio/1/agents list (published on CENTRAL but absent from .env.local) — no
 * env mutation. Create the baseline once via scripts/setup/create_allsource_agent.mjs.
 *
 * ⚠️ CAVEATS (respected + printed in the report):
 *   - Thin sources: the agent stream yields only {title,url} (no body), so grounding is
 *     INDICATIVE. All 3 panels get identically thin sources, so the *relative* A/B/C
 *     composite/coverage/depth deltas are unbiased; treat grounding as directional only.
 *   - Fairness: A, B, C, the classifier, AND the judge all resolve through the same
 *     pinned provider (provider.ts / makeActiveJudgeLlm) — do not pin divergent providers.
 *
 *   Usage (smoke first!):
 *     npm run expt:sourcerouting -- --limit 1
 *     npm run expt:sourcerouting -- --split dev --concurrency 3
 *     npm run expt:sourcerouting -- --extras --rounds 3
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { getEnv, REPO_ROOT } from "../config.js";
import { makeAnswerDeps, makePinnedLlm } from "../answerService.js";
import { makeActiveJudgeLlm } from "../activeJudgeLlm.js";
import { parseQuestions, type TestQuestion, type Split } from "../questions.js";
import { mapWithConcurrency } from "../concurrency.js";
import { judgeLive, makeLlmScorer, type LiveJudgeRequest, type LiveSource } from "../judge/liveJudge.js";
import type { StreamSource, AgentRunResult } from "../agentRunner.js";
import { LABELS, SPECIALIST_AGENT_NAME, type SourceLabel } from "./sourceRouting/labels.js";

/** Panel A baseline: all-source neural agent on the specialists' index, no filter. */
const BASELINE_AGENT_NAME = "ac2-allsource-neural";
import { EXTRA_QUESTIONS } from "./sourceRouting/extraQuestions.js";
import { routeBySource, makeSourceClassifier } from "./sourceRouting/classifier.js";
import {
  aggregateRouting,
  type RoutingRow,
  type PanelScore,
  type RoutingStats,
} from "./sourceRouting/routingAgg.js";

interface Flags {
  limit?: number;
  ids?: string[];
  split?: Split;
  rounds?: number;
  concurrency: number;
  extras: boolean;
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = { concurrency: 3, extras: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") f.limit = Number(argv[++i]);
    else if (a === "--ids") f.ids = argv[++i]?.split(",").map((s) => s.trim());
    else if (a === "--rounds") f.rounds = Number(argv[++i]);
    else if (a === "--concurrency") f.concurrency = Math.max(1, Number(argv[++i]) || 3);
    else if (a === "--extras") f.extras = true;
    else if (a === "--split") {
      const v = argv[++i];
      if (v === "dev" || v === "held-out") f.split = v;
    }
  }
  return f;
}

/** Resolve published Agent Studio agents → { name: id } from the live app. */
async function listLiveAgents(env: Record<string, string | undefined>): Promise<Record<string, string>> {
  const app = env.ALGOLIA_APP_ID ?? "";
  const key = env.ALGOLIA_ADMIN_API_KEY ?? env.ALGOLIA_SEARCH_API_KEY ?? "";
  // ?limit=100: the default page caps at 10 agents (the app has 21) — without this,
  // specialists past the first page silently vanish and routing throws "not found".
  const res = await fetch(`https://${app}.algolia.net/agent-studio/1/agents?limit=100`, {
    headers: {
      "X-Algolia-Application-Id": app,
      "X-Algolia-API-Key": key,
      "Content-Type": "application/json",
      "User-Agent": "curl/8.4.0",
    },
  });
  const text = await res.text();
  let json: { data?: unknown[]; agents?: unknown[]; items?: unknown[] } = {};
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`agent list parse failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const arr = (json.data ?? json.agents ?? json.items ?? []) as Array<Record<string, string>>;
  const map: Record<string, string> = {};
  for (const a of arr) {
    const id = a.id ?? a.objectID ?? a.agentId;
    if (a.name && id) map[a.name] = id;
  }
  return map;
}

/** Agent {title,url} hits → thin LiveSource for the judge (text falls back to title). */
function toLiveSources(sources: StreamSource[]): LiveSource[] {
  return sources.map((s, i) => ({ id: `S${i + 1}`, title: s.title, url: s.url, text: s.title }));
}

const EMPTY: PanelScore = {
  composite: 0,
  dims: { grounding: 0, coverage: 0, depth: 0, relevance: 0 },
  gateTripped: false,
};

/** A token-cost proxy: no token API available, so size of the produced text. */
function tokenProxy(run: AgentRunResult): number {
  return run.answer.length + run.sources.reduce((n, s) => n + (s.title?.length ?? 0), 0);
}

interface OverheadRow {
  A: { ms: number; hops: number; tok: number };
  B: { ms: number; hops: number; tok: number };
  C: { ms: number; hops: number; tok: number };
}

function selectQuestions(f: Flags): TestQuestion[] {
  let qs: TestQuestion[] = parseQuestions();
  if (f.extras) qs = [...qs, ...EXTRA_QUESTIONS];
  if (f.ids) {
    const want = new Set(f.ids);
    qs = qs.filter((q) => want.has(q.id));
  } else if (f.split) {
    qs = qs.filter((q) => q.split === f.split);
  }
  if (f.limit !== undefined) qs = qs.slice(0, f.limit);
  return qs;
}

async function timedRun(
  fn: () => Promise<AgentRunResult>,
): Promise<{ run: AgentRunResult; ms: number }> {
  const t0 = performance.now();
  const run = await fn();
  return { run, ms: Math.round(performance.now() - t0) };
}

interface FullRow extends RoutingRow {
  prompt: string;
  overhead: OverheadRow;
}

async function main(): Promise<void> {
  const f = parseFlags(process.argv.slice(2));
  const env = getEnv();

  const deps = await makeAnswerDeps(env);
  // Specialists + the all-source baseline are published on the app but absent from
  // .env.local — resolve ids by name from the live agent list (no env mutation).
  const liveAgents = await listLiveAgents(env);

  // Panel A baseline = ac2-allsource-neural: SAME index the specialists use
  // (AC2_WWW_MULTI_NEURAL) with NO source filter → all 9 sources. This strips the
  // 6-source-Maverick blindness confound, so the only variable vs a specialist is scope.
  const baselineId = liveAgents[BASELINE_AGENT_NAME];
  if (!baselineId) throw new Error(`${BASELINE_AGENT_NAME} not found on the live app — run scripts/setup/create_allsource_agent.mjs first.`);
  // Panel C first hop = the INCUMBENT Maverick (it answers value/discovery before handoff).
  const maverickId = deps.agentIds.maverick;
  if (!maverickId) throw new Error("ALGOLIA_AGENT_MAVERICK_NEURAL_ID is empty — Maverick (Panel C first hop) not created.");

  const specialistId = (label: SourceLabel): string => {
    const id = liveAgents[SPECIALIST_AGENT_NAME[label]];
    if (!id) throw new Error(`${SPECIALIST_AGENT_NAME[label]} not found on the live app — cannot route ${label}.`);
    return id;
  };

  const { llm: classifierLlm, provider, model } = await makePinnedLlm(env);
  const classify = makeSourceClassifier(classifierLlm);
  const judge = await makeActiveJudgeLlm({ fastLive: true });
  const scorer = makeLlmScorer(judge.llm);
  const rounds = f.rounds ?? 1;

  const questions = selectQuestions(f);
  process.stderr.write(
    `[source-routing] ${questions.length} question(s) · agent ${provider}/${model} · judge ${judge.provider}/${judge.model} · rounds=${rounds} · concurrency=${f.concurrency}\n`,
  );

  const rows: FullRow[] = await mapWithConcurrency(questions, f.concurrency, async (q) => {
    const label = LABELS[q.id];
    const oracle: SourceLabel = label ? routeBySource(label) : "technical";
    const span = label?.span ?? false;

    // Panel A — all-source baseline (1 hop).
    const aRes = await timedRun(() => deps.runAgent(baselineId, q.prompt, []));
    // Panel B — oracle-routed specialist (1 hop, no router).
    const bRes = await timedRun(() => deps.runAgent(specialistId(oracle), q.prompt, []));
    // Panel C — Maverick answers (value/discovery first hop), classifier routes,
    // specialist answers (2 hops + classifier).
    const cMav = await timedRun(() => deps.runAgent(maverickId, q.prompt, []));
    let routed: SourceLabel = "technical";
    try {
      routed = await classify(q.prompt);
    } catch {
      routed = "technical";
    }
    const cSpec = await timedRun(() => deps.runAgent(specialistId(routed), q.prompt, []));

    // Judge all three answers as panels of the SAME question, blind.
    const req: LiveJudgeRequest = {
      question: q.prompt,
      ...(q.isRefusalTest ? { isRefusalTest: true } : {}),
      rounds,
      panels: [
        { panelId: "A", answer: aRes.run.answer, sources: toLiveSources(aRes.run.sources) },
        { panelId: "B", answer: bRes.run.answer, sources: toLiveSources(bRes.run.sources) },
        { panelId: "C", answer: cSpec.run.answer, sources: toLiveSources(cSpec.run.sources) },
      ],
    };

    let A: PanelScore = { ...EMPTY };
    let B: PanelScore = { ...EMPTY };
    let C: PanelScore = { ...EMPTY };
    try {
      const res = await judgeLive(req, scorer);
      const by = new Map(res.panels.map((p) => [p.panelId, p]));
      const pick = (id: string): PanelScore => {
        const v = by.get(id);
        return v
          ? { composite: v.composite, dims: v.dims, gateTripped: v.gateTripped, ...(v.error ? { error: v.error } : {}) }
          : { ...EMPTY, error: "no verdict" };
      };
      A = pick("A");
      B = pick("B");
      C = pick("C");
    } catch (e) {
      const error = (e as Error).message;
      A = { ...EMPTY, error };
      B = { ...EMPTY, error };
      C = { ...EMPTY, error };
    }

    // Carry agent errors into the panel so the aggregator excludes them.
    if (aRes.run.error && !A.error) A = { ...A, error: aRes.run.error };
    if (bRes.run.error && !B.error) B = { ...B, error: bRes.run.error };
    if (cSpec.run.error && !C.error) C = { ...C, error: cSpec.run.error };

    process.stderr.write(
      `[source-routing] ${q.id} oracle=${oracle} routed=${routed}${routed === oracle ? "" : "✗"} A=${A.composite.toFixed(1)} B=${B.composite.toFixed(1)} C=${C.composite.toFixed(1)}\n`,
    );

    return {
      id: q.id,
      category: q.category,
      sourceLabel: oracle,
      routedLabel: routed,
      routedCorrect: routed === oracle,
      span,
      prompt: q.prompt,
      A,
      B,
      C,
      overhead: {
        A: { ms: aRes.ms, hops: 1, tok: tokenProxy(aRes.run) },
        B: { ms: bRes.ms, hops: 1, tok: tokenProxy(bRes.run) },
        C: { ms: cMav.ms + cSpec.ms, hops: 2, tok: tokenProxy(cMav.run) + tokenProxy(cSpec.run) },
      },
    };
  });

  const agg = aggregateRouting(rows);

  const outDir = resolve(REPO_ROOT, "docs", "experiment");
  mkdirSync(outDir, { recursive: true });
  const meta = {
    generatedBy: "sourceRoutingAb.ts",
    agentProvider: `${provider}/${model}`,
    judgeProvider: `${judge.provider}/${judge.model}`,
    rounds,
    nQuestions: rows.length,
    routerAccuracy: agg.routerAccuracy,
  };
  writeFileSync(
    resolve(outDir, "source-routing-ab-results.json"),
    JSON.stringify({ meta, aggregate: agg, rows }, null, 2) + "\n",
  );
  writeFileSync(resolve(outDir, "source-routing-ab-summary.md"), renderMarkdown(meta, agg, rows));

  process.stdout.write(JSON.stringify({ meta, aggregate: agg }, null, 2) + "\n");
  process.stderr.write(`[source-routing] VERDICT: ${agg.verdict.toUpperCase()} — ${agg.rationale}\n`);
}

function meanOverhead(rows: FullRow[], pick: (o: OverheadRow) => { ms: number; hops: number; tok: number }) {
  const clean = rows.filter((r) => !r.A.error && !r.B.error && !r.C.error);
  if (clean.length === 0) return { ms: 0, hops: 0, tok: 0 };
  const vals = clean.map((r) => pick(r.overhead));
  const m = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return { ms: m(vals.map((v) => v.ms)), hops: vals[0].hops, tok: m(vals.map((v) => v.tok)) };
}

function renderMarkdown(
  meta: Record<string, unknown>,
  agg: ReturnType<typeof aggregateRouting>,
  rows: FullRow[],
): string {
  const s = agg.all;
  const scoreLine = (label: string, mean: number, delta: string, st: RoutingStats, arm: "A" | "B" | "C", wtl: string) => {
    const dm = arm === "A" ? st.dimMeansA : arm === "B" ? st.dimMeansB : st.dimMeansC;
    return `| ${label} | ${st.n} | ${mean} | ${delta} | ${dm.grounding} | ${dm.coverage} | ${dm.depth} | ${dm.relevance} | ${wtl} |`;
  };
  const oh = { A: meanOverhead(rows, (o) => o.A), B: meanOverhead(rows, (o) => o.B), C: meanOverhead(rows, (o) => o.C) };
  const per = (r: FullRow) =>
    `| ${r.id} | ${r.sourceLabel} | ${r.routedLabel}${r.routedCorrect ? "" : " ✗"} | ${r.span ? "span" : ""} | ${r.A.composite.toFixed(1)} | ${r.B.composite.toFixed(1)} | ${r.C.composite.toFixed(1)} | ${(r.B.composite - r.A.composite).toFixed(1)} | ${(r.C.composite - r.A.composite).toFixed(1)} | ${r.A.error || r.B.error || r.C.error ? "err" : ""} |`;

  return `# Content-Source Routing — scored A/B/C spike

_Generated by \`sourceRoutingAb.ts\`. Agent: ${meta.agentProvider}. Judge: ${meta.judgeProvider} (INDICATIVE, fastLive). Rounds: ${meta.rounds}. Questions: ${meta.nQuestions}._

## Verdict: **${agg.verdict.toUpperCase()}**
${agg.rationale}

**Router accuracy (Panel C, clean rows): ${Math.round(agg.routerAccuracy * 100)}%.**

## Scorecard (clean = all 3 panels scored without error)
| panel | n | mean | Δ vs A | grounding | coverage | depth | relevance | W/T/L vs A |
|---|---|---|---|---|---|---|---|---|
${scoreLine("A baseline (all-source, no filter)", s.meanA, "—", s, "A", "—")}
${scoreLine("B oracle (honed)", s.meanB, `${s.deltaBA >= 0 ? "+" : ""}${s.deltaBA}`, s, "B", `${s.bWins}/${s.bTies}/${s.bLosses}`)}
${scoreLine("C real router", s.meanC, `${s.deltaCA >= 0 ? "+" : ""}${s.deltaCA}`, s, "C", `${s.cWins}/${s.cTies}/${s.cLosses}`)}

Errored rows excluded: ${agg.errored}.

## Clean (single-domain) vs span split — Δ B vs A
| subset | n | mean A | mean B | Δ B−A | mean C | Δ C−A |
|---|---|---|---|---|---|---|
| single-domain | ${agg.clean.n} | ${agg.clean.meanA} | ${agg.clean.meanB} | ${agg.clean.deltaBA} | ${agg.clean.meanC} | ${agg.clean.deltaCA} |
| span (2+ sources) | ${agg.span.n} | ${agg.span.meanA} | ${agg.span.meanB} | ${agg.span.deltaBA} | ${agg.span.meanC} | ${agg.span.deltaCA} |

## Overhead (the cost side of the merit/demerit ledger)
| panel | agent hops | mean latency ms | mean token proxy |
|---|---|---|---|
| A baseline | ${oh.A.hops} | ${oh.A.ms} | ${oh.A.tok} |
| B oracle | ${oh.B.hops} | ${oh.B.ms} | ${oh.B.tok} |
| C real router | ${oh.C.hops} (+classifier) | ${oh.C.ms} | ${oh.C.tok} |

## Per-question
| id | oracle | routed | span | A | B | C | ΔBA | ΔCA | err |
|---|---|---|---|---|---|---|---|---|---|
${rows.map(per).join("\n")}

## Caveats
- **Baseline = all-source, same index, no filter (\`ac2-allsource-neural\`).** It searches the identical AC2_WWW_MULTI_NEURAL index the specialists use, with the source filter removed — so the ONLY variable vs a specialist is the source scope. This strips the 6-source-Maverick blindness confound: a B/C win here is attributable to scoping (focus), not to content the baseline couldn't see.
- **Thin sources:** the agent stream gives only {title,url}; grounding is INDICATIVE (text falls back to title). The bias is symmetric across A/B/C, so composite/coverage/depth Δ is the trustworthy signal; treat grounding as directional only.
- **Flash-judge noise:** \`fastLive\` = gemini-2.5-flash occasionally emits malformed JSON (isolated per-panel \`error\`, excluded above). Re-run with \`--rounds 3\` to dampen.
- **Oracle-label subjectivity:** span questions have no single correct source; the oracle is the PRIMARY domain. If B wins only on single-domain and ties on span, the honest finding is "honing helps single-domain, not cross-domain."
- **Charter narrowness:** academy/support specialists are single-source — they may under-retrieve on span questions and lose to the all-source baseline on coverage alone. A B-loss WITH a span-only pattern is a charter-width problem, not a routing kill.
- **Token proxy:** no token API available — \`tok\` = answer chars + source-title chars, a relative size proxy only.
`;
}

main().catch((e) => {
  process.stderr.write(`[source-routing] error: ${(e as Error).message}\n`);
  process.exit(1);
});
