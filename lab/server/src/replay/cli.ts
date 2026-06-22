import { join } from "node:path";
import { runReplay } from "./runReplay.js";
import { REPO_ROOT } from "../config.js";

const goldDir = join(REPO_ROOT, "lab", "replay", "gold");
const outDir = join(REPO_ROOT, "lab", "replay", "results");

runReplay({ goldDir, outDir })
  .then((r) => {
    console.log("✅ Replay complete.");
    console.log(`Mean % of floor: ${r.summary.meanPctOfFloor}%`);
    console.log(`Gated (grounding failed): ${r.summary.gatedCount}`);
    console.log("Per-scenario:");
    Object.entries(r.summary.perScenario).forEach(([k, v]) =>
      console.log(`  ${k}: ${v}%`),
    );
    console.log(`Scorecard written to ${outDir}`);
  })
  .catch((err) => {
    console.error("❌ Replay failed:", err);
    process.exit(1);
  });
