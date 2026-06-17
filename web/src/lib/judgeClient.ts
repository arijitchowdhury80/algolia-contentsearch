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

export interface JudgeVerdict {
  panelId: string;
  judges: { role: JudgeRole; score: number; note: string }[];
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

/** POST a judge request to the local backend. fetchImpl is injectable for tests. */
export async function requestJudge(
  req: JudgeRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<JudgeResult> {
  const res = await fetchImpl(`${labApiBase()}/api/judge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `judge request failed (${res.status})`);
  }
  return (await res.json()) as JudgeResult;
}
