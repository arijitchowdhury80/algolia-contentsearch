/**
 * smokeRun — replay ONE scenario (retail-q1, both modes) to prove the harness
 * runs end-to-end in a time-bounded window (~5-8 min).
 *
 * Run via: npx tsx src/replay/smokeRun.ts
 * Output: lab/replay/results/scorecard-smoke.json
 */
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadGold } from "./goldLoader.js";
import { replayEngagement } from "./replay.js";
import { summarize, type ScorecardTurn } from "./scorecard.js";
import { judgeReplayTurn } from "./runReplay.js";
import { makeAnswerDeps, makePinnedLlm } from "../answerService.js";
import { REPO_ROOT } from "../config.js";
import type { OrchestrateDeps } from "../orchestrate.js";

const goldDir = join(REPO_ROOT, "lab", "replay", "gold");
const outDir = join(REPO_ROOT, "lab", "replay", "results");

process.stderr.write("[smoke] starting\n");

const allGold = loadGold(goldDir);
// Only run first scenario for smoke — proves harness runs end-to-end
const gold = [allGold[0]];
process.stderr.write(`[smoke] scenario: ${gold[0].scenarioId} (${gold[0].turns.length} turns)\n`);

const deps = await makeAnswerDeps();
const { llm, provider } = await makePinnedLlm();
process.stderr.write(`[smoke] provider: ${provider}\n`);

const turns: ScorecardTurn[] = [];

for (const eng of gold) {
  for (const mode of ["single", "multi"] as const) {
    process.stderr.write(`[smoke] replaying ${eng.scenarioId}/${mode}...\n`);
    const replayed = await replayEngagement(eng, mode, deps as OrchestrateDeps);
    process.stderr.write(`[smoke] got ${replayed.turns.length} turns, judging...\n`);
    for (const rt of replayed.turns) {
      process.stderr.write(`[smoke]   judging turn ${rt.turnIndex}...\n`);
      const scored = await judgeReplayTurn(eng.scenarioId, mode, rt, llm);
      process.stderr.write(
        `[smoke]     turn ${rt.turnIndex}: composite=${scored.composite} gated=${scored.gated}\n`,
      );
      turns.push(scored);
    }
  }
}

const summary = summarize(turns);
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "scorecard-smoke.json");
writeFileSync(outPath, JSON.stringify({ turns, summary, smokeOnly: true, scenariosRun: gold.map(g => g.scenarioId) }, null, 2));

process.stderr.write(`[smoke] DONE — wrote ${outPath}\n`);
console.log("✅ Smoke replay complete.");
console.log(`Provider: ${provider}`);
console.log(`Mean composite: ${summary.meanComposite}`);
console.log(`Gated: ${summary.gatedCount}`);
console.log("Per-scenario:");
for (const [k, v] of Object.entries(summary.perScenario)) {
  console.log(`  ${k}: ${v}`);
}
console.log(`Scorecard: ${outPath}`);
