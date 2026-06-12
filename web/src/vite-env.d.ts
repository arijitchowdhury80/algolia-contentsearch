/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OUR build app (VVKSSPDMJX) — full admin; hosts our indices + agents. */
  readonly VITE_OURS_APP_ID: string;
  readonly VITE_OURS_SEARCH_KEY: string;
  readonly VITE_AGENT_MIRROR_ID: string;
  readonly VITE_INDEX_MIRROR: string;
  readonly VITE_AGENT_TUNED_ID: string;
  readonly VITE_INDEX_TUNED: string;
  /** Incumbent app (1QDAWL72TQ) — READ-ONLY; live keyword index name (for ① label only). */
  readonly VITE_INCUMBENT_INDEX: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
