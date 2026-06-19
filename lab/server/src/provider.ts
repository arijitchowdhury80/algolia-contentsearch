/**
 * provider — the SINGLE source of truth for which LLM the whole system uses.
 *
 * Policy (Arijit, 2026-06-12): PREFER OpenAI; fall back to Gemini ONLY when
 * OpenAI is unavailable (quota/rate limit/auth). The choice is GLOBAL and
 * CONSISTENT — the judge, the Maverick coordinator, AND ALL Agent Studio agents
 * must run the SAME provider+model; no mixing (FAIRNESS INVARIANT, 2026-06-18:
 * the only variables across the 2×2 panels are architecture + retrieval, never
 * the model). This module resolves the one active provider; create_central_agents
 * + the coordinator + the judge all read the single resolved spec so they can
 * never be split.
 *
 * App / provider IDs (2026-06-18): the build home is now CENTRAL `0EXRPAXB56`
 * (`ALGOLIA_*`). Agent Studio providers are PER-APP, so the old VVKSSPDMJX
 * provider ids are invalid here. Provider ids are read from `.env.local`
 * (`ALGOLIA_PROVIDER_OPENAI_ID` / `ALGOLIA_PROVIDER_GEMINI_ID`) with the verified
 * CENTRAL Gemini id baked in as the default. NOTE: as of 2026-06-18 the OpenAI
 * key is DEAD (429 quota) so the resolver falls through to Gemini — but we keep
 * the OpenAI→Gemini policy intact for when the key is restored.
 *
 * Override the auto-resolution with LLM_PROVIDER=openai|gemini (manual pin).
 */
import { makeOpenAIComplete } from "./openai.js";

export type Provider = "openai" | "gemini";

export interface ProviderSpec {
  readonly provider: Provider;
  /** Model the JUDGE uses (lab/server judge step). */
  readonly judgeModel: string;
  /** Model the Agent Studio AGENTS + the Maverick coordinator use. */
  readonly agentModel: string;
  /** Agent Studio provider id (per-app, CENTRAL 0EXRPAXB56) the agents reference. */
  readonly agentProviderId: string;
  /** Env var name holding the judge API key for this provider. */
  readonly keyVar: string;
}

/**
 * The CENTRAL (0EXRPAXB56) Gemini provider id, verified live 2026-06-18. Used as
 * the default when `.env.local` does not pin one. The OpenAI id has no verified
 * CENTRAL value yet (key is dead) — it resolves from env or stays empty, which is
 * fine because the resolver never selects OpenAI while the key is unhealthy.
 */
const CENTRAL_GEMINI_PROVIDER_ID = "a1ca01bf-bc28-4844-89d1-331b79c3e1ab";

/**
 * Fixed specs per provider (CENTRAL 0EXRPAXB56 Agent Studio provider ids + models).
 * Provider ids come from `.env.local` (per-app — registered by setup_providers.mjs)
 * and fall back to the verified Gemini id. The pinned agent model is read from
 * `ALGOLIA_AGENT_MODEL` (default gemini-2.5-pro) so every agent + the coordinator
 * + the judge share ONE model — the fairness invariant.
 */
export function providerSpecs(
  env: Record<string, string | undefined> = process.env,
): Record<Provider, ProviderSpec> {
  const geminiModel = env.ALGOLIA_AGENT_MODEL || "gemini-2.5-pro";
  return {
    openai: {
      provider: "openai",
      judgeModel: env.JUDGE_MODEL || "gpt-5.2",
      agentModel: env.ALGOLIA_AGENT_MODEL || "gpt-5.2",
      // Per-app id from env; no verified CENTRAL OpenAI id (dead key) → empty default.
      agentProviderId: env.ALGOLIA_PROVIDER_OPENAI_ID || "",
      keyVar: "OPENAI_API_KEY",
    },
    gemini: {
      provider: "gemini",
      judgeModel: geminiModel,
      agentModel: geminiModel,
      agentProviderId: env.ALGOLIA_PROVIDER_GEMINI_ID || CENTRAL_GEMINI_PROVIDER_ID,
      keyVar: "GOOGLE_API_KEY",
    },
  };
}

/**
 * Back-compat snapshot built from process.env at import time. Prefer
 * `providerSpecs(env)` when you have a merged env map; this constant exists so
 * existing call-sites keep working.
 */
export const PROVIDER_SPECS: Record<Provider, ProviderSpec> = providerSpecs();

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
      model: providerSpecs(process.env).openai.judgeModel,
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
  const specs = providerSpecs(env);
  const forced = opts.force ?? (env.LLM_PROVIDER as Provider | undefined);
  if (forced === "openai" || forced === "gemini") {
    return specs[forced];
  }
  const probe = opts.openaiHealthy ?? isOpenAIHealthy;
  const openaiKey = env.OPENAI_API_KEY ?? "";
  if (openaiKey && (await probe(openaiKey))) {
    return specs.openai;
  }
  // OpenAI dead/over-limit (or no key) → Gemini (the one working provider, 2026-06-18).
  return specs.gemini;
}

/**
 * The single resolved {providerId, model} pinned across ALL agents + the Maverick
 * coordinator + the judge (FAIRNESS INVARIANT). Thin convenience over
 * resolveActiveProvider for call-sites that only need the two pinned values.
 */
export interface PinnedAgentSpec {
  readonly provider: Provider;
  readonly providerId: string;
  readonly model: string;
}

export async function resolvePinnedAgentSpec(
  env: Record<string, string | undefined>,
  opts: ResolveOptions = {},
): Promise<PinnedAgentSpec> {
  const spec = await resolveActiveProvider(env, opts);
  return {
    provider: spec.provider,
    providerId: spec.agentProviderId,
    model: spec.agentModel,
  };
}
