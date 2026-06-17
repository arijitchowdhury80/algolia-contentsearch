/**
 * websiteClient — ① "Current Website Search". The browser can't query live
 * algolia.com (different app + WAF + CORS), so the local lab backend captures it
 * via Playwright. POST /api/website { query } → { answer, sources }. Local-only;
 * not available on the Vercel deploy. See judgeClient for labApiBase.
 */
import { labApiBase } from './judgeClient';

export interface WebsiteSource {
  id: string;
  /** Display text (title — snippet). */
  text: string;
  /** Result URL. */
  label?: string;
}

export interface WebsiteResult {
  /** Rendered "top results" text (also used as the judged answer). */
  answer: string;
  /** Ranked result hits. */
  sources: WebsiteSource[];
}

export async function requestWebsiteCapture(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WebsiteResult> {
  const res = await fetchImpl(`${labApiBase()}/api/website`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `website capture failed (${res.status})`);
  }
  return (await res.json()) as WebsiteResult;
}
