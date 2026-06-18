/**
 * activeJudgeLlm — build the judge's LLM from the SINGLE resolved provider.
 *
 * One source of truth for "which provider the judge runs": prefer OpenAI, fall
 * back to Gemini (see provider.ts), then wrap with makeJudgeLlm so judge output
 * dimension ids are normalised. Shared by the batch judge (judgeStep) and the
 * live judge endpoint so they can never drift onto different providers.
 */
import { DEFAULT_JUDGE_CONFIG, type LlmComplete } from "@lab/judge";
import { getEnv } from "./config.js";
import { makeOpenAIComplete } from "./openai.js";
import { makeGeminiComplete } from "./gemini.js";
import { makeJudgeLlm } from "./judgeLlm.js";
import { resolveActiveProvider } from "./provider.js";

export interface ActiveJudgeLlm {
  llm: LlmComplete;
  provider: string;
  model: string;
}

export interface ActiveJudgeOpts {
  /**
   * LIVE judge mode: pick a fast model for the indicative on-screen verdict.
   * For gemini that's gemini-2.5-flash (override via JUDGE_LIVE_MODEL) — ~5–10×
   * faster than pro. The batch `cli judge` (authoritative) leaves this off and
   * keeps the slow, accurate pro model.
   */
  fastLive?: boolean;
}

/** The fast model used for the live/indicative judge, per provider. */
function liveModelFor(env: ReturnType<typeof getEnv>, provider: string, fallback: string): string {
  if (provider === "gemini") return env.JUDGE_LIVE_MODEL ?? "gemini-2.5-flash";
  // OpenAI: no confirmed faster judge model wired — keep the resolved default.
  return env.JUDGE_LIVE_MODEL ?? fallback;
}

export async function makeActiveJudgeLlm(opts: ActiveJudgeOpts = {}): Promise<ActiveJudgeLlm> {
  const env = getEnv();
  const spec = await resolveActiveProvider(env);
  const apiKey = env[spec.keyVar] ?? "";
  const model = opts.fastLive
    ? liveModelFor(env, spec.provider, spec.judgeModel)
    : spec.judgeModel;
  const rawLlm =
    spec.provider === "gemini"
      ? makeGeminiComplete({ apiKey, model })
      : makeOpenAIComplete({ apiKey, model });
  const llm = makeJudgeLlm(rawLlm, DEFAULT_JUDGE_CONFIG.rubric);
  return { llm, provider: spec.provider, model };
}
