/**
 * Panel configuration for the 2×2 Answer-Quality Lab.
 *
 * The lab compares OUR system on the CENTRAL app (0EXRPAXB56) across two axes:
 *   architecture:  single-agent  | multi-agent (coded Maverick coordinator)
 *   retrieval:     keyword        | neural
 *
 *   | row\col   | Single                   | Multi                   |
 *   | keyword   | P1 · AC2_WWW_SINGLE_KEYWORD | P2 · AC2_WWW_MULTI_KEYWORD |
 *   | neural    | P3 · AC2_WWW_SINGLE_NEURAL  | P4 · AC2_WWW_MULTI_NEURAL  |
 *
 * Config is read from import.meta.env (VITE_* in web/.env.local).
 *   VITE_ALGOLIA_APP_ID          — CENTRAL app id (0EXRPAXB56)
 *   VITE_ALGOLIA_SEARCH_API_KEY  — search-only key; NEVER the admin key
 *
 * Security: the browser receives ONLY the search-only key. Admin keys, agent
 * keys, and OpenAI/Gemini keys are strictly server-side (lab/server).
 *
 * NOTE: the NEURAL indices currently run in keyword mode (neural enablement is a
 * deferred async flip). `retrieval` is a label/parameter for query construction
 * — do NOT assume neural is live at runtime.
 */
import type { Panel, PanelId, Architecture, Retrieval } from '../types/chat';

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

/** Read a required VITE_ env var; throws loudly at startup if absent. */
function reqEnv(key: keyof ImportMetaEnv): string {
  const v = import.meta.env[key];
  if (!v) {
    throw new Error(
      `Missing required env var ${key}. Add it to web/.env.local.\n` +
      `VITE_ALGOLIA_APP_ID and VITE_ALGOLIA_SEARCH_API_KEY must both be set to the CENTRAL app (0EXRPAXB56).`,
    );
  }
  return v;
}

// ---------------------------------------------------------------------------
// Per-panel UI config (extends Panel with display metadata)
// ---------------------------------------------------------------------------

/**
 * Full browser-side panel descriptor — the Panel identity fields plus the
 * display metadata needed by Matrix, PanelCell, and the JudgeDrawer.
 */
export interface PanelConfig extends Panel {
  /** Short label shown in the cell header, e.g. "P1 · Single · Keyword". */
  label: string;
  /** Which Algolia app id to use for source previews (search-only). */
  appId: string;
  /** Search-only Algolia API key — the ONLY key shipped to the browser. */
  searchKey: string;
  /** CSS custom-property name for the panel's accent stripe/glow. */
  accentVar: string;
  /** One-line tagline: what this cell proves in the experiment. */
  proves: string;
  /** One-line execution pipeline description for the "How it answered" expander. */
  pipeline: string;
}

// ---------------------------------------------------------------------------
// Locked index names (must match the server's INDEX_NAMES in panels.ts)
// ---------------------------------------------------------------------------

/** The four index names — locked naming convention AC2_WWW_<ARCH>_<RETRIEVAL>. */
export const INDEX_NAMES: Record<PanelId, string> = {
  P1: 'AC2_WWW_SINGLE_KEYWORD',
  P2: 'AC2_WWW_MULTI_KEYWORD',
  P3: 'AC2_WWW_SINGLE_NEURAL',
  P4: 'AC2_WWW_MULTI_NEURAL',
} as const;

// ---------------------------------------------------------------------------
// Panel config builder
// ---------------------------------------------------------------------------

/**
 * Build the four panel descriptors from CENTRAL env.
 *
 * Call once at app startup; throws if required env vars are missing. The
 * returned configs are read-only — they never change at runtime.
 */
