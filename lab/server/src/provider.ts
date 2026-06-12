/**
 * provider — the SINGLE source of truth for which LLM the whole system uses.
 *
 * Policy (Arijit, 2026-06-12): PREFER OpenAI; fall back to Gemini ONLY when
 * OpenAI is unavailable (quota/rate limit/auth). The choice is GLOBAL and
 * CONSISTENT — the judge and ALL Agent Studio agents must run the same provider;
 * no mixing. This module resolves the one active provider; `sync-agents` (CLI)
 * applies it to every agent so they can never be split.
 *
 * Override the auto-resolution with LLM_PROVIDER=openai|gemini (manual pin).
 */
import { makeOpenAIComplete } from "./openai.js";

export type Provider = "openai" | "gemini";

export interface ProviderSpec {
  readonly provider: Provider;
  /** Model the JUDGE uses (lab/server judge step). */
  readonly judgeModel: string;
  /** Model the Agent Studio AGENTS use. */
  readonly agentModel: string;
  /** Agent Studio provider id the agents must reference for this provider. */
  readonly agentProviderId: string;
  /** Env var name holding the judge API key for this provider. */
  readonly keyVar: string;
}

/** Fixed specs per provider (Agent Studio provider ids + models, verified 2026-06-12). */
export const PROVIDER_SPECS: Record<Provider, ProviderSpec> = {
  openai: {
    provider: "openai",
    judgeModel: "gpt-5.2",
    agentModel: "gpt-5.2",
    agentProviderId: "ae943683-905b-403c-b16f-c1525fc9b7a8",
    keyVar: "OPENAI_API_KEY",
  },
  gemini: {
    provider: "gemini",
    judgeModel: "gemini-2.5-pro",
    agentModel: "gemini-2.5-pro",
    agentProviderId: "730780db-5c7f-4350-aef4-e9632af57aed",
    keyVar: "GOOGLE_API_KEY",
  },
};

/**
 * Is OpenAI actually usable right now? A cheap 1-token probe. Returns false on
 * ANY failure (429 quota/rate-limit, 401 auth, network) so we fall back rather
 * than select a dead provider.
 */
export async function isOpenAIHealthy(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!apiKey) return false;
  try {
    const llm = makeOpenAIComplete({
      apiKey,
      model: PROVIDER_SPECS.openai.judgeModel,
      fetchImpl,
      timeoutMs: 20_000,
    });
    const out = await llm("Reply with: ok", { maxTokens: 5 });
    return typeof out === "string" && out.length > 0;
  } catch {
    return false;
  }
}

export interface ResolveOptions {
  /** Manual override: force a provider regardless of health. */
  readonly force?: Provider | undefined;
  /** Health-probe override (tests). */
  readonly openaiHealthy?: ((apiKey: string) => Promise<boolean>) | undefined;
}

/**
 * Resolve the ONE active provider for the whole system. Prefers OpenAI when it
 * is healthy; otherwise Gemini. Honors LLM_PROVIDER as a hard pin.
 */
export async function resolveActiveProvider(
  env: Record<string, string | undefined>,
  opts: ResolveOptions = {},
): Promise<ProviderSpec> {
  const forced = opts.force ?? (env.LLM_PROVIDER as Provider | undefined);
  if (forced === "openai" || forced === "gemini") {
    return PROVIDER_SPECS[forced];
  }
  const probe = opts.openaiHealthy ?? isOpenAIHealthy;
  const openaiKey = env.OPENAI_API_KEY ?? "";
  if (openaiKey && (await probe(openaiKey))) {
    return PROVIDER_SPECS.openai;
  }
  return PROVIDER_SPECS.gemini;
}
