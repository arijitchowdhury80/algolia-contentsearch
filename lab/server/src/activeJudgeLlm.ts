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

export async function makeActiveJudgeLlm(): Promise<ActiveJudgeLlm> {
  const env = getEnv();
  const spec = await resolveActiveProvider(env);
  const apiKey = env[spec.keyVar] ?? "";
  const rawLlm =
    spec.provider === "gemini"
      ? makeGeminiComplete({ apiKey, model: spec.judgeModel })
      : makeOpenAIComplete({ apiKey, model: spec.judgeModel });
  const llm = makeJudgeLlm(rawLlm, DEFAULT_JUDGE_CONFIG.rubric);
  return { llm, provider: spec.provider, model: spec.judgeModel };
}
