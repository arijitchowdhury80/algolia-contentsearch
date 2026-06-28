/**
 * autocorrectAdapters — the Algolia-specific wiring that fills the portable
 * @lab/autocorrect seams (deploy / evaluate / propose). The loop core in
 * lab/autocorrect knows none of this; swap these adapters to point the same
 * loop at a different system.
 *
 *   config C            = the single-agent system-prompt text (a string)
 *   deploy(promptText)  = PATCH + publish the optimized agent (via agent_admin.mjs)
 *   evaluate(split)     = runTests(split) → judgeRun → map scores to answers
 *   propose(...)        = LLM rewrites the prompt to fix the weakest dimension
 *
 * TODO(phase2): re-wire autocorrect to the full 2×2 P1–P4 model. This currently
 * targets ONE single-agent panel (default P1) — the multi-panel coordinator
 * optimization is out of scope for the refactor. The pure floor-cache merge math
 * below is panel-id-agnostic and stays correct.
 */
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import type {
  AutocorrectSeams,
  ScoredPanelAnswer,
  RoundResult,
  WeakDimension,
} from "@lab/autocorrect";
import { runTests } from "./runTests.js";
import { judgeRun } from "./judgeStep.js";
import { loadConfig } from "./config.js";
import { loadScores } from "./store.js";
import { resolveActiveProvider } from "./provider.js";
import { getEnv } from "./config.js";
import { makeGeminiComplete } from "./gemini.js";
import { makeOpenAIComplete } from "./openai.js";

const execFileAsync = promisify(execFile);

/** Absolute path to scripts/setup/agent_admin.mjs from lab/server/src. */
const REPO_ROOT = path.resolve(process.cwd(), "../..");
const AGENT_ADMIN = path.join(REPO_ROOT, "scripts/setup/agent_admin.mjs");

/**
 * Floor-cache merge logic (pure, testable). The loop only mutates the `ours`
 * panel each round, so the fixed (non-ours) floor is measured once and reused:
 *   - First eval of a split (`cached === undefined`): return all `fresh` panels
 *     and cache the non-ours ones as the floor.
 *   - Later evals (`cached` present): `fresh` holds only the re-measured ours
 *     panel; merge it with the cached floor so the loop sees a complete split.
 */
export function applyFloorCache(
  cached: ScoredPanelAnswer[] | undefined,
  fresh: ScoredPanelAnswer[],
  oursPanelId: string,
): { merged: ScoredPanelAnswer[]; floorToCache?: ScoredPanelAnswer[] } {
  if (cached === undefined) {
    return { merged: fresh, floorToCache: fresh.filter((a) => a.panelId !== oursPanelId) };
  }
  return { merged: [...cached, ...fresh] };
}

/** Map a judged ScoreSet (one split's run) to the loop's ScoredPanelAnswer[]. */
function scoresToAnswers(runId: string, split: "dev" | "held-out"): ScoredPanelAnswer[] {
  const scores = loadScores(runId);
  const out: ScoredPanelAnswer[] = [];
  for (const q of scores.questions) {
    for (const p of q.panels) {
      out.push({
        panelId: p.panelId,
        split,
        meanScore: p.meanPreGateScore,
        gated: p.gateTripped,
        borderline: p.borderline,
        dimensionMeans: p.dimensionMeans ?? {},
      });
    }
  }
  return out;
}

/** Build an LlmComplete bound to the consistently-resolved active provider. */
async function activeLlm() {
  const env = getEnv();
  const spec = await resolveActiveProvider(env);
  const apiKey = env[spec.keyVar] ?? "";
  return spec.provider === "gemini"
    ? makeGeminiComplete({ apiKey, model: spec.judgeModel })
    : makeOpenAIComplete({ apiKey, model: spec.judgeModel });
}

/** Gather ③ (ours) judge rationales for gated/weak questions from a scored run. */
function oursRationales(runId: string, oursPanelId: string, max = 6): string[] {
  const scores = loadScores(runId);
  const lines: string[] = [];
  for (const q of scores.questions) {
    const p = q.panels.find((x) => x.panelId === oursPanelId);
    if (!p || !p.rationale) continue;
    const tag = p.gateTripped ? "[GATED] " : p.borderline ? "[borderline] " : "";
    lines.push(`Q${q.questionId} ${tag}(score ${p.meanPreGateScore.toFixed(1)}): ${p.rationale}`);
  }
  // Prefer the gated/borderline ones — they carry the most actionable signal.
  lines.sort((a, b) => (b.includes("GATED") ? 1 : 0) - (a.includes("GATED") ? 1 : 0));
  return lines.slice(0, max);
}

export interface AutocorrectAdapterOptions {
  /** Panel id of the single-agent system being optimized (default "P1"). */
  oursPanelId?: string;
  /** Use a stub proposer that returns the prompt unchanged (smoke tests). */
  stubProposer?: boolean;
  /** Restrict evaluation to these question ids (smoke tests). */
  evalIds?: string[];
  /** Restrict evaluation to the first N questions (smoke tests). */
  evalLimit?: number;
  /**
   * Cache the fixed (non-ours) floor across rounds (default true). Only the
   * panel under optimization (`oursPanelId`) changes between rounds, so the
   * floor is measured + judged once per split and reused — roughly halving
   * per-round cost. Set false to re-measure every panel every round.
   */
  cacheFloor?: boolean;
  log?: (msg: string) => void;
}

/**
 * Build the Algolia seams. Returns the seams plus a getter for the last runId
 * (so callers can persist/inspect the final transcript).
 */
