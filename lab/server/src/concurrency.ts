/**
 * mapWithConcurrency — map over items with bounded parallelism, preserving input
 * order in the result. Used to parallelize the judge and run-tests across
 * (question × panel) tasks; the dominant cost is per-call LLM latency, so running
 * a handful concurrently turns hour-long sequential passes into minutes.
 *
 * Order is preserved by writing each result to its input index, so callers can
 * regroup deterministically regardless of completion order. A throwing `fn`
 * rejects the whole call (callers that need per-item isolation catch inside `fn`).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workers = Math.max(1, Math.min(limit, items.length));
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
