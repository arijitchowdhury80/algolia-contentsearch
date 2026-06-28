/**
 * neuralStatus (client) — reports whether each NEURAL index is actually running
 * in NeuralSearch mode yet.
 *
 * NeuralSearch is a deferred async flip (it gates on aggregated events; see
 * scripts/setup/enable_neural.mjs). Until it lands, the P3/P4 "neural" panels
 * run in keyword mode. The PanelCell shows an honest "Neural · enabling" badge
 * for those panels, driven by this status from the backend's GET /health.
 *
 * Self-healing: the badge clears the moment the backend reports the index in
 * `neuralSearch` mode — no redeploy needed (a slow poll picks it up live).
 * Conservative on uncertainty: if /health is unreachable or omits the field,
 * we treat neural as NOT live (show the badge) rather than over-claim.
 */
import { labApiBase } from './judgeClient';

/** Map of index name → is that index live in NeuralSearch mode. */
export type NeuralStatus = Record<string, boolean>;

/**
 * Pull the `neural` map out of a /health JSON body. Tolerant of any shape:
 * a missing/malformed `neural` field yields {} (→ "not live, show badge").
 */
export function parseNeuralStatus(body: unknown): NeuralStatus {
  if (!body || typeof body !== 'object') return {};
  const neural = (body as { neural?: unknown }).neural;
  if (!neural || typeof neural !== 'object') return {};
  const out: NeuralStatus = {};
  for (const [k, v] of Object.entries(neural as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/**
 * Should a neural panel show the "enabling" badge?
 * Keyword panels: never. Neural panels: until the index reports live.
 */
export function isNeuralPending(
  retrieval: 'keyword' | 'neural',
  indexName: string,
  status: NeuralStatus,
): boolean {
  if (retrieval !== 'neural') return false;
  return status[indexName] !== true;
}

/** Fetch /health and parse the neural-index live-mode map. Any failure → {}. */
export async function fetchNeuralStatus(
  fetchImpl: typeof fetch = fetch,
): Promise<NeuralStatus> {
  try {
    const res = await fetchImpl(`${labApiBase()}/health`);
    if (!res.ok) return {};
    return parseNeuralStatus(await res.json());
  } catch {
    return {};
  }
}
