/**
 * Pure seed logic for the 4 CENTRAL indices (Phase 1.1). No I/O — tested in isolation.
 * Seed rule (LOCKED, brief §9): keep language_code:en, dedup by url keeping latest
 * lastUpdated, ≈8,100 records. environment is intentionally NOT a filter.
 */
import { createHash } from 'node:crypto';

export function filterEnglish(records) {
  return records.filter((r) => r.language_code === 'en');
}

// Keep the record with the greatest lastUpdated per url. Records missing lastUpdated
// sort as 0 (any one is kept). environment is intentionally ignored.
export function dedupeByUrl(records) {
  const best = new Map();
  for (const r of records) {
    const ts = Number(r.lastUpdated ?? 0);
    const cur = best.get(r.url);
    if (!cur || ts > Number(cur.lastUpdated ?? 0)) best.set(r.url, r);
  }
  return [...best.values()];
}

// Stable objectID from url so re-runs upsert (not duplicate) and all 4 indices
// share identical objectIDs (keyword vs neural differ only by config, not records).
export function objectIdForUrl(url) {
  return createHash('sha1').update(String(url)).digest('hex');
}
