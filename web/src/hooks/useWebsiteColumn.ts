/**
 * useWebsiteColumn — drives ① "Current Website Search". On each submission it
 * calls the local backend's Playwright capture of live algolia.com and exposes
 * the result + lifecycle. Seq-guarded so a superseded query's result is dropped.
 * Local-only (needs the backend on :8787); errors surface a clear hint.
 */
import { useEffect, useRef, useState } from 'react';
import type { Submission } from './useComparison';
import { requestWebsiteCapture, type WebsiteResult } from '../lib/websiteClient';

export type WebsiteState = 'idle' | 'loading' | 'done' | 'error';

export interface WebsiteColumnApi {
  state: WebsiteState;
  result?: WebsiteResult;
  error?: string;
}

export function useWebsiteColumn(submission: Submission | null): WebsiteColumnApi {
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
    requestWebsiteCapture(submission.query)
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
