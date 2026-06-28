/**
 * applyHumanRanks — map Arijit's BLIND human ranks from RANKING-SHEET.md into
 * set.json's humanRank, so `npm run calibrate` correlates the judge against HIS
 * ordering (the real P2b gate) instead of the synthetic construct order.
 *
 * Flow: Arijit fills ranks.json ({ "<sheetItem>": <rank 1..12> }) from
 * RANKING-SHEET.md → this resolves each sheet item to its set.json id via
 * key.json → overwrites humanRank. The construct-order set is backed up once to
 * set.construct.json so the synthetic baseline is never lost.
 *
 * Run (from lab/server/calibration):  node applyHumanRanks.mjs
 *   then (from lab/server):           npm run calibrate
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ranks = JSON.parse(readFileSync(join(DIR, 'ranks.json'), 'utf8'));
const key = JSON.parse(readFileSync(join(DIR, 'key.json'), 'utf8'));
const setPath = join(DIR, 'set.json');
const set = JSON.parse(readFileSync(setPath, 'utf8'));

// Validate: ranks must be a permutation of 1..N over the sheet item numbers in key.
const sheetItems = Object.keys(key);
const given = sheetItems.map((k) => ranks[k]);
if (given.some((r) => r == null)) {
  console.error(`Unfilled ranks. Fill all ${sheetItems.length} entries in ranks.json (sheet item -> rank).`);
  process.exit(1);
}
const sorted = [...given].sort((a, b) => a - b);
const expected = sheetItems.map((_, i) => i + 1);
if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
  console.error(`Ranks must be a permutation of 1..${sheetItems.length} (each used once). Got: ${sorted.join(',')}`);
  process.exit(1);
}

// Back up the construct-order set ONCE (synthetic baseline, never overwrite it).
const backup = join(DIR, 'set.construct.json');
if (!existsSync(backup)) {
  writeFileSync(backup, JSON.stringify(set, null, 2));
  console.log('backed up construct-order set → set.construct.json');
}

// Apply: sheet item -> id (via key) -> set.json item -> humanRank.
let applied = 0;
for (const sheetItem of sheetItems) {
  const id = key[sheetItem];
  const item = set.find((x) => x.id === id);
  if (!item) { console.error(`id ${id} (sheet ${sheetItem}) not in set.json`); process.exit(1); }
  item.humanRank = ranks[sheetItem];
  applied++;
}
writeFileSync(setPath, JSON.stringify(set, null, 2));
console.log(`applied ${applied} human ranks → set.json. Now run:  npm run calibrate`);
