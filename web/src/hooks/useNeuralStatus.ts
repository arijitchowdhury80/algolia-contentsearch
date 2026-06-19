/**
 * useNeuralStatus — polls the backend for the live NeuralSearch mode of each
 * neural index. Fetches on mount and every 60s, so an open tab self-heals when
 * the deferred neural flip lands (the "enabling" badge clears with no reload).
 */
import { useEffect, useState } from 'react';
import { fetchNeuralStatus, type NeuralStatus } from '../lib/neuralStatus';

const POLL_MS = 60_000;

export function useNeuralStatus(): NeuralStatus {
  const [status, setStatus] = useState<NeuralStatus>({});

  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetchNeuralStatus().then((s) => {
        if (alive) setStatus(s);
      });
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return status;
}
