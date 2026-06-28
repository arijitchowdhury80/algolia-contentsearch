/**
 * bench_pipeline — measure the answer pipeline step-by-step.
 *
 * Wraps the injectable runAgent + llm deps with timers (every llm call is tagged:
 * maverick:extract / maverick:synthesize / maverick:followup / single:followup;
 * runAgent = an Agent Studio completion). Runs each panel SERIALLY so step
 * attribution is clean, prints a per-step timeline + the bottleneck, then a
 * summary. In production the 4 panels run in PARALLEL, so the user's wall-clock
 * ≈ max(panel) + judge — noted in the summary.
 *
 *   npx tsx bench_pipeline.ts ["question one" "question two" ...]
 */
import { getEnv } from "./src/config.js";
import { makeAnswerDeps } from "./src/answerService.js";
import { buildPanels } from "./src/panels.js";
import { producePanelAnswer } from "./src/answer.js";

interface Ev { tag: string; startRel: number; endRel: number; ms: number }

const DEFAULT_QS = [
  "What is NeuralSearch and how does it work?",
  "How does Algolia Recommend work?",
];

function fmt(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  const questions = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_QS;
  const env = getEnv();
  const baseDeps = await makeAnswerDeps(env);
  const panels = buildPanels(env);

  // Per-run event buffer + the panel start clock (reset before each panel).
  let events: Ev[] = [];
  let clock = 0;

  const deps = {
    ...baseDeps,
    llm: async (prompt: string, opts?: { tag?: string }) => {
      const s = Date.now();
      const out = await baseDeps.llm(prompt, opts as never);
      const e = Date.now();
      events.push({ tag: opts?.tag ?? "llm", startRel: s - clock, endRel: e - clock, ms: e - s });
      return out;
    },
    runAgent: async (agentId: string, query: string, history?: unknown) => {
      const s = Date.now();
      const out = await baseDeps.runAgent(agentId, query, history as never);
      const e = Date.now();
      events.push({ tag: `runAgent(${out.sources?.length ?? 0} hits)`, startRel: s - clock, endRel: e - clock, ms: e - s });
      return out;
    },
  };

  const summary: Array<{ q: string; panel: string; wall: number; steps: Ev[] }> = [];

  for (const q of questions) {
    console.log(`\n${"=".repeat(72)}\nQUESTION: ${q}\n${"=".repeat(72)}`);
    for (const panel of panels) {
      events = [];
      clock = Date.now();
      const t0 = Date.now();
      try {
        await producePanelAnswer(panel, q, { deps });
      } catch (e) {
        console.log(`  ${panel.panelId} ERROR: ${(e as Error).message}`);
        continue;
      }
      const wall = Date.now() - t0;
      const tag = `${panel.panelId} ${panel.arch}/${panel.retrieval}`;
      console.log(`\n  ── ${tag} — wall ${fmt(wall)} ──`);
      // Timeline: each step with its window [start→end] and whether it overlapped (parallel).
      const sorted = [...events].sort((a, b) => a.startRel - b.startRel);
      let measured = 0;
      for (const ev of sorted) {
        const bar = " ".repeat(Math.round(ev.startRel / wall * 24));
        console.log(`     ${ev.tag.padEnd(22)} ${fmt(ev.ms).padStart(7)}  ${bar}[${fmt(ev.startRel)}→${fmt(ev.endRel)}]`);
        measured += ev.ms;
      }
      // Parallelism check: sum of step ms vs wall (sum>wall ⇒ overlap = parallel fan-out).
      const overlap = measured - wall;
      console.log(`     ${"(sum of steps)".padEnd(22)} ${fmt(measured).padStart(7)}  ${overlap > 500 ? `(=${fmt(overlap)} ran in parallel)` : "(serial)"}`);
      summary.push({ q, panel: tag, wall, steps: sorted });
    }
  }

  // ---- Bottleneck summary across all runs ----
  console.log(`\n${"=".repeat(72)}\nBOTTLENECK SUMMARY (per panel type, averaged)\n${"=".repeat(72)}`);
  const byPanel = new Map<string, { walls: number[]; stepMs: Map<string, number[]> }>();
  for (const r of summary) {
    const key = r.panel.split(" ")[1]; // arch/retrieval
    if (!byPanel.has(key)) byPanel.set(key, { walls: [], stepMs: new Map() });
    const b = byPanel.get(key)!;
    b.walls.push(r.wall);
    // collapse runAgent(...) variants to "runAgent"
    for (const s of r.steps) {
      const t = s.tag.startsWith("runAgent") ? "runAgent" : s.tag;
      if (!b.stepMs.has(t)) b.stepMs.set(t, []);
      b.stepMs.get(t)!.push(s.ms);
    }
  }
  const avg = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;
  for (const [key, b] of byPanel) {
    console.log(`\n  ${key}  — avg wall ${fmt(avg(b.walls))}`);
    const rows = [...b.stepMs.entries()].map(([t, xs]) => ({ t, ms: avg(xs), n: xs.length }))
      .sort((a, c) => c.ms - a.ms);
    for (const row of rows) {
      console.log(`     ${row.t.padEnd(22)} avg ${fmt(row.ms).padStart(7)}  (${row.n} call${row.n !== 1 ? "s" : ""})`);
    }
    const top = rows[0];
    if (top) console.log(`     ⮕ BOTTLENECK: ${top.t} (${fmt(top.ms)})`);
  }
  console.log(`\nNote: panels run SERIALLY here for clean attribution. In production they run\nin PARALLEL, so user wall-clock ≈ slowest panel + judge (~20s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
