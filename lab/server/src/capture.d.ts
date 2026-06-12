/**
 * Ambient types for the plain-JS Playwright capture module (lab/capture/capture.mjs),
 * which has no own .d.ts. Wildcard match so the relative dynamic import type-checks.
 */
declare module "*capture.mjs" {
  export interface WebsiteResult {
    rank: number;
    title: string;
    url: string;
    snippet: string;
  }
  export interface WebsiteCaptureResult {
    question: string;
    capturedAt: string;
    url: string;
    results: WebsiteResult[];
    screenshotPath: string;
    raw?: {
      method?: string | null;
      nbHits?: number;
      blocker?: string;
      [k: string]: unknown;
    };
  }
  export function captureWebsite(
    question: string,
    opts?: { headless?: boolean },
  ): Promise<WebsiteCaptureResult>;
  export function slugify(question: string): string;
}
