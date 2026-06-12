/**
 * useComparison — orchestrates the 4-lane fan-out from a single query bar.
 *
 * Decoupled design: this hook owns only the SHARED signals. Each lane keeps its
 * own thread/state locally (better streaming perf, no cross-lane re-renders) and
 * reacts to:
 *   - `submission` — a {query, seq} bumped on every submit; lanes run on seq change.
 *   - `clearSeq`   — bumped on reset; lanes clear their threads on change.
 * For transcript export, each lane registers a snapshot getter; export folds them.
 */
import { useCallback, useRef, useState } from 'react';
import type { ColumnId, Message } from '../types/chat';

export interface Submission {
  query: string;
  seq: number;
}

/** What a lane reports for transcript capture (eval tie-in, overview §10). */
export interface LaneSnapshot {
  columnId: ColumnId;
  kind: 'keyword' | 'agent';
  /** Agent lanes: the full message thread. */
  messages?: Message[];
  /** Keyword lane: the latest query + ranked hits. */
  keyword?: { query: string; hits: Record<string, unknown>[]; nbHits: number };
}

export interface Transcript {
  capturedAt: string;
  lanes: LaneSnapshot[];
}

export interface ComparisonApi {
  submission: Submission | null;
  clearSeq: number;
  hasRun: boolean;
  submit: (query: string) => void;
  reset: () => void;
  /** Lanes call this on mount to register their snapshot getter. Returns an unregister fn. */
  register: (id: ColumnId, getSnapshot: () => LaneSnapshot) => () => void;
  /** Build the transcript JSON from all registered lanes. */
  buildTranscript: () => Transcript;
}

export function useComparison(): ComparisonApi {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [clearSeq, setClearSeq] = useState(0);
  const registry = useRef(new Map<ColumnId, () => LaneSnapshot>());

  const submit = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    setSubmission((prev) => ({ query: q, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const reset = useCallback(() => {
    setSubmission(null);
    setClearSeq((n) => n + 1);
  }, []);

  const register = useCallback((id: ColumnId, getSnapshot: () => LaneSnapshot) => {
    registry.current.set(id, getSnapshot);
    return () => {
      registry.current.delete(id);
    };
  }, []);

  const buildTranscript = useCallback((): Transcript => {
    const lanes: LaneSnapshot[] = [];
    for (const getSnapshot of registry.current.values()) {
      lanes.push(getSnapshot());
    }
    return { capturedAt: new Date().toISOString(), lanes };
  }, []);

  return {
    submission,
    clearSeq,
    hasRun: submission !== null,
    submit,
    reset,
    register,
    buildTranscript,
  };
}
