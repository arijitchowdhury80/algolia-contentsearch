/** Format a millisecond duration for the UI: "0.9s", "24.1s", "1m02s". */
export function formatMs(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m${r.toString().padStart(2, '0')}s`;
}
