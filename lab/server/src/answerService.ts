/**
 * answerService — assemble the real AnswerDeps from env (CENTRAL app + pinned
 * provider) and run the four panels for the /api/answer endpoint.
 *
 * The agent-completion key is the SERVER-SIDE admin key (never the browser key).
 * The LLM is the single pinned provider (prefer OpenAI → Gemini); the specialist
 * agent ids come from the 8 ALGOLIA_AGENT_<ROLE>_<MODE>_ID env vars and the two
 * single agent ids from ALGOLIA_AGENT_P1_ID / ALGOLIA_AGENT_P3_ID. Any id may be
 * empty until the agents are created (create_central_agents.mjs) — the runner
 * returns a clean error rather than throwing.
 */
import type { LlmComplete } from "@lab/judge";
import { getEnv } from "./config.js";
import { makeAgentStudioRunner } from "./agentRunner.js";
import { makeGeminiComplete } from "./gemini.js";
import { makeOpenAIComplete } from "./openai.js";
import { resolveActiveProvider } from "./provider.js";
import type { SpecialistAgentMap, SpecialistName } from "./multiAgent.js";
import { buildPanels, type PanelId, type PanelMeta, type Retrieval } from "./panels.js";
import { producePanelAnswer, type AnswerDeps, type PanelAnswerResult } from "./answer.js";

const ROLE_ENV: Record<SpecialistName, string> = {
  technical: "TECH",
  marketer: "MARKETER",
  academy: "ACADEMY",
  support: "SUPPORT",
};

/** Build the specialist agent id map for one retrieval mode from env. */
function specialistMapFor(
  env: Record<string, string | undefined>,
  mode: Retrieval,
): SpecialistAgentMap {
  const m = mode.toUpperCase();
  const map = {} as SpecialistAgentMap;
  for (const name of Object.keys(ROLE_ENV) as SpecialistName[]) {
    map[name] = env[`ALGOLIA_AGENT_${ROLE_ENV[name]}_${m}_ID`] ?? "";
  }
  return map;
}

/** Resolve the single pinned LLM (fairness) used by coordinator + single follow-up. */
export async function makePinnedLlm(
  env: Record<string, string | undefined> = getEnv(),
): Promise<{ llm: LlmComplete; provider: string; model: string }> {
  const spec = await resolveActiveProvider(env);
  const apiKey = env[spec.keyVar] ?? "";
  const llm =
    spec.provider === "gemini"
      ? makeGeminiComplete({ apiKey, model: spec.agentModel })
      : makeOpenAIComplete({ apiKey, model: spec.agentModel });
  return { llm, provider: spec.provider, model: spec.agentModel };
}

/** Build the full AnswerDeps from env (real network seams). */
export async function makeAnswerDeps(
  env: Record<string, string | undefined> = getEnv(),
): Promise<AnswerDeps> {
  const appId = env.ALGOLIA_APP_ID ?? "";
  // Completions need a server-side key; admin key is valid and never leaves the server.
  const apiKey = env.ALGOLIA_ADMIN_API_KEY ?? env.ALGOLIA_SEARCH_API_KEY ?? "";
  const runAgent = makeAgentStudioRunner({ appId, apiKey });
  const { llm } = await makePinnedLlm(env);
  return {
    runAgent,
    llm,
    specialistAgents: {
      keyword: specialistMapFor(env, "keyword"),
      neural: specialistMapFor(env, "neural"),
    },
  };
}

export interface AnswerRequest {
  question: string;
  /** Which panels to run; defaults to all four. */
  panels?: PanelId[];
  turn?: 1 | 2;
  /** Turn-2: per-panel turn-1 answer + generated follow-up that becomes turn-2. */
  turn1?: Partial<Record<PanelId, { answer: string; followUp: string }>>;
}

/** One panel's answer payload tagged with its id (the on-complete SSE payload). */
export interface AnswerPanelPayload extends PanelAnswerResult {
  panelId: PanelId;
}

/**
 * Run the requested panels IN PARALLEL. `onPanel` fires as each panel completes
 * (enables per-panel SSE streaming). Per-panel failures are isolated into that
 * payload's `error`. Returns all payloads in request order.
 */
export async function runAnswerPanels(
  req: AnswerRequest,
  deps: AnswerDeps,
  onPanel?: (payload: AnswerPanelPayload) => void,
  env: Record<string, string | undefined> = getEnv(),
): Promise<AnswerPanelPayload[]> {
  const all = buildPanels(env);
  const want = new Set(req.panels ?? all.map((p) => p.panelId));
  const selected: PanelMeta[] = all.filter((p) => want.has(p.panelId));

  return Promise.all(
    selected.map(async (panel): Promise<AnswerPanelPayload> => {
      const t1 = req.turn1?.[panel.panelId];
      let payload: AnswerPanelPayload;
      try {
        const result = await producePanelAnswer(panel, req.question, {
          deps,
          ...(req.turn === 2 ? { turn: 2 as const } : {}),
          ...(t1?.answer ? { turn1Answer: t1.answer } : {}),
          ...(t1?.followUp ? { followUp: t1.followUp } : {}),
        });
        payload = { panelId: panel.panelId, ...result };
      } catch (e) {
        payload = {
          panelId: panel.panelId,
          answer: "",
          sources: [],
          timing: { firstTokenMs: 0, totalMs: 0 },
          followUp: "",
          error: (e as Error).message,
        };
      }
      onPanel?.(payload);
      return payload;
    }),
  );
}
