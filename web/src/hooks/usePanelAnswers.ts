/**
 * usePanelAnswers — fans one /api/answer SSE connection into per-panel state.
 *
 * Opens ONE streaming connection to the backend for a submitted question and
 * distributes the per-panel token/complete events into P1–P4 state. All four
 * panels are driven by this single hook so the connection lifecycle is managed
 * in one place and there are no cross-lane race conditions.
 *
 * SSE protocol (backend webserver.ts → answerService.ts):
 *   event: phase  → { phase:'answering', panels:number, turn:number }
 *   event: panel  → AnswerPanelPayload (panelId + unified answer contract)
 *   event: result → { panels: AnswerPanelPayload[] }          (final summary)
 *   event: error  → { error: string }                         (fatal stream error)
 *
 * State machine per panel: idle → streaming → done | error
 * Hook-level state:        idle → streaming → done | error
 *
 * Mirrors the streaming-client style of useLiveJudge.ts and judgeClient.ts:
 *   - seq guard drops results from a superseded query
 *   - abort controller cancels the in-flight fetch on new submission / unmount
 *   - refs keep callbacks stable and free of stale closures
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelId, PanelDataResult, AnswerSource, PanelTiming, OrchestrationTrace } from '../types/chat';
import type { Submission } from './useComparison';
import { labApiBase } from '../lib/judgeClient';

// ---------------------------------------------------------------------------
// Per-panel state
// ---------------------------------------------------------------------------

export type PanelAnswerStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface PanelAnswerState {
  status: PanelAnswerStatus;
  /** Streamed answer text (grows as tokens arrive for a future streaming path). */
  answer: string;
  sources: AnswerSource[];
  timing: PanelTiming | null;
  /** Multi panels (P2/P4) — Maverick orchestration trace. */
  trace?: OrchestrationTrace;
  /** Generated follow-up question from the panel (shared instruction, varies by arch). */
  followUp?: string;
  /** Set on a panel-level error (other panels are unaffected). */
  error?: string;
}

const IDLE_PANEL: PanelAnswerState = {
  status: 'idle',
  answer: '',
  sources: [],
  timing: null,
};

// ---------------------------------------------------------------------------
// Hook-level state
// ---------------------------------------------------------------------------

export type PanelAnswersStatus = 'idle' | 'streaming' | 'done' | 'error';

export type PanelAnswersMap = Record<PanelId, PanelAnswerState>;

export interface PanelAnswersApi {
  /** Hook-level lifecycle — all panels done → 'done'. */
  status: PanelAnswersStatus;
  /** Fatal stream-level error (distinct from per-panel errors). */
  error?: string;
  /** Per-panel state — always has all four keys. */
  panels: PanelAnswersMap;
  /**
   * Convenience: returns the PanelDataResult shape (answer, sources, timing,
   * trace, followUp) for one panel when it is done, undefined otherwise.
   * Useful for wiring into useLiveJudge.report() on completion.
   */
  getResult: (id: PanelId) => PanelDataResult | undefined;
}

// ---------------------------------------------------------------------------
// Internal SSE payload types (mirror answerService.ts server types)
// ---------------------------------------------------------------------------

interface AnswerPanelPayload {
  panelId: PanelId;
  answer: string;
  sources: AnswerSource[];
  timing: PanelTiming;
  followUp: string;
  trace?: OrchestrationTrace;
  error?: string;
}

interface PhaseEvent {
  phase: string;
  panels: number;
  turn: number;
}

interface ResultEvent {
  panels: AnswerPanelPayload[];
}

// ---------------------------------------------------------------------------
// SSE parsing helper (same as judgeClient.ts parseSseBlock)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// API key header helper (mirrors judgeClient.ts judgeHeaders pattern)
// ---------------------------------------------------------------------------

function answerHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  const apiKey = import.meta.env.VITE_LAB_API_KEY as string | undefined;
  if (apiKey) headers['x-lab-key'] = apiKey;
  return headers;
}

// ---------------------------------------------------------------------------
// Initial map factory
// ---------------------------------------------------------------------------

function makeIdleMap(): PanelAnswersMap {
  return { P1: { ...IDLE_PANEL }, P2: { ...IDLE_PANEL }, P3: { ...IDLE_PANEL }, P4: { ...IDLE_PANEL } };
}

// ---------------------------------------------------------------------------
// usePanelAnswers
// ---------------------------------------------------------------------------

