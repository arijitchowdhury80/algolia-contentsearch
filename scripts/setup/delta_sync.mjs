/**
 * delta_sync.mjs — Incremental data-only sync for the 4 CENTRAL indices.
 *
 * Purpose: keep the 4 AC2_WWW_* indices fresh without touching their retrieval
 * config. Only record data is ever written (saveObjects / batch upsert). We
 * NEVER call setSettings — each index owns its own retrieval mode/config and
 * delta-sync must not disturb it.
 *
 * Recommended schedule: end-of-day cron, e.g. 23:00 UTC daily.
 *   cron: 0 23 * * *   node scripts/setup/delta_sync.mjs
 *
 * Deletions policy (default — revisit with Arijit):
 *   Upsert-only. Records removed from the Visibility source are logged but NOT
 *   deleted from CENTRAL indices. This avoids silent data loss and preserves
 *   retrieval coverage while the removal is reviewed.
 *
 * Usage (manual / triggered):
 *   node scripts/setup/delta_sync.mjs [--dry-run]
 *
 *   --dry-run  Compute the delta and log it; do NOT write to Algolia.
 *
 * DO NOT run this script during automated test runs — it makes live Algolia
 * calls. Import only computeDelta (pure) in tests.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ─── Pure diff logic (tested in isolation) ────────────────────────────────────

/**
 * Compute which live records need to be upserted (new objectID or changed hash).
 *
 * @param {Array<{objectID: string, _hash: string, [key: string]: unknown}>} liveRecords
 *   Records from the live source, each pre-stamped with a `_hash`.
 * @param {Map<string, string>} existingHashByObjectId
 *   Map of objectID → content hash for what is currently in the target index.
 * @returns {Array} Records that are new or whose hash differs from existing.
 */
export function computeDelta(liveRecords, existingHashByObjectId) {
  return liveRecords.filter((r) => {
    const existingHash = existingHashByObjectId.get(r.objectID);
    // New record (not in index) OR hash changed
    return existingHash === undefined || existingHash !== r._hash;
  });
}

// ─── Content hash helper ──────────────────────────────────────────────────────

/**
 * Compute a stable SHA-1 content hash for a record. We hash the url +
 * lastUpdated + a small set of content fields (title, body, description) to
 * detect meaningful changes without hashing the full record (avoids spurious
 * diffs from server-side field additions).
 */
function contentHash(record) {
  const sig = JSON.stringify({
    url: record.url ?? '',
    lastUpdated: record.lastUpdated ?? 0,
    title: record.title ?? '',
    body: record.body ?? '',
    description: record.description ?? '',
    source: record.source ?? '',
  });
  return createHash('sha1').update(sig).digest('hex');
}

// ─── Env loader (no dotenv dep — parse .env.local manually) ──────────────────

function loadEnv() {
  const envPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../.env.local',
  );
  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    throw new Error(`Cannot read .env.local at ${envPath}`);
  }
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
  return env;
}

// ─── Index list ───────────────────────────────────────────────────────────────

const CENTRAL_INDICES = [
  'AC2_WWW_SINGLE_KEYWORD',
  'AC2_WWW_MULTI_KEYWORD',
  'AC2_WWW_SINGLE_NEURAL',
  'AC2_WWW_MULTI_NEURAL',
];

// ─── Live sync orchestration ──────────────────────────────────────────────────

/**
 * runDeltaSync — main entry point (has side effects; NOT imported in tests).
 *
 * 1. Browse all records from Visibility (READ-ONLY source on 1QDAWL72TQ).
 * 2. Apply filterEnglish + dedupeByUrl (same seed rule as seed_central.mjs).
 * 3. Stamp each record with _hash + objectID (stable sha1 of url).
 * 4. For each CENTRAL index, browse existing objectIDs+hashes (via browse),
 *    compute delta, upsert only new/changed records (saveObjects).
 * 5. Log removed URLs (records in CENTRAL but not in live) — do NOT delete.
 *
 * Pass dryRun=true to skip all writes (log only).
 */
