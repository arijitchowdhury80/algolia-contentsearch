/**
 * panels — the 2×2 panel model (P1–P4) for the answer-quality lab.
 *
 * The lab compares OUR system across two axes on the CENTRAL app (0EXRPAXB56):
 *   architecture: single-agent | multi-agent
 *   retrieval:    keyword       | neural
 *
 *   | row\col   | Single                  | Multi                  |
 *   | keyword   | P1 SINGLE_KEYWORD       | P2 MULTI_KEYWORD       |
 *   | neural    | P3 SINGLE_NEURAL        | P4 MULTI_NEURAL        |
 *
 * Single panels (P1/P3) proxy ONE Agent Studio agent (agentId, from env). Multi
 * panels (P2/P4) run the coded Maverick coordinator (multiAgent.ts) over the
 * source-scoped specialist agents on the shared MULTI index. Index names are the
 * locked AC2_WWW_<ARCH>_<RETRIEVAL> convention; agent ids are read from env and
 * MAY be empty until the agents are created out-of-band (create_central_agents.mjs)
 * — every consumer must tolerate an empty agentId.
 *
 * NOTE (2026-06-18): the NEURAL indices currently run in keyword mode (neural
 * enablement is a deferred async flip handled OUTSIDE this workflow). `retrieval`
 * is therefore just a tag/parameter that drives query construction — do NOT
 * assume neural is live at runtime.
 */
import { getEnv } from "./config.js";

// ---------------------------------------------------------------------------
// Shared answer shape (referenced by store.ts, runTests.ts, answer.ts, cli.ts)
// ---------------------------------------------------------------------------

export interface PanelSource {
  /** Stable id the judge can cite, e.g. "S1". */
  id: string;
  /** Source text fed to the grounding check. */
  text: string;
  /** URL / title for the rationale. */
  label?: string;
}

export interface PanelAnswer {
  answer: string;
  sources: PanelSource[];
  /** Provenance tag, e.g. "agent" or "coordinator". */
  source: string;
  error?: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// The 2×2 panel model
// ---------------------------------------------------------------------------

export type PanelId = "P1" | "P2" | "P3" | "P4";
export type Architecture = "single" | "multi";
export type Retrieval = "keyword" | "neural";

export interface PanelMeta {
  readonly panelId: PanelId;
  readonly label: string;
  readonly arch: Architecture;
  readonly retrieval: Retrieval;
  /** The index this panel's retrieval targets (single) or the specialists share (multi). */
  readonly indexName: string;
  /**
   * Single panels: the Agent Studio agent id (from env; may be "" until created).
   * Multi panels: undefined — the coded Maverick coordinator answers (`coordinator`).
   */
  readonly agentId?: string;
  /** Multi panels: true — answered by the coded coordinator, not a single agent. */
  readonly coordinator?: boolean;
}

/** The four index names — locked naming convention AC2_WWW_<ARCH>_<RETRIEVAL>. */
export const INDEX_NAMES = {
  P1: "AC2_WWW_SINGLE_KEYWORD",
  P2: "AC2_WWW_MULTI_KEYWORD",
  P3: "AC2_WWW_SINGLE_NEURAL",
  P4: "AC2_WWW_MULTI_NEURAL",
} as const;

/**
 * Build the four panel descriptors from env. Single-agent ids come from
 * ALGOLIA_AGENT_P1_ID / ALGOLIA_AGENT_P3_ID (may be empty until agents exist).
 * Multi panels carry `coordinator: true` instead of an agent id.
 */
export function buildPanels(
  env: Record<string, string | undefined> = getEnv(),
): PanelMeta[] {
  return [
    {
      panelId: "P1",
      label: "P1 · Single · Keyword",
      arch: "single",
      retrieval: "keyword",
      indexName: INDEX_NAMES.P1,
      agentId: env.ALGOLIA_AGENT_P1_ID ?? "",
    },
    {
      panelId: "P2",
      label: "P2 · Multi · Keyword",
      arch: "multi",
      retrieval: "keyword",
      indexName: INDEX_NAMES.P2,
      coordinator: true,
    },
    {
      panelId: "P3",
      label: "P3 · Single · Neural",
      arch: "single",
      retrieval: "neural",
      indexName: INDEX_NAMES.P3,
      agentId: env.ALGOLIA_AGENT_P3_ID ?? "",
    },
    {
      panelId: "P4",
      label: "P4 · Multi · Neural",
      arch: "multi",
      retrieval: "neural",
      indexName: INDEX_NAMES.P4,
      coordinator: true,
    },
  ];
}

/**
 * The four panels, built lazily from the merged env map and memoized.
 *
 * Lazy (not an eager `const = buildPanels()`) to avoid a module-init cycle:
 * config.ts imports buildPanels from here, and buildPanels' default env arg
 * calls getEnv() back in config.ts — evaluating it at panels.ts init time would
 * call getEnv() before config.ts has finished defining it. Computing on first
 * use sidesteps the cycle entirely.
 */
let _panels: PanelMeta[] | undefined;
export function getPanels(): PanelMeta[] {
  if (_panels === undefined) _panels = buildPanels();
  return _panels;
}

/** Look up one panel's metadata by id. Throws on an unknown id. */
export function panelById(
  panelId: PanelId,
  env?: Record<string, string | undefined>,
): PanelMeta {
  const panels = env ? buildPanels(env) : getPanels();
  const p = panels.find((x) => x.panelId === panelId);
  if (!p) throw new Error(`Unknown panelId: ${panelId}`);
  return p;
}