export function usePanelAnswers(submission: Submission | null): PanelAnswersApi {
  const [status, setStatus] = useState<PanelAnswersStatus>('idle');
  const [error, setError] = useState<string | undefined>();
  const [panels, setPanels] = useState<PanelAnswersMap>(makeIdleMap);

  // Seq guard: drop events from superseded submissions.
  const seqRef = useRef(-1);
  // Abort controller: cancel the in-flight fetch on new submission or unmount.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Reset → idle when submission is cleared (Reset button).
    if (!submission) {
      abortRef.current?.abort();
      abortRef.current = null;
      seqRef.current = -1;
      setStatus('idle');
      setError(undefined);
      setPanels(makeIdleMap());
      return;
    }

    // Same submission as before — nothing to do.
    if (submission.seq === seqRef.current) return;

    // New submission — cancel previous and start fresh.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    seqRef.current = submission.seq;
    const firedSeq = submission.seq;

    // Transition to streaming + reset per-panel state.
    setStatus('streaming');
    setError(undefined);
    setPanels(() => {
      const m = makeIdleMap();
      // Mark all four panels as streaming immediately so the UI shows spinners.
      (Object.keys(m) as PanelId[]).forEach((id) => {
        m[id] = { ...IDLE_PANEL, status: 'streaming' };
      });
      return m;
    });

    // Stream from the backend.
    (async () => {
      try {
        const res = await fetch(`${labApiBase()}/api/answer`, {
          method: 'POST',
          headers: answerHeaders(),
          body: JSON.stringify({ question: submission.query }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `answer request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;

          // Seq guard: abort processing if superseded.
          if (seqRef.current !== firedSeq) break;

          buffer += decoder.decode(value, { stream: true });

          // Dispatch complete SSE blocks (delimited by \n\n).
          let sep: number;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const ev = parseSseBlock(block);
            if (!ev || seqRef.current !== firedSeq) continue;

            if (ev.event === 'phase') {
              // Phase event confirms the stream has opened. Status already 'streaming'.
              void (ev.data as PhaseEvent);
            } else if (ev.event === 'panel') {
              const payload = ev.data as AnswerPanelPayload;
              const panelState: PanelAnswerState = {
                status: payload.error && !payload.answer ? 'error' : 'done',
                answer: payload.answer,
                sources: payload.sources,
                timing: payload.timing,
                ...(payload.trace ? { trace: payload.trace } : {}),
                ...(payload.followUp ? { followUp: payload.followUp } : {}),
                ...(payload.error ? { error: payload.error } : {}),
              };
              setPanels((prev) => ({ ...prev, [payload.panelId]: panelState }));
            } else if (ev.event === 'result') {
              // The result event is the final summary — all panels should be set by
              // individual panel events already; use it as a reconciliation pass.
              const result = ev.data as ResultEvent;
              if (seqRef.current === firedSeq) {
                setPanels((prev) => {
                  const next = { ...prev };
                  for (const payload of result.panels) {
                    // Only fill in panels that didn't receive an individual panel event.
                    if (next[payload.panelId].status === 'streaming') {
                      next[payload.panelId] = {
                        status: payload.error && !payload.answer ? 'error' : 'done',
                        answer: payload.answer,
                        sources: payload.sources,
                        timing: payload.timing,
                        ...(payload.trace ? { trace: payload.trace } : {}),
                        ...(payload.followUp ? { followUp: payload.followUp } : {}),
                        ...(payload.error ? { error: payload.error } : {}),
                      };
                    }
                  }
                  return next;
                });
              }
            } else if (ev.event === 'error') {
              const errData = ev.data as { error?: string };
              throw new Error(errData.error ?? 'stream error');
            }
          }
        }

        // Stream complete.
        if (seqRef.current === firedSeq) {
          setStatus('done');
        }
      } catch (e: unknown) {
        if (seqRef.current !== firedSeq) return; // superseded — ignore
        if ((e as { name?: string }).name === 'AbortError') return; // intentional abort

        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus('error');
        // Mark any still-streaming panels as error.
        setPanels((prev) => {
          const next = { ...prev };
          (Object.keys(next) as PanelId[]).forEach((id) => {
            if (next[id].status === 'streaming') {
              next[id] = { ...next[id], status: 'error', error: msg };
            }
          });
          return next;
        });
      }
    })();

    // Cleanup: abort on unmount or before the next effect run.
    return () => {
      ctrl.abort();
    };
  }, [submission]);

  const getResult = useCallback(
    (id: PanelId): PanelDataResult | undefined => {
      const p = panels[id];
      if (p.status !== 'done' || !p.timing) return undefined;
      return {
        answer: p.answer,
        sources: p.sources,
        timing: p.timing,
        ...(p.followUp ? { followUp: p.followUp } : {}),
        ...(p.trace ? { trace: p.trace } : {}),
        ...(p.error ? { error: p.error } : {}),
      };
    },
    [panels],
  );

  return { status, error, panels, getResult };
}
