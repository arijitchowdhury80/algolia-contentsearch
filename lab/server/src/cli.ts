/**
 * cli — the harness entry point.
 *
 *   tsx src/cli.ts run-tests [--limit N] [--ids 1.2,1.3] [--split dev|held-out]
 *   tsx src/cli.ts judge <runId> [--limit N] [--ids ...]
 *   tsx src/cli.ts summary <runId>
 *   tsx src/cli.ts pipeline [--limit N] [--ids ...]   (run-tests → judge → summary)
 *
 * The harness ONLY runs panels + scores them. It never creates or modifies
 * Algolia agents/indices. Panel ids come from web/.env.local (see config.ts).
 */
import { runTests } from "./runTests.js";
import { judgeRun } from "./judgeStep.js";
import { summarize } from "./summary.js";
import { setWebsiteCapture } from "./panels.js";
import { liveWebsiteCapture } from "./website.js";

interface Flags {
  limit?: number;
  ids?: string[];
  split?: "dev" | "held-out";
  positional: string[];
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") flags.limit = Number(argv[++i]);
    else if (a === "--ids") flags.ids = argv[++i]?.split(",").map((s) => s.trim());
    else if (a === "--split") {
      const v = argv[++i];
      if (v === "dev" || v === "held-out") flags.split = v;
    } else flags.positional.push(a);
  }
  return flags;
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  const f = parseFlags(rest);

  // Wire the LIVE Playwright website capture for runs (opt out with WEBSITE_STUB=1).
  // Only matters for run-tests/pipeline; judge/summary read an existing transcript.
  if ((cmd === "run-tests" || cmd === "pipeline") && !process.env.WEBSITE_STUB) {
    setWebsiteCapture(liveWebsiteCapture);
    console.log("[cli] live website capture wired (Case ①). Set WEBSITE_STUB=1 to stub.");
  }

  switch (cmd) {
    case "run-tests": {
      await runTests({
        ...(f.limit !== undefined ? { limit: f.limit } : {}),
        ...(f.ids ? { onlyIds: f.ids } : {}),
        ...(f.split ? { split: f.split } : {}),
      });
      break;
    }
    case "judge": {
      const runId = f.positional[0];
      if (!runId) throw new Error("usage: judge <runId>");
      await judgeRun(runId, {
        ...(f.limit !== undefined ? { limit: f.limit } : {}),
        ...(f.ids ? { onlyIds: f.ids } : {}),
      });
      break;
    }
    case "summary": {
      const runId = f.positional[0];
      if (!runId) throw new Error("usage: summary <runId>");
      summarize(runId);
      break;
    }
    case "pipeline": {
      const runId = await runTests({
        ...(f.limit !== undefined ? { limit: f.limit } : {}),
        ...(f.ids ? { onlyIds: f.ids } : {}),
        ...(f.split ? { split: f.split } : {}),
      });
      await judgeRun(runId, {});
      summarize(runId);
      break;
    }
    default:
      console.log(
        [
          "Algolia answer-quality harness",
          "",
          "Commands:",
          "  run-tests [--limit N] [--ids a,b] [--split dev|held-out]",
          "  judge <runId> [--limit N] [--ids a,b]",
          "  summary <runId>",
          "  pipeline [--limit N] [--ids a,b] [--split ...]",
        ].join("\n"),
      );
  }
}

main().catch((e) => {
  console.error("\n[harness] FAILED:", (e as Error).message);
  process.exitCode = 1;
});
