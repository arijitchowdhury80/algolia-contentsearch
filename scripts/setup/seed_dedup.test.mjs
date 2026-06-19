import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEnglish, dedupeByUrl, objectIdForUrl } from './seed_dedup.mjs';

test('filterEnglish keeps only language_code en', () => {
  const recs = [{ url: 'a', language_code: 'en' }, { url: 'b', language_code: 'fr' }];
  assert.deepEqual(filterEnglish(recs).map((r) => r.url), ['a']);
});

test('dedupeByUrl keeps the record with the latest lastUpdated per url', () => {
  const recs = [
    { url: 'x', lastUpdated: 100, body: 'old' },
    { url: 'x', lastUpdated: 200, body: 'new' },
    { url: 'y', lastUpdated: 50, body: 'only' },
  ];
  const out = dedupeByUrl(recs).sort((a, b) => a.url.localeCompare(b.url));
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.url === 'x').body, 'new');
});

test('dedupeByUrl does NOT filter by environment', () => {
  const recs = [
    { url: 'x', lastUpdated: 1, environment: 'nonprod20260220' },
    { url: 'y', lastUpdated: 1, environment: 'prod03042026' },
  ];
  assert.equal(dedupeByUrl(recs).length, 2);
});

test('dedupeByUrl is robust when lastUpdated is absent (keeps one per url)', () => {
  const recs = [{ url: 'z', body: 'a' }, { url: 'z', body: 'b' }];
  assert.equal(dedupeByUrl(recs).length, 1);
});

test('objectIdForUrl is stable and deterministic per url', () => {
  const a = objectIdForUrl('https://algolia.com/doc/x');
  const b = objectIdForUrl('https://algolia.com/doc/x');
  const c = objectIdForUrl('https://algolia.com/doc/y');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{40}$/); // sha1 hex
});