export async function runDeltaSync({ dryRun = false } = {}) {
  // Dynamic import of algoliasearch so the module can be imported in test
  // environments that don't have the package (computeDelta is the only export
  // tests need; runDeltaSync is integration-only).
  let algoliasearch;
  try {
    ({ algoliasearch } = await import('algoliasearch'));
  } catch {
    throw new Error(
      'algoliasearch package not found — run `npm install algoliasearch` in the repo root.',
    );
  }

  // Import seed helpers from sibling module
  const { filterEnglish, dedupeByUrl, objectIdForUrl } = await import(
    './seed_dedup.mjs'
  );

  const env = loadEnv();

  const required = [
    'VISIBILITY_APP_ID',
    'VISIBILITY_API_KEY',
    'VISIBILITY_INDEX_NAME',
    'ALGOLIA_APP_ID',
    'ALGOLIA_ADMIN_API_KEY',
  ];
  for (const key of required) {
    if (!env[key]) throw new Error(`Missing env var: ${key}`);
  }

  const visClient = algoliasearch(env.VISIBILITY_APP_ID, env.VISIBILITY_API_KEY);
  const centralClient = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_ADMIN_API_KEY);

  const visIndexName = env.VISIBILITY_INDEX_NAME;

  // ── Step 1: Browse Visibility (READ-ONLY source) ──────────────────────────
  console.log(`[delta-sync] Browsing Visibility ${visIndexName} …`);
  const rawRecords = [];
  await visClient.browseObjects({
    indexName: visIndexName,
    browseParams: { attributesToRetrieve: ['*'], hitsPerPage: 1000 },
    aggregator: (response) => rawRecords.push(...response.hits),
  });
  console.log(`[delta-sync] Fetched ${rawRecords.length} raw records from Visibility.`);

  // ── Step 2: Apply seed rule (filterEnglish + dedupeByUrl) ─────────────────
  const enRecords = filterEnglish(rawRecords);
  const deduped = dedupeByUrl(enRecords);
  console.log(
    `[delta-sync] After en-filter + url-dedup: ${deduped.length} records (raw: ${rawRecords.length}).`,
  );

  if (deduped.length < 7800 || deduped.length > 8400) {
    console.warn(
      `[delta-sync] WARNING: record count ${deduped.length} is outside expected range 7800–8400. ` +
      'Seed-rule drift? Proceeding but double-check.',
    );
  }

  // ── Step 3: Stamp records with stable objectID + content hash ─────────────
  const liveRecords = deduped.map((r) => ({
    ...r,
    objectID: objectIdForUrl(r.url),
    _hash: contentHash(r),
  }));

  // ── Step 4: Per-index delta + upsert ──────────────────────────────────────
  for (const indexName of CENTRAL_INDICES) {
    console.log(`\n[delta-sync] Processing index: ${indexName}`);

    // Browse existing objectIDs + hashes from CENTRAL
    // We store _hash on each record at seed/upsert time, so we retrieve it here.
    const existingHashByObjectId = new Map();
    const removedUrls = [];

    await centralClient.browseObjects({
      indexName,
      browseParams: {
        attributesToRetrieve: ['objectID', '_hash', 'url'],
        hitsPerPage: 1000,
      },
      aggregator: (response) => {
        for (const hit of response.hits) {
          existingHashByObjectId.set(hit.objectID, hit._hash ?? '');
        }
      },
    });
    console.log(`[delta-sync]   Existing records in ${indexName}: ${existingHashByObjectId.size}`);

    // Identify removed URLs (in CENTRAL but not in live — upsert-only default)
    const liveObjectIds = new Set(liveRecords.map((r) => r.objectID));
    for (const [oid] of existingHashByObjectId) {
      if (!liveObjectIds.has(oid)) {
        removedUrls.push(oid);
      }
    }
    if (removedUrls.length > 0) {
      console.log(
        `[delta-sync]   ${removedUrls.length} records present in ${indexName} but missing from live source ` +
        '(NOT deleted — upsert-only policy). objectIDs logged below:',
      );
      removedUrls.forEach((oid) => console.log(`    removed: ${oid}`));
    }

    // Compute delta
    const delta = computeDelta(liveRecords, existingHashByObjectId);
    console.log(`[delta-sync]   Delta: ${delta.length} records to upsert (new or changed).`);

    if (delta.length === 0) {
      console.log(`[delta-sync]   ${indexName} is up to date — nothing to write.`);
      continue;
    }

    if (dryRun) {
      console.log(`[delta-sync]   --dry-run: skipping write to ${indexName}.`);
      continue;
    }

    // Upsert data ONLY — NEVER call setSettings (each index owns its own config)
    const BATCH_SIZE = 1000;
    for (let i = 0; i < delta.length; i += BATCH_SIZE) {
      const batch = delta.slice(i, i + BATCH_SIZE);
      await centralClient.saveObjects({ indexName, objects: batch });
      console.log(
        `[delta-sync]   Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}` +
        ` (${batch.length} records) → ${indexName}`,
      );
    }
    console.log(`[delta-sync]   Done: ${delta.length} records upserted to ${indexName}.`);
  }

  console.log('\n[delta-sync] Complete.');
}

// ─── CLI entry point ──────────────────────────────────────────────────────────
// Only runs when executed directly (not when imported by tests).
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('[delta-sync] DRY-RUN mode — no writes will be made.');
  runDeltaSync({ dryRun }).catch((err) => {
    console.error('[delta-sync] FATAL:', err.message);
    process.exit(1);
  });
}
