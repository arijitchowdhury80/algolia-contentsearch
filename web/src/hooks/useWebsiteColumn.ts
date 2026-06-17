/**
 * useWebsiteColumn — drives ① "Current Website Search". On each submission it
 * runs a BROWSER-DIRECT Algolia keyword search against the incumbent app/index
 * (the same one algolia.com's header search uses) with a search-only key, and
 * exposes the result + lifecycle. No backend — works on the deployed app.
 * Seq-guarded so a superseded query's result is dropped.
 */
import { useEffect, useRef, useState } from 'react';
import type { Submission } from './useComparison';
import { searchIncumbent, type IncumbentConfig, type WebsiteResult } from '../lib/incumbentSearch';

export type WebsiteState = 'idle' | 'loading' | 'done' | 'error';

export interface WebsiteColumnApi {
  state: WebsiteState;
  result?: WebsiteResult;
  error?: string;
}

export function useWebsiteColumn(
  cfg: IncumbentConfig,
  submission: Submission | null,
): WebsiteColumnApi {
  const [state, setState] = useState<WebsiteState>('idle');
  const [result, setResult] = useState<WebsiteResult>();
  const [error, setError] = useState<string>();
  const seqRef = useRef(-1);

  useEffect(() => {
    if (!submission || submission.seq === seqRef.current) return;
    seqRef.current = submission.seq;
    const fired = submission.seq;
    setState('loading');
    setResult(undefined);
    setError(undefined);
    searchIncumbent(cfg, submission.query)
      .then((r) => {
        if (seqRef.current !== fired) return; // superseded
        setResult(r);
        setState('done');
      })
      .catch((e: unknown) => {
        if (seqRef.current !== fired) return;
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      });
  }, [submission?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, result, error };
}
