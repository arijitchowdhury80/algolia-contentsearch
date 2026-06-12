/**
 * panels — runners that produce an answer for a question from each panel.
 *
 * Two panel kinds:
 *   - agent   → Agent Studio completions (node, with User-Agent for the WAF).
 *               SSE parse logic is ported from web/src/lib/agentStudioClient.ts
 *               (0:/9:/a:/3: frames) to keep one wire contract across browser +
 *               node.
 *   - website → the incumbent algolia.com Ask-AI. STUBBED for now; if the
 *               parallel lab/capture module exposes captureWebsite() we use it,
 *               otherwise we return a marked placeholder so the pipeline runs
 *               end-to-end without blocking on that workstream.
 */

// ---------------------------------------------------------------------------
// Shared answer shape
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
  /** Provenance tag, e.g. "agent" or "website-stub". */
  source: string;
  error?: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Agent Studio — SSE parsing (ported from agentStudioClient.ts)
// ---------------------------------------------------------------------------

const IGNORED_PREFIXES = new Set(["b", "e", "d", "f", "2", "c"]);

function parseSSELine(
  line: string,
): { prefix: string; payload: string } | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;
  return {
    prefix: line.substring(0, colonIdx),
    payload: line.substring(colonIdx + 1),
  };
}

function collectHits(
  result: unknown,
  sink: Record<string, unknown>[],
): void {
  if (!result || typeof result !== "object") return;
  const routeHit = (h: unknown) => {
    if (!h || typeof h !== "object") return;
    const rec = h as Record<string, unknown>;
    if (rec.url || rec.title) sink.push(rec);
  };
  if (Array.isArray(result)) {
    result.forEach(routeHit);
    return;
  }
  const obj = result as Record<string, unknown>;
  if (Array.isArray(obj.hits)) {
    (obj.hits as unknown[]).forEach(routeHit);
    return;
  }
  for (const key of Object.keys(obj)) {
    if (Array.isArray(obj[key])) (obj[key] as unknown[]).forEach(routeHit);
  }
}

interface ParsedCompletion {
  content: string;
  hits: Record<string, unknown>[];
  error?: string;
}

/** Fold a list of SSE lines into the accumulated completion. */
export function parseCompletionStream(lines: string[]): ParsedCompletion {
  let content = "";
  const hits: Record<string, unknown>[] = [];
  let error: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const parsed = parseSSELine(line);
    if (!parsed) continue;
    const { prefix, payload } = parsed;

    if (prefix === "0") {
      try {
        const delta = JSON.parse(payload) as string;
        if (typeof delta === "string") content += delta;
      } catch {
        /* skip malformed delta */
      }
    } else if (prefix === "a") {
      try {
        const toolResult = JSON.parse(payload) as { result?: unknown };
        collectHits(toolResult.result, hits);
      } catch {
        /* skip malformed tool result */
      }
    } else if (prefix === "3") {
      try {
        error = JSON.parse(payload) as string;
      } catch {
        error = payload;
      }
    } else if (prefix === "9") {
      /* tool call frame — not needed for the answer/sources */
    } else if (!IGNORED_PREFIXES.has(prefix)) {
      /* unknown prefix — ignore, don't crash */
    }
  }

  return { content, hits, ...(error ? { error } : {}) };
}

/** Turn collected agent hits into the judge's Source shape. */
function hitsToSources(hits: Record<string, unknown>[]): PanelSource[] {
  return hits.map((h, i) => {
    const url = typeof h.url === "string" ? h.url : undefined;
    const title = typeof h.title === "string" ? h.title : undefined;
    // Prefer a substantive text body for the grounding check.
    const textParts = [
      title,
      typeof h.description === "string" ? h.description : undefined,
      typeof h.content === "string" ? h.content : undefined,
      typeof h.body === "string" ? h.body : undefined,
      typeof h.excerpt === "string" ? h.excerpt : undefined,
    ].filter((x): x is string => Boolean(x));
    const text = textParts.join("\n") || url || `(hit ${i + 1})`;
    return {
      id: `S${i + 1}`,
      text,
      ...(url ?? title ? { label: url ?? title } : {}),
    };
  });
}

