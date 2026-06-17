/**
 * useLiveJudge — orchestrates live judging of the displayed answers.
 *
 * Agent lanes call `report(result)` when they finish. Once every expected lane
 * has reported for the current submission, this POSTs the done answers to the
 * local lab backend (/api/judge) and exposes the verdict as AnalysisData. State:
 *   idle → (submit) streaming → (all lanes done) judging → done | error
 *
 * Local-only and indicative — see judgeClient. Refs keep `report` stable and
 * free of stale closures; a seq guard drops results from a superseded query.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColumnId } from '../types/chat';
import type { Submission } from './useComparison';
import type { AgentResult } from './useAgentColumn';
import type { AnalysisData } from '../components/AnalysisDrawer';
import { requestJudge, toJudgeSource, type JudgePanelInput } from '../lib/judgeClient';
import { toAnalysisData } from '../lib/analysis';

export type LiveJudgeState = 'idle' | 'streaming' | 'judging' | 'done' | 'error';

export interface LiveJudgeOptions {
  oursPanelId: ColumnId;
  floorPanelId: ColumnId;
  /** Lanes whose completion gates judging (the agent lanes). */
  expectedPanelIds: ColumnId[];
  /** Judge rounds; backend default applies when omitted. */
  rounds?: number;
}

export interface LiveJudgeApi {
  state: LiveJudgeState;
  data?: AnalysisData;
  error?: string;
  report: (result: AgentResult) => void;
}

export function useLiveJudge(
  submission: Submission | null,
  opts: LiveJudgeOptions,
): LiveJudgeApi {
  const [state, setState] = useState<LiveJudgeState>('idle');
  const [data, setData] = useState<AnalysisData>();
  const [error, setError] = useState<string>();

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const subRef = useRef(submission);
  subRef.current = submission;
  const seqRef = useRef(-1);
  const resultsRef = useRef(new Map<ColumnId, AgentResult>());

  // Reset on each new submission — and clear back to idle on Reset (submission → null)
  // so a stale verdict never lingers on the score pills / verdict chip.
  useEffect(() => {
    if (!submission) {
      seqRef.current = -1;
      resultsRef.current = new Map();
      setState('idle');
      setData(undefined);
      setError(undefined);
      return;
    }
    if (submission.seq === seqRef.current) return;
    seqRef.current = submission.seq;
    resultsRef.current = new Map();
    setState('streaming');
    setData(undefined);
    setError(undefined);
  }, [submission]);

  const report = useCallback((result: AgentResult) => {
    if (result.seq !== seqRef.current) return; // a newer query is in flight
    const { expectedPanelIds, oursPanelId, floorPanelId, rounds } = optsRef.current;
    resultsRef.current.set(result.columnId, result);

    // Wait until every expected lane has reported for this submission.
    if (!expectedPanelIds.every((id) => resultsRef.current.has(id))) return;

    const done = expectedPanelIds
      .map((id) => resultsRef.current.get(id)!)
      .filter((r) => r.status === 'done' && r.answer.trim());

    if (done.length === 0) {
      setState('error');
      setError('No answers to judge — both lanes errored or were empty.');
      return;
    }

    const panels: JudgePanelInput[] = done.map((r) => ({
      panelId: r.columnId,
      answer: r.answer,
      sources: r.sources.map(toJudgeSource),
    }));

    const query = subRef.current?.query ?? '';
    const firedSeq = seqRef.current;
    setState('judging');
    requestJudge({ question: query, ...(rounds ? { rounds } : {}), panels })
      .then((res) => {
        if (seqRef.current !== firedSeq) return; // superseded
        setData(toAnalysisData(res, oursPanelId, floorPanelId));
        setState('done');
      })
      .catch((e: unknown) => {
        if (seqRef.current !== firedSeq) return;
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      });
  }, []);

  return { state, data, error, report };
}