export function makeAlgoliaSeams(
  opts: AutocorrectAdapterOptions = {},
): { seams: AutocorrectSeams<string>; lastRunId: () => string | undefined } {
  // Default to the single-keyword panel (P1) — autocorrect optimizes ONE
  // Agent Studio system prompt, so it only applies to a single-agent panel.
  const oursPanelId = opts.oursPanelId ?? "P1";
  const log = opts.log ?? (() => {});
  const cfg = loadConfig();
  // TODO(phase2): re-wire autocorrect to the full P1–P4 model (per-panel deploy
  // targets, a proper floor panel). For now resolve the single-agent panel's
  // agent id; an unset/absent agent id makes deploy a graceful no-op rather than
  // throwing (a fresh CENTRAL env may not have created the agents yet).
  const oursPanel = cfg.panels.find((p) => p.id === oursPanelId);
  if (oursPanel && oursPanel.kind !== "agent") {
    throw new Error(`panel "${oursPanelId}" is a coordinator panel, not optimizable`);
  }
  const agentId = oursPanel?.agentId ?? "";

  let lastRunId: string | undefined;
  const cacheFloor = opts.cacheFloor ?? true;
  /** Per-split cache of the FIXED (non-ours) panel scores, measured once. */
  const floorCache = new Map<"dev" | "held-out", ScoredPanelAnswer[]>();

  const seams: AutocorrectSeams<string> = {
    async deploy(promptText) {
      if (!agentId) {
        // No agent created for this panel yet → no-op so the loop can still run
        // its decision logic in smoke/dry mode without a live PATCH.
        log(`deploy → SKIPPED (panel "${oursPanelId}" has no agent id set)`);
        return;
      }
      const tmp = path.join("/tmp", `autocorrect_candidate_${Date.now()}.md`);
      await writeFile(tmp, promptText, "utf8");
      log(`deploy → agent ${agentId} (${promptText.length} chars)`);
      await execFileAsync("node", [AGENT_ADMIN, "update", agentId, tmp]);
    },

    async evaluate(split) {
      const cached = cacheFloor ? floorCache.get(split) : undefined;
      const oursOnly = cached !== undefined;
      log(
        `evaluate(${split}): run-tests + judge${oursOnly ? ` (ours only — ${cached!.length} floor panel-scores cached)` : ""}`,
      );
      const runId = await runTests({
        split,
        ...(opts.evalIds ? { onlyIds: opts.evalIds } : {}),
        ...(opts.evalLimit !== undefined ? { limit: opts.evalLimit } : {}),
        ...(oursOnly ? { panelIds: [oursPanelId] } : {}),
      });
      await judgeRun(runId);
      lastRunId = runId;
      const fresh = scoresToAnswers(runId, split);
      if (!cacheFloor) return fresh;
      const { merged, floorToCache } = applyFloorCache(cached, fresh, oursPanelId);
      if (floorToCache) floorCache.set(split, floorToCache);
      return merged;
    },

    async propose(current, weakest: readonly WeakDimension[], _history: readonly RoundResult[]) {
      if (opts.stubProposer) {
        log("propose: STUB (prompt unchanged)");
        return current;
      }
      const llm = await activeLlm();
      const weakList = weakest
        .map((w) => `- ${w.dimensionId} (mean ${w.meanScore.toFixed(1)}/10)`)
        .join("\n");
      const rationales = lastRunId
        ? oursRationales(lastRunId, oursPanelId).join("\n")
        : "(none yet)";
      const proposerPrompt = [
        "You are improving the SYSTEM PROMPT of a strictly-grounded Algolia answer assistant.",
        "Goal: raise answer quality on the weakest rubric dimensions WITHOUT ever weakening grounding (the assistant may only state what its retrieved sources support).",
        "",
        "WEAKEST DIMENSIONS to improve (lowest first):",
        weakList || "(none diagnosed)",
        "",
        "JUDGE RATIONALES from the latest evaluation (what went wrong):",
        rationales,
        "",
        "CURRENT SYSTEM PROMPT (between the markers):",
        "<<<PROMPT",
        current,
        "PROMPT>>>",
        "",
        "Rewrite the system prompt to fix the weakest dimension(s). Make a FOCUSED change — keep everything that works, change only what the rationales point to. Never weaken the grounding rules. Output ONLY the new system prompt text, no preamble, no code fences.",
      ].join("\n");
      log(`propose: LLM rewrite targeting ${weakest[0]?.dimensionId ?? "?"}`);
      // maxTokens must cover BOTH the thinking model's reasoning AND the full
      // rewritten prompt (~2k tokens). 4000 let thinking starve the answer →
      // empty MAX_TOKENS response. 16000 leaves ample headroom.
      try {
        const out = await llm(proposerPrompt, {
          temperature: 0.4,
          maxTokens: 16000,
          tag: "autocorrect:propose",
        });
        // Strip accidental code fences.
        const cleaned = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        // A truncated/empty proposal is not a valid candidate — keep the
        // incumbent so the round becomes a no-op (rollback) rather than crashing
        // the whole loop or deploying a broken prompt.
        if (cleaned.length < 200) {
          log(`propose: discarded (output too short: ${cleaned.length} chars) — keeping incumbent`);
          return current;
        }
        return cleaned;
      } catch (e) {
        log(`propose: FAILED (${(e as Error).message.slice(0, 120)}) — keeping incumbent`);
        return current;
      }
    },

    log,
  };

  return { seams, lastRunId: () => lastRunId };
}
