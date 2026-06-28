/**
 * calibrationCli — runs the judge over the human-ranked calibration set and
 * reports the Spearman rank correlation (the VALIDITY GATE, spec §7, D10).
 *
 * Reads the labeled set (default: lab/server/calibration/set.json), resolves the
 * single active provider LLM the same way the webserver does (makeActiveJudgeLlm),
 * runs runCalibration, and prints a per-item table + the overall Spearman with a
 * PASS/FAIL verdict against the agreed bar.
 *
 * Run: `npm run calibrate` (from lab/server) AFTER filling humanRank in set.json.
 *   Optional: `npm run calibrate -- path/to/set.json`
 *   Env: CALIBRATION_THRESHOLD (default 0.7), CALIBRATION_ROUNDS (default 1).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_JUDGE_CONFIG, runCalibration, type CalibrationItem } from "@lab/judge";
import { REPO_ROOT, getEnv } from "./config.js";
import { makeActiveJudgeLlm } from "./activeJudgeLlm.js";

async function main(): Promise<void> {
  const env = getEnv();
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose") || env.CALIBRATION_VERBOSE === "1";
  const setPath =
    args.find((a) => !a.startsWith("--")) ??
    join(REPO_ROOT, "lab", "server", "calibration", "set.json");
  const threshold = Number(env.CALIBRATION_THRESHOLD ?? "0.7");
  const rounds = Number(env.CALIBRATION_ROUNDS ?? "1");

  const items = JSON.parse(readFileSync(setPath, "utf8")) as CalibrationItem[];
  const ranked = items.filter((i) => i.humanRank !== null);
  if (ranked.length < 2) {
    console.error(
      `Only ${ranked.length} item(s) have a humanRank in ${setPath}. ` +
        "Fill the ranks from RANKING-SHEET.md first (need >= 2).",
    );
    process.exit(1);
  }

  // Same provider resolution the live/batch judge uses (OpenAI → Gemini fallback).
  const { llm, provider, model } = await makeActiveJudgeLlm();
  console.log(`Calibration set: ${setPath}`);
  console.log(`Ranked items: ${ranked.length}/${items.length}`);
  console.log(`Judge provider: ${provider} (${model}), rounds: ${rounds}`);
  console.log("Scoring… (this calls the LLM per item)\n");

  const result = await runCalibration(items, DEFAULT_JUDGE_CONFIG, llm, rounds, verbose);

  // Table: id, humanRank, judgeComposite, judgeRank — sorted by human rank.
  const rows = [...result.perItem].sort((a, b) => a.humanRank - b.humanRank);
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(
    `${pad("id", 24)}${pad("humanRank", 11)}${pad("judgeComposite", 16)}judgeRank`,
  );
  console.log("-".repeat(60));
  for (const r of rows) {
    console.log(
      `${pad(r.id, 24)}${pad(String(r.humanRank), 11)}${pad(
        r.judgeComposite.toFixed(2),
        16,
      )}${r.judgeRank}`,
    );
    // Verbose: dump the evidence (dim means + gate + every gating violation).
    if (verbose && r.diagnostics) {
      const d = r.diagnostics;
      const dims = Object.entries(d.dimensionMeans)
        .map(([k, v]) => `${k}=${v.toFixed(1)}`)
        .join(" ");
      console.log(
        `   preGate=${d.preGateScore.toFixed(2)} gate=${d.gateTripped} | ${dims}`,
      );
      if (d.groundingViolations.length === 0) {
        console.log("   skeptic violations: NONE");
      } else {
        for (const v of d.groundingViolations) {
          console.log(
            `   VIOL kind=${v.kind} certainty=${v.certainty.toFixed(2)} :: ${v.claim.slice(0, 100).replace(/\n/g, " ")}`,
          );
        }
      }
    }
  }

  const passed = result.spearman >= threshold;
  console.log("\n" + "=".repeat(60));
  console.log(`Spearman rank correlation: ${result.spearman.toFixed(3)} (n=${result.n})`);
  console.log(`Threshold: ${threshold.toFixed(2)}`);
  console.log(passed ? "✅ PASS — judge agrees with human ranking." : "❌ FAIL — rubric needs tuning.");
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Calibration failed:", err);
  process.exit(1);
});
