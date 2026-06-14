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
import { readFile } from "node:fs/promises";
import { runTests } from "./runTests.js";
import { judgeRun } from "./judgeStep.js";
import { summarize } from "./summary.js";
import { setWebsiteCapture } from "./panels.js";
import { liveWebsiteCapture } from "./website.js";
import { getEnv } from "./config.js";
import { resolveActiveProvider } from "./provider.js";
import { runAutocorrect } from "@lab/autocorrect";
import type { LoopConfig } from "@lab/autocorrect";
import { makeAlgoliaSeams } from "./autocorrectAdapters.js";

interface Flags {
  limit?: number;
  ids?: string[];
  split?: "dev" | "held-out";
  baseline?: string;
  rounds?: number;
  smoke?: boolean;
  positional: string[];
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") flags.limit = Number(argv[++i]);
    else if (a === "--ids") flags.ids = argv[++i]?.split(",").map((s) => s.trim());
    else if (a === "--baseline") flags.baseline = argv[++i];
    else if (a === "--rounds") flags.rounds = Number(argv[++i]);
    else if (a === "--smoke") flags.smoke = true;
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
    case "provider": {
      // Resolve + report the ONE active provider (prefer OpenAI, fall back to
      // Gemini). Everything — judge + all agents — must run this same provider.
      const env = getEnv();
      const spec = await resolveActiveProvider(env);
      console.log(`\n[provider] policy: prefer OpenAI; fall back to Gemini only when OpenAI is over limit.`);
      console.log(`[provider] ACTIVE = ${spec.provider.toUpperCase()}  (judge + agents must all use this)`);
      console.log(`  judge model : ${spec.judgeModel}`);
      console.log(`  agent model : ${spec.agentModel}`);

      // CONSISTENCY CHECK (read-only): confirm every agent's model matches.
      const appId = env["ARIJIT-TEST_APP_ID"] ?? env.VITE_OURS_APP_ID ?? "";
      const adminKey = env["ARIJIT-TEST_ADMIN_API_KEY"] ?? "";
      const agents: { label: string; id: string | undefined }[] = [
        { label: "② mirror", id: env.VITE_AGENT_MIRROR_ID },
        { label: "③ tuned", id: env.VITE_AGENT_TUNED_ID },
      ];
      console.log(`\n[provider] agent consistency check:`);
      let allMatch = true;
      for (const a of agents) {
        if (!a.id) continue;
        try {
          const r = await fetch(
            `https://${appId}.algolia.net/agent-studio/1/agents/${a.id}`,
            {
              headers: {
                "X-Algolia-Application-Id": appId,
                "X-Algolia-API-Key": adminKey,
                "User-Agent": "visibility-agent-harness/1.0",
              },
            },
          );
          const j = (await r.json()) as { model?: string };
          const ok = j.model === spec.agentModel;
          if (!ok) allMatch = false;
          console.log(`  ${a.label}: model=${j.model ?? "?"}  ${ok ? "✓ matches" : "✗ MISMATCH → " + spec.agentModel}`);
        } catch (e) {
          allMatch = false;
          console.log(`  ${a.label}: could not read (${(e as Error).message})`);
        }
      }
      console.log(
        allMatch
          ? `\n  ✓ CONSISTENT — all agents + judge on ${spec.provider}.`
          : `\n  ⚠ INCONSISTENT — re-point the mismatched agent(s) to ${spec.provider} (model ${spec.agentModel}, provider ${spec.agentProviderId}) in Agent Studio before running.`,
      );
      break;
    }
    case "autocorrect": {
      // Drive the @lab/autocorrect loop against the live Algolia agents.
      //   --baseline <file>  the Case-3 prompt to start from (deployed at round 0)
      //   --rounds N         max rounds (default 4)
      //   --smoke            stub proposer + tiny set (--ids/--limit) to prove wiring
      const baselineFile =
        f.baseline ??
        `${process.cwd()}/../../scripts/setup/instructions_case3_grounded_lead_v1.md`;
      const baselineConfig = await readFile(baselineFile, "utf8");
      const cfg: LoopConfig = {
        oursPanelId: "tuned",
        floorPanelId: "mirror",
        targetMargin: 1.0,
        sustainRounds: 2,
        maxRounds: f.rounds ?? 4,
        patience: 2,
        minImprovement: 0.3, // measured Gemini noise floor (zero-flicker proof)
      };
      const { seams, lastRunId } = makeAlgoliaSeams({
        oursPanelId: "tuned",
        stubWebsite: true,
        ...(f.smoke ? { stubProposer: true } : {}),
        ...(f.ids ? { evalIds: f.ids } : {}),
        ...(f.limit !== undefined ? { evalLimit: f.limit } : {}),
        log: (m) => console.log(`[autocorrect] ${m}`),
      });
      console.log(
        `\n[autocorrect] baseline=${baselineFile}\n[autocorrect] maxRounds=${cfg.maxRounds} target=+${cfg.targetMargin} minImprovement=${cfg.minImprovement}${f.smoke ? " (SMOKE: stub proposer)" : ""}\n`,
      );
      const res = await runAutocorrect({
        seams,
        cfg,
        baseline: { id: "case3-baseline", config: baselineConfig },
      });
      console.log(`\n[autocorrect] STOPPED: ${res.stopReason}`);
      console.log(`[autocorrect] best config id: ${res.best.id}`);
      console.log(`[autocorrect] rounds run: ${res.history.length}`);
      console.log(`[autocorrect] last transcript: ${lastRunId() ?? "(none)"}`);
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
          "  provider",
          "  autocorrect [--baseline <file>] [--rounds N] [--smoke]",
        ].join("\n"),
      );
  }
}

main().catch((e) => {
  console.error("\n[harness] FAILED:", (e as Error).message);
  process.exitCode = 1;
});
