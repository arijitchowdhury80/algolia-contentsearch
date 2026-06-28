import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDelta } from './delta_sync.mjs';

test('computeDelta returns new + changed records, by objectID + hash', () => {
  const live = [
    { objectID: 'a', _hash: '1' },
    { objectID: 'b', _hash: '2' },
    { objectID: 'c', _hash: '3' },
  ];
  const existing = new Map([['a', '1'], ['b', 'OLD']]); // a unchanged, b changed, c new
  const delta = computeDelta(live, existing);
  assert.deepEqual(delta.map((r) => r.objectID).sort(), ['b', 'c']);
});

test('computeDelta returns empty array when nothing changed', () => {
  const live = [{ objectID: 'a', _hash: '1' }, { objectID: 'b', _hash: '2' }];
  const existing = new Map([['a', '1'], ['b', '2']]);
  const delta = computeDelta(live, existing);
  assert.deepEqual(delta, []);
});

test('computeDelta treats all records as new when existing map is empty', () => {
  const live = [{ objectID: 'x', _hash: 'h1' }, { objectID: 'y', _hash: 'h2' }];
  const existing = new Map();
  const delta = computeDelta(live, existing);
  assert.deepEqual(delta.map((r) => r.objectID).sort(), ['x', 'y']);
});

test('computeDelta does not include records that are unchanged', () => {
  const live = [
    { objectID: 'keep', _hash: 'same' },
    { objectID: 'change', _hash: 'new-hash' },
  ];
  const existing = new Map([['keep', 'same'], ['change', 'old-hash']]);
  const delta = computeDelta(live, existing);
  assert.equal(delta.length, 1);
  assert.equal(delta[0].objectID, 'change');
});