export function buildPanelConfigs(): PanelConfig[] {
  const appId = reqEnv('VITE_ALGOLIA_APP_ID');
  const searchKey = reqEnv('VITE_ALGOLIA_SEARCH_API_KEY');

  const panels: Array<{
    id: PanelId;
    arch: Architecture;
    retrieval: Retrieval;
    accentVar: string;
    proves: string;
    pipeline: string;
  }> = [
    {
      id: 'P1',
      arch: 'single',
      retrieval: 'keyword',
      accentVar: '--accent-p1',
      proves: 'Baseline: single agent + keyword retrieval (Case-3 config).',
      pipeline: 'Browser → /api/answer → Agent Studio agent (ac2-single-keyword) → AC2_WWW_SINGLE_KEYWORD → grounded answer.',
    },
    {
      id: 'P2',
      arch: 'multi',
      retrieval: 'keyword',
      accentVar: '--accent-p2',
      proves: 'Multi-agent lift over keyword: does Maverick + source-scoped specialists beat a single agent?',
      pipeline: 'Browser → /api/answer → Maverick coordinator → parallel specialists (Technical/Marketer/Academy/Support on AC2_WWW_MULTI_KEYWORD) → synthesis.',
    },
    {
      id: 'P3',
      arch: 'single',
      retrieval: 'neural',
      accentVar: '--accent-p3',
      proves: 'Neural lift over keyword: does neural retrieval beat keyword for a single agent?',
      pipeline: 'Browser → /api/answer → Agent Studio agent (ac2-single-neural) → AC2_WWW_SINGLE_NEURAL → grounded answer.',
    },
    {
      id: 'P4',
      arch: 'multi',
      retrieval: 'neural',
      accentVar: '--accent-p4',
      proves: 'Compound: multi-agent + neural — the best of both axes vs the P1 baseline.',
      pipeline: 'Browser → /api/answer → Maverick coordinator → parallel specialists on AC2_WWW_MULTI_NEURAL → synthesis.',
    },
  ];

  return panels.map((p) => ({
    id: p.id,
    arch: p.arch,
    retrieval: p.retrieval,
    indexName: INDEX_NAMES[p.id],
    label: `${p.id} · ${p.arch === 'single' ? 'Single' : 'Multi'} · ${p.retrieval === 'keyword' ? 'Keyword' : 'Neural'}`,
    appId,
    searchKey,
    accentVar: p.accentVar,
    proves: p.proves,
    pipeline: p.pipeline,
  }));
}

/** The four panel configs, built once from env. Import this in components. */
export const PANEL_CONFIGS: PanelConfig[] = buildPanelConfigs();

/** Look up one panel config by id. Throws on an unknown id. */
export function panelConfigById(id: PanelId): PanelConfig {
  const c = PANEL_CONFIGS.find((p) => p.id === id);
  if (!c) throw new Error(`Unknown PanelId: ${id}`);
  return c;
}

// ---------------------------------------------------------------------------
// Legacy (kept for dormant old-lab files during the Phase 0→5 transition)
// ColumnHeader.tsx, ColumnHeader.test.tsx, useComparison.ts, and other pre-
// refactor files reference these types. They are not rendered by the new App.
// ---------------------------------------------------------------------------

/** @deprecated Legacy column kind union. Use Panel/PanelConfig instead. */
export type ColumnKind = 'website' | 'agent';

/** @deprecated Legacy base column config. Use PanelConfig instead. */
export interface ColumnConfig {
  id: string;
  kind: ColumnKind;
  title: string;
  indexLabel: string;
  agentLabel: string;
  appName: string;
  readOnly: boolean;
  pipeline: string;
  accentVar: string;
  proves: string;
}

/** @deprecated Legacy agent column config. Use PanelConfig instead. */
export interface AgentColumnConfig extends ColumnConfig {
  kind: 'agent';
  appId: string;
  searchKey: string;
  agentId: string;
  indexName: string;
  knownIssue?: string;
}

// ---------------------------------------------------------------------------
// Example queries for the empty / idle state
// ---------------------------------------------------------------------------

/**
 * Seed queries for the lab's empty state — a mix of keyword-friendly (precise
 * terms) and neural-friendly (conceptual / natural-language) to exercise both
 * retrieval axes.
 */
export const EXAMPLE_QUERIES: string[] = [
  'How does Algolia handle typo tolerance?',
  'What is the difference between a Query Suggestion and a Recommendation?',
  'Set up faceted search for an ecommerce catalog',
  'Does Algolia support vector search?',
  'How do I configure synonyms for my index?',
  'What content sources does Algolia Academy cover?',
];
