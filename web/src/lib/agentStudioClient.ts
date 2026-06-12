/**
 * agentStudioClient — browser-direct Agent Studio completions (Stage 1).
 *
 * Adapted from rc3 useAgentStudioMaverick.ts:104-271, stripped of the
 * specialist/debug-log/console-logging cruft. Calls Agent Studio completions
 * directly from the browser (no backend) and parses the AI SDK v4 data stream.
 *
 * Wire contract (docs/project-overview.md Appendix A; rc3 §3.1):
 *   POST https://{APP_ID}.algolia.net/agent-studio/1/agents/{AGENT_ID}/completions?compatibilityMode=ai-sdk-4
 *   Headers: X-Algolia-Application-Id, X-Algolia-API-Key (search-only key),
 *            Content-Type: application/json, User-Agent (WAF blocks default urllib/fetch UA on /agent-studio/*)
 *   Body: { messages: [...history, {role:'user', content}] }
 *   Returns: SSE data stream — 0:text deltas, 9:tool calls, a:tool results/hits, 3:error.
 *
 * Our agents (cloned from Beta) run `searchIndex` SERVER-SIDE, so hits arrive as
 * `a:` frames and no client-side tool loop is required for Stage 1. The `hits`
 * we collect ARE the grounding source pool fed to InlineStreamAuditor.
 */

import type { HistoryEntry } from '../types/chat';

// ---------------------------------------------------------------------------
// Pure SSE parsing — testable without a network
// ---------------------------------------------------------------------------

export interface ToolInvocation {
    tool_call_id: string;
    tool_name: string;
    args: Record<string, unknown>;
}

export interface ParsedCompletion {
    content: string;
    toolInvocations: ToolInvocation[];
    hits: Record<string, unknown>[];
    error?: string;
}

/** Metadata frame prefixes that carry no answer/hit/error content. */
const IGNORED_PREFIXES = new Set(['b', 'e', 'd', 'f', '2', 'c']);

/**
 * Split an SSE line into `<prefix>:<payload>` on the FIRST colon only — payloads
 * (URLs, JSON) routinely contain colons. Returns null if there's no colon.
 */
export function parseSSELine(line: string): { prefix: string; payload: string } | null {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return null;
    return { prefix: line.substring(0, colonIdx), payload: line.substring(colonIdx + 1) };
}

/** Collect hit-shaped objects (url or title) from an `a:` tool result payload. */
function collectHits(result: unknown, sink: Record<string, unknown>[]): void {
    if (!result || typeof result !== 'object') return;
    const routeHit = (h: unknown) => {
        if (!h || typeof h !== 'object') return;
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

/**
 * Fold a list of SSE lines into the accumulated completion. `onText` (if given)
 * is called with the running content after each text delta — this is how the UI
 * streams. Malformed JSON in any single frame is skipped, never thrown.
 */
export function parseCompletionStream(
    lines: string[],
    onText?: (accumulated: string) => void,
): ParsedCompletion {
    let content = '';
    const toolInvocations: ToolInvocation[] = [];
    const hits: Record<string, unknown>[] = [];
    let error: string | undefined;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const parsed = parseSSELine(line);
        if (!parsed) continue;
        const { prefix, payload } = parsed;

        if (prefix === '0') {
            try {
                const delta = JSON.parse(payload) as string;
                if (typeof delta === 'string') {
                    content += delta;
                    onText?.(content);
                }
            } catch { /* skip malformed delta */ }
        } else if (prefix === '9') {
            try {
                const tc = JSON.parse(payload) as { toolCallId?: string; toolName?: string; args?: Record<string, unknown> };
                toolInvocations.push({
                    tool_call_id: tc.toolCallId ?? '',
                    tool_name: tc.toolName ?? '',
                    args: tc.args ?? {},
                });
            } catch { /* skip malformed tool call */ }
        } else if (prefix === 'a') {
            try {
                const toolResult = JSON.parse(payload) as { result?: unknown };
                collectHits(toolResult.result, hits);
            } catch { /* skip malformed tool result */ }
        } else if (prefix === '3') {
            // Error frame. Payload is usually a JSON string; fall back to raw.
            try {
                error = JSON.parse(payload) as string;
            } catch {
                error = payload;
            }
        } else if (!IGNORED_PREFIXES.has(prefix)) {
            // Unknown prefix — ignore but don't crash. (Logged in dev via caller.)
        }
    }

    return { content, toolInvocations, hits, error };
}

// ---------------------------------------------------------------------------
// Network call — browser-direct completions
// ---------------------------------------------------------------------------

export interface CompletionsConfig {
    appId: string;
    searchKey: string;
    agentId: string;
}

export interface CompletionsRequest {
    /** Prior turns (already sliced via buildConversationHistory). */
    history?: HistoryEntry[];
    /** The current user query. */
    query: string;
}

export function getAgentStudioUrl(appId: string, agentId: string): string {
    return `https://${appId}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-4`;
}

/**
 * Call Agent Studio completions and stream the answer. Resolves with the fully
 * accumulated completion (content + hits + tool calls + error). `onText` fires
 * on every text delta for live rendering.
 *
 * Throws on a non-2xx HTTP response (e.g. WAF 4xx, provider 401).
 */
export async function callCompletions(
    config: CompletionsConfig,
    req: CompletionsRequest,
    onText?: (accumulated: string) => void,
    fetchImpl: typeof fetch = fetch,
): Promise<ParsedCompletion> {
    const messages = [
        ...(req.history ?? []),
        { role: 'user' as const, content: req.query },
    ];

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Algolia-Application-Id': config.appId,
        'X-Algolia-API-Key': config.searchKey,
    };
    // The WAF on /agent-studio/* blocks the default urllib/node UA, so set an
    // explicit one in non-browser (node script/test) contexts. Browsers FORBID
    // setting User-Agent (they log "Refused to set unsafe header" and send their
    // own UA, which the WAF accepts) — so we omit it there to keep the console clean.
    // CORS browser-direct is confirmed working from a localhost origin (2026-06-10).
    if (typeof window === 'undefined') {
        headers['User-Agent'] = 'visibility-agent-webapp/1.0';
    }

    const res = await fetchImpl(getAgentStudioUrl(config.appId, config.agentId), {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Agent Studio error ${res.status}: ${text.substring(0, 500)}`);
    }
    if (!res.body) {
        throw new Error('Agent Studio response has no body to stream');
    }

    // Stream the SSE body, feeding complete lines to the parser incrementally so
    // onText fires as text arrives. We re-fold the full line list each flush; the
    // parser is cheap and this keeps a single source of truth for frame handling.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const lines: string[] = [];
    let lastContentLen = -1;

    const flushOnText = () => {
        const parsed = parseCompletionStream(lines);
        if (onText && parsed.content.length !== lastContentLen) {
            lastContentLen = parsed.content.length;
            onText(parsed.content);
        }
    };

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const split = buffer.split('\n');
            buffer = split.pop() ?? '';
            for (const l of split) {
                const t = l.trim();
                if (t) lines.push(t);
            }
            flushOnText();
        }
    } finally {
        reader.releaseLock();
    }
    if (buffer.trim()) lines.push(buffer.trim());

    return parseCompletionStream(lines);
}
