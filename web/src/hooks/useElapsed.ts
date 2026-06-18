import { useEffect, useState } from 'react';

/**
 * Live elapsed-ms since `startedAt`, ticking every 200ms while `running`. Freezes
 * (stops ticking) when not running. Returns 0 if no start time. Used for the
 * per-lane and judge "time taken" counters so latency is always visible.
 */
export function useElapsed(startedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || startedAt == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running, startedAt]);
  return startedAt == null ? 0 : Math.max(0, now - startedAt);
}
