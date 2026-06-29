/**
 * variantJudge — score the 4 RC2 answer sets (flash / flash-lite / inference /
 * baseline) for the 12 head-to-head questions with the FIXED judge at rounds=3,
 * then pick a per-question + overall winner. All four come from the RC2 pipeline,
 * so sources use the RC2 shape (chunk_text / doc_url / doc_title).
 *
 * Run: cd lab/server && npx tsx src/judge/variantJudge.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_JUDGE_CONFIG,
  judgeArtifactMultiRound,
  type Artifact,
  type Source,
} from "@lab/judge";
import { REPO_ROOT, getEnv } from "../config.js";
import { makeActiveJudgeLlm } from "../activeJudgeLlm.js";

const H2H = join(REPO_ROOT, "scripts", "setup", "h2h");
const RUNS = join(H2H, "runs");
const ROUNDS = Number(getEnv().CALIBRATION_ROUNDS ?? "3");
const SRC_CAP = 20;

const SETS: { label: string; file: string }[] = [
  { label: "flash", file: join(RUNS, "flash_answers.json") },
  { label: "flash-lite", file: join(RUNS, "flash-lite_answers.json") },
  { label: "inference", file: join(RUNS, "inference_answers.json") },
  { label: "baseline", file: join(H2H, "rc2_answers.json") },
];

interface RawAns { qi: number; question: string; system: string; answer: string; sources: any[]; ms?: number }

function toSources(raw: any[]): Source[] {
  return (raw ?? []).slice(0, SRC_CAP).map((s, i) => {
    const text = s.chunk_text ?? s.text ?? s.doc_title ?? s.title ?? "";
    const label = s.doc_url ?? s.url ?? s.doc_title ?? s.title ?? "";
    return { id: `S${i + 1}`, text: String(text).slice(0, 1200), label: String(label) };
  }).filter((s) => s.text.trim().length > 0);
}

async function main() {
  const { llm, provider, model } = await makeActiveJudgeLlm({ fastLive: true });
  console.log(`Judge: ${provider} (${model}), rounds=${ROUNDS}, sourceCap=${SRC_CAP}\n`);

  // Flatten to a task list, then run with bounded concurrency (flash tolerates it).
  const tasks: { label: string; a: RawAns }[] = [];
  for (const { label, file } of SETS) {
    let data: RawAns[];
    try { data = JSON.parse(readFileSync(file, "utf8")); }
    catch (e: any) { console.error(`SKIP ${label}: cannot read ${file} (${e.message})`); continue; }
    for (const a of data) tasks.push({ label, a });
  }

  const scores: any[] = [];
  const CONC = 6;
  let next = 0, done = 0;
  async function worker() {
    while (next < tasks.length) {
      const { label, a } = tasks[next++];
      const sources = toSources(a.sources);
      const artifact: Artifact = { type: "algolia-answer", prompt: a.question, content: a.answer, sources };
      try {
        const r = await judgeArtifactMultiRound(artifact, DEFAULT_JUDGE_CONFIG, llm, ROUNDS);
        scores.push({
          qi: a.qi, system: label,
          composite: r.aggregate.finalScore,
          gateTripped: r.aggregate.gateTripped,
          dimensionMeans: r.aggregate.dimensionMeans,
          ms: a.ms ?? null, answerLen: a.answer.length, sourceCount: sources.length,
        });
      } catch (e: any) {
        scores.push({ qi: a.qi, system: label, composite: null, error: e.message, ms: a.ms ?? null });
      }
      process.stderr.write(`  [${++done}/${tasks.length}] ${label} Q${a.qi + 1}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  writeFileSync(join(RUNS, "variant_scores.json"), JSON.stringify(scores, null, 2));

  const labels = SETS.map((s) => s.label);
  const wins: Record<string, number> = Object.fromEntries(labels.map((l) => [l, 0]));
  let ties = 0;
  console.log("\nQ    " + labels.map((l) => l.padEnd(11)).join("") + "winner");
  for (let qi = 0; qi < 12; qi++) {
    const row = labels.map((l) => scores.find((s) => s.qi === qi && s.system === l));
    const cells = row.map((r) => (r?.composite != null ? r.composite.toFixed(2) : (r ? "GATE/ERR" : "—")).padEnd(11));
    const valid = labels.map((l, i) => ({ l, c: row[i]?.composite })).filter((x) => x.c != null) as { l: string; c: number }[];
    let winner = "—";
    if (valid.length) {
      valid.sort((a, b) => b.c - a.c);
      const top = valid[0], second = valid[1];
      if (second && top.c - second.c < 0.3) { winner = "tie"; ties++; }
      else { winner = top.l; wins[top.l]++; }
    }
    console.log(`Q${(qi + 1 + "").padEnd(3)} ${cells.join("")}${winner}`);
  }
  // Per-system mean composite + mean time.
  console.log("\nMeans:");
  for (const l of labels) {
    const ss = scores.filter((s) => s.system === l && s.composite != null);
    const mc = ss.length ? (ss.reduce((a, b) => a + b.composite, 0) / ss.length).toFixed(2) : "n/a";
    const mt = ss.filter((s) => s.ms).length ? (ss.reduce((a, b) => a + (b.ms || 0), 0) / ss.filter((s) => s.ms).length / 1000).toFixed(1) + "s" : "n/a";
    const gates = scores.filter((s) => s.system === l && s.gateTripped).length;
    console.log(`  ${l.padEnd(11)} meanComposite=${mc}  meanTime=${mt}  gatesTripped=${gates}  wins=${wins[l]}`);
  }
  console.log(`  ties=${ties}`);
  console.log(`\nwrote ${join(RUNS, "variant_scores.json")}`);
}
main().catch((e) => { console.error("variantJudge FAILED:", e); process.exit(1); });
