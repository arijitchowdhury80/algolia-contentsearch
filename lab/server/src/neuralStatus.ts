/**
 * neuralStatus — report whether the two neural indices are actually running in
 * NeuralSearch mode yet.
 *
 * NeuralSearch is a deferred async flip: it gates on aggregated events, so a
 * freshly seeded index 412s on `mode:neuralSearch` until aggregation completes
 * (see scripts/setup/enable_neural.mjs). Until the flip lands, the P3/P4
 * "neural" panels run in keyword mode. GET /health embeds this map so the
 * frontend can show an honest "Neural · enabling" badge that clears itself the
 * moment the index reports `neuralSearch` — with NO redeploy.
 *
 * The Algolia getSettings calls are cached (TTL) so uptime/tunnel pings to
 * /health don't hammer the settings endpoint. On any error we report all-false
 * (conservative: never claim neural is live unverified).
 */
import { getEnv } from "./config.js";

/** The two indices whose live retrieval mode the neural panels (P3/P4) depend on. */
export const NEURAL_INDEXES = [
  "AC2_WWW_SINGLE_NEURAL",
  "AC2_WWW_MULTI_NEURAL",
] as const;

/** Map of index name → is that index live in NeuralSearch mode. */
export type NeuralStatus = Record<string, boolean>;

/** Pure: map each neural index's settings `mode` to a live-neural boolean. */
export function interpretNeuralModes(
  modeByIndex: Record<string, string | undefined | null>,
): NeuralStatus {
  const out: NeuralStatus = {};
  for (const ix of NEURAL_INDEXES) {
    out[ix] = modeByIndex[ix] === "neuralSearch";
  }
  return out;
}

export interface NeuralStatusDeps {
  appId: string;
  apiKey: string;
  /** Injectable fetch seam (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock (tests). Defaults to Date.now. */
  now?: () => number;
  /** Cache TTL in ms (default 30s). */
  ttlMs?: number;
}

/** Fetch the live `mode` of each neural index (one getSettings call per index). */
export async function fetchNeuralModes(
  deps: Pick<NeuralStatusDeps, "appId" | "apiKey" | "fetchImpl">,
): Promise<Record<string, string | undefined>> {
  const f = deps.fetchImpl ?? fetch;
  const entries = await Promise.all(
    NEURAL_INDEXES.map(async (ix) => {
      try {
        const res = await f(
          `https://${deps.appId}.algolia.net/1/indexes/${ix}/settings`,
          {
            headers: {
              "X-Algolia-Application-Id": deps.appId,
              "X-Algolia-API-Key": deps.apiKey,
              // Non-curl HTTP clients need a UA on Algolia endpoints.
              "User-Agent": "curl/8.4.0",
            },
          },
        );
        if (!res.ok) return [ix, undefined] as const;
        const json = (await res.json()) as { mode?: string };
        return [ix, json.mode] as const;
      } catch {
        return [ix, undefined] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Build a cached neural-status reader. getStatus() returns the interpreted map,
 * refetching at most once per TTL. On a cold cache, concurrent callers may each
 * fetch once (acceptable — /health is low-frequency); the result is then cached.
 */
export function makeNeuralStatusReader(
  deps: NeuralStatusDeps,
): () => Promise<NeuralStatus> {
  const ttlMs = deps.ttlMs ?? 30_000;
  const now = deps.now ?? Date.now;
  let cached: { at: number; value: NeuralStatus } | undefined;

  return async function getStatus(): Promise<NeuralStatus> {
    const t = now();
    if (cached && t - cached.at < ttlMs) return cached.value;
    const modes = await fetchNeuralModes(deps);
    const value = interpretNeuralModes(modes);
    cached = { at: t, value };
    return value;
  };
}

/** Build the reader from env (CENTRAL app + admin key). */
export function makeNeuralStatusReaderFromEnv(
  env: Record<string, string | undefined> = getEnv(),
): () => Promise<NeuralStatus> {
  return makeNeuralStatusReader({
    appId: env.ALGOLIA_APP_ID ?? "",
    apiKey: env.ALGOLIA_ADMIN_API_KEY ?? "",
  });
}
