/**
 * The three panels of the Answer-Quality Lab (layout restructure 2026-06-12).
 * One query fans out to all three; each panel is labelled `Index | Engine`.
 *
 *   ① website — Current Website Search  → live algolia.com (offline Playwright capture, backend)
 *   ② mirror  — Ask AI                  → quality floor (real Ask-AI-default prompt, untuned index)
 *   ③ tuned   — Our System              → our optimized agent + tuned index
 *
 * Comparisons:
 *   ② vs ③ — Ask-AI quality floor vs our optimized system.
 *   ① vs ③ — old keyword website vs our agent.
 *
 * Config is read from import.meta.env (VITE_* in web/.env.local). Search-only
 * keys only ever reach the browser; admin/OpenAI keys stay server-side.
 */
import type { ColumnId } from '../types/chat';

export type ColumnKind = 'website' | 'agent';

interface CommonColumn {
  id: ColumnId;
  kind: ColumnKind;
  /** Short panel title shown in the header. */
  title: string;
  /** `Index | Engine` identity. */
  indexLabel: string;
  agentLabel: string;
  /** Friendly Algolia app name + id (which app this panel runs against). */
  appName: string;
  /** True for the incumbent app — we only READ it, never write. */
  readOnly: boolean;
  /** One-line execution pipeline (how a query becomes this panel's output). */
  pipeline: string;
  /** CSS custom property name used for the panel accent stripe. */
  accentVar: string;
  /** One-line "what this panel proves" tagline. */
  proves: string;
}

export interface WebsiteColumnConfig extends CommonColumn {
  kind: 'website';
}

export interface AgentColumnConfig extends CommonColumn {
  kind: 'agent';
  appId: string;
  searchKey: string;
  agentId: string;
  indexName: string;
  /** Known external defect surfaced to the UI. */
  knownIssue?: string;
}

export type ColumnConfig = WebsiteColumnConfig | AgentColumnConfig;

/** Read a required env var, failing loudly at startup if absent. */
function reqEnv(key: keyof ImportMetaEnv): string {
  const v = import.meta.env[key];
  if (!v) {
    throw new Error(`Missing required env var ${key}. Check web/.env.local.`);
  }
  return v;
}

export function buildColumns(): ColumnConfig[] {
  const oursApp = reqEnv('VITE_OURS_APP_ID');
  const oursKey = reqEnv('VITE_OURS_SEARCH_KEY');
  const incIndex = reqEnv('VITE_INCUMBENT_INDEX');

  return [
    {
      id: 'website',
      kind: 'website',
      title: '① Current Website Search',
      indexLabel: incIndex,
      agentLabel: 'Live keyword search (algolia.com)',
      appName: 'Incumbent · algolia.com',
      readOnly: true,
      pipeline: 'Captured offline by the backend harness (Playwright on live algolia.com). Not driven live from the browser.',
      accentVar: '--gray-400',
      proves: 'The old-world reference: what algolia.com search returns today.',
    },
    {
      id: 'mirror',
      kind: 'agent',
      title: '② Ask AI',
      indexLabel: reqEnv('VITE_INDEX_MIRROR'),
      agentLabel: 'Ask AI — default config',
      appName: `Our build app · ${oursApp}`,
      readOnly: false,
      pipeline: 'Browser → Agent Studio (ours) → searchIndex on the faithful (untuned) index → grounded LLM answer.',
      accentVar: '--accent-purple',
      proves: "The Ask-AI quality floor: Algolia's default Ask-AI prompt on the faithful, untuned corpus.",
      appId: oursApp,
      searchKey: oursKey,
      agentId: reqEnv('VITE_AGENT_MIRROR_ID'),
      indexName: reqEnv('VITE_INDEX_MIRROR'),
    },
    {
      id: 'tuned',
      kind: 'agent',
      title: '③ Our System',
      indexLabel: reqEnv('VITE_INDEX_TUNED'),
      agentLabel: 'Our System (optimized — Wave 2)',
      appName: `Our build app · ${oursApp}`,
      readOnly: false,
      pipeline: 'Browser → Agent Studio (ours) → searchIndex on the TUNED index → grounded LLM answer.',
      accentVar: '--algolia-blue',
      proves: 'Our optimized system (compare ② vs ③, and ① vs ③).',
      appId: oursApp,
      searchKey: oursKey,
      agentId: reqEnv('VITE_AGENT_TUNED_ID'),
      indexName: reqEnv('VITE_INDEX_TUNED'),
    },
  ];
}

/** Example queries for the empty state (keyword + conversational mix). */
export const EXAMPLE_QUERIES = [
  'How does Algolia handle typo tolerance?',
  'What is the difference between a Query Suggestion and a Recommendation?',
  'Set up faceted search for an ecommerce catalog',
  'Does Algolia support vector search?',
];
