import { resolve } from "node:path";
import { runReplay } from "./runReplay.js";

const goldDir = resolve(__dirname, "..", "..", "..", "lab", "replay", "gold");
const outDir = resolve(__dirname, "..", "..", "..", "lab", "replay", "results");

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
