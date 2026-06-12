/**
 * website — adapter that wires the live Playwright website capture
 * (lab/capture/capture.mjs) into the harness's WebsiteCapture seam.
 *
 * Case ① "Current Website Search" returns search RESULTS (links), not a
 * generated answer. We render the top results into a readable `answer` string
 * and expose each result as a grounding `Source`, so the blind judge scores the
 * incumbent keyword experience on the same rubric as the generated panels. (A
 * list of links naturally scores lower on completeness/depth than a synthesized
 * answer — that contrast is the point of the comparison.)
 *
 * The capture launches a real browser per question (slow, can hit bot detection)
 * so this lives behind the seam and is only registered for run-tests/pipeline.
 */
import type { ConversationTurn, PanelSource, WebsiteCapture } from "./panels.js";

function renderAnswer(
  question: string,
  results: { rank: number; title: string; url: string; snippet: string }[],
): string {
  if (results.length === 0) {
    return `The website search returned no results for "${question}".`;
  }
  const lines = results.map((r) => {
    const snip = r.snippet ? ` — ${r.snippet}` : "";
    const url = r.url ? ` (${r.url})` : "";
    return `${r.rank}. ${r.title}${snip}${url}`;
  });
  return `Current website search results for "${question}":\n${lines.join("\n")}`;
}

function toSources(
  results: { rank: number; title: string; url: string; snippet: string }[],
): PanelSource[] {
  return results.map((r) => ({
    id: `S${r.rank}`,
    text: [r.title, r.snippet].filter(Boolean).join(" — ") || r.url || `(result ${r.rank})`,
    ...(r.url ? { label: r.url } : {}),
  }));
}

/**
 * The live website capture, shaped to the harness's WebsiteCapture interface.
 * `history` is ignored — the incumbent header search is single-shot and has no
 * conversational memory, so a multi-turn follow-up is searched as a fresh query.
 */
export const liveWebsiteCapture: WebsiteCapture = {
  async captureWebsite(question: string, _history?: ConversationTurn[]) {
    const mod = await import("../../capture/capture.mjs");
    const cap = await mod.captureWebsite(question, { headless: true });
    const results = cap.results ?? [];
    return {
      answer: renderAnswer(question, results),
      sources: toSources(results),
    };
  },
};
