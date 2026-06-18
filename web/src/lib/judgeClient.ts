/**
 * judgeClient — talks to the local lab backend's POST /api/judge to grade the
 * answers the UI just displayed (③ Our System + ② Ask AI). Local-only: the
 * backend (lab/server webserver.ts) must be running; this cannot run on Vercel.
 * Live judging is indicative — the batch `cli judge` remains authoritative.
 */
import type { Source } from '../types/chat';

export type JudgeRole = 'skeptic' | 'referee' | 'advocate';

export interface JudgeSource {
  id?: string;
  title?: string;
  url?: string;
  /** Substantive body the grounding gate checks against. */
  text?: string;
}

export interface JudgePanelInput {
  panelId: string;
  label?: string;
  answer: string;
  sources: JudgeSource[];
}

export interface JudgeRequest {
  question: string;
  followUp?: string;
  isRefusalTest?: boolean;
  rounds?: number;
  panels: JudgePanelInput[];
}

/** One scored rubric dimension (grounding / confidence / breadth_depth), 1–10. */
export interface JudgeDimension {
  id: string;
  label: string;
  score: number;
}

/** A claim the Skeptic flagged as unsupported by the sources. */
export interface JudgeViolation {
  claim: string;
  reason: string;
  confidence: number;
}

export interface JudgeVerdict {
  panelId: string;
  judges: { role: JudgeRole; score: number; note: string }[];
  /** 3-dimension breakdown for the analysis rail's per-dimension bars. */
  dimensions: JudgeDimension[];
  /** Flagged unsupported claims — the WHY behind a grounding gate trip. */
  violations: JudgeViolation[];
  synthesizedScore: number;
  preGateScore: number;
  gateTripped: boolean;
  borderline: boolean;
  rationale: string;
  error?: string;
}

export interface JudgeResult {
  rounds: number;
  panels: JudgeVerdict[];
}

/** Base URL of the local lab backend. Override with VITE_LAB_API_URL. */
export function labApiBase(): string {
  return (import.meta.env.VITE_LAB_API_URL as string) || 'http://localhost:8787';
}

/** Map a UI Source to the judge payload, choosing the richest grounding text. */
export function toJudgeSource(s: Source): JudgeSource {
  const text =
    s.chunk_text?.trim() ||
    s.summary?.trim() ||
    s.doc_summary?.trim() ||
    s.title?.trim() ||
    '';
  return {
    id: s.objectID ?? s.id,
    ...(s.title ? { title: s.title } : {}),
    ...(s.url ?? s.doc_url ? { url: s.url ?? s.doc_url } : {}),
    text,
  };
}

function judgeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  // Shared-secret gate on the hosted backend (see lab/server/src/auth.ts). Unset
  // locally, so local dev keeps working against the open localhost backend.
  const apiKey = import.meta.env.VITE_LAB_API_KEY as string | undefined;
  if (apiKey) headers['x-lab-key'] = apiKey;
  return headers;
}

/** POST a judge request to the local backend (one JSON blob). For tests/back-compat. */
export async function requestJudge(
  req: JudgeRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<JudgeResult> {
  const res = await fetchImpl(`${labApiBase()}/api/judge`, {
    method: 'POST',
    headers: judgeHeaders(),
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `judge request failed (${res.status})`);
  }
  return (await res.json()) as JudgeResult;
}

export interface JudgePhase {
  phase: string;
  panels: number;
  provider: string;
  model: string;
  rounds: number;
}
export interface JudgeStreamHandlers {
  onPhase?: (p: JudgePhase) => void;
  /** Fires as EACH panel's verdict resolves (parallel — order not guaranteed). */
  onPanel?: (v: JudgeVerdict) => void;
}

/** Parse one SSE block ("event: x\ndata: {...}") into {event, data}. */
function parseSseBlock(block: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

/**
 * Stream a judge request as Server-Sent Events: fires `onPhase` once and `onPanel`
 * as each panel finishes (the panels judge in parallel on the backend), then
 * resolves with the final JudgeResult. Falls back to throwing on error events.
 */
export async function streamJudge(
  req: JudgeRequest,
  handlers: JudgeStreamHandlers = {},
  fetchImpl: typeof fetch = fetch,
): Promise<JudgeResult> {
  const res = await fetchImpl(`${labApiBase()}/api/judge`, {
    method: 'POST',
    headers: judgeHeaders({ Accept: 'text/event-stream' }),
    body: JSON.stringify(req),
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `judge request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: JudgeResult | undefined;
  let streamError: string | undefined;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const ev = parseSseBlock(block);
      if (!ev) continue;
      if (ev.event === 'phase') handlers.onPhase?.(ev.data as JudgePhase);
      else if (ev.event === 'panel') handlers.onPanel?.(ev.data as JudgeVerdict);
      else if (ev.event === 'result') result = ev.data as JudgeResult;
      else if (ev.event === 'error') streamError = (ev.data as { error?: string }).error;
    }
  }

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error('judge stream ended without a result');
  return result;
}
