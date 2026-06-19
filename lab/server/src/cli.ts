/**
 * cli — the harness entry point.
 *
 *   tsx src/cli.ts run-tests [--limit N] [--ids 1.2,1.3] [--split dev|held-out]
 *   tsx src/cli.ts judge <runId> [--limit N] [--ids ...]
 *   tsx src/cli.ts summary <runId>           (2×2 leaderboard + multi/neural/compound deltas)
 *   tsx src/cli.ts pipeline [--limit N] [--ids ...]   (run-tests → judge → summary)
 *
 * The harness runs the four 2×2 panels (P1–P4) through the unified answer path
 * (answer.ts: single = Agent Studio proxy, multi = coded Maverick coordinator)
 * + scores them. It never CREATES Algolia agents/indices (that is
 * create_central_agents.mjs); panel + agent ids come from .env.local.
 */
import { readFile } from "node:fs/promises";
import { runTests } from "./runTests.js";
import { judgeRun } from "./judgeStep.js";
import { summarize } from "./summary.js";
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
  noCacheFloor?: boolean;
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
    else if (a === "--no-cache-floor") flags.noCacheFloor = true;
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
      // Gemini). Everything — judge + ALL agents + the Maverick coordinator —
      // must run this same provider+model (FAIRNESS INVARIANT). Read-only
      // consistency check across the four 2×2 agents (P1/P3 + the 8 specialists).
      const env = getEnv();
      const spec = await resolveActiveProvider(env);
      console.log(`\n[provider] policy: prefer OpenAI; fall back to Gemini only when OpenAI is over limit.`);
      console.log(`[provider] ACTIVE = ${spec.provider.toUpperCase()}  (judge + agents + coordinator must all use this)`);
      console.log(`  judge model    : ${spec.judgeModel}`);
      console.log(`  agent model    : ${spec.agentModel}`);
      console.log(`  agent provider : ${spec.agentProviderId || "(unset — register via setup_providers.mjs)"}`);

      const appId = env.ALGOLIA_APP_ID ?? "";
      const adminKey = env.ALGOLIA_ADMIN_API_KEY ?? "";
      const agents: { label: string; id: string | undefined }[] = [
        { label: "P1 single-keyword", id: env.ALGOLIA_AGENT_P1_ID },
        { label: "P3 single-neural", id: env.ALGOLIA_AGENT_P3_ID },
        { label: "tech-keyword", id: env.ALGOLIA_AGENT_TECH_KEYWORD_ID },
        { label: "tech-neural", id: env.ALGOLIA_AGENT_TECH_NEURAL_ID },
        { label: "marketer-keyword", id: env.ALGOLIA_AGENT_MARKETER_KEYWORD_ID },
        { label: "marketer-neural", id: env.ALGOLIA_AGENT_MARKETER_NEURAL_ID },
        { label: "academy-keyword", id: env.ALGOLIA_AGENT_ACADEMY_KEYWORD_ID },
        { label: "academy-neural", id: env.ALGOLIA_AGENT_ACADEMY_NEURAL_ID },
        { label: "support-keyword", id: env.ALGOLIA_AGENT_SUPPORT_KEYWORD_ID },
        { label: "support-neural", id: env.ALGOLIA_AGENT_SUPPORT_NEURAL_ID },
      ];
      console.log(`\n[provider] agent consistency check (only configured ids):`);
      let allMatch = true;
      let checked = 0;
      for (const a of agents) {
        if (!a.id) continue;
        checked++;
        try {
          const r = await fetch(
            `https://${appId}.algolia.net/agent-studio/1/agents/${a.id}`,
            {
              headers: {
                "X-Algolia-Application-Id": appId,
                "X-Algolia-API-Key": adminKey,
                "User-Agent": "curl/8.4.0",
              },
            },
          );
          const j = (await r.json()) as { model?: string };
          const ok = j.model === spec.agentModel;
          if (!ok) allMatch = false;
          console.log(`  ${a.label.padEnd(18)}: model=${j.model ?? "?"}  ${ok ? "✓" : "✗ MISMATCH → " + spec.agentModel}`);
        } catch (e) {
          allMatch = false;
          console.log(`  ${a.label.padEnd(18)}: could not read (${(e as Error).message})`);
        }
      }
      if (checked === 0) {
        console.log(`  (no agent ids in .env.local yet — run create_central_agents.mjs first)`);
      } else {
        console.log(
          allMatch
            ? `\n  ✓ CONSISTENT — all ${checked} configured agents on ${spec.agentModel}.`
            : `\n  ⚠ INCONSISTENT — re-point the mismatched agent(s) to ${spec.agentModel} (provider ${spec.agentProviderId}) before running.`,
        );
      }
      break;
    }
    case "autocorrect": {
      // Drive the @lab/autocorrect loop against the live Algolia agents.
      //   --baseline <file>  the Case-3 prompt to start from (deployed at round 0)
      //   --rounds N         max rounds (default 4)
      //   --smoke            stub proposer + tiny set (--ids/--limit) to prove wiring
      //   --no-cache-floor   re-measure every panel every round (default: cache ①/②)
      const baselineFile =
        f.baseline ??
        `${process.cwd()}/../../scripts/setup/instructions_case3_grounded_lead_v1.md`;
      const baselineConfig = await readFile(baselineFile, "utf8");
      // TODO(phase2): re-wire autocorrect to the full P1–P4 model. For now it
      // optimizes the single-keyword panel (P1) and measures the margin against
      // its multi-keyword sibling (P2) as the fixed floor.
      const cfg: LoopConfig = {
        oursPanelId: "P1",
        floorPanelId: "P2",
        targetMargin: 1.0,
        sustainRounds: 2,
        maxRounds: f.rounds ?? 4,
        patience: 2,
        minImprovement: 0.3, // measured Gemini noise floor (zero-flicker proof)
      };
      const { seams, lastRunId } = makeAlgoliaSeams({
        oursPanelId: "P1",
        cacheFloor: !f.noCacheFloor,
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
          "  autocorrect [--baseline <file>] [--rounds N] [--smoke] [--no-cache-floor]",
        ].join("\n"),
      );
  }
}

main().catch((e) => {
  console.error("\n[harness] FAILED:", (e as Error).message);
  process.exitCode = 1;
});
