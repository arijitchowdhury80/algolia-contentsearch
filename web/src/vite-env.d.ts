/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * CENTRAL app id (0EXRPAXB56) — the build home for the 2×2 lab.
   * Used by the browser ONLY for source preview searches (search-only key).
   */
  readonly VITE_ALGOLIA_APP_ID: string;
  /**
   * Search-only Algolia API key scoped to the 4 AC2_WWW_* indices.
   * NEVER the admin key. Admin / agent / LLM keys are strictly server-side.
   */
  readonly VITE_ALGOLIA_SEARCH_API_KEY: string;
  /**
   * Base URL of the lab backend (lab/server, port 8787 locally).
   * e.g. http://localhost:8787 or https://ac2-lab.onrender.com
   */
  readonly VITE_LAB_API_URL?: string;
  /**
   * Optional shared secret sent as x-lab-key to the hosted judge backend.
   * Only required when the backend enforces key auth (production deploy).
   */
  readonly VITE_LAB_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
