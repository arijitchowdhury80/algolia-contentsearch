/**
 * useAgentColumn — drives an agent chat lane (cols 2–4).
 *
 * Owns the lane's Message[] thread and streaming state. On each submission it
 * appends the user turn + a streaming assistant placeholder, calls
 * callCompletions() (browser-direct), and updates the placeholder live via the
 * onText callback. Sources come straight from ParsedCompletion.hits.
 *
 * Refusal detection is a CONSERVATIVE heuristic on the agent's own grounded-
 * refusal phrasing (grounding is enforced in the agent prompt, not here — see
 * decision #6/#10). It is a display signal only, NOT a re-implemented auditor.
 */
import { useEffect, useRef, useState } from 'react';
import { callCompletions } from '../lib/agentStudioClient';
import { buildConversationHistory } from '../lib/conversation';
import type { AgentColumnConfig } from '../config/columns';
import type { Message, Source } from '../types/chat';
import type { LaneSnapshot, Submission } from './useComparison';

export type AgentLaneStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface AgentColumnState {
  messages: Message[];
  status: AgentLaneStatus;
  /** Wall-clock when the current submission started (Date.now()), for a live timer. */
  startedAt: number | null;
  /** Final answer latency in ms once done/error; null while streaming/idle. */
  elapsedMs: number | null;
}

/** Final outcome of one lane for a given submission — fed to the live judge. */
export interface AgentResult {
  columnId: AgentColumnConfig['id'];
  seq: number;
  status: 'done' | 'error';
  answer: string;
  sources: Source[];
  /** Answer latency in ms (agent call wall-clock). */
  elapsedMs: number;
}

interface Params {
  config: AgentColumnConfig;
  submission: Submission | null;
  clearSeq: number;
  register: (id: AgentColumnConfig['id'], get: () => LaneSnapshot) => () => void;
  /** Fires once when this lane finishes a submission (done or error). */
  onResult?: (result: AgentResult) => void;
}

let msgSeq = 0;
const nextId = () => `m${++msgSeq}`;

/** Phrases our hardened grounded-refusal prompt produces. Conservative. */
const REFUSAL_SIGNALS = [
  "i don't have",
  'i do not have',
  "couldn't find",
  'could not find',
  'no information',
  'not available in',
  'i can only answer',
  "i'm not able to answer",
  'outside the scope',
];

function looksLikeRefusal(content: string, hitCount: number): boolean {
  if (hitCount > 0) return false;
  const c = content.toLowerCase();
  return REFUSAL_SIGNALS.some((s) => c.includes(s));
}

/** Map raw Agent Studio `a:`-frame hits to the Source display shape. */
function hitsToSources(hits: Record<string, unknown>[]): Source[] {
  return hits.map((h, i) => ({
    objectID: typeof h.objectID === 'string' ? h.objectID : undefined,
    title: (h.title ?? h.doc_title) as string | undefined,
    url: (h.url ?? h.doc_url) as string | undefined,
    summary: (h.summary ?? h.description ?? h.doc_summary) as string | undefined,
    // Substantive body for the live grounding gate (thin in the UI vs the
    // batch harness's full text — live judging is indicative).
    chunk_text: (h.chunk_text ?? h.content ?? h.body ?? h.excerpt) as string | undefined,
    position: i + 1,
  }));
}

export function useAgentColumn({ config, submission, clearSeq, register, onResult }: Params): AgentColumnState {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<AgentLaneStatus>('idle');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Ref so the async completion handler always sees the latest callback.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    return register(config.id, () => ({
      columnId: config.id,
      kind: 'agent',
      messages: messagesRef.current,
    }));
  }, [register, config.id]);

  useEffect(() => {
    if (clearSeq === 0) return;
    setMessages([]);
    setStatus('idle');
    setStartedAt(null);
    setElapsedMs(null);
  }, [clearSeq]);

  useEffect(() => {
    if (!submission) return;
    let cancelled = false;
    const { query, seq } = submission;
    const t0 = performance.now();
    setStartedAt(Date.now());
    setElapsedMs(null);
    const elapsed = () => Math.round(performance.now() - t0);

    const history = buildConversationHistory(messagesRef.current);
    const userMsg: Message = { id: nextId(), role: 'user', content: query };
    const assistantId = nextId();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      column: config.id,
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStatus('streaming');

    const patchAssistant = (patch: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
      );
    };

    callCompletions(
      { appId: config.appId, searchKey: config.searchKey, agentId: config.agentId },
      { history, query },
      (accumulated) => {
        if (!cancelled) patchAssistant({ content: accumulated });
      },
    )
      .then((res) => {
        if (cancelled) return;
        const sources = hitsToSources(res.hits);
        const refused = looksLikeRefusal(res.content, res.hits.length);
        // An error frame (`3:`) arrives inside a 200 stream — e.g. the Beta
        // provider's 401. Surface it as the error state, not a blank "answer".
        if (res.error) {
          patchAssistant({
            content: res.content || res.error,
            isLoading: false,
            sourceType: 'error',
            indexName: config.indexName,
          });
          setStatus('error');
          setElapsedMs(elapsed());
          onResultRef.current?.({
            columnId: config.id,
            seq,
            status: 'error',
            answer: res.content || res.error,
            sources: [],
            elapsedMs: elapsed(),
          });
          return;
        }
        patchAssistant({
          content: res.content,
          isLoading: false,
          sources,
          refused,
          sourceType: refused ? 'refusal' : 'rag',
          indexName: config.indexName,
        });
        setStatus('done');
        setElapsedMs(elapsed());
        onResultRef.current?.({
          columnId: config.id,
          seq,
          status: 'done',
          answer: res.content,
          sources,
          elapsedMs: elapsed(),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        patchAssistant({
          content: message,
          isLoading: false,
          sourceType: 'error',
        });
        setStatus('error');
        setElapsedMs(elapsed());
        onResultRef.current?.({
          columnId: config.id,
          seq,
          status: 'error',
          answer: message,
          sources: [],
          elapsedMs: elapsed(),
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.seq]);

  return { messages, status, startedAt, elapsedMs };
}
