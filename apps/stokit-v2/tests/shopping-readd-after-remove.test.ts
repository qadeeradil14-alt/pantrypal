/**
 * Re-adding a previously-removed item to an active trip does NOT currently
 * stick across devices. This file documents that known gap and locks in the
 * behavior that must not regress around it.
 *
 * The gap: `removedItemIds` is a plain string[] tombstone with no timestamp.
 * Once an id lands there on any device, every merge re-unions it and
 * mergeShoppingEntries filters that item back out. The local reducer
 * un-tombstones on ADD_ENTRY, but the peer still carries the tombstone, so
 * the next sync re-deletes the re-added item. Items are auto-tombstoned when
 * they become `stocked` (shoppingEntryEventForItem emits REMOVE_ENTRY), so
 * anything purchased earlier in a trip is affected.
 *
 * OTA 416 attempted a fix via ShoppingEntry.addedAt + ShoppingSession.removedAt
 * stamps. That had to be reverted in OTA 417: the Supabase members RLS policy
 * (can_update_household_snapshot_as_member) only permits `entries`,
 * `removedItemIds` and `storeQueue` to change on the session, so the two new
 * fields caused EVERY member/collaborator push to be rejected server-side —
 * a far worse P0 (no adds or deletes synced from the member device at all).
 *
 * Re-landing the fix requires first widening that RLS allowlist, then
 * restoring the stamps. Until then the tests below pin current behavior.
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

test('[guard] the session must never carry fields the members RLS policy forbids', () => {
  // Only entries / removedItemIds / storeQueue may change on the session for a
  // non-shopper member. Anything else makes every member push fail (OTA 416).
  const base = activeTrip();
  const removed = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 });
  const readded = reduce(removed, { type: 'ADD_ENTRY', entry: entry('eggs'), now: T + 200 });

  for (const session of [base, removed, readded]) {
    assert.equal((session as unknown as Record<string, unknown>).removedAt, undefined,
      'removedAt must not be written — the members RLS policy rejects unknown session fields');
    for (const e of session.entries) {
      assert.equal((e as unknown as Record<string, unknown>).addedAt, undefined,
        'addedAt must not be written — it trips the members RLS entry-diff check');
    }
  }
});

test('[known gap] a re-added item is still dropped when a peer holds the tombstone', () => {
  const base = activeTrip();
  const readded = reduce(
    reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 }),
    { type: 'ADD_ENTRY', entry: entry('eggs'), now: T + 200 },
  );
  const peerWithTombstone = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 });

  const merged = foldRemoteActiveSession(readded, peerWithTombstone);
  assert.ok(!merged.entries.some((e) => e.itemId === 'eggs'),
    'documents the open gap — fixing it requires the RLS allowlist change first');
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