function agentUrl(appId: string, agentId: string): string {
  return `https://${appId}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-4`;
}

/**
 * Call an Agent Studio agent and return its answer + grounding sources.
 *
 * `history` is prior turns (for multi-turn questions); the current question is
 * appended as the final user message — same contract as the browser client.
 */
export async function runAgentPanel(
  agentId: string,
  appId: string,
  searchKey: string,
  question: string,
  history: ConversationTurn[] = [],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 120_000,
): Promise<PanelAnswer> {
  const messages = [...history, { role: "user" as const, content: question }];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(agentUrl(appId, agentId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": appId,
        "X-Algolia-API-Key": searchKey,
        // The WAF on /agent-studio/* blocks the default node UA.
        "User-Agent": "visibility-agent-harness/1.0",
      },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        answer: "",
        sources: [],
        source: "agent",
        error: `Agent Studio ${res.status}: ${text.slice(0, 300)}`,
      };
    }

    const body = await res.text();
    const lines = body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = parseCompletionStream(lines);

    return {
      answer: parsed.content,
      sources: hitsToSources(parsed.hits),
      source: "agent",
      ...(parsed.error ? { error: parsed.error } : {}),
    };
  } catch (e) {
    return {
      answer: "",
      sources: [],
      source: "agent",
      error: (e as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Website panel — incumbent Ask-AI (stubbed; lab/capture lands later)
// ---------------------------------------------------------------------------

/** Contract a real website capture must satisfy to slot into the harness. */
export interface WebsiteCapture {
  captureWebsite(
    question: string,
    history?: ConversationTurn[],
  ): Promise<{ answer: string; sources?: PanelSource[] }>;
}

let websiteCapture: WebsiteCapture | undefined;

/**
 * Try to load the parallel-built capture module. It currently exposes no entry,
 * so this stays undefined and we stub. When lab/capture ships a captureWebsite()
 * (or src/index with that export), register it here / via setWebsiteCapture and
 * runWebsitePanel uses it with no other change.
 */
export function setWebsiteCapture(impl: WebsiteCapture): void {
  websiteCapture = impl;
}

export async function loadWebsiteCaptureIfPresent(): Promise<void> {
  if (websiteCapture) return;
  // Candidate entry points the capture workstream might ship.
  const candidates = ["../../capture/src/index.js", "../../capture/index.js"];
  for (const rel of candidates) {
    try {
      const mod = (await import(rel)) as Partial<WebsiteCapture>;
      if (typeof mod.captureWebsite === "function") {
        websiteCapture = { captureWebsite: mod.captureWebsite.bind(mod) };
        return;
      }
    } catch {
      /* not present yet — fall through to stub */
    }
  }
}

/**
 * Produce the incumbent website answer. Uses a real capture if one is
 * registered; otherwise returns a clearly-marked stub so the pipeline runs.
 */
export async function runWebsitePanel(
  question: string,
  history: ConversationTurn[] = [],
): Promise<PanelAnswer> {
  await loadWebsiteCaptureIfPresent();
  if (websiteCapture) {
    try {
      const out = await websiteCapture.captureWebsite(question, history);
      return {
        answer: out.answer,
        sources: out.sources ?? [],
        source: "website",
      };
    } catch (e) {
      return {
        answer: "",
        sources: [],
        source: "website",
        error: (e as Error).message,
      };
    }
  }

  // Stub path — no live capture yet.
  return {
    answer: `[WEBSITE STUB] No live algolia.com Ask-AI capture wired yet for: "${question}". This placeholder exists so the harness runs end-to-end; lab/capture will replace it.`,
    sources: [],
    source: "website-stub",
  };
}
