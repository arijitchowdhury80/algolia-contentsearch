/**
 * config — loads experiment configuration from the repo's env files.
 *
 * Two env files, no external dotenv dependency:
 *   - root  .env.local  → OPENAI_API_KEY (judge LLM) + (later) agent admin keys
 *   - web/.env.local    → VITE_OURS_* app/search key + the agent + index IDs
 *
 * Panel IDs are intentionally read from env (not hardcoded) so the real Case 2/3
 * agents can be swapped in later by editing web/.env.local — no code change.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// lab/server/src → repo root is three levels up.
export const REPO_ROOT = resolve(__dirname, "..", "..", "..");

/** Minimal .env parser: KEY=VALUE lines, ignores comments/blank, strips quotes. */
function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Merged env: process.env wins, then web/.env.local, then root .env.local. */
function loadEnv(): Record<string, string> {
  const root = parseEnvFile(resolve(REPO_ROOT, ".env.local"));
  const web = parseEnvFile(resolve(REPO_ROOT, "web", ".env.local"));
  return { ...root, ...web, ...(process.env as Record<string, string>) };
}

const ENV = loadEnv();

/** The merged env map (process.env + .env.local files). Used by the provider resolver. */
export function getEnv(): Record<string, string | undefined> {
  return ENV;
}

function req(key: string): string {
  const v = ENV[key];
  if (!v) throw new Error(`Missing required env var: ${key} (check .env.local)`);
  return v;
}

function opt(key: string): string | undefined {
  return ENV[key] || undefined;
}

/** Identifies one panel (a column in the A/B/C comparison). */
export interface PanelConfig {
  /** Stable panel id used throughout transcripts + scores. */
  readonly id: string;
  /** Human label for the summary printout. */
  readonly label: string;
  /** How this panel produces an answer. */
  readonly kind: "agent" | "website";
  /** For agent panels: Agent Studio agent id. */
  readonly agentId?: string;
  /** For agent panels: the index the agent searches (metadata only). */
  readonly index?: string;
}

export type JudgeProvider = "openai" | "gemini";

export interface ExperimentConfig {
  /** Which LLM backs the judge. */
  readonly judgeProvider: JudgeProvider;
  /** API key for the active judge provider. */
  readonly judgeApiKey: string;
  readonly judgeModel: string;
  /** How many independent judging rounds to average per answer (stability). */
  readonly judgeRounds: number;
  /** Agent Studio app + search key (shared across our agent panels). */
  readonly ours: { appId: string; searchKey: string };
  /** The panels to run, in display order. */
  readonly panels: readonly PanelConfig[];
}

/**
 * Build the experiment config from env.
 *
 * Panel layout (current placeholders — see CLAUDE.md A/B/C columns):
 *   ① website  — stub for now (lab/capture lands later)
 *   ② mirror   — existing agent on the faithful-mirror index   (VITE_AGENT_MIRROR_ID)
 *   ③ tuned    — existing agent on the tuned index             (VITE_AGENT_TUNED_ID)
 *
 * SWAPPING IN REAL CASE 2/3 AGENTS LATER: change VITE_AGENT_MIRROR_ID /
 * VITE_AGENT_TUNED_ID (and the matching VITE_INDEX_*) in web/.env.local. No
 * code change here — the panel ids stay stable so scores remain comparable.
 */
export function loadConfig(): ExperimentConfig {
  const ours = {
    appId: req("VITE_OURS_APP_ID"),
    searchKey: req("VITE_OURS_SEARCH_KEY"),
  };

  const panels: PanelConfig[] = [
    {
      id: "website",
      label: "① Website (incumbent Ask-AI)",
      kind: "website",
    },
    {
      id: "mirror",
      label: "② Agent — faithful mirror",
      kind: "agent",
      agentId: req("VITE_AGENT_MIRROR_ID"),
      index: opt("VITE_INDEX_MIRROR"),
    },
    {
      id: "tuned",
      label: "③ Agent — tuned index",
      kind: "agent",
      agentId: req("VITE_AGENT_TUNED_ID"),
      index: opt("VITE_INDEX_TUNED"),
    },
  ];

  // Default 5 rounds: enough resolution for the supermajority gate vote (>=2/3)
  // and a stable mean±σ. Use JUDGE_ROUNDS=3 for cheaper quick iteration (the
  // pre-gate quality score is stable even at 3; 5 sharpens the gate decision).
  const judgeRounds = Math.max(1, Number(opt("JUDGE_ROUNDS") ?? 5) || 5);

  // Provider: default to Gemini (OpenAI quota exhausted 2026-06-12). Override
  // with JUDGE_PROVIDER=openai|gemini and JUDGE_MODEL=<model>.
  const judgeProvider = (opt("JUDGE_PROVIDER") ?? "gemini") as JudgeProvider;
  const providerDefaults: Record<JudgeProvider, { keyVar: string; model: string }> = {
    // gemini-2.5-pro = latest GA Pro (3.x are preview); stable for a judge.
    gemini: { keyVar: "GOOGLE_API_KEY", model: "gemini-2.5-pro" },
    openai: { keyVar: "OPENAI_API_KEY", model: "gpt-5.2" },
  };
  const pd = providerDefaults[judgeProvider];
  if (!pd) throw new Error(`Unknown JUDGE_PROVIDER: ${judgeProvider} (use openai|gemini)`);

  return {
    judgeProvider,
    judgeApiKey: req(pd.keyVar),
    judgeModel: opt("JUDGE_MODEL") ?? pd.model,
    judgeRounds,
    ours,
    panels,
  };
}
