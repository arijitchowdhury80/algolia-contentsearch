/**
 * config — loads experiment configuration from the repo's env files.
 *
 * Two env files, no external dotenv dependency:
 *   - root  .env.local  → GOOGLE_API_KEY / OPENAI_API_KEY (judge LLM) + the
 *                         Algolia CENTRAL admin/provider/agent ids (server-only)
 *   - web/.env.local    → VITE_ALGOLIA_APP_ID + VITE_ALGOLIA_SEARCH_API_KEY
 *                         (the browser search-only credentials)
 *
 * The 2×2 panel set (P1–P4) is the source of truth in panels.ts; loadConfig()
 * delegates there (buildPanels) and maps each PanelMeta → PanelConfig so legacy
 * consumers keep a stable shape. Agent ids come from env (ALGOLIA_AGENT_P1_ID /
 * ALGOLIA_AGENT_P3_ID) and MAY be empty until the agents are created out-of-band
 * — loadConfig() must NEVER throw merely because an agent id is unset.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPanels, type PanelMeta } from "./panels.js";

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

/**
 * Identifies one panel (a cell in the 2×2 lab). A projection of panels.ts'
 * PanelMeta onto the legacy shape some consumers still read:
 *   - single panels (P1/P3) are `kind: "agent"` with an `agentId` (may be "")
 *   - multi panels (P2/P4) are `kind: "coordinator"` (the coded Maverick path)
 */
export interface PanelConfig {
  /** Stable panel id used throughout transcripts + scores (P1–P4). */
  readonly id: string;
  /** Human label for the summary printout. */
  readonly label: string;
  /** How this panel produces an answer. */
  readonly kind: "agent" | "coordinator";
  /** For agent panels: Agent Studio agent id (may be "" until created). */
  readonly agentId?: string;
  /** The index this panel's retrieval targets (metadata only). */
  readonly index?: string;
}

/** Map a PanelMeta (panels.ts) onto the legacy PanelConfig shape. */
function toPanelConfig(p: PanelMeta): PanelConfig {
  return {
    id: p.panelId,
    label: p.label,
    kind: p.coordinator ? "coordinator" : "agent",
    ...(p.agentId !== undefined ? { agentId: p.agentId } : {}),
    index: p.indexName,
  };
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
  /** Max (question × panel) tasks judged / answered in parallel. */
  readonly concurrency: number;
  /** Agent Studio app + search key (shared across our agent panels). */
  readonly ours: { appId: string; searchKey: string };
  /** The panels to run, in display order. */
  readonly panels: readonly PanelConfig[];
}

/**
 * Build the experiment config from env.
 *
 * Panels are the 2×2 set from panels.ts (P1–P4), mapped onto PanelConfig. The
 * shared Algolia app/search-key (`ours`) reads the CENTRAL vars
 * (VITE_ALGOLIA_APP_ID / VITE_ALGOLIA_SEARCH_API_KEY), falling back to the old
 * VITE_OURS_* names if a stale env file still carries them. Missing values are
 * tolerated ("" ) — loadConfig() never throws on the panel/app credentials so
 * the judge path runs on a fresh CENTRAL env where agents may not exist yet.
 */
export function loadConfig(): ExperimentConfig {
  const ours = {
    appId: opt("VITE_ALGOLIA_APP_ID") ?? opt("VITE_OURS_APP_ID") ?? "",
    searchKey:
      opt("VITE_ALGOLIA_SEARCH_API_KEY") ?? opt("VITE_OURS_SEARCH_KEY") ?? "",
  };

  // The four 2×2 panels (P1–P4) are the source of truth in panels.ts.
  const panels: PanelConfig[] = buildPanels(ENV).map(toPanelConfig);

  // Default 5 rounds: enough resolution for the supermajority gate vote (>=2/3)
  // and a stable mean±σ. Use JUDGE_ROUNDS=3 for cheaper quick iteration (the
  // pre-gate quality score is stable even at 3; 5 sharpens the gate decision).
  const judgeRounds = Math.max(1, Number(opt("JUDGE_ROUNDS") ?? 5) || 5);

  // Parallelism across (question × panel) tasks. Each judged panel itself fans 3
  // judges out per round, so the effective in-flight LLM calls ≈ concurrency × 3.
  // 4 is conservative for Gemini's rate limits (gemini.ts retries 429s). Tune via
  // RUN_CONCURRENCY; set 1 for fully sequential (debugging).
  const concurrency = Math.max(1, Number(opt("RUN_CONCURRENCY") ?? 4) || 4);

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
    concurrency,
    ours,
    panels,
  };
}
