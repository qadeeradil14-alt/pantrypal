/**
 * Removal and re-add actions carry monotonic timestamps. A stale peer's
 * tombstone therefore cannot delete a newer re-add.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine';
import { foldRemoteActiveSession, resolveRemovedItemIds } from '../core/services/shoppingEntrySync';

const T = 1_700_000_000_000;

const entry = (itemId: string, storeId = 'lidl') => ({
  itemId, name: itemId, quantity: 1, unit: 'unit' as const, storeId, picked: false,
});

function activeTrip(): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP', now: T, shopperId: 'nargis',
    entries: [entry('cheese'), entry('eggs')],
  });
}

test('remove and re-add carry the timestamps allowed by the member RLS policy', () => {
  const base = activeTrip();
  const removed = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 });
  const readded = reduce(removed, { type: 'ADD_ENTRY', entry: entry('eggs'), now: T + 200 });

  assert.equal(base.entries.find((e) => e.itemId === 'eggs')?.addedAt, T);
  assert.equal(removed.removedAt?.eggs, T + 100);
  assert.equal(readded.entries.find((e) => e.itemId === 'eggs')?.addedAt, T + 200);
  assert.equal(readded.removedAt?.eggs, undefined);
});

test('a re-added item survives when a peer still holds the old tombstone', () => {
  const base = activeTrip();
  const readded = reduce(
    reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 }),
    { type: 'ADD_ENTRY', entry: entry('eggs'), now: T + 200 },
  );
  const peerWithTombstone = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 });

  const merged = foldRemoteActiveSession(readded, peerWithTombstone);
  assert.ok(merged.entries.some((e) => e.itemId === 'eggs'));
  assert.ok(!merged.removedItemIds.includes('eggs'));
});

test('a genuine deletion propagates to a peer that has not seen it', () => {
  const base = activeTrip();
  const deleter = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 });

  assert.ok(!foldRemoteActiveSession(deleter, base).entries.some((e) => e.itemId === 'eggs'));
  assert.ok(!foldRemoteActiveSession(base, deleter).entries.some((e) => e.itemId === 'eggs'));
});

test('deletion stays deleted across repeated syncs', () => {
  const base = activeTrip();
  const deleter = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 });

  let session = deleter;
  for (let i = 0; i < 4; i++) {
    session = foldRemoteActiveSession(session, base);
    assert.ok(!session.entries.some((e) => e.itemId === 'eggs'), `sync round ${i + 1}`);
  }
});

test('resolveRemovedItemIds unions tombstones from both sides', () => {
  const a = { entries: [], removedItemIds: ['eggs'] };
  const b = { entries: [], removedItemIds: ['milk'] };

  const { removedItemIds } = resolveRemovedItemIds(a, b);
  assert.deepEqual([...removedItemIds].sort(), ['eggs', 'milk']);
});

test('items never removed are untouched by the tombstone logic', () => {
  const base = activeTrip();
  const merged = foldRemoteActiveSession(base, base);
  assert.deepEqual(merged.entries.map((e) => e.itemId).sort(), ['cheese', 'eggs']);
});
