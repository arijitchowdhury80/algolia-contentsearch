/**
 * agentRunner — the seam that runs ONE Agent Studio agent completion and parses
 * its streamed response into `{ answer, sources }`. This is the single point of
 * contact with the Agent Studio completions wire protocol; answer.ts (single
 * panels) and multiAgent.ts (specialist fan-out) both call through it, and tests
 * inject a fake `AgentRunner` so no network is touched.
 *
 * Wire contract (Protocol Read Receipt — verified live in
 * scripts/setup/create_agents.py:94-107 + scripts/setup/agent_admin.mjs:93-110):
 *   POST https://{APP}.algolia.net/agent-studio/1/agents/{id}/completions?compatibilityMode=ai-sdk-4
 *   Headers: X-Algolia-Application-Id, X-Algolia-API-Key, Content-Type: application/json,
 *            User-Agent: curl/8.4.0  (REQUIRED for /agent-studio/*)
 *   Body:    { messages: [{ role, content }, ...] }
 *   Stream (ai-sdk-4 line protocol, one `<prefix>:<json>` per line):
 *     0:"text chunk"     → assistant text (JSON-encoded string fragment)
 *     3:"error"          → error
 *     a:{...} / 9:{...}  → tool result frames carrying retrieved hits ({url,title,...})
 */
import type { ConversationTurn, PanelSource } from "./panels.js";

/** Result of running one agent: the assistant text + the hits it retrieved. */
export interface AgentRunResult {
  answer: string;
  sources: PanelSource[];
  error?: string;
}

/**
 * Run one Agent Studio agent against a question (+ optional prior turns). The
 * seam answer.ts / multiAgent.ts depend on; the default is `runAgentStudioAgent`
 * (real network), tests pass a stub.
 */
export type AgentRunner = (
  agentId: string,
  question: string,
  history?: ConversationTurn[],
) => Promise<AgentRunResult>;

/** Config for the real Agent Studio runner (CENTRAL app + a server-side key). */
export interface AgentStudioConfig {
  readonly appId: string;
  /** Admin or search key valid for completions (server-side only — never browser). */
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  /** Per-call network timeout, ms. Default 120000. */
  readonly timeoutMs?: number;
}

/** Extract retrieved hits from a parsed tool-result frame (a:/9:). Pure. */
function hitsFromToolFrame(payload: unknown): PanelSource[] {
  if (!payload || typeof payload !== "object") return [];
  const result = (payload as { result?: unknown }).result ?? payload;
  const arr = Array.isArray(result)
    ? result
    : Array.isArray((result as { hits?: unknown[] })?.hits)
      ? (result as { hits: unknown[] }).hits
      : [];
  const out: PanelSource[] = [];
  for (const h of arr) {
    if (!h || typeof h !== "object") continue;
    const hit = h as Record<string, unknown>;
    const url = typeof hit.url === "string" ? hit.url : undefined;
    const title = typeof hit.title === "string" ? hit.title : undefined;
    if (!url && !title) continue;
    // Body for the grounding check: prefer rich text, fall back to title.
    const text =
      [hit.content, hit.body, hit.description, hit.text, title]
        .find((v) => typeof v === "string" && (v as string).trim()) as
        | string
        | undefined;
    out.push({
      id: `S${out.length + 1}`,
      text: (text ?? title ?? url ?? "").trim(),
      ...(title ?? url ? { label: (title ?? url) as string } : {}),
    });
  }
  return out;
}

/**
 * Parse the ai-sdk-4 streamed completion body into `{ answer, sources }`. Pure
 * (no I/O) so it is unit-testable against captured fixtures. De-dupes sources by
 * label/url across multiple tool frames.
 */
export function parseAgentStream(raw: string): AgentRunResult {
  let answer = "";
  let error: string | undefined;
  const sources: PanelSource[] = [];
  const seen = new Set<string>();

  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i === -1) continue;
    const prefix = t.slice(0, i);
    const payload = t.slice(i + 1);
    if (prefix === "0") {
      // assistant text fragment, JSON-encoded string
      try {
        answer += JSON.parse(payload) as string;
      } catch {
        /* ignore malformed text frame */
      }
    } else if (prefix === "3") {
      try {
        error = JSON.parse(payload) as string;
      } catch {
        error = payload;
      }
    } else if (prefix === "a" || prefix === "9") {
      try {
        for (const s of hitsFromToolFrame(JSON.parse(payload))) {
          const key = (s.label ?? s.text).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          sources.push({ ...s, id: `S${sources.length + 1}` });
        }
      } catch {
        /* ignore malformed tool frame */
      }
    }
  }

  return {
    answer: answer.trim(),
    sources,
    ...(error ? { error } : {}),
  };
}

/** Build the messages array for a completion (prior turns + the new question). */
function toMessages(
  question: string,
  history: ConversationTurn[] = [],
): { role: string; content: string }[] {
  return [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: question },
  ];
}

/** Build the real Agent Studio runner bound to a CENTRAL app + server-side key. */
export function makeAgentStudioRunner(cfg: AgentStudioConfig): AgentRunner {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 120_000;

  return async function runAgentStudioAgent(
    agentId: string,
    question: string,
    history: ConversationTurn[] = [],
  ): Promise<AgentRunResult> {
    if (!agentId) {
      return { answer: "", sources: [], error: "no agentId configured" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(
        `https://${cfg.appId}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-4`,
        {
          method: "POST",
          headers: {
            "X-Algolia-Application-Id": cfg.appId,
            "X-Algolia-API-Key": cfg.apiKey,
            "Content-Type": "application/json",
            "User-Agent": "curl/8.4.0",
          },
          body: JSON.stringify({ messages: toMessages(question, history) }),
          signal: controller.signal,
        },
      );
      const raw = await res.text();
      if (!res.ok) {
        return { answer: "", sources: [], error: `agent ${res.status}: ${raw.slice(0, 300)}` };
      }
      return parseAgentStream(raw);
    } catch (e) {
      return { answer: "", sources: [], error: (e as Error).message };
    } finally {
      clearTimeout(timer);
    }
  };
}
