/**
 * h2hJudge — score the RC2 + AC2 head-to-head answers with the FIXED judge at
 * rounds=3 (rounds<3 is noise). Reads rc2_answers.json + ac2_answers.json from
 * scripts/setup/h2h/, builds Artifacts (sources mapped to the judge's Source
 * shape, capped at 20/answer for prompt size), and writes judge_scores.json.
 *
 * Run: cd lab/server && npx tsx src/judge/h2hJudge.ts
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
const ROUNDS = Number(getEnv().CALIBRATION_ROUNDS ?? "3");
const SRC_CAP = 20;

interface RawAns {
  qi: number;
  question: string;
  system: string;
  answer: string;
  sources: any[];
}

function toSources(raw: any[], system: string): Source[] {
  return (raw ?? []).slice(0, SRC_CAP).map((s, i) => {
    const text =
      system === "rc2"
        ? (s.chunk_text ?? s.doc_title ?? "")
        : (s.text ?? s.title ?? "");
    const label = system === "rc2" ? (s.doc_url ?? s.doc_title ?? "") : (s.url ?? s.title ?? "");
    return { id: `S${i + 1}`, text: String(text).slice(0, 1200), label: String(label) };
  }).filter((s) => s.text.trim().length > 0);
}

async function main() {
  const rc2 = JSON.parse(readFileSync(join(H2H, "rc2_answers.json"), "utf8")) as RawAns[];
  const ac2 = JSON.parse(readFileSync(join(H2H, "ac2_answers.json"), "utf8")) as RawAns[];
  const { llm, provider, model } = await makeActiveJudgeLlm();
  console.log(`Judge: ${provider} (${model}), rounds=${ROUNDS}, sourceCap=${SRC_CAP}`);

  const scores: any[] = [];
  for (const set of [rc2, ac2]) {
    for (const a of set) {
      const sources = toSources(a.sources, a.system);
      const artifact: Artifact = {
        type: "algolia-answer",
        prompt: a.question,
        content: a.answer,
        sources,
      };
      process.stderr.write(`judge ${a.system} Q${a.qi + 1} (${sources.length} src) ...\n`);
      try {
        const r = await judgeArtifactMultiRound(artifact, DEFAULT_JUDGE_CONFIG, llm, ROUNDS);
        scores.push({
          qi: a.qi,
          system: a.system,
          composite: r.aggregate.finalScore,
          gateTripped: r.aggregate.gateTripped,
          dimensionMeans: r.aggregate.dimensionMeans,
          sourceCount: sources.length,
          answerLen: a.answer.length,
        });
      } catch (e: any) {
        scores.push({ qi: a.qi, system: a.system, composite: null, error: e.message, sourceCount: sources.length });
        process.stderr.write(`  ERROR ${a.system} Q${a.qi + 1}: ${e.message}\n`);
      }
    }
  }
  writeFileSync(join(H2H, "judge_scores.json"), JSON.stringify(scores, null, 2));

  // Summary table + per-question judge preference.
  console.log("\nQ   RC2    AC2    judge prefers");
  let rc2Wins = 0, ac2Wins = 0, ties = 0;
  for (let qi = 0; qi < 12; qi++) {
    const r = scores.find((s) => s.qi === qi && s.system === "rc2");
    const a = scores.find((s) => s.qi === qi && s.system === "ac2");
    const rc = r?.composite, ac = a?.composite;
    let pref = "—";
    if (rc != null && ac != null) {
      const d = rc - ac;
      if (Math.abs(d) < 0.3) { pref = "tie"; ties++; }
      else if (d > 0) { pref = "RC2"; rc2Wins++; }
      else { pref = "AC2"; ac2Wins++; }
    }
    console.log(`Q${(qi + 1 + "").padEnd(2)} ${(rc?.toFixed(2) ?? "ERR").padEnd(6)} ${(ac?.toFixed(2) ?? "ERR").padEnd(6)} ${pref}`);
  }
  console.log(`\nJudge preference: RC2 ${rc2Wins} | AC2 ${ac2Wins} | tie ${ties}`);
  console.log(`wrote ${join(H2H, "judge_scores.json")}`);
}
main().catch((e) => { console.error("h2hJudge FAILED:", e); process.exit(1); });
